import type { Request } from 'express';
import type { Mensagem, Prisma } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import type { z } from 'zod';
import prisma from '../config/database';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  asyncHandler
} from '../middleware/error.middleware';
import { uploadBuffer, deleteObject, getSignedDownloadUrl } from '../config/r2';
import { TIPOS_ANEXO_VIDEO } from '../middleware/upload.middleware';
import { enviarParaUsuario } from '../services/push.service';
import type { enviarMensagemSchema, editarMensagemSchema } from '../schemas/mensagem.schema';

// O corpo já passou pelo `validate(...)` da rota: é o que o Zod devolveu.
type EnviarMensagemBody = z.infer<typeof enviarMensagemSchema>;
type EditarMensagemBody = z.infer<typeof editarMensagemSchema>;

const REMETENTE_SELECT = { id: true, nome: true, foto_perfil: true } as const;

// Tipos de mensagem que carregam arquivo. `video` entrou com o clipe curto de
// sintoma gravado no celular (25MB, sem transcodificação — ver
// `upload.middleware.js`); do ponto de vista desta rota ele é só mais um anexo:
// mesma tabela `mensagens_anexos`, mesma URL assinada na leitura e a mesma
// política de retenção do `anexo-retencao.worker.js`.
const TIPOS_COM_ANEXO: string[] = ['imagem', 'documento', 'video'];

// O `tipo` que o arquivo enviado realmente é. Serve para impedir que um vídeo
// entre declarado como 'imagem' — a tela decide pelo `tipo` como renderizar a
// bolha, então uma divergência aqui vira player quebrado ou <img> vazio lá.
const tipoDoArquivo = (mimetype: string): 'video' | 'documento' | 'imagem' => {
  if (TIPOS_ANEXO_VIDEO.includes(mimetype)) return 'video';
  if (mimetype === 'application/pdf') return 'documento';
  return 'imagem';
};

const ANEXO_SELECT = {
  id: true,
  tipo: true,
  nome_original: true,
  mime_type: true,
  tamanho_bytes: true,
  storage_key: true,
  // Anexo cujo binário já saiu do R2 por política de retenção
  // (`anexo-retencao.worker.js`). A linha continua; o arquivo não.
  arquivo_removido_em: true
} as const;

// Include padrão de qualquer mensagem devolvida pela API.
const MENSAGEM_INCLUDE = {
  remetente: { select: REMETENTE_SELECT },
  anexos: { select: ANEXO_SELECT }
} as const;

/** Um anexo como sai do banco com `ANEXO_SELECT`. */
type AnexoLido = Prisma.MensagemAnexoGetPayload<{ select: typeof ANEXO_SELECT }>;

/** O anexo como sai da API: sem a chave de storage, com a URL assinada. */
type AnexoPublico = Omit<AnexoLido, 'storage_key' | 'arquivo_removido_em'> & {
  url: string | null;
  arquivo_removido: boolean;
  arquivo_removido_em: Date | null;
};

/**
 * Qualquer mensagem que a API devolve: a linha da tabela, com os includes que
 * cada rota escolher. Os anexos só existem quando a busca os incluiu.
 */
type MensagemLida = Mensagem & Record<string, unknown> & { anexos?: AnexoLido[] };

type MensagemSerializada = Omit<MensagemLida, 'anexos'> & { excluida: boolean; anexos: AnexoPublico[] };

/** O que o Socket.IO da aplicação expõe; o server o pendura em `app.get('io')`. */
type Io = Pick<SocketServer, 'to'> | null | undefined;

/**
 * Paginação da conversa.
 *
 * A leitura devolvia a conversa inteira. Como cada anexo gera uma URL assinada no
 * momento da resposta, uma conversa longa com fotos custava uma assinatura por
 * anexo a cada abertura de tela — e o custo crescia para sempre.
 *
 * O corte é por cursor, não por `offset`: numa conversa que recebe mensagem
 * enquanto se rola para cima, o offset desloca a janela e faz sumir ou repetir
 * linha. O cursor é a própria posição, imune a isso.
 */
const LIMITE_PADRAO_DA_CONVERSA = 50;
const LIMITE_MAXIMO_DA_CONVERSA = 200;

type Cursor = { data: Date; id: string };

function paginacaoDaConversa(query: Request['query'] = {}): { limite: number; cursor: Cursor | null } {
  // `parseInt` converte o argumento para texto; o `String()` é essa conversão.
  const pedido = Number.parseInt(String(query.limite), 10);
  const limite = Number.isFinite(pedido) && pedido > 0
    ? Math.min(pedido, LIMITE_MAXIMO_DA_CONVERSA)
    : LIMITE_PADRAO_DA_CONVERSA;

  return { limite, cursor: lerCursor(query.cursor) };
}

/** O cursor é opaco para quem chama: `<data ISO>|<id>`. */
function montarCursor(mensagem: { criado_em: Date; id: string }): string {
  return `${new Date(mensagem.criado_em).toISOString()}|${mensagem.id}`;
}

function lerCursor(valor: unknown): Cursor | null {
  if (!valor || typeof valor !== 'string') return null;

  const [dataTexto, id] = valor.split('|');
  const data = new Date(dataTexto);
  if (!id || Number.isNaN(data.getTime())) return null;

  return { data, id };
}

/**
 * Tudo que é mais antigo que o cursor. O desempate por `id` existe porque duas
 * mensagens podem cair no mesmo milissegundo — com só a data, a de trás sumiria.
 */
function filtroDoCursor(cursor: Cursor): Prisma.MensagemWhereInput {
  return {
    OR: [
      { criado_em: { lt: cursor.data } },
      { criado_em: cursor.data, id: { lt: cursor.id } }
    ]
  };
}

/**
 * Prepara a mensagem para sair da API.
 *
 * Duas responsabilidades: o anexo nunca sai como URL pública — devolvemos uma URL
 * assinada de curta duração, gerada na leitura — e a mensagem excluída não
 * entrega mais o conteúdo aos participantes. A linha continua no banco com o
 * texto original, e quem audita (admin do tenant) continua enxergando tudo.
 */
type OpcoesDeSerializacao = { podeVerExcluida?: boolean };

async function serializarMensagem(mensagem: MensagemLida, opcoes?: OpcoesDeSerializacao): Promise<MensagemSerializada>;
async function serializarMensagem(
  mensagem: MensagemLida | null | undefined,
  opcoes?: OpcoesDeSerializacao
): Promise<MensagemSerializada | null | undefined>;
async function serializarMensagem(
  mensagem: MensagemLida | null | undefined,
  { podeVerExcluida = false }: OpcoesDeSerializacao = {}
): Promise<MensagemSerializada | null | undefined> {
  if (!mensagem) return mensagem;

  const excluida = Boolean(mensagem.deletada_em);
  const anexos: AnexoPublico[] = await Promise.all((mensagem.anexos || []).map(async (anexo) => {
    const { storage_key, arquivo_removido_em, ...publico } = anexo;

    // Binário já recolhido pela retenção: assinar uma URL para um objeto que não
    // existe mais entregaria à tela um link que só falha ao ser aberto. Melhor
    // dizer o que aconteceu — os metadados (nome, tamanho, tipo) continuam.
    if (arquivo_removido_em) {
      return { ...publico, url: null, arquivo_removido: true, arquivo_removido_em };
    }

    return {
      ...publico,
      url: await getSignedDownloadUrl(storage_key),
      arquivo_removido: false,
      arquivo_removido_em: null
    };
  }));

  if (excluida && !podeVerExcluida) {
    return {
      ...mensagem,
      conteudo: null,
      latitude: null,
      longitude: null,
      endereco: null,
      excluida: true,
      anexos: []
    };
  }

  return { ...mensagem, excluida, anexos };
}

const serializarMensagens = (mensagens: MensagemLida[], opcoes?: OpcoesDeSerializacao) =>
  Promise.all(mensagens.map((mensagem) => serializarMensagem(mensagem, opcoes)));

// A regra de "quem pode falar com quem" saiu daqui para
// `services/vinculo-atendimento`, porque o perfil precisa da MESMA resposta —
// e não tinha. Duas telas do mesmo chat discordando sobre quem pode conversar
// é como o veterinário acabava com o campo de mensagem desabilitado.
import { buscarVinculoProfissional } from '../services/vinculo-atendimento.service';

/**
 * Para onde o aviso de mensagem nova leva.
 *
 * Decidia pelo tipo de conta de quem ENVIOU: `req.userType === 'tutor' ? tela
 * do vet : tela do tutor`. Isso só acerta enquanto um lado é sempre tutor e o
 * outro sempre veterinário. Desde que o veterinário também pode ser tutor do
 * próprio pet, ele mandava mensagem como tutor e o aviso jogava o veterinário
 * do outro lado na área do tutor — onde aquela conversa não existe.
 *
 * Quem decide é o VÍNCULO, o mesmo critério de `buscarVinculoProfissional` e
 * da videochamada: quem é o `tutor_id` daquele atendimento é o tutor ali, seja
 * qual for o `tipo_usuario` da conta.
 *
 * E leva à CONVERSA, não à caixa de entrada: quem toca no aviso quer responder,
 * não procurar. Sem vínculo conhecido cai em `/tutor/chat`, a única das duas
 * rotas que aceita os dois tipos de conta — na dúvida, errar para o lado que
 * pelo menos abre.
 */
function telaDaConversa({ destinatarioEhTutor, outroUsuarioId, atendimentoId }: {
  destinatarioEhTutor: boolean | null;
  outroUsuarioId: string;
  atendimentoId: string | null;
}): string {
  const area = destinatarioEhTutor === false ? 'veterinario' : 'tutor';
  const doAtendimento = atendimentoId ? `?atendimento=${atendimentoId}` : '';
  return `/${area}/chat/${outroUsuarioId}${doAtendimento}`;
}

class MensagemController {
  // Enviar mensagem (texto, anexo ou localização)
  enviar = asyncHandler(async (req, res) => {
    console.log('💬 [MENSAGEM] Enviando');
    const {
      conteudo,
      atendimentoId,
      solicitacao_id,
      destinatarioId,
      tipo,
      latitude,
      longitude,
      endereco
    } = req.body as EnviarMensagemBody;
    const remetenteId = req.userId as string;
    const atendimento_id = solicitacao_id || atendimentoId || null;
    const arquivo = req.file || null;

    if (TIPOS_COM_ANEXO.includes(tipo) && !arquivo) {
      throw new ValidationError('Mensagem de anexo exige o arquivo no campo "arquivo"');
    }

    if (arquivo && !TIPOS_COM_ANEXO.includes(tipo)) {
      throw new ValidationError('Para enviar arquivo use tipo "imagem", "documento" ou "video"');
    }

    // O `tipo` declarado tem de bater com o arquivo que veio: um vídeo anunciado
    // como 'imagem' seria gravado como imagem e a bolha tentaria exibi-lo em
    // <img>. A mensagem cita o tipo certo em vez de só recusar.
    if (arquivo && tipoDoArquivo(arquivo.mimetype) !== tipo) {
      throw new ValidationError(
        tipoDoArquivo(arquivo.mimetype) === 'video'
          ? 'Para enviar vídeo use tipo "video"'
          : `Este arquivo deve ser enviado com tipo "${tipoDoArquivo(arquivo.mimetype)}"`
      );
    }

    if (!arquivo && tipo !== 'localizacao' && !conteudo) {
      throw new ValidationError('Mensagem não pode ser vazia');
    }

    let destinatario_id: string;
    // O papel de QUEM RECEBE naquele atendimento — não o tipo da conta dele.
    // É o que decide a tela do aviso; ver `telaDaConversa`.
    let destinatarioEhTutor: boolean | null = null;

    if (atendimento_id) {
      const solicitacao = await prisma.solicitacao.findFirst({
        where: { id: atendimento_id, tenant_id: req.tenantId as string },
        include: { veterinario: { select: { usuario_id: true } } }
      });

      if (!solicitacao) throw new NotFoundError('Solicitação não encontrada');

      const veterinarioUsuarioId = solicitacao.veterinario?.usuario_id;
      const isTutor = solicitacao.tutor_id === remetenteId;
      const isVeterinario = veterinarioUsuarioId === remetenteId;
      if (!isTutor && !isVeterinario) throw new NotFoundError('Solicitação não encontrada');

      const destinatarioDoAtendimento = isTutor ? veterinarioUsuarioId : solicitacao.tutor_id;
      if (!destinatarioDoAtendimento) {
        throw new ForbiddenError('O atendimento ainda não possui os dois participantes');
      }

      destinatario_id = destinatarioDoAtendimento;
      destinatarioEhTutor = destinatario_id === solicitacao.tutor_id;
    } else {
      // Conversa direta: o vet consegue falar com um tutor já atendido mesmo
      // depois do atendimento encerrado, sem precisar de um atendimento aberto.
      if (!destinatarioId) {
        throw new ForbiddenError('Informe o atendimento ou o destinatário da mensagem');
      }

      if (destinatarioId === remetenteId) {
        throw new ForbiddenError('Não é possível enviar mensagem para si mesmo');
      }

      const vinculo = await buscarVinculoProfissional(req.tenantId as string, remetenteId, destinatarioId);
      if (!vinculo) {
        throw new ForbiddenError('Você só pode conversar com quem já participou de um atendimento com você');
      }

      destinatario_id = destinatarioId;
      // Conversa fora de um atendimento aberto: o papel vem do atendimento que
      // criou o vínculo — é o único lugar onde ele está escrito.
      if (vinculo.tutorId) destinatarioEhTutor = vinculo.tutorId === destinatario_id;
    }

    // O arquivo sobe antes da linha existir. Se a gravação falhar depois, apagamos
    // o objeto para não deixar lixo pago no bucket.
    let storageKey: string | null = null;
    if (arquivo) {
      const extensao = (arquivo.originalname.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
      storageKey = `chat/${req.tenantId}/${remetenteId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extensao}`;
      await uploadBuffer(arquivo.buffer, storageKey, arquivo.mimetype);
    }

    let mensagem;
    try {
      mensagem = await prisma.mensagem.create({
        data: {
          tenant_id: req.tenantId as string,
          remetente_id: remetenteId,
          destinatario_id: destinatario_id,
          atendimento_id: atendimento_id || null,
          conteudo: conteudo || null,
          tipo: tipo || 'texto',
          latitude: tipo === 'localizacao' ? latitude : null,
          longitude: tipo === 'localizacao' ? longitude : null,
          endereco: tipo === 'localizacao' ? (endereco || null) : null,
          // `storageKey` só existe quando há arquivo; o `arquivo &&` é para o
          // compilador, que não sabe amarrar os dois.
          anexos: storageKey && arquivo ? {
            create: [{
              tenant_id: req.tenantId as string,
              storage_key: storageKey,
              nome_original: arquivo.originalname,
              mime_type: arquivo.mimetype,
              tamanho_bytes: arquivo.size,
              tipo
            }]
          } : undefined
        },
        include: {
          ...MENSAGEM_INCLUDE,
          destinatario: { select: REMETENTE_SELECT }
        }
      });
    } catch (erroAoGravar) {
      if (storageKey) {
        const chaveOrfa = storageKey;
        await deleteObject(chaveOrfa).catch((erro: unknown) =>
          console.error('⚠️ [MENSAGEM] Anexo órfão no R2 (ignorado):', chaveOrfa, erro instanceof Error ? erro.message : String(erro)));
      }
      throw erroAoGravar;
    }

    console.log('✅ [MENSAGEM] Enviada');

    const resposta = await serializarMensagem(mensagem);

    // Notificar via Socket.IO
    const io: Io = req.app.get('io');
    if (io) {
      io.to(`user:${destinatario_id}`).emit('nova:mensagem', resposta);
      if (atendimento_id) {
        io.to(`atendimento:${atendimento_id}`).emit('mensagem:nova', resposta);
      }
    }

    // Push para quem está com o app fechado. O tag por conversa faz mensagens
    // seguidas substituírem a notificação em vez de empilharem.
    const previa = String(resposta.conteudo || '').slice(0, 90) || 'Você recebeu um anexo.';
    void enviarParaUsuario(destinatario_id, {
      title: `💬 ${req.user?.nome || 'Nova mensagem'}`,
      body: previa,
      url: telaDaConversa({
        destinatarioEhTutor,
        // Do ponto de vista de quem recebe, "o outro" é quem escreveu.
        outroUsuarioId: remetenteId,
        atendimentoId: atendimento_id
      }),
      tag: `chat-${atendimento_id || destinatario_id}`
    }).catch(() => {});

    return res.status(201).json({ mensagem: resposta });
  });

  // Editar mensagem própria, arquivando a versão anterior
  editar = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { conteudo } = req.body as EditarMensagemBody;

    const mensagem = await prisma.mensagem.findFirst({
      where: { id, tenant_id: req.tenantId as string }
    });

    if (!mensagem) throw new NotFoundError('Mensagem não encontrada');
    if (mensagem.remetente_id !== req.userId) {
      throw new ForbiddenError('Só o autor pode editar a própria mensagem');
    }
    if (mensagem.deletada_em) {
      throw new ForbiddenError('Mensagem excluída não pode ser editada');
    }
    if (mensagem.tipo !== 'texto') {
      throw new ForbiddenError('Só mensagens de texto podem ser editadas');
    }
    if (mensagem.conteudo === conteudo) {
      throw new ValidationError('O novo texto é igual ao atual');
    }

    // Arquivar a versão anterior e gravar a nova no mesmo passo: uma conversa
    // auditada não pode ter uma edição sem o texto que existia antes dela.
    const atualizada = await prisma.$transaction(async (tx) => {
      await tx.mensagemEdicao.create({
        data: {
          tenant_id: req.tenantId as string,
          mensagem_id: id,
          conteudo_anterior: mensagem.conteudo ?? '',
          editado_por_id: req.userId as string
        }
      });

      return tx.mensagem.update({
        where: { id },
        data: { conteudo, editada_em: new Date() },
        include: MENSAGEM_INCLUDE
      });
    });

    const resposta = await serializarMensagem(atualizada);

    const io: Io = req.app.get('io');
    if (io) {
      io.to(`user:${mensagem.destinatario_id}`).emit('mensagem:editada', resposta);
      if (mensagem.atendimento_id) {
        io.to(`atendimento:${mensagem.atendimento_id}`).emit('mensagem:editada', resposta);
      }
    }

    return res.json({ mensagem: resposta });
  });

  // Exclusão lógica: a linha e o conteúdo original permanecem para auditoria
  excluir = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const mensagem = await prisma.mensagem.findFirst({
      where: { id, tenant_id: req.tenantId as string }
    });

    if (!mensagem) throw new NotFoundError('Mensagem não encontrada');

    const isAutor = mensagem.remetente_id === req.userId;
    const isTenantAdmin = req.userType === 'admin';
    if (!isAutor && !isTenantAdmin) {
      throw new ForbiddenError('Só o autor ou um administrador pode excluir a mensagem');
    }
    if (mensagem.deletada_em) {
      return res.json({ mensagem: await serializarMensagem(mensagem) });
    }

    const excluida = await prisma.mensagem.update({
      where: { id },
      data: { deletada_em: new Date(), deletada_por_id: req.userId },
      include: MENSAGEM_INCLUDE
    });

    const resposta = await serializarMensagem(excluida);

    const io: Io = req.app.get('io');
    if (io) {
      io.to(`user:${mensagem.destinatario_id}`).emit('mensagem:excluida', resposta);
      if (mensagem.atendimento_id) {
        io.to(`atendimento:${mensagem.atendimento_id}`).emit('mensagem:excluida', resposta);
      }
    }

    return res.json({ mensagem: resposta });
  });

  // Histórico de edições de uma mensagem: participantes e admin do tenant
  historico = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const mensagem = await prisma.mensagem.findFirst({
      where: { id, tenant_id: req.tenantId as string },
      select: { id: true, remetente_id: true, destinatario_id: true, conteudo: true, editada_em: true, deletada_em: true }
    });

    if (!mensagem) throw new NotFoundError('Mensagem não encontrada');

    const isParticipante = [mensagem.remetente_id, mensagem.destinatario_id].includes(req.userId as string);
    const isTenantAdmin = req.userType === 'admin';
    if (!isParticipante && !isTenantAdmin) {
      throw new NotFoundError('Mensagem não encontrada');
    }

    const edicoes = await prisma.mensagemEdicao.findMany({
      where: { tenant_id: req.tenantId as string, mensagem_id: id },
      orderBy: { editado_em: 'asc' },
      select: { id: true, conteudo_anterior: true, editado_por_id: true, editado_em: true }
    });

    return res.json({
      mensagem_id: id,
      conteudo_atual: mensagem.deletada_em && !isTenantAdmin ? null : mensagem.conteudo,
      editada_em: mensagem.editada_em,
      excluida: Boolean(mensagem.deletada_em),
      edicoes
    });
  });

  // Listar conversas
  listarConversas = asyncHandler(async (req, res) => {
    const usuarioId = req.userId;

    const mensagens = await prisma.mensagem.findMany({
      where: {
        tenant_id: req.tenantId as string,
        OR: [
          { remetente_id: usuarioId },
          { destinatario_id: usuarioId }
        ]
      },
      include: {
        ...MENSAGEM_INCLUDE,
        destinatario: { select: REMETENTE_SELECT }
      },
      orderBy: { criado_em: 'desc' }
    });

    type Conversa = {
      usuario: (typeof mensagens)[number]['remetente'];
      ultimaMensagem: (typeof mensagens)[number];
      naoLidas: number;
    };

    // Agrupar por conversa
    const conversas = new Map<string, Conversa>();
    mensagens.forEach(msg => {
      const outroUsuarioId = msg.remetente_id === usuarioId
        ? msg.destinatario_id
        : msg.remetente_id;

      if (!conversas.has(outroUsuarioId)) {
        conversas.set(outroUsuarioId, {
          usuario: msg.remetente_id === usuarioId ? msg.destinatario : msg.remetente,
          ultimaMensagem: msg,
          naoLidas: 0
        });
      }

      if (msg.destinatario_id === usuarioId && !msg.lida) {
        // Acabou de ser criada acima se não existia.
        conversas.get(outroUsuarioId)!.naoLidas++;
      }
    });

    const lista = await Promise.all(Array.from(conversas.values()).map(async (conversa) => ({
      ...conversa,
      ultimaMensagem: await serializarMensagem(conversa.ultimaMensagem)
    })));

    return res.json(lista);
  });

  // Pessoas com quem o usuário pode iniciar uma conversa, mesmo que nunca tenham
  // trocado mensagem. Para o veterinário, são os tutores que ele já atendeu.
  listarContatos = asyncHandler(async (req, res) => {
    const usuarioId = req.userId;

    const solicitacoes = await prisma.solicitacao.findMany({
      where: {
        tenant_id: req.tenantId as string,
        OR: [
          { tutor_id: usuarioId },
          { veterinario: { usuario_id: usuarioId } }
        ]
      },
      select: {
        id: true,
        status: true,
        tipo_atendimento: true,
        criado_em: true,
        tutor: { select: { id: true, nome: true, foto_perfil: true } },
        pet: { select: { id: true, nome: true } },
        veterinario: {
          select: { usuario: { select: { id: true, nome: true, foto_perfil: true } } }
        }
      },
      orderBy: { criado_em: 'desc' },
      take: 200
    });

    type Contato = {
      usuario: (typeof solicitacoes)[number]['tutor'];
      ultimoAtendimento: {
        id: string;
        status: (typeof solicitacoes)[number]['status'];
        tipo_atendimento: (typeof solicitacoes)[number]['tipo_atendimento'];
        criado_em: Date;
        pet: (typeof solicitacoes)[number]['pet'];
      };
    };

    const contatos = new Map<string, Contato>();

    solicitacoes.forEach((solicitacao) => {
      const souTutor = solicitacao.tutor?.id === usuarioId;
      const outro = souTutor ? solicitacao.veterinario?.usuario : solicitacao.tutor;
      if (!outro?.id || outro.id === usuarioId) return;

      // A lista já vem ordenada por data, então o primeiro que aparece é o mais recente
      if (contatos.has(outro.id)) return;

      contatos.set(outro.id, {
        usuario: outro,
        ultimoAtendimento: {
          id: solicitacao.id,
          status: solicitacao.status,
          tipo_atendimento: solicitacao.tipo_atendimento,
          criado_em: solicitacao.criado_em,
          pet: solicitacao.pet
        }
      });
    });

    return res.json(Array.from(contatos.values()));
  });

  // Buscar mensagens entre usuários
  buscarMensagens = asyncHandler(async (req, res) => {
    const { outroUsuarioId } = req.params;
    const usuarioId = req.userId;
    const { limite, cursor } = paginacaoDaConversa(req.query);

    const entreOsDois: Prisma.MensagemWhereInput = {
      OR: [
        { remetente_id: usuarioId, destinatario_id: outroUsuarioId },
        { remetente_id: outroUsuarioId, destinatario_id: usuarioId }
      ]
    };

    // Busca do mais recente para trás — é a página que a tela abre — e devolve
    // em ordem crescente, que é como a conversa é lida.
    const pagina = await prisma.mensagem.findMany({
      where: {
        tenant_id: req.tenantId as string,
        AND: [entreOsDois, ...(cursor ? [filtroDoCursor(cursor)] : [])]
      },
      include: MENSAGEM_INCLUDE,
      orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
      take: limite + 1
    });

    const temMais = pagina.length > limite;
    const mensagens = pagina.slice(0, limite).reverse();

    // Marcar como lidas. `lida_em` existia na tabela e nunca era preenchido, então
    // não havia como dizer *quando* o outro lado leu — só que leu.
    const agora = new Date();
    const { count } = await prisma.mensagem.updateMany({
      where: {
        tenant_id: req.tenantId as string,
        remetente_id: outroUsuarioId,
        destinatario_id: usuarioId,
        lida: false
      },
      data: { lida: true, lida_em: agora }
    });

    // Confirmação de leitura para quem enviou.
    const io: Io = req.app.get('io');
    if (io && count > 0) {
      io.to(`user:${outroUsuarioId}`).emit('mensagens:lidas', {
        porUsuarioId: usuarioId,
        quantidade: count,
        lidas_em: agora
      });
    }

    return res.json({
      mensagens: await serializarMensagens(mensagens),
      paginacao: {
        limite,
        tem_mais: temMais,
        // Cursor da página seguinte: a mensagem mais antiga desta leva à anterior.
        proximo_cursor: temMais && mensagens.length ? montarCursor(mensagens[0]) : null
      }
    });
  });

  // Marcar como lida
  marcarLida = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.userId;

    const mensagem = await prisma.mensagem.findFirst({
      where: { id, tenant_id: req.tenantId as string, destinatario_id: usuarioId }
    });

    if (!mensagem) {
      throw new NotFoundError('Mensagem não encontrada');
    }

    const mensagemAtualizada = await prisma.mensagem.update({
      where: { id },
      data: { lida: true, lida_em: mensagem.lida_em || new Date() },
      include: MENSAGEM_INCLUDE
    });

    const io: Io = req.app.get('io');
    if (io) {
      io.to(`user:${mensagem.remetente_id}`).emit('mensagens:lidas', {
        porUsuarioId: usuarioId,
        mensagemId: id,
        quantidade: 1,
        lidas_em: mensagemAtualizada.lida_em
      });
    }

    return res.json({ mensagem: await serializarMensagem(mensagemAtualizada) });
  });

  // Listar mensagens por solicitação
  listarPorSolicitacao = asyncHandler(async (req, res) => {
    const solicitacao_id = req.query.solicitacao_id as string | undefined;
    const usuarioId = req.userId;

    if (!solicitacao_id) {
      return res.status(400).json({ error: 'solicitacao_id é obrigatório' });
    }

    // Verificar se usuário tem acesso a esta solicitação
    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id: solicitacao_id, tenant_id: req.tenantId as string },
      include: {
        veterinario: { include: { usuario: true } }
      }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    // Só os dois participantes daquele atendimento e o admin do tenant, que é
    // quem audita a conversa — e por isso enxerga também o que foi excluído.
    const isParticipante = solicitacao.tutor_id === usuarioId ||
                           solicitacao.veterinario?.usuario_id === usuarioId;
    const isTenantAdmin = req.userType === 'admin';

    if (!isParticipante && !isTenantAdmin) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const { limite, cursor } = paginacaoDaConversa(req.query);

    const pagina = await prisma.mensagem.findMany({
      where: {
        tenant_id: req.tenantId as string,
        atendimento_id: solicitacao_id,
        ...(cursor ? { AND: [filtroDoCursor(cursor)] } : {})
      },
      include: {
        ...MENSAGEM_INCLUDE,
        destinatario: { select: REMETENTE_SELECT },
        edicoes: isTenantAdmin
          ? { select: { conteudo_anterior: true, editado_por_id: true, editado_em: true }, orderBy: { editado_em: 'asc' } }
          : false
      },
      orderBy: [{ criado_em: 'desc' }, { id: 'desc' }],
      take: limite + 1
    });

    const temMais = pagina.length > limite;
    const mensagens = pagina.slice(0, limite).reverse();

    return res.json({
      mensagens: await serializarMensagens(mensagens, { podeVerExcluida: isTenantAdmin }),
      paginacao: {
        limite,
        tem_mais: temMais,
        proximo_cursor: temMais && mensagens.length ? montarCursor(mensagens[0]) : null
      }
    });
  });
}

const controller = new MensagemController();

module.exports = controller;
export default controller;
