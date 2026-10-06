import type { Request, Response } from 'express';
import type { StatusAgendamento } from '@prisma/client';
import prisma from '../config/database';
import * as crmService from '../services/crm-veterinario.service';
import * as agendamentoService from '../services/agendamento.service';
import * as analyticsService from '../services/vet-analytics.service';
import * as retencaoService from '../services/retencao-veterinario.service';
import type { AlvoDaConvocacao } from '../services/retencao-veterinario.service';
import * as agendamentoNotificacao from '../services/agendamento-notificacao.service';
import { abrirAtendimentoDoAgendamento } from '../services/agendamento-atendimento.service';
import { recursosDoVeterinario } from '../middleware/plano-vet.middleware';
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/error.middleware';

const usuarioDe = (req: Request) => String(req.userId);
const tenantDe = (req: Request) => String(req.tenantId);

/** Query string vem como texto, lista ou objeto; só o texto interessa aqui. */
const textoDaQuery = (valor: unknown): string | undefined =>
  typeof valor === 'string' ? valor : undefined;

/** Corpo de POST /agendamentos. */
interface CorpoDoAgendamento {
  tutor_id?: string;
  pet_id?: string;
  inicio?: string;
  duracao_minutos?: number;
  tipo_atendimento?: string;
  observacoes?: string;
}

/** Corpo de PUT /agendamentos/:id/status. */
interface CorpoDoStatus {
  status?: StatusAgendamento;
  motivo?: string;
}

/** Corpo de PUT /agendamentos/:id/remarcar. */
interface CorpoDaRemarcacao {
  inicio?: string;
  duracao_minutos?: number;
}

/** Corpo de POST /retencao/lembretes. */
interface CorpoDoLembrete {
  tutor_id?: string;
  pet_id?: string;
  titulo?: string;
  tipo?: string;
  data_lembrete?: string;
  mensagem?: string;
}

/** Corpo de POST /retencao/convocar. */
interface CorpoDaConvocacao {
  alvos?: AlvoDaConvocacao[];
  titulo?: string;
  tipo?: string;
  data_lembrete?: string;
  mensagem?: string;
}

/**
 * Resolve o `Veterinario.id` a partir do usuário autenticado.
 *
 * O token carrega o id do USUÁRIO; quase tudo aqui é chaveado pelo id do
 * VETERINÁRIO, que é outra tabela. Fazer isso num único lugar evita que uma
 * rota esqueça a tradução e acabe consultando com o id errado — que não daria
 * erro, só devolveria vazio silenciosamente.
 */
async function veterinarioDoUsuario(req: Request) {
  const veterinario = await prisma.veterinario.findFirst({
    where: { usuario_id: usuarioDe(req), tenant_id: tenantDe(req) },
    select: { id: true, aprovado_admin: true }
  });

  if (!veterinario) {
    throw new NotFoundError('Perfil de veterinário não encontrado para este usuário.');
  }

  return veterinario;
}

class CrmVeterinarioController {
  // ── Clientela ─────────────────────────────────────────────────────────────

  listarClientes = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);
    const { busca, tag, favoritos, ordem, pagina, por_pagina: porPagina } = req.query;

    const resultado = await crmService.listarClientes({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      busca: textoDaQuery(busca),
      tag: textoDaQuery(tag),
      favoritos: favoritos === '1' || favoritos === 'true',
      ordem: textoDaQuery(ordem),
      pagina: textoDaQuery(pagina),
      porPagina: textoDaQuery(porPagina)
    });

    return res.json(resultado);
  });

  obterCliente = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);
    const ficha = await crmService.obterCliente({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      tutorId: String(req.params.tutorId)
    });

    if (!ficha) {
      throw new NotFoundError('Cliente não encontrado na sua carteira.');
    }

    return res.json(ficha);
  });

  atualizarCliente = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);
    const dados: crmService.DadosDaFicha = req.body || {};
    const ficha = await crmService.atualizarFicha({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      tutorId: String(req.params.tutorId),
      dados
    });

    return res.json({ success: true, cliente: ficha });
  });

  listarTags = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);
    const tags = await crmService.listarTags({
      tenantId: tenantDe(req),
      veterinarioId: vet.id
    });

    return res.json({ tags });
  });

  // ── Agenda ────────────────────────────────────────────────────────────────

  listarAgendamentos = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);
    // O status chega como texto livre da query; quem o valida é o Prisma, como
    // antes da migração.
    const status = textoDaQuery(req.query.status) as StatusAgendamento | undefined;
    const agendamentos = await agendamentoService.listarDoVeterinario({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      de: textoDaQuery(req.query.de),
      ate: textoDaQuery(req.query.ate),
      status
    });

    return res.json({ agendamentos });
  });

  criarAgendamento = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);
    const corpo: CorpoDoAgendamento = req.body || {};
    const { tutor_id: tutorId, pet_id: petId, inicio, duracao_minutos: duracao, tipo_atendimento: tipo, observacoes } = corpo;

    if (!tutorId || !petId || !inicio || !tipo) {
      throw new ValidationError('Informe tutor, pet, início e tipo de atendimento.');
    }

    const agendamento = await agendamentoService.criar({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      tutorId,
      petId,
      inicio,
      duracaoMinutos: duracao,
      tipoAtendimento: tipo,
      observacoes,
      criadoPorId: req.userId,
      // O vet marcando na própria agenda já nasce confirmado — ele não precisa
      // confirmar para si mesmo.
      confirmadoDeCara: true
    });

    // Marcar consulta cria a relação comercial, mesmo antes do primeiro
    // atendimento fechado.
    await crmService.garantirFicha({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      tutorId
    });

    // O tutor fica sabendo por e-mail — antes disto, só "por fora".
    agendamentoNotificacao.notificarCriacao(agendamento.id).catch(() => {});

    return res.status(201).json({ success: true, agendamento });
  });

  alterarStatusAgendamento = asyncHandler(async (req: Request, res: Response) => {
    await veterinarioDoUsuario(req);
    const corpo: CorpoDoStatus = req.body || {};
    const { status, motivo } = corpo;

    if (!status) {
      throw new ValidationError('Informe o novo status.');
    }

    const agendamento = await agendamentoService.alterarStatus({
      tenantId: tenantDe(req),
      agendamentoId: String(req.params.id),
      novoStatus: status,
      usuarioId: req.userId,
      motivo
    });

    // Cancelamento pelo vet chega ao tutor por e-mail; best-effort.
    agendamentoNotificacao
      .notificarMudancaDeStatus(agendamento.id, { novoStatus: status, atorId: req.userId, motivo })
      .catch(() => {});

    return res.json({ success: true, agendamento });
  });

  /**
   * Abre agora o atendimento de uma consulta marcada — o mesmo caminho que o
   * worker percorre na hora marcada, para quando o veterinário começa antes.
   */
  iniciarAtendimentoDoAgendamento = asyncHandler(async (req: Request, res: Response) => {
    const veterinario = await veterinarioDoUsuario(req);

    const agendamento = await prisma.agendamento.findFirst({
      where: { id: String(req.params.id), tenant_id: tenantDe(req), veterinario_id: veterinario.id },
      select: { id: true }
    });

    if (!agendamento) {
      throw new NotFoundError('Agendamento não encontrado');
    }

    const { solicitacao, reaproveitada } = await abrirAtendimentoDoAgendamento({
      agendamentoId: agendamento.id,
      tenantId: tenantDe(req),
      ator: { id: req.userId, tipo: 'veterinario' },
      origem: 'api',
      manual: true
    });

    return res.status(reaproveitada ? 200 : 201).json({ success: true, reaproveitada, solicitacao });
  });

  remarcarAgendamento = asyncHandler(async (req: Request, res: Response) => {
    await veterinarioDoUsuario(req);
    const corpo: CorpoDaRemarcacao = req.body || {};
    const { inicio, duracao_minutos: duracao } = corpo;

    if (!inicio) {
      throw new ValidationError('Informe o novo horário.');
    }

    const agendamento = await agendamentoService.remarcar({
      tenantId: tenantDe(req),
      agendamentoId: String(req.params.id),
      inicio,
      duracaoMinutos: duracao
    });

    // Novo horário vai por e-mail ao tutor; best-effort.
    agendamentoNotificacao.notificarRemarcacao(agendamento.id).catch(() => {});

    return res.json({ success: true, agendamento });
  });

  horariosLivres = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);

    if (!req.query.data) {
      throw new ValidationError('Informe a data.');
    }

    const duracao = textoDaQuery(req.query.duracao);
    const horarios = await agendamentoService.horariosLivres({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      data: String(req.query.data),
      duracaoMinutos: duracao === undefined ? undefined : Number(duracao)
    });

    return res.json({ horarios });
  });

  // ── Relatórios ────────────────────────────────────────────────────────────

  painel = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);
    const dados = await analyticsService.painel({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      meses: textoDaQuery(req.query.meses)
    });

    return res.json(dados);
  });

  // ── Retenção ──────────────────────────────────────────────────────────────

  clientesInativos = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);
    const clientes = await retencaoService.clientesInativos({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      diasSemContato: textoDaQuery(req.query.dias),
      limite: textoDaQuery(req.query.limite)
    });

    return res.json({ clientes, total: clientes.length });
  });

  criarLembrete = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);
    const corpo: CorpoDoLembrete = req.body || {};
    const { tutor_id: tutorId, pet_id: petId, titulo, tipo, data_lembrete: data, mensagem } = corpo;

    if (!tutorId || !petId || !titulo || !tipo || !data) {
      throw new ValidationError('Informe tutor, pet, título, tipo e data.');
    }

    const lembrete = await retencaoService.criarLembrete({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      tutorId,
      petId,
      titulo,
      tipo,
      dataLembrete: data,
      mensagem
    });

    return res.status(201).json({ success: true, lembrete });
  });

  listarLembretes = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);
    const lembretes = await retencaoService.listarLembretesDoVet({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      incluirConcluidos: req.query.concluidos === '1'
    });

    return res.json({ lembretes });
  });

  convocarEmLote = asyncHandler(async (req: Request, res: Response) => {
    const vet = await veterinarioDoUsuario(req);
    const corpo: CorpoDaConvocacao = req.body || {};
    const { alvos, titulo, tipo, data_lembrete: data, mensagem } = corpo;

    if (!titulo || !tipo || !data) {
      throw new ValidationError('Informe título, tipo e data da convocação.');
    }

    const resultado = await retencaoService.convocarEmLote({
      tenantId: tenantDe(req),
      veterinarioId: vet.id,
      // `alvos` é conferido em tempo de execução pelo serviço (lista não vazia).
      alvos: alvos as AlvoDaConvocacao[],
      titulo,
      tipo,
      dataLembrete: data,
      mensagem
    });

    return res.status(201).json({ success: true, ...resultado });
  });

  // ── Plano ─────────────────────────────────────────────────────────────────

  meuPlano = asyncHandler(async (req: Request, res: Response) => {
    const dados = await recursosDoVeterinario({
      tenantId: tenantDe(req),
      usuarioId: usuarioDe(req)
    });

    return res.json(dados);
  });
}

const crmVeterinarioController = new CrmVeterinarioController();

// As rotas fazem `require('../controllers/crm-veterinario.controller')` e leem
// os métodos direto da instância — a forma exportada precisa continuar a mesma.
module.exports = crmVeterinarioController;

export default crmVeterinarioController;
