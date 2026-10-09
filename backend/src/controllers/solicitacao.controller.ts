import { dataBr, diaDeCalendarioBr } from '../utils/datas';
import AuditService from '../services/audit.service';
import type { PdfService } from '../services/pdf.service';
import { logoParaDocumento } from '../services/logo-veterinario.service';
import type { Request, Response } from 'express';
import type { Prisma, StatusAtendimento } from '@prisma/client';
import type { z } from 'zod';
import prisma from '../config/database';
import { comAvaliacaoDoTutor } from '../utils/avaliacao';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
  asyncHandler
} from '../middleware/error.middleware';
import {
  STATUS_ATIVOS,
  STATUS_FINALIZADOS,
  transicionar,
  atorDaRequest
} from '../services/atendimento-state.service';
import * as crmVeterinarioService from '../services/crm-veterinario.service';
import * as despachoService from '../services/despacho-solicitacao.service';
import { distanciaKm, ordenarPorDistancia, dentroDoRaio, rotuloDistancia } from '../services/geo.service';
import type { createSolicitacaoSchema, updateStatusSchema, updatePrescriptionSchema } from '../schemas/solicitacao.schema';
import type { finalizarAtendimentoSchema } from '../schemas/prontuario.schema';
import emailService from '../services/email.service';

// Corpos já validados pelo `validate(schema)` da rota: o tipo é o que sai do Zod.
type CorpoDeCriacao = z.infer<typeof createSolicitacaoSchema>;
type CorpoDeStatus = z.infer<typeof updateStatusSchema>;
type CorpoDePrescricao = z.infer<typeof updatePrescriptionSchema>;
type RegistroDeFinalizacao = z.infer<typeof finalizarAtendimentoSchema>;

// `authMiddleware` e `tenantContext` já rodaram em toda rota deste controller:
// os dois campos existem. `String()` é como o resto da casa diz isso ao compilador.
const tenantDe = (req: Request) => String(req.tenantId);
const usuarioDe = (req: Request) => String(req.userId);

// Mesmo valor que `mensagemDe(erro)` lia antes: texto para Error, `undefined` para o resto.
const mensagemDe = (erro: unknown): string | undefined => (erro instanceof Error ? erro.message : undefined);

// Campos seguros de usuário (nunca inclui a senha)
const USUARIO_SAFE_SELECT = {
  id: true,
  nome: true,
  email: true,
  telefone: true,
  tipo_usuario: true,
  foto_perfil: true,
  foto_capa: true,
  cidade: true,
  sobre: true,
  email_verificado: true,
  avaliacao_media: true,
  total_avaliacoes: true,
  criado_em: true,
  atualizado_em: true,
  tenant_id: true
} as const satisfies Prisma.UsuarioSelect;

const ROTULO_ATENDIMENTO: Record<string, string> = {
  emergencia: 'Emergência',
  consulta_domiciliar: 'Consulta domiciliar',
  teleorientacao: 'Teleorientação',
  vacinacao: 'Vacinação',
  avaliacao: 'Avaliação clínica',
  consulta_rotina: 'Consulta de rotina'
};

/**
 * Converte os itens de prescrição no texto que as telas do tutor já mostram
 * (`Solicitacao.receita`), para que o registro estruturado não obrigue nenhuma
 * tela existente a mudar de uma vez.
 */
function formatarPrescricoes(itens: RegistroDeFinalizacao['prescricoes'] = []) {
  if (!itens.length) return null;

  return itens.map((item, indice) => {
    const nome = [item.medicamento, item.concentracao, item.forma_farmaceutica].filter(Boolean).join(' ');
    const duracao = item.duracao_dias ? ` Por ${item.duracao_dias} dia(s).` : '';
    return `${indice + 1}. ${nome} — ${item.posologia}${duracao}`;
  }).join('\n');
}

// Faixa dos sinais diacríticos combinantes, que `normalize('NFD')` separa da letra.
const ACENTOS = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Chave de comparação de texto clínico digitado à mão: sem acento, sem caixa e
 * sem espaço sobrando. "Dipirona", "dipirona " e "DIPIRONA" são a mesma alergia,
 * e registrar as três encheria a ficha do animal de repetição.
 */
function chaveClinica(valor: unknown) {
  return (valor || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(ACENTOS, '');
}

/**
 * Paginação do histórico clínico do pet.
 *
 * A rota devolvia sempre os 20 atendimentos mais recentes e anunciava em
 * `resumo.total_atendimentos` um número maior — mostrava 20 e afirmava 60, sem
 * nenhuma forma de chegar aos outros 40. Aqui o corte vira página de verdade.
 *
 * Offset e não cursor, ao contrário do chat: histórico clínico fechado é uma
 * lista estável (só entra atendimento novo no topo, e raramente), então o
 * deslocamento de janela que estraga a conversa ao vivo não acontece — e o
 * veterinário quer poder pular para uma página específica.
 */
const LIMITE_HISTORICO_DO_PET = 20;
const LIMITE_MAXIMO_HISTORICO_DO_PET = 100;

function paginacaoDoHistorico(query: Request['query'] = {}) {
  const paginaPedida = Number.parseInt(String(query.pagina), 10);
  const porPaginaPedida = Number.parseInt(String(query.por_pagina), 10);

  const pagina = Number.isFinite(paginaPedida) && paginaPedida > 0 ? paginaPedida : 1;
  const porPagina = Number.isFinite(porPaginaPedida) && porPaginaPedida > 0
    ? Math.min(porPaginaPedida, LIMITE_MAXIMO_HISTORICO_DO_PET)
    : LIMITE_HISTORICO_DO_PET;

  return { pagina, porPagina };
}

// Include padrão do atendimento devolvido depois de uma transição de status.
const SOLICITACAO_COMPLETA_INCLUDE = {
  pet: true,
  tutor: { select: USUARIO_SAFE_SELECT },
  veterinario: {
    include: { usuario: { select: USUARIO_SAFE_SELECT } }
  }
} as const satisfies Prisma.SolicitacaoInclude;

class SolicitacaoController {
  // Criar nova solicitação
  create = asyncHandler(async (req: Request, res: Response) => {
    console.log('🔵 [SOLICITACAO] Criando solicitação');
    const tutorId = usuarioDe(req);
    const {
      pet_id, tipo_atendimento, localizacao_cliente, latitude, longitude, observacoes, endereco_id,
      // Escolha do profissional: só nos tipos sem pressa. Emergência continua
      // na fila aberta, onde vale o primeiro que aceitar.
      veterinario_escolhido
    }: CorpoDeCriacao = req.body;

    // Verificar se o pet pertence ao tutor
    const pet = await prisma.pet.findFirst({
      where: {
        id: pet_id,
        tenant_id: tenantDe(req),
        tutor_id: tutorId
      },
      include: {
        tutor: {
          select: { tenant_id: true }
        }
      }
    });

    if (!pet) {
      throw new NotFoundError('Pet não encontrado');
    }

    const tenant_id = pet.tutor.tenant_id;
    // `Usuario.tenant_id` é anulável no schema; a solicitação exige um tenant.
    // Sem tenant o Prisma já recusava o `create` com erro genérico (500) — aqui
    // o mesmo desfecho, só que dito antes e com o tipo estreitado.
    if (tenant_id === null) {
      throw new Error('Tutor sem tenant: solicitação não pode ser criada');
    }

    // Verificar se já existe solicitação ativa
    const solicitacaoAtiva = await prisma.solicitacao.findFirst({
      where: {
        tenant_id,
        tutor_id: tutorId,
        status: {
          in: STATUS_ATIVOS
        }
      }
    });

    if (solicitacaoAtiva) {
      throw new ConflictError('Você já possui um atendimento em andamento');
    }

    // Criar solicitação e abrir a linha do tempo no mesmo passo, para que todo
    // atendimento tenha um primeiro evento com data/hora e autor.
    // Escolha conferida ANTES de criar: escolher alguém que não pode atender
    // precisa falhar com a tela ainda aberta, e não virar um chamado dirigido a
    // quem nunca vai recebê-lo.
    let veterinarioDirigido = null;
    if (veterinario_escolhido) {
      const { validarEscolha } = (require('../services/escolha-de-veterinario.service') as typeof import('../services/escolha-de-veterinario.service'));
      veterinarioDirigido = await validarEscolha({
        tenantId: tenant_id,
        tipo: tipo_atendimento,
        veterinarioId: String(veterinario_escolhido)
      });
    }

    const solicitacao = await prisma.$transaction(async (tx) => {
      const criada = await tx.solicitacao.create({
        data: {
          tenant_id,
          tutor_id: tutorId,
          pet_id,
          tipo_atendimento,
          localizacao_cliente,
          // `latitude || null` transformava 0 em null — 0 é coordenada válida
          // (linha do equador). O schema já garante que vieram números.
          latitude,
          longitude,
          // Sintomas descritos pelo tutor: é o que o veterinário lê antes de aceitar
          // e o que abre a queixa principal do prontuário no fim do atendimento.
          observacoes: observacoes || null,
          // O chamado nasce apontando para quem o tutor escolheu — só ele é
          // avisado. Recusando, `recusar` devolve à fila aberta em vez de o
          // chamado morrer: ninguém fica sem atendimento por ter escolhido
          // alguém ocupado.
          veterinario_id: veterinarioDirigido,
          status: 'procurando_veterinario'
        },
        include: {
          pet: true,
          tutor: {
            select: {
              id: true,
              nome: true,
              telefone: true,
              cidade: true
            }
          }
        }
      });

      await tx.solicitacaoTimeline.create({
        data: {
          tenant_id,
          atendimento_id: criada.id,
          status: 'procurando_veterinario',
          ator_id: tutorId,
          ator_tipo: 'tutor',
          origem: 'api',
          // `latitude || null` transformava 0 em null — 0 é coordenada válida
          // (linha do equador). O schema já garante que vieram números.
          latitude,
          longitude,
          observacao: 'Solicitação criada pelo tutor'
        }
      });

      return criada;
    });
    console.log('✅ [SOLICITACAO] Criada:', solicitacao.id);

    // Despacho por proximidade: o chamado vai para os veterinários de plantão
    // dentro do raio da cidade, do mais perto ao mais longe, já com a
    // distância. Antes era um broadcast para todos, e cada app filtrava por
    // nome de cidade no navegador.
    const io = req.app.get('io');
    try {
      // Marca o endereço salvo como usado agora: a lista do tutor passa a vir
      // ordenada pelo que ele realmente usa, não pela ordem de cadastro.
      if (endereco_id) {
        prisma.enderecoTutor.updateMany({
          where: { id: endereco_id, tutor_id: usuarioDe(req), tenant_id: tenantDe(req) },
          data: { usado_em: new Date() }
        }).catch(() => {});
      }

      const { notificados, raioKm } = await despachoService.despacharSolicitacao({ io, solicitacao });
      console.log(`📡 [SOLICITACAO] ${solicitacao.id} despachada a ${notificados} veterinário(s) (raio ${raioKm} km)`);
    } catch (erro: unknown) {
      // O chamado já existe: falhar o despacho não pode falhar a solicitação.
      console.error('❌ [SOLICITACAO] Despacho falhou, caindo no aviso geral:', mensagemDe(erro));
      if (io) io.to(`tenant:${tenant_id}:veterinarios`).emit('solicitacao:nova', solicitacao);
    }

    (require('../services/meta-conversions.service') as typeof import('../services/meta-conversions.service')).trackConversion('Contact', {
      phone: solicitacao.tutor?.telefone
    }, { content_name: tipo_atendimento }).catch(() => {});

    return res.status(201).json({ solicitacao });
  });

  // Listar solicitações (genérico - detecta tipo de usuário)
  listar = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = usuarioDe(req);
    const userType = req.userType;

    if (userType === 'tutor') {
      const solicitacoes = await prisma.solicitacao.findMany({
        where: { tenant_id: tenantDe(req), tutor_id: usuarioId },
        include: {
          pet: true,
          veterinario: {
            include: {
              usuario: {
                select: {
                  id: true,
                  nome: true,
                  telefone: true,
                  foto_perfil: true
                }
              }
            }
          }
        },
        orderBy: { criado_em: 'desc' }
      });
      return res.json({ solicitacoes });
    } else if (userType === 'veterinario') {
      // Listar disponíveis para veterinário
      const veterinario = await prisma.veterinario.findFirst({
        where: { usuario_id: usuarioId, tenant_id: tenantDe(req), aprovado_admin: true }
      });

      if (!veterinario) {
        throw new NotFoundError('Veterinário não encontrado');
      }

      const solicitacoes = await prisma.solicitacao.findMany({
        where: {
          tenant_id: tenantDe(req),
          status: 'procurando_veterinario'
        },
        include: {
          pet: true,
          tutor: {
            select: {
              id: true,
              nome: true,
              telefone: true,
              cidade: true,
              foto_perfil: true
            }
          }
        },
        orderBy: { criado_em: 'desc' }
      });

      return res.json({ solicitacoes });
    } else if (userType === 'admin' || userType === 'super_admin') {
      // A torre de controle (`/admin/operacoes`) chamava esta rota a cada 10s e
      // caía sempre no 403 abaixo: a tela inteira só sabia dizer "sem conexão
      // com o servidor" e nunca listou um chamado sequer.
      // Aqui o admin vê a operação do próprio tenant, com os chamados em curso
      // primeiro — que é o que a tela existe para vigiar.
      const EM_CURSO: StatusAtendimento[] = [
        'criado', 'procurando_veterinario', 'oferta_enviada', 'veterinario_encontrado',
        'aceito', 'a_caminho', 'chegou', 'atendimento_em_andamento'
      ];
      const { status } = req.query;

      const solicitacoes = await prisma.solicitacao.findMany({
        where: {
          tenant_id: tenantDe(req),
          // A query chega como texto solto; valor fora do enum continua sendo
          // recusado pelo Prisma, como sempre foi.
          ...(status ? { status: String(status) as StatusAtendimento } : { status: { in: EM_CURSO } })
        },
        include: {
          pet: { select: { id: true, nome: true, especie: true, raca: true } },
          tutor: { select: { id: true, nome: true, telefone: true, cidade: true } },
          veterinario: {
            include: { usuario: { select: { id: true, nome: true, telefone: true } } }
          }
        },
        orderBy: { criado_em: 'desc' },
        take: 100
      });

      return res.json({ solicitacoes });
    } else {
      return res.status(403).json({ error: 'Tipo de usuário não autorizado' });
    }
  });

  // Listar solicitações do tutor
  listarDoTutor = asyncHandler(async (req: Request, res: Response) => {
    const tutorId = usuarioDe(req);

    const solicitacoes = await prisma.solicitacao.findMany({
      where: { tenant_id: tenantDe(req), tutor_id: tutorId },
      include: {
        pet: true,
        // O histórico mostra a nota que o tutor deu e esconde o botão "Avaliar"
        // de quem já avaliou — mas o `include` não trazia a avaliação, então a
        // nota nunca reaparecia e o convite para avaliar voltava para sempre.
        avaliacoes: {
          where: { autor_papel: 'tutor' },
          take: 1,
          select: { id: true, nota: true, comentario: true, criado_em: true }
        },
        veterinario: {
          include: {
            usuario: {
              select: {
                id: true,
                nome: true,
                telefone: true,
                foto_perfil: true
              }
            }
          }
        }
      },
      orderBy: { criado_em: 'desc' }
    });

    return res.json(solicitacoes.map(comAvaliacaoDoTutor));
  });

  // Buscar solicitação ativa do tutor
  /**
   * O chamado que o tutor tem em aberto, para a home.
   *
   * `sem_veterinario` entra aqui, e NÃO está em `STATUS_ATIVOS` de propósito —
   * ele não é um atendimento em curso, é um pedido que não achou ninguém. Mas
   * some da lista é pior do que qualquer rótulo errado: a pessoa pediu socorro
   * para o animal dela, ninguém aceitou, e a home ficava idêntica a quem nunca
   * pediu nada. O chamado sumia da tela sem uma palavra.
   *
   * O status deixou de ser terminal quando o `busca-sem-resposta.service`
   * entrou — dá para mandar procurar de novo sem repetir pet, sintoma e
   * endereço. Faltava o caminho de volta até ele.
   */
  buscarAtiva = asyncHandler(async (req: Request, res: Response) => {
    const tutorId = usuarioDe(req);

    const solicitacao = await prisma.solicitacao.findFirst({
      where: {
        tenant_id: tenantDe(req),
        tutor_id: tutorId,
        status: {
          in: [...STATUS_ATIVOS, 'sem_veterinario']
        }
      },
      include: {
        pet: true,
        veterinario: {
          include: {
            usuario: { select: USUARIO_SAFE_SELECT }
          }
        }
      }
    });

    if (!solicitacao) {
      return res.json(null);
    }

    return res.json(solicitacao);
  });

  // Veterinário aceitar solicitação
  aceitar = asyncHandler(async (req: Request, res: Response) => {
    console.log('🔵 [SOLICITACAO] Aceitando');
    const { id } = req.params;
    const usuarioId = usuarioDe(req);

    // Buscar veterinário
    const veterinario = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioId, tenant_id: tenantDe(req), aprovado_admin: true }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    if (!veterinario.aprovado_admin) {
      throw new ForbiddenError('Veterinário não aprovado');
    }

    // Buscar solicitação
    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) },
      include: { tutor: { select: USUARIO_SAFE_SELECT } }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    // Desde 26/08/2026 o veterinário também pode ser tutor e pedir atendimento
    // para o próprio pet. Aceitar o que ele mesmo pediu significaria atender a
    // si mesmo, fechar o atendimento sozinho e gerar o repasse dos 85% para a
    // própria conta — sem ninguém do outro lado para conferir nada. O despacho
    // já o exclui da fila; esta é a trava para quem chegar pela URL.
    if (solicitacao.tutor_id === usuarioId) {
      throw new ForbiddenError('Você não pode aceitar um atendimento que você mesmo pediu. Este chamado vai para outro profissional.');
    }

    if (!['procurando_veterinario', 'oferta_enviada'].includes(solicitacao.status)) {
      throw new ConflictError('Solicitação já foi aceita por outro veterinário');
    }

    const atualizada = await transicionar({
      id,
      tenantId: tenantDe(req),
      para: 'veterinario_encontrado',
      ator: atorDaRequest(req),
      deveEstarEm: ['procurando_veterinario', 'oferta_enviada'],
      dados: { veterinario_id: veterinario.id },
      observacao: 'Veterinário aceitou o chamado',
      include: SOLICITACAO_COMPLETA_INCLUDE
    });

    console.log('✅ [SOLICITACAO] Aceita');

    // Notificar tutor via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${solicitacao.tutor_id}`).emit('solicitacao:aceita', {
        solicitacaoId: id,
        tutorId: solicitacao.tutor_id,
        veterinarioId: veterinario.id
      });
    }

    // Notificação por WhatsApp é best-effort: nunca deve derrubar a resposta principal.
    const whatsappService = (require('../services/whatsapp.service') as typeof import('../services/whatsapp.service'));
    whatsappService.notifySolicitacaoAceita({
      tutorPhone: solicitacao.tutor?.telefone,
      tutorUsuarioId: solicitacao.tutor_id,
      solicitacaoId: id,
      veterinarioNome: atualizada.veterinario?.usuario?.nome
    }).catch((error: unknown) => console.error('❌ [SOLICITACAO] Falha ao notificar WhatsApp (ignorado):', mensagemDe(error)));

    return res.json(atualizada);
  });

  // Atualizar status da solicitação
  atualizarStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status }: CorpoDeStatus = req.body;
    const usuarioId = usuarioDe(req);

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) },
      include: { veterinario: true }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    // Verificar permissão
    if (solicitacao.veterinario?.usuario_id !== usuarioId) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const atualizada = await transicionar({
      id,
      tenantId: tenantDe(req),
      para: status,
      ator: atorDaRequest(req),
      include: SOLICITACAO_COMPLETA_INCLUDE
    });

    // Notificar via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`atendimento:${id}`).emit('atendimento:status', {
        solicitacaoId: id,
        status,
        tutorId: solicitacao.tutor_id,
        veterinarioId: solicitacao.veterinario_id
      });
    }

    return res.json(atualizada);
  });

  // Atualizar localização ao vivo do veterinário durante o deslocamento
  updateLiveLocation = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { latitude, longitude } = req.body;
    const usuarioId = usuarioDe(req);

    if (latitude === undefined || longitude === undefined) {
      throw new ValidationError('Latitude e Longitude são obrigatórias');
    }

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) },
      include: { veterinario: true }
    });

    if (!solicitacao || solicitacao.veterinario?.usuario_id !== usuarioId) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const atualizada = await prisma.solicitacao.update({
      where: { id },
      data: {
        latitude_vet: parseFloat(latitude),
        longitude_vet: parseFloat(longitude),
        ultimo_ping_vet: new Date()
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`atendimento:${id}`).emit('vet:location_update', {
        solicitacaoId: id,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        timestamp: new Date()
      });
    }

    return res.json({ success: true, latitude: parseFloat(latitude), longitude: parseFloat(longitude) });
  });

  // Listar solicitações disponíveis para veterinários
  listarDisponiveis = asyncHandler(async (req: Request, res: Response) => {
    const { status } = req.query;
    const usuarioId = usuarioDe(req);

    const where: Prisma.SolicitacaoWhereInput = {
      tenant_id: tenantDe(req),
      // Texto solto da query: valor fora do enum continua sendo recusado pelo Prisma.
      status: status ? (String(status) as StatusAtendimento) : 'procurando_veterinario',
      // O profissional que pediu atendimento para o próprio pet não vê o
      // próprio chamado na fila de plantão — ele não pode aceitá-lo, e
      // mostrar o que não se pode aceitar só ensina a ignorar a lista.
      tutor_id: { not: usuarioId }
    };

    // A posição do veterinário é gravada quando ele entra em plantão; sem ela
    // a lista continua vindo por data, como antes.
    const [solicitacoes, veterinario] = await Promise.all([
      prisma.solicitacao.findMany({
        where,
        include: {
          pet: true,
          tutor: {
            select: {
              id: true,
              nome: true,
              telefone: true,
              cidade: true,
              // Reputação do tutor: é o outro lado da confiança que o produto
              // promete. Quem já foi bem recebido antes merece aparecer assim.
              avaliacao_media: true,
              total_avaliacoes: true
            }
          }
        },
        orderBy: { criado_em: 'desc' }
      }),
      prisma.veterinario.findFirst({
        where: { usuario_id: usuarioId, tenant_id: tenantDe(req) },
        select: { latitude: true, longitude: true }
      })
    ]);

    // O que o tutor anexou ao pedir socorro. É a diferença entre aceitar às
    // cegas e ver a ferida antes de decidir — e é a razão de o anexo existir.
    const { listarMidias } = (require('../services/midia-atendimento.service') as typeof import('../services/midia-atendimento.service'));
    const comMidias = await Promise.all(
      solicitacoes.map(async (solicitacao) => ({
        ...solicitacao,
        midias: await listarMidias(solicitacao.id, tenantDe(req)).catch(() => [])
      }))
    );

    if (!veterinario || veterinario.latitude == null || veterinario.longitude == null) {
      return res.json({ solicitacoes: comMidias, distancia_disponivel: false });
    }

    // Mesma regra do despacho: raio da cidade do tutor, quem está sem
    // coordenada não some da lista — só perde a preferência de ordem.
    const comDistancia = await Promise.all(
      comMidias.map(async (solicitacao) => {
        const distancia = distanciaKm(
          veterinario.latitude,
          veterinario.longitude,
          solicitacao.latitude,
          solicitacao.longitude
        );
        const raioKm = await despachoService.raioDaCidade(tenantDe(req), solicitacao.tutor?.cidade);
        return {
          ...solicitacao,
          distancia_km: distancia,
          distancia_label: rotuloDistancia(distancia),
          dentro_do_raio: dentroDoRaio(distancia, raioKm)
        };
      })
    );

    return res.json({
      solicitacoes: ordenarPorDistancia(comDistancia.filter((item) => item.dentro_do_raio)),
      fora_do_raio: ordenarPorDistancia(comDistancia.filter((item) => !item.dentro_do_raio)),
      distancia_disponivel: true
    });
  });

  // Iniciar atendimento
  iniciar = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const usuarioId = usuarioDe(req);

    const veterinario = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioId, tenant_id: tenantDe(req), aprovado_admin: true }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    if (solicitacao.veterinario_id !== veterinario.id) {
      throw new ForbiddenError('Você não está atribuído a esta solicitação');
    }

    // Antes esta rota aceitava também `veterinario_encontrado` e `a_caminho`,
    // permitindo pular o deslocamento e a chegada — etapas que o tutor acompanha
    // ao vivo. O início do atendimento agora exige que o vet já tenha marcado chegada.
    const atualizada = await transicionar({
      id,
      tenantId: tenantDe(req),
      para: 'atendimento_em_andamento',
      ator: atorDaRequest(req),
      deveEstarEm: ['chegou'],
      observacao: 'Atendimento iniciado pelo veterinário',
      include: SOLICITACAO_COMPLETA_INCLUDE
    });

    // Notificar via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`atendimento:${id}`).emit('atendimento:iniciado', {
        solicitacaoId: id,
        tutorId: solicitacao.tutor_id
      });
    }

    return res.json({ solicitacao: atualizada });
  });

  // Finalizar atendimento registrando o prontuário eletrônico
  finalizar = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const registro: RegistroDeFinalizacao = req.body;
    const usuarioId = usuarioDe(req);

    const veterinario = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioId, tenant_id: tenantDe(req), aprovado_admin: true }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) },
      include: {
        pet: true,
        tutor: { select: USUARIO_SAFE_SELECT }
      }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    if (solicitacao.veterinario_id !== veterinario.id) {
      throw new ForbiddenError('Você não está atribuído a esta solicitação');
    }

    if (solicitacao.status !== 'atendimento_em_andamento') {
      throw new ConflictError('Atendimento não pode ser finalizado no status atual');
    }

    const vetUser = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    const petItem = solicitacao.pet;
    const tutorUser = solicitacao.tutor;

    // `queixa_principal` é obrigatória no prontuário. Quando o veterinário não a
    // reescreve, vale o que o tutor descreveu ao abrir o chamado.
    const queixaPrincipal = registro.queixa_principal
      || solicitacao.observacoes
      || ROTULO_ATENDIMENTO[solicitacao.tipo_atendimento]
      || 'Atendimento veterinário';

    // A prescrição estruturada também precisa existir como texto: as telas do tutor
    // e o histórico do veterinário leem `Solicitacao.receita`.
    const receitaTexto = registro.receita || formatarPrescricoes(registro.prescricoes);
    const diagnosticoTexto = registro.diagnostico_definitivo || registro.hipotese_diagnostica;

    // As alergias que o veterinário acabou de registrar valem para o animal, não
    // para este atendimento: só entram as que ainda não estavam na ficha do pet.
    const alergiasJaRegistradas = await prisma.petAlergia.findMany({
      where: { tenant_id: tenantDe(req), pet_id: solicitacao.pet_id, ativo: true },
      orderBy: { criado_em: 'asc' }
    });

    const chavesConhecidas = new Set(alergiasJaRegistradas.map((item) => chaveClinica(item.alergia)));
    const alergiasNovas: RegistroDeFinalizacao['alergias'] = [];
    for (const item of registro.alergias) {
      const chave = chaveClinica(item.alergia);
      if (!chave || chavesConhecidas.has(chave)) continue;
      chavesConhecidas.add(chave);
      alergiasNovas.push(item);
    }

    // O documento sai com a ficha completa do animal, não só com o que foi digitado hoje.
    const alergiasDoPet = [...alergiasJaRegistradas, ...alergiasNovas];

    // Um único instante para todo o fechamento: aplicação de vacina, início de
    // medicação e encerramento da medicação substituída precisam bater entre si.
    const agora = new Date();

    // A mesma vacina no mesmo dia é a mesma aplicação, ainda que digitada duas vezes.
    const vacinasAplicadas: RegistroDeFinalizacao['vacinas'] = [];
    const chavesDeVacina = new Set();
    for (const item of registro.vacinas) {
      const chave = `${chaveClinica(item.nome_vacina)}|${(item.data_aplicacao || agora).toISOString().slice(0, 10)}`;
      if (chavesDeVacina.has(chave)) continue;
      chavesDeVacina.add(chave);
      vacinasAplicadas.push(item);
    }

    // Repetiu o mesmo medicamento no formulário? Vale a última linha, que é a
    // que o veterinário terminou de escrever.
    const medicamentosPorChave = new Map();
    for (const item of registro.medicamentos) {
      medicamentosPorChave.set(chaveClinica(item.nome_medicamento), item);
    }
    const medicamentosEmUso = [...medicamentosPorChave.values()];

    const medicamentosAtivos = medicamentosEmUso.length > 0
      ? await prisma.petMedicamento.findMany({
        where: {
          tenant_id: tenantDe(req),
          pet_id: solicitacao.pet_id,
          ativo: true,
          OR: [{ data_fim: null }, { data_fim: { gte: agora } }]
        }
      })
      : [];

    const medicamentosAtivosPorChave = new Map(
      medicamentosAtivos.map((item) => [chaveClinica(item.nome_medicamento), item])
    );

    const dadosDoPaciente = {
      protocolo: solicitacao.id.slice(0, 8).toUpperCase(),
      nomeTutor: tutorUser?.nome,
      // `USUARIO_SAFE_SELECT` não carrega `cpf`, então este campo sempre chegou
      // `undefined` ao PDF. Mantido: expor o CPF no documento é decisão de produto.
      cpfTutor: undefined,
      nomePet: petItem?.nome,
      especiePet: petItem?.especie || petItem?.tipo,
      racaPet: petItem?.raca,
      idadePet: petItem?.idade,
      pesoPet: petItem?.peso,
      nomeVet: vetUser?.nome,
      crmvVet: veterinario.crmv,
      ufCrmv: veterinario.crmv_uf || 'SP',
      dataAtendimento: dataBr(),
      // Logo do consultório no cabeçalho, quando o veterinário enviou um.
      logoVet: await logoParaDocumento(veterinario)
    };

    let receita_pdf_url = null;
    let prontuario_pdf_url = null;

    try {
      // O módulo exporta a INSTÂNCIA (`module.exports = pdfService`). Até
      // 08/10/2026 esta linha lia `.default`, que nesse formato não existe: o
      // fechamento falhava com "Cannot read properties of undefined (reading
      // 'gerarReceitaPdf')", o aviso era engolido e o tutor ficava sem receita
      // e sem prontuário até a rotina de reemissão passar, até 30 minutos depois.
      const pdfService: PdfService = require('../services/pdf.service');
      const resultadoReceita = await pdfService.gerarReceitaPdf({
        ...dadosDoPaciente,
        medicamentos: registro.prescricoes.map((item) => ({
          nome: [item.medicamento, item.concentracao].filter(Boolean).join(' '),
          posologia: [item.posologia, item.duracao_dias ? `Por ${item.duracao_dias} dia(s).` : null]
            .filter(Boolean).join(' ')
        })),
        // Sem itens estruturados a receita antiga (texto livre) é o corpo do documento.
        orientacoes: [registro.prescricoes.length ? null : registro.receita, registro.orientacoes_tutor]
          .filter(Boolean).join('\n\n') || null
      });
      receita_pdf_url = resultadoReceita.cdnUrl;

      // Estes nomes precisam bater com os parâmetros de `gerarProntuarioPdf`. Antes
      // eram outros (`queixaPrincipal`, `diagnosticoDefinitivo`, `orientacoesTutor`)
      // e o PDF enviado ao tutor saía inteiro com os textos genéricos de fallback,
      // sem uma linha do que o veterinário escreveu.
      const resultadoProntuario = await pdfService.gerarProntuarioPdf({
        ...dadosDoPaciente,
        anamnese: queixaPrincipal,
        exameFisico: registro.exame_fisico,
        hipotesesDiagnosticas: [
          registro.hipotese_diagnostica,
          registro.diagnostico_definitivo && registro.diagnostico_definitivo !== registro.hipotese_diagnostica
            ? `Diagnóstico definitivo: ${registro.diagnostico_definitivo}`
            : null
        ].filter(Boolean).join('\n'),
        conduta: [receitaTexto, registro.orientacoes_tutor].filter(Boolean).join('\n\n') || null,
        exames: registro.exames,
        alergias: alergiasDoPet,
        vacinas: vacinasAplicadas.map((item) => ({
          ...item,
          // Dia de calendário quando o veterinário informou; sem data, é "agora".
          data_aplicacao: item.data_aplicacao ? diaDeCalendarioBr(item.data_aplicacao) : dataBr(agora),
          proxima_dose: item.proxima_dose ? diaDeCalendarioBr(item.proxima_dose) : null
        })),
        // O documento registra que existem fotos e o que cada uma mostra; a
        // imagem fica no aplicativo. Falhar aqui não pode impedir o fechamento.
        fotos: await prisma.midiaAtendimento
          .findMany({
            where: { atendimento_id: id, tenant_id: tenantDe(req) },
            orderBy: { criado_em: 'asc' },
            select: { legenda: true, tipo: true, autor_papel: true }
          })
          .catch(() => []),
        retornoSugerido: registro.retorno_sugerido_em
          ? diaDeCalendarioBr(registro.retorno_sugerido_em)
          : null
      });
      prontuario_pdf_url = resultadoProntuario.cdnUrl;
    } catch (pdfErr: unknown) {
      console.error('⚠️ [PDF GENERATION WARNING] Falha ao gerar PDF no R2 (ignorado):', mensagemDe(pdfErr));
    }

    // Status e prontuário na mesma transação: um atendimento finalizado sem
    // registro clínico é exatamente o que esta rota existe para impedir.
    const atualizada = await transicionar({
      id,
      tenantId: tenantDe(req),
      para: 'finalizado',
      ator: atorDaRequest(req),
      deveEstarEm: ['atendimento_em_andamento'],
      dados: {
        diagnostico: diagnosticoTexto,
        receita: receitaTexto,
        receita_pdf_url,
        prontuario_pdf_url,
        finalizado_em: new Date()
      },
      observacao: 'Atendimento finalizado com prontuário registrado',
      include: SOLICITACAO_COMPLETA_INCLUDE,
      aposTransicao: async (tx, atendimentoId) => {
        // O contador de atendimentos do veterinário é RECONTADO aqui, na mesma
        // transação do fechamento. Ele tinha sido tirado da avaliação ("quem
        // conta é o fechamento") e o fechamento nunca passou a contar: o número
        // ficou em zero para todos — no perfil do profissional e na lista em
        // que o tutor escolhe quem vai atender. Recontar em vez de somar não
        // desanda se uma transação for revertida.
        const totalDeAtendimentos = await tx.solicitacao.count({
          where: { tenant_id: tenantDe(req), veterinario_id: veterinario.id, status: { in: STATUS_FINALIZADOS } }
        });
        await tx.veterinario.update({ where: { id: veterinario.id }, data: { total_atendimentos: totalDeAtendimentos } });

        await tx.prontuarioEletronico.create({
          data: {
            tenant_id: tenantDe(req),
            atendimento_id: atendimentoId,
            pet_id: solicitacao.pet_id,
            veterinario_id: veterinario.id,
            queixa_principal: queixaPrincipal,
            exame_fisico: registro.exame_fisico,
            hipotese_diagnostica: registro.hipotese_diagnostica,
            diagnostico_definitivo: registro.diagnostico_definitivo,
            orientacoes_tutor: registro.orientacoes_tutor,
            retorno_sugerido_em: registro.retorno_sugerido_em || null,
            pdf_prontuario_url: prontuario_pdf_url,
            itensPrescricao: {
              create: registro.prescricoes.map((item) => ({
                medicamento: item.medicamento,
                concentracao: item.concentracao,
                // A coluna nasceu com o nome trocado (`forma_farmacia`).
                forma_farmaceutica: item.forma_farmaceutica,
                posologia: item.posologia,
                duracao_dias: item.duracao_dias ?? null
              }))
            },
            examesSolicitados: {
              create: registro.exames.map((item) => ({
                nome_exame: item.nome_exame,
                justificativa: item.justificativa
              }))
            }
          }
        });

        // Alergia é do animal e sobrevive ao atendimento: é o que o próximo
        // veterinário lê antes de prescrever.
        if (alergiasNovas.length > 0) {
          await tx.petAlergia.createMany({
            data: alergiasNovas.map((item) => ({
              tenant_id: tenantDe(req),
              pet_id: solicitacao.pet_id,
              alergia: item.alergia,
              gravidade: item.gravidade,
              observacoes: item.observacoes
            }))
          });
        }

        // A vacina aplicada é um evento do animal, não do atendimento: é ela que
        // alimenta a carteira digital do tutor e a tag pública do pet, que já
        // liam `pets_vacinas` e só encontravam tabela vazia.
        if (vacinasAplicadas.length > 0) {
          await tx.petVacina.createMany({
            data: vacinasAplicadas.map((item) => ({
              tenant_id: tenantDe(req),
              pet_id: solicitacao.pet_id,
              nome_vacina: item.nome_vacina,
              laboratorio: item.laboratorio,
              lote: item.lote,
              data_aplicacao: item.data_aplicacao || agora,
              proxima_dose: item.proxima_dose,
              veterinario_nome: vetUser?.nome || null
            }))
          });
        }

        // Uma medicação em uso substitui a anterior de mesmo nome: quando o
        // veterinário reescreve "Prednisolona" com outra dose, o registro antigo
        // é encerrado hoje em vez de conviver com o novo dizendo outra coisa.
        for (const item of medicamentosEmUso) {
          const anterior = medicamentosAtivosPorChave.get(chaveClinica(item.nome_medicamento));
          if (anterior) {
            await tx.petMedicamento.update({
              where: { id: anterior.id },
              data: { data_fim: agora }
            });
          }

          await tx.petMedicamento.create({
            data: {
              tenant_id: tenantDe(req),
              pet_id: solicitacao.pet_id,
              nome_medicamento: item.nome_medicamento,
              dosagem: item.dosagem,
              frequencia_horas: item.frequencia_horas,
              uso_continuo: item.uso_continuo,
              data_inicio: item.data_inicio || agora,
              data_fim: item.data_fim,
              observacoes: item.observacoes
            }
          });
        }

        // O retorno sugerido só existia como data dentro do prontuário — ninguém
        // era avisado dele. Agora vira lembrete do tutor, na mesma transação:
        // ou o atendimento fecha com o retorno agendado, ou não fecha.
        const lembretes = [];

        if (registro.retorno_sugerido_em) {
          lembretes.push({
            titulo: `Consulta de retorno — ${petItem?.nome || 'seu pet'}`,
            tipo: 'retorno',
            data_lembrete: registro.retorno_sugerido_em
          });
        }

        for (const item of vacinasAplicadas) {
          if (!item.proxima_dose) continue;
          lembretes.push({
            titulo: `Reforço da vacina ${item.nome_vacina}`,
            tipo: 'vacina',
            data_lembrete: item.proxima_dose
          });
        }

        if (lembretes.length > 0) {
          await tx.lembretePet.createMany({
            data: lembretes.map((item) => ({
              tenant_id: tenantDe(req),
              tutor_id: solicitacao.tutor_id,
              pet_id: solicitacao.pet_id,
              // Quem pediu o retorno. Sem isto o e-mail saía assinado com a
              // string literal "veterinário responsável" e o tutor não sabia
              // quem o havia chamado de volta.
              veterinario_id: veterinario.id,
              ...item
            }))
          });
        }

        // A ficha comercial do cliente acompanha o fechamento: é aqui que
        // "atendimento avulso" vira clientela. Fica na mesma transação para
        // não existir atendimento fechado sem cliente correspondente.
        await crmVeterinarioService.recalcularFicha(
          {
            tenantId: tenantDe(req),
            veterinarioId: veterinario.id,
            tutorId: solicitacao.tutor_id
          },
          tx
        );
      }
    });

    const prontuario = await prisma.prontuarioEletronico.findUnique({
      where: { atendimento_id: id },
      include: { itensPrescricao: true, examesSolicitados: true }
    });

    // Notificar via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`atendimento:${id}`).emit('atendimento:finalizado', {
        solicitacaoId: id,
        tutorId: solicitacao.tutor_id,
        diagnostico: diagnosticoTexto,
        receita: receitaTexto,
        receita_pdf_url,
        prontuario_pdf_url,
        orientacoes: registro.orientacoes_tutor
      });
    }

    // Disparar E-mail para o Tutor com os Documentos PDF em Anexo via Resend (best-effort)
    if (tutorUser && tutorUser.email) {
      emailService.enviarEmailReceitaEProntuario(
        tutorUser.email,
        tutorUser.nome,
        petItem?.nome || 'Pet',
        receita_pdf_url,
        prontuario_pdf_url
      ).catch((e: unknown) => console.error('⚠️ [EMAIL WARNING] Falha ao enviar receita por e-mail (ignorado):', mensagemDe(e)));
    }

    return res.json({
      solicitacao: atualizada,
      prontuario,
      diagnostico: diagnosticoTexto,
      receita: receitaTexto,
      receita_pdf_url,
      prontuario_pdf_url
    });
  });

  // Prontuário do atendimento: visível para os participantes e para o admin do tenant
  /**
   * Acervo de arquivos do atendimento.
   *
   * `SolicitacaoAnexo` existia no schema para ser esse acervo e nunca recebeu
   * uma linha sequer — os arquivos sempre viveram presos à mensagem do chat.
   * Em vez de manter uma segunda tabela para os mesmos bytes, o acervo é uma
   * leitura sobre o que já existe: todo anexo das mensagens deste atendimento,
   * do mais recente ao mais antigo, com URL assinada na hora.
   */
  anexos = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) },
      include: { veterinario: { select: { usuario_id: true } } }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const isParticipant = solicitacao.tutor_id === usuarioDe(req) ||
      solicitacao.veterinario?.usuario_id === usuarioDe(req);
    if (!isParticipant && req.userType !== 'admin') {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const anexos = await prisma.mensagemAnexo.findMany({
      where: { tenant_id: tenantDe(req), mensagem: { atendimento_id: id } },
      orderBy: { criado_em: 'desc' },
      include: { mensagem: { select: { id: true, remetente_id: true, criado_em: true } } }
    });

    const { getSignedDownloadUrl } = (require('../config/r2') as typeof import('../config/r2'));

    const arquivos = await Promise.all(anexos.map(async (anexo) => ({
      id: anexo.id,
      nome_original: anexo.nome_original,
      mime_type: anexo.mime_type,
      tamanho_bytes: anexo.tamanho_bytes,
      tipo: anexo.tipo,
      criado_em: anexo.criado_em,
      mensagem_id: anexo.mensagem_id,
      enviado_por: anexo.mensagem?.remetente_id || null,
      // Binário já recolhido pela política de retenção: a linha fica, o
      // arquivo não. Assinar URL de objeto inexistente só geraria link morto.
      arquivo_removido: Boolean(anexo.arquivo_removido_em),
      url: anexo.arquivo_removido_em ? null : await getSignedDownloadUrl(anexo.storage_key)
    })));

    return res.json({ anexos: arquivos, total: arquivos.length });
  });

  prontuario = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) },
      include: { veterinario: { select: { usuario_id: true } } }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const isParticipant = solicitacao.tutor_id === usuarioDe(req) ||
      solicitacao.veterinario?.usuario_id === usuarioDe(req);
    const isTenantAdmin = req.userType === 'admin';
    if (!isParticipant && !isTenantAdmin) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const prontuarioRegistrado = await prisma.prontuarioEletronico.findUnique({
      where: { atendimento_id: id },
      include: { itensPrescricao: true, examesSolicitados: true }
    });

    // Autorização já conferida acima (participante ou admin do tenant): a foto
    // clínica é dado sensível de saúde e só sai por URL assinada de curta duração.
    // A mídia é acréscimo ao prontuário, não o prontuário: falha ao listá-la não
    // pode impedir o tutor de ler o registro clínico.
    const { listarMidias } = (require('../services/midia-atendimento.service') as typeof import('../services/midia-atendimento.service'));
    const midias = await listarMidias(id, tenantDe(req)).catch(() => []);

    return res.json({
      atendimento_id: id,
      status: solicitacao.status,
      midias,
      // Desfecho de emergência: sai em campo próprio, não escondido no texto.
      encaminhamento: solicitacao.encaminhamento_motivo
        ? {
            motivo: solicitacao.encaminhamento_motivo,
            orientacao: solicitacao.encaminhamento_orientacao,
            em: solicitacao.encaminhado_em
          }
        : null,
      // Atendimentos fechados antes do prontuário estruturado só têm os textos livres.
      prontuario: prontuarioRegistrado,
      diagnostico: solicitacao.diagnostico,
      receita: solicitacao.receita,
      queixa_do_tutor: solicitacao.observacoes,
      receita_pdf_url: solicitacao.receita_pdf_url,
      prontuario_pdf_url: solicitacao.prontuario_pdf_url,
      finalizado_em: solicitacao.finalizado_em
    });
  });

  /**
   * Histórico clínico acumulado do pet do atendimento.
   *
   * Cada atendimento era legível isoladamente e nada somava por animal: o
   * veterinário prescrevia sem enxergar o que já tinha sido prescrito, nem a
   * alergia registrada por outro colega. Esta rota é a leitura por pet, ancorada
   * no atendimento porque é ele que carrega a autorização — os participantes e o
   * admin do tenant, os mesmos de `GET /:id/prontuario`.
   *
   * O escopo é o tenant: dentro da mesma clínica, o histórico do animal é
   * compartilhado entre os veterinários, e é isso que sustenta a continuidade
   * do tratamento.
   */
  historicoDoPet = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) },
      include: { pet: true, veterinario: { select: { usuario_id: true } } }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const isParticipant = solicitacao.tutor_id === usuarioDe(req) ||
      solicitacao.veterinario?.usuario_id === usuarioDe(req);
    // `super_admin` junto: ele já pode corrigir a ficha (`ficha-clinica.routes`),
    // e corrigir sem conseguir ler deixava a tela do admin em branco para ele.
    const isTenantAdmin = req.userType === 'admin' || req.userType === 'super_admin';
    if (!isParticipant && !isTenantAdmin) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const filtroDosAnteriores = {
      tenant_id: tenantDe(req),
      pet_id: solicitacao.pet_id,
      id: { not: id },
      status: { in: STATUS_FINALIZADOS }
    };

    const agora = new Date();
    const { pagina, porPagina } = paginacaoDoHistorico(req.query);

    const [anteriores, totalAnteriores, alergias, vacinas, medicamentosEmUso, lembretes] = await Promise.all([
      prisma.solicitacao.findMany({
        where: filtroDosAnteriores,
        include: {
          prontuario: { include: { itensPrescricao: true, examesSolicitados: true } },
          veterinario: { include: { usuario: { select: { nome: true } } } }
        },
        orderBy: [{ finalizado_em: 'desc' }, { criado_em: 'desc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina
      }),
      prisma.solicitacao.count({ where: filtroDosAnteriores }),
      // `ativo: true` em toda a ficha: o que um veterinário removeu não pode
      // continuar guiando a conduta do próximo.
      prisma.petAlergia.findMany({
        where: { tenant_id: tenantDe(req), pet_id: solicitacao.pet_id, ativo: true },
        orderBy: { criado_em: 'asc' }
      }),
      prisma.petVacina.findMany({
        where: { tenant_id: tenantDe(req), pet_id: solicitacao.pet_id, ativo: true },
        orderBy: { data_aplicacao: 'desc' }
      }),
      // Só o que o animal usa hoje: medicação encerrada não muda a conduta de agora.
      prisma.petMedicamento.findMany({
        where: {
          tenant_id: tenantDe(req),
          pet_id: solicitacao.pet_id,
          ativo: true,
          OR: [{ data_fim: null }, { data_fim: { gte: agora } }]
        },
        orderBy: { data_inicio: 'desc' }
      }),
      prisma.lembretePet.findMany({
        where: { tenant_id: tenantDe(req), pet_id: solicitacao.pet_id, concluido: false },
        orderBy: { data_lembrete: 'asc' },
        take: 10
      })
    ]);

    // Mídias dos atendimentos desta página, em uma rodada só — uma consulta por
    // atendimento transformaria o histórico numa rajada de queries.
    const { listarMidias } = (require('../services/midia-atendimento.service') as typeof import('../services/midia-atendimento.service'));
    const midiasPorAtendimento = new Map(
      await Promise.all(
        anteriores.map(async (item) => [
          item.id,
          await listarMidias(item.id, tenantDe(req)).catch(() => [])
        ] as const)
      )
    );

    const atendimentos = anteriores.map((item) => ({
      atendimento_id: item.id,
      tipo_atendimento: item.tipo_atendimento,
      data: item.finalizado_em || item.criado_em,
      veterinario: item.veterinario?.usuario?.nome || null,
      crmv: item.veterinario?.crmv || null,
      // Atendimentos fechados antes do prontuário estruturado (agosto de 2026) só
      // têm os textos livres da própria solicitação. Eles continuam no histórico:
      // omiti-los daria ao veterinário a impressão de um animal sem passado.
      estruturado: Boolean(item.prontuario),
      queixa_principal: item.prontuario?.queixa_principal || item.observacoes || null,
      exame_fisico: item.prontuario?.exame_fisico || null,
      hipotese_diagnostica: item.prontuario?.hipotese_diagnostica || null,
      diagnostico: item.prontuario?.diagnostico_definitivo || item.diagnostico || null,
      orientacoes_tutor: item.prontuario?.orientacoes_tutor || null,
      retorno_sugerido_em: item.prontuario?.retorno_sugerido_em || null,
      prescricoes: item.prontuario?.itensPrescricao || [],
      exames: item.prontuario?.examesSolicitados || [],
      // `PUT /:id/prescricao` corrige só este texto depois do fechamento, sem
      // tocar nos itens estruturados: ele é a versão vigente da prescrição.
      receita_texto: item.receita || null,
      receita_pdf_url: item.receita_pdf_url,
      prontuario_pdf_url: item.prontuario_pdf_url,
      // A lesão fotografada no atendimento anterior é o que permite comparar hoje.
      midias: midiasPorAtendimento.get(item.id) || [],
      // Encaminhado é desfecho, não ausência de desfecho: quem atender depois
      // precisa saber que o caso já excedeu o atendimento domiciliar uma vez.
      encaminhamento: item.encaminhamento_motivo
        ? { motivo: item.encaminhamento_motivo, orientacao: item.encaminhamento_orientacao, em: item.encaminhado_em }
        : null
    }));

    // Todo medicamento já prescrito ao animal, do mais recente para o mais antigo.
    // Não confundir com `medicamentos_em_uso`: aqui é o que já foi receitado
    // algum dia, ali é o que o animal toma hoje.
    const jaPrescritos = [];
    const chavesDeMedicamento = new Set();
    for (const atendimento of atendimentos) {
      for (const item of atendimento.prescricoes) {
        const chave = chaveClinica(item.medicamento);
        if (!chave || chavesDeMedicamento.has(chave)) continue;
        chavesDeMedicamento.add(chave);
        jaPrescritos.push({
          medicamento: item.medicamento,
          concentracao: item.concentracao,
          prescrito_em: atendimento.data
        });
      }
    }

    return res.json({
      atendimento_id: id,
      pet: solicitacao.pet,
      alergias,
      vacinas,
      medicamentos_em_uso: medicamentosEmUso,
      lembretes,
      atendimentos,
      paginacao: {
        pagina,
        por_pagina: porPagina,
        total: totalAnteriores,
        paginas: Math.max(1, Math.ceil(totalAnteriores / porPagina))
      },
      resumo: {
        total_atendimentos: totalAnteriores,
        exibindo: atendimentos.length,
        // Da página atual: o veterinário só vê como "último" o que está na sua
        // frente, e afirmar a data de um atendimento fora da página seria mentir
        // sobre o que a tela mostra.
        ultimo_atendimento_em: atendimentos[0]?.data || null,
        // Idem: extraído dos atendimentos desta página. A tela acumula ao
        // carregar mais, que é onde a lista completa se forma.
        medicamentos_ja_prescritos: jaPrescritos
      }
    });
  });

  // Listar todas as solicitações atribuídas ao veterinário logado
  listarDoVeterinario = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = usuarioDe(req);

    const veterinario = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioId, tenant_id: tenantDe(req), aprovado_admin: true }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const solicitacoes = await prisma.solicitacao.findMany({
      where: { tenant_id: tenantDe(req), veterinario_id: veterinario.id },
      include: {
        pet: true,
        tutor: { select: USUARIO_SAFE_SELECT },
        avaliacoes: true
      },
      orderBy: { criado_em: 'desc' }
    });

    return res.json(solicitacoes.map(comAvaliacaoDoTutor));
  });

  // Mapeia as abas da tela de agendamentos para os status reais da solicitação
  porStatusVeterinario = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = usuarioDe(req);
    const { status } = req.query;

    const veterinario = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioId, tenant_id: tenantDe(req), aprovado_admin: true }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const statusPorAba: Record<string, StatusAtendimento[]> = {
      pendentes: ['veterinario_encontrado'],
      confirmados: ['a_caminho', 'chegou', 'atendimento_em_andamento'],
      finalizados: ['finalizado', 'concluido'],
      cancelados: ['cancelado']
    };

    const statusFiltro = statusPorAba[String(status)];

    if (!statusFiltro) {
      throw new ValidationError('Aba inválida. Use: pendentes, confirmados, finalizados ou cancelados');
    }

    const solicitacoes = await prisma.solicitacao.findMany({
      where: {
        tenant_id: tenantDe(req),
        veterinario_id: veterinario.id,
        status: { in: statusFiltro }
      },
      include: {
        pet: true,
        tutor: { select: USUARIO_SAFE_SELECT },
        avaliacoes: true
      },
      orderBy: { criado_em: 'desc' }
    });

    return res.json(solicitacoes.map(comAvaliacaoDoTutor));
  });

  atualizarPrescricao = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { receita, prescricoes, motivo }: CorpoDePrescricao = req.body;
    const veterinario = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioDe(req), tenant_id: tenantDe(req), aprovado_admin: true },
      include: { usuario: { select: { nome: true } } }
    });

    if (!veterinario) throw new NotFoundError('Veterinário não encontrado');

    const solicitacao = await prisma.solicitacao.findFirst({ where: { id, tenant_id: tenantDe(req) } });
    if (!solicitacao) throw new NotFoundError('Solicitação não encontrada');
    if (solicitacao.veterinario_id !== veterinario.id) throw new ForbiddenError('Sem permissão para alterar esta prescrição');
    if (!STATUS_FINALIZADOS.includes(solicitacao.status)) throw new ConflictError('A prescrição só pode ser registrada após a finalização do atendimento');

    // Corrigir receita de atendimento fechado é retificação, não edição: o
    // documento é reemitido com marca de versão, a via anterior fica
    // guardada e o tutor é avisado de que o papel em mãos não vale mais.
    const { retificarReceita } = (require('../services/receita-retificacao.service') as typeof import('../services/receita-retificacao.service'));
    const resultado = await retificarReceita({
      atendimentoId: id,
      tenantId: tenantDe(req),
      veterinario,
      motivo,
      prescricoes,
      receitaTexto: receita
    });

    // Mesmo erro do gerador de PDF (08/10/2026): esta linha lia o serviço por
    // `require(...).default`, que não existe num módulo que exporta com
    // `module.exports`. A retificação era gravada, o tutor era avisado e o
    // veterinário recebia erro 500 — sem trilha de auditoria e com o convite
    // a tentar de novo, gerando outra versão do documento.
    AuditService.logForensicEvent({
      req,
      entityType: 'Solicitacao',
      entityId: id,
      action: 'prescricao.retificada_apos_finalizacao',
      estadoAnterior: { receita: solicitacao.receita, versao: solicitacao.receita_versao, pdf: solicitacao.receita_pdf_url },
      estadoPosterior: { receita: resultado.solicitacao.receita, versao: resultado.versao, pdf: resultado.pdf_url },
      motivo
    }).catch((error: unknown) => console.error('❌ [SOLICITACAO] Falha ao auditar prescrição (ignorado):', mensagemDe(error)));

    return res.json(resultado.solicitacao);
  });

  /**
   * Cancelamento pelo tutor.
   *
   * A tela oferecia "Cancelar atendimento" desde sempre e chamava
   * `PUT /solicitacoes/:id/cancelar` — rota que nunca existiu: 404 garantido.
   * O efeito era pior do que um botão morto: `create` recusa nova solicitação
   * enquanto houver uma ativa, então um chamado que ninguém aceitou deixava o
   * tutor permanentemente impedido de pedir atendimento.
   *
   * A máquina de estados já previa `cancelado_tutor` em todas as etapas
   * anteriores ao atendimento em si — faltava só quem a acionasse.
   */
  cancelar = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { motivo } = req.body || {};

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) },
      include: { veterinario: { select: { usuario_id: true } } }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    if (solicitacao.tutor_id !== usuarioDe(req)) {
      throw new ForbiddenError('Só o tutor do atendimento pode cancelá-lo.');
    }

    // Depois que o atendimento começou, encerrar é ato clínico do veterinário
    // (com prontuário) — não um cancelamento administrativo do tutor.
    if (!['criado', 'procurando_veterinario', 'oferta_enviada', 'veterinario_encontrado', 'aceito', 'a_caminho'].includes(solicitacao.status)) {
      throw new ConflictError('Este atendimento já começou e não pode mais ser cancelado por aqui. Fale com o veterinário.');
    }

    // O status ANTES do cancelamento é o que decide a política: livre enquanto
    // ninguém saiu de casa, com taxa de deslocamento se o profissional já está
    // na rua. Precisa ser lido aqui, antes da transição apagar a etapa.
    const statusAntes = solicitacao.status;

    const atualizada = await transicionar({
      id,
      tenantId: tenantDe(req),
      para: 'cancelado_tutor',
      ator: atorDaRequest(req),
      origem: 'api',
      dados: { motivo_cancelamento: motivo?.trim() || 'Cancelado pelo tutor' },
      observacao: motivo?.trim() || null,
      include: SOLICITACAO_COMPLETA_INCLUDE
    });

    // O dinheiro segue a regra sozinho. Até aqui o pagamento ficava parado
    // esperando alguém lembrar de estornar pelo painel — com volume, isso vira
    // reclamação e depois contestação no cartão.
    const { reembolsarCancelamento } = (require('../services/cancelamento.service') as typeof import('../services/cancelamento.service'));
    const reembolso = await reembolsarCancelamento({
      atendimentoId: id,
      tenantId: tenantDe(req),
      status: statusAntes,
      quemCancelou: 'tutor',
      usuarioId: usuarioDe(req)
    });

    const io = req.app.get('io');
    if (io) {
      // O vet que já tinha aceitado precisa saber na hora — ele pode estar a
      // caminho. Quem só viu o chamado na fila também, para sumir da lista.
      io.to(`atendimento:${id}`).emit('atendimento:cancelado', { solicitacaoId: id, por: 'tutor' });
      if (solicitacao.veterinario?.usuario_id) {
        io.to(`user:${solicitacao.veterinario.usuario_id}`).emit('atendimento:cancelado', { solicitacaoId: id, por: 'tutor' });
      }
      io.to(`tenant:${tenantDe(req)}:veterinarios`).emit('solicitacao:indisponivel', { solicitacaoId: id });
    }

    if (solicitacao.veterinario?.usuario_id) {
      try {
        const pushService = (require('../services/push.service') as typeof import('../services/push.service'));
        void pushService.enviarParaUsuario(solicitacao.veterinario.usuario_id, {
          title: 'Atendimento cancelado',
          body: `O tutor cancelou o chamado${motivo?.trim() ? `: ${motivo.trim()}` : '.'}`,
          url: '/veterinario/home',
          tag: `cancelado-${id}`
        });
      } catch (erro: unknown) {
        console.error('⚠️  [SOLICITACAO] Push de cancelamento falhou (ignorado):', mensagemDe(erro));
      }
    }

    // A tela precisa dizer o que aconteceu com o dinheiro, no mesmo instante.
    return res.json({
      success: true,
      solicitacao: atualizada,
      reembolso: {
        politica: reembolso.politica,
        valor_estornado: reembolso.estornado,
        situacao: reembolso.motivo
      }
    });
  });

  // Linha do tempo do atendimento: quem mudou o quê e quando
  timeline = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) },
      include: { veterinario: { select: { usuario_id: true } } }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const isParticipant = solicitacao.tutor_id === usuarioDe(req) ||
      solicitacao.veterinario?.usuario_id === usuarioDe(req);
    const isTenantAdmin = req.userType === 'admin';
    if (!isParticipant && !isTenantAdmin) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const eventos = await prisma.solicitacaoTimeline.findMany({
      where: { tenant_id: tenantDe(req), atendimento_id: id },
      orderBy: { registrado_em: 'asc' }
    });

    return res.json({ atendimento_id: id, status_atual: solicitacao.status, eventos });
  });

  // Veterinário desiste de um atendimento que já tinha aceitado.
  //
  // `cancelado_vet` existe na máquina de estados desde sempre e NENHUMA tela o
  // alcançava: o vet que aceitasse e não pudesse ir (carro quebrou, emergência
  // pessoal) não tinha saída no aplicativo — ficava com o chamado preso e o
  // tutor esperando alguém que não vinha. É diferente de `recusar`, que só vale
  // antes de aceitar, e de `encaminhar-emergencia`, que é decisão clínica.
  desistir = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { motivo } = req.body || {};

    if (!motivo || String(motivo).trim().length < 5) {
      throw new ValidationError('Explique o motivo — o tutor está esperando e precisa saber o que houve.');
    }

    const veterinario = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioDe(req), tenant_id: tenantDe(req) },
      select: { id: true }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) },
      select: { id: true, status: true, veterinario_id: true, tutor_id: true }
    });

    if (!solicitacao || solicitacao.veterinario_id !== veterinario.id) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    // Depois de começar o atendimento o encerramento é clínico: sai com
    // prontuário, não com desistência.
    if (!['aceito', 'veterinario_encontrado', 'a_caminho', 'chegou'].includes(solicitacao.status)) {
      throw new ConflictError('Este atendimento já começou. Encerre pelo prontuário ou encaminhe para emergência.');
    }

    const statusAntes = solicitacao.status;

    const atualizada = await transicionar({
      id,
      tenantId: tenantDe(req),
      para: 'cancelado_vet',
      ator: atorDaRequest(req),
      origem: 'api',
      deveEstarEm: ['aceito', 'veterinario_encontrado', 'a_caminho', 'chegou'],
      dados: { motivo_cancelamento: String(motivo).trim() },
      observacao: String(motivo).trim(),
      include: SOLICITACAO_COMPLETA_INCLUDE
    });

    // Desistência do profissional devolve tudo, em qualquer etapa: o tutor não
    // pode pagar por uma decisão que não é dele.
    const { reembolsarCancelamento } = (require('../services/cancelamento.service') as typeof import('../services/cancelamento.service'));
    await reembolsarCancelamento({
      atendimentoId: id,
      tenantId: tenantDe(req),
      status: statusAntes,
      quemCancelou: 'veterinario',
      usuarioId: usuarioDe(req)
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`atendimento:${id}`).emit('atendimento:cancelado', { solicitacaoId: id, por: 'veterinario', motivo: String(motivo).trim() });
      if (solicitacao.tutor_id) {
        io.to(`user:${solicitacao.tutor_id}`).emit('atendimento:cancelado', { solicitacaoId: id, por: 'veterinario', motivo: String(motivo).trim() });
      }
    }

    if (solicitacao.tutor_id) {
      try {
        const pushService = (require('../services/push.service') as typeof import('../services/push.service'));
        void pushService.enviarParaUsuario(solicitacao.tutor_id, {
          title: 'O veterinário não poderá atender',
          body: `${String(motivo).trim()} — abra um novo chamado para encontrar outro profissional.`,
          url: '/tutor/home',
          tag: `desistencia-${id}`
        });
      } catch (erro: unknown) {
        console.error('⚠️  [SOLICITACAO] Push de desistência falhou (ignorado):', mensagemDe(erro));
      }
    }

    return res.json({ success: true, solicitacao: atualizada });
  });

  // Veterinário recusa uma solicitação já atribuída a ele, devolvendo-a
  // para a fila para que outro veterinário possa aceitá-la
  recusar = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { motivo } = req.body;
    const usuarioId = usuarioDe(req);

    const veterinario = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioId, tenant_id: tenantDe(req), aprovado_admin: true }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    if (solicitacao.veterinario_id !== veterinario.id) {
      throw new ForbiddenError('Você não está atribuído a esta solicitação');
    }

    const atualizada = await transicionar({
      id,
      tenantId: tenantDe(req),
      para: 'procurando_veterinario',
      ator: atorDaRequest(req),
      deveEstarEm: ['veterinario_encontrado'],
      dados: {
        veterinario_id: null,
        observacoes: motivo
          ? `[Recusado por ${veterinario.id}] ${motivo}`
          : solicitacao.observacoes
      },
      observacao: motivo
        ? `Veterinário recusou o chamado: ${motivo}`
        : 'Veterinário recusou o chamado',
      include: {
        pet: true,
        tutor: { select: USUARIO_SAFE_SELECT }
      }
    });

    // Notifica os veterinários de que a solicitação voltou a ficar disponível
    const io = req.app.get('io');
    if (io) {
      io.to(`tenant:${tenantDe(req)}:veterinarios`).emit('solicitacao:nova', atualizada);
    }

    return res.json({ solicitacao: atualizada });
  });

  // Emergência clínica: o caso excede o atendimento domiciliar e o tutor é
  // orientado a buscar um serviço de emergência. O desfecho fica registrado
  // como `encaminhado` — nem finalização normal, nem cancelamento.
  encaminharEmergencia = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const motivo = String(req.body?.motivo || '').trim();
    const orientacao = String(req.body?.orientacao || '').trim();

    if (motivo.length < 10) {
      throw new ValidationError('Descreva o motivo do encaminhamento (mínimo de 10 caracteres)');
    }

    const veterinario = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioDe(req), tenant_id: tenantDe(req), aprovado_admin: true }
    });
    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) }
    });
    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }
    if (solicitacao.veterinario_id !== veterinario.id) {
      throw new ForbiddenError('Você não está atribuído a esta solicitação');
    }

    const atualizada = await transicionar({
      id,
      tenantId: tenantDe(req),
      para: 'encaminhado',
      ator: atorDaRequest(req),
      // Campos próprios, não texto enfiado em `diagnostico`/`receita` com
      // prefixo: assim o encaminhamento pode ser consultado, contado e impresso
      // em seção própria — e a orientação chega à tela do tutor, que até então
      // lia um campo inexistente e caía sempre no "veja no chat".
      dados: {
        encaminhamento_motivo: motivo,
        encaminhamento_orientacao: orientacao || null,
        encaminhado_em: new Date()
      },
      observacao: `Encaminhado para serviço de emergência: ${motivo}`,
      include: {
        pet: true,
        tutor: { select: USUARIO_SAFE_SELECT }
      }
    });

    // O tutor precisa saber AGORA — socket para quem está com o app aberto;
    // o push da máquina de estados cobre quem está com ele fechado.
    const io = req.app.get('io');
    if (io) {
      io.to(`atendimento:${id}`).emit('atendimento:encaminhado', {
        solicitacaoId: id,
        motivo,
        orientacao: orientacao || null
      });
    }

    return res.json({ solicitacao: atualizada });
  });

  // Buscar por ID
  buscarPorId = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: tenantDe(req) },
      include: {
        pet: true,
        tutor: { select: USUARIO_SAFE_SELECT },
        veterinario: {
          include: { usuario: { select: USUARIO_SAFE_SELECT } }
        }
      }
    });

    if (!solicitacao) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    const isParticipant = solicitacao.tutor_id === usuarioDe(req) ||
      solicitacao.veterinario?.usuario_id === usuarioDe(req);
    const isTenantAdmin = req.userType === 'admin';
    if (!isParticipant && !isTenantAdmin) {
      throw new NotFoundError('Solicitação não encontrada');
    }

    return res.json(solicitacao);
  });
}

const solicitacaoController = new SolicitacaoController();

// Rotas e testes fazem `require('../controllers/solicitacao.controller')` e leem
// os handlers direto da instância — a forma exportada precisa continuar a mesma.
module.exports = solicitacaoController;

export default solicitacaoController;
