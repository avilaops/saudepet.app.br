import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { uploadBuffer, deleteObject, getSignedDownloadUrl } from '../config/r2';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../middleware/error.middleware';

/**
 * A mídia do atendimento — o que a descrição escrita não mostra.
 *
 * Duas origens, um lugar só:
 *
 * O TUTOR anexa ao pedir socorro. Era o buraco mais gritante do fluxo: quem
 * tinha a foto da ferida na mão não conseguia mandar na hora do pedido, porque
 * o único caminho para arquivo era o chat — que só abre DEPOIS que um
 * veterinário aceita. O profissional decidia aceitar sem ver nada.
 *
 * O VETERINÁRIO anexa durante a consulta. Também só existia o chat, e ali a
 * retenção de 90 dias apagava o arquivo: registro clínico não pode expirar
 * junto com bate-papo, e a lesão fotografada hoje é o que permite comparar no
 * retorno.
 *
 * Tudo vive sob o prefixo `clinico/` no R2, fora do alcance do
 * `anexo-retencao.worker`, que varre `chat/` e só ele.
 */

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
/** O que o celular grava. */
const TIPOS_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime'];
const TIPOS_AUDIO = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-m4a'];

const TIPOS_ACEITOS = [...TIPOS_IMAGEM, ...TIPOS_VIDEO, ...TIPOS_AUDIO];

/** Foto de celular moderno passa fácil de 5 MB; vídeo de sintoma pesa mais. */
const LIMITE_IMAGEM = 12 * 1024 * 1024;
const LIMITE_VIDEO = 25 * 1024 * 1024;
const LIMITE_AUDIO = 10 * 1024 * 1024;

/** Um atendimento não precisa de um álbum — precisa do que documenta o caso. */
const MAXIMO_POR_ATENDIMENTO = 15;

/**
 * O tutor anexa desde o pedido até o fim da consulta: o sintoma pode mudar
 * enquanto ele espera, e é justamente isso que o veterinário precisa saber.
 */
const STATUS_QUE_ACEITAM_DO_TUTOR = [
  'criado',
  'procurando_veterinario',
  'oferta_enviada',
  'veterinario_encontrado',
  'aceito',
  'a_caminho',
  'chegou',
  'atendimento_em_andamento'
];

/**
 * O veterinário anexa a partir do aceite. Depois de finalizado ninguém anexa:
 * o prontuário é imutável, e mídia nova ali seria alterar registro fechado.
 */
const STATUS_QUE_ACEITAM_DO_VETERINARIO = [
  'aceito',
  'a_caminho',
  'chegou',
  'atendimento_em_andamento'
];

type ArquivoRecebido = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

export type MidiaParaLeitura = {
  id: string;
  tipo: string;
  autor_papel: string;
  legenda: string | null;
  nome_original: string;
  mime_type: string;
  tamanho_bytes: number;
  criado_em: Date;
  url: string | null;
};

function classificar(mime: string): 'imagem' | 'video' | 'audio' | null {
  if (TIPOS_IMAGEM.includes(mime)) return 'imagem';
  if (TIPOS_VIDEO.includes(mime)) return 'video';
  if (TIPOS_AUDIO.includes(mime)) return 'audio';
  return null;
}

function limiteDe(tipo: 'imagem' | 'video' | 'audio'): number {
  if (tipo === 'video') return LIMITE_VIDEO;
  if (tipo === 'audio') return LIMITE_AUDIO;
  return LIMITE_IMAGEM;
}

function extensaoDe(mime: string): string {
  const mapa: Record<string, string> = {
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heic',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg',
    'audio/webm': 'weba',
    'audio/wav': 'wav'
  };
  return mapa[mime] || 'jpg';
}

/**
 * Quem pode ver a mídia de um atendimento.
 *
 * Os dois participantes e o admin do tenant, sempre. E, enquanto ninguém
 * aceitou, qualquer veterinário aprovado do tenant — é exatamente para decidir
 * se aceita que ele precisa ver a foto.
 */
export async function conferirAcesso({
  atendimentoId,
  tenantId,
  usuarioId,
  tipoDeUsuario
}: {
  atendimentoId: string;
  tenantId: string;
  usuarioId: string;
  tipoDeUsuario?: string;
}) {
  const atendimento = await prisma.solicitacao.findFirst({
    where: { id: atendimentoId, tenant_id: tenantId },
    select: {
      id: true,
      status: true,
      tutor_id: true,
      veterinario_id: true,
      veterinario: { select: { usuario_id: true } }
    }
  });

  if (!atendimento) throw new NotFoundError('Atendimento não encontrado');

  if (
    atendimento.tutor_id === usuarioId ||
    atendimento.veterinario?.usuario_id === usuarioId ||
    tipoDeUsuario === 'admin'
  ) {
    return atendimento;
  }

  // Chamado ainda na fila: quem está de plantão precisa ver para decidir.
  if (!atendimento.veterinario_id && tipoDeUsuario === 'veterinario') {
    const aprovado = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioId, tenant_id: tenantId, aprovado_admin: true },
      select: { id: true }
    });
    if (aprovado) return atendimento;
  }

  // 404 e não 403: para quem não tem nada com isso, o atendimento não existe.
  throw new NotFoundError('Atendimento não encontrado');
}

export async function anexarMidia({
  atendimentoId,
  tenantId,
  usuarioId,
  papel,
  arquivo,
  legenda
}: {
  atendimentoId: string;
  tenantId: string;
  usuarioId: string;
  papel: 'tutor' | 'veterinario';
  arquivo: ArquivoRecebido | undefined;
  legenda?: string;
}) {
  if (!arquivo?.buffer) {
    throw new ValidationError('Envie o arquivo no campo "arquivo"');
  }

  const mime = String(arquivo.mimetype || '');
  const tipo = classificar(mime);
  if (!tipo) {
    throw new ValidationError('Formato não aceito. Envie foto, vídeo ou áudio.');
  }

  const tamanho = arquivo.size ?? arquivo.buffer.length;
  const limite = limiteDe(tipo);
  if (tamanho > limite) {
    throw new ValidationError(`O arquivo passa de ${Math.round(limite / (1024 * 1024))} MB.`);
  }

  const atendimento = await prisma.solicitacao.findFirst({
    where: { id: atendimentoId, tenant_id: tenantId },
    select: {
      id: true,
      status: true,
      tutor_id: true,
      veterinario: { select: { id: true, usuario_id: true } }
    }
  });
  if (!atendimento) throw new NotFoundError('Atendimento não encontrado');

  let veterinarioId: string | null = null;

  if (papel === 'tutor') {
    if (atendimento.tutor_id !== usuarioId) {
      throw new ForbiddenError('Este atendimento não é seu');
    }
    if (!STATUS_QUE_ACEITAM_DO_TUTOR.includes(atendimento.status)) {
      throw new ConflictError('Este atendimento já foi encerrado.');
    }
  } else {
    if (!atendimento.veterinario || atendimento.veterinario.usuario_id !== usuarioId) {
      throw new ForbiddenError('Você não está atribuído a este atendimento');
    }
    if (!STATUS_QUE_ACEITAM_DO_VETERINARIO.includes(atendimento.status)) {
      throw new ConflictError(
        'Arquivos só entram durante o atendimento. Depois de finalizado, o prontuário não muda.'
      );
    }
    veterinarioId = atendimento.veterinario.id;
  }

  const quantas = await prisma.midiaAtendimento.count({ where: { atendimento_id: atendimentoId } });
  if (quantas >= MAXIMO_POR_ATENDIMENTO) {
    throw new ConflictError(`Limite de ${MAXIMO_POR_ATENDIMENTO} arquivos por atendimento.`);
  }

  // `clinico/` de propósito: o worker de retenção varre `chat/` e só ele.
  const chave = `clinico/${atendimentoId}/${randomUUID()}.${extensaoDe(mime)}`;
  await uploadBuffer(arquivo.buffer, chave, mime);

  try {
    return await prisma.midiaAtendimento.create({
      data: {
        tenant_id: tenantId,
        atendimento_id: atendimentoId,
        autor_usuario_id: usuarioId,
        autor_papel: papel,
        veterinario_id: veterinarioId,
        storage_key: chave,
        nome_original: String(arquivo.originalname || 'arquivo').slice(0, 200),
        mime_type: mime,
        tamanho_bytes: tamanho,
        tipo,
        legenda: legenda?.trim() ? legenda.trim().slice(0, 500) : null
      },
      select: { id: true, tipo: true, legenda: true, nome_original: true, criado_em: true }
    });
  } catch (erro) {
    // Sem a linha no banco o objeto é lixo invisível: ninguém saberia que existe.
    await deleteObject(chave).catch(() => {});
    throw erro;
  }
}

/**
 * As mídias de um atendimento, com URL assinada de curta duração.
 *
 * Não faz autorização: quem chama já conferiu (`conferirAcesso`, ou a
 * conferência que o próprio endpoint do prontuário faz antes).
 */
export async function listarMidias(atendimentoId: string, tenantId: string): Promise<MidiaParaLeitura[]> {
  const midias = await prisma.midiaAtendimento.findMany({
    where: { atendimento_id: atendimentoId, tenant_id: tenantId },
    orderBy: { criado_em: 'asc' },
    select: {
      id: true,
      tipo: true,
      autor_papel: true,
      legenda: true,
      nome_original: true,
      mime_type: true,
      tamanho_bytes: true,
      criado_em: true,
      storage_key: true
    }
  });

  if (!Array.isArray(midias)) return [];

  return Promise.all(
    midias.map(async (midia) => {
      const { storage_key, ...resto } = midia;
      // Falha ao assinar não pode derrubar a leitura do prontuário inteiro.
      const url = await getSignedDownloadUrl(storage_key).catch(() => null);
      return { ...resto, url };
    })
  );
}

/**
 * Remover arquivo errado — do animal errado, desfocado, do bolso do jaleco.
 *
 * Só quem enviou, e só enquanto o atendimento está aberto. Depois do
 * fechamento nada sai: o prontuário é imutável, inclusive nas partes
 * inconvenientes.
 */
export async function removerMidia({
  midiaId,
  tenantId,
  usuarioId
}: {
  midiaId: string;
  tenantId: string;
  usuarioId: string;
}) {
  const midia = await prisma.midiaAtendimento.findFirst({
    where: { id: midiaId, tenant_id: tenantId },
    select: {
      id: true,
      storage_key: true,
      atendimento_id: true,
      autor_usuario_id: true,
      atendimento: { select: { status: true } }
    }
  });

  if (!midia) throw new NotFoundError('Arquivo não encontrado');
  if (midia.autor_usuario_id !== usuarioId) {
    throw new ForbiddenError('Só quem enviou o arquivo pode removê-lo');
  }
  if (!STATUS_QUE_ACEITAM_DO_TUTOR.includes(midia.atendimento.status)) {
    throw new ConflictError('O atendimento já foi encerrado. O prontuário não muda mais.');
  }

  await prisma.midiaAtendimento.delete({ where: { id: midiaId } });
  await deleteObject(midia.storage_key).catch(() => {});

  return { id: midiaId };
}

export {
  TIPOS_ACEITOS,
  TIPOS_IMAGEM,
  TIPOS_VIDEO,
  TIPOS_AUDIO,
  LIMITE_IMAGEM,
  LIMITE_VIDEO,
  LIMITE_AUDIO,
  MAXIMO_POR_ATENDIMENTO,
  STATUS_QUE_ACEITAM_DO_TUTOR,
  STATUS_QUE_ACEITAM_DO_VETERINARIO
};
