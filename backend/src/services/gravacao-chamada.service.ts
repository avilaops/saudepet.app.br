import prisma from '../config/database';
import { uploadBuffer, deleteObject, getSignedDownloadUrl } from '../config/r2';
import { ForbiddenError, NotFoundError, ValidationError } from '../middleware/error.middleware';

/**
 * Gravação da teleorientação, para auditoria interna.
 *
 * TODA chamada é gravada. A razão é controle de risco: numa consulta por vídeo
 * entre um profissional e um cliente, quando alguém denuncia abuso ou quebra de
 * regra o que existe hoje são duas versões e nada mais — e a primeira denúncia
 * séria seria justamente a que não dá para apurar.
 *
 * ── O que este arquivo NÃO faz, e é a parte que importa ──────────────────
 *
 * Não devolve gravação para participante. Nem tutor nem veterinário têm link,
 * player ou download; a leitura é só da moderação, por
 * `abrirParaAuditoria`, e cada abertura deixa rastro em `AuditLog`. Auditoria
 * que ninguém audita é só um acervo — e um acervo de consulta veterinária com
 * voz das duas pessoas é dado sensível pela LGPD.
 *
 * ── Por que áudio ────────────────────────────────────────────────────────
 *
 * O que se apura numa denúncia de conduta é o que foi DITO. Vídeo de consulta
 * custa uma ordem de grandeza a mais em armazenamento e retenção para
 * responder à mesma pergunta. `GRAVAR_VIDEO` inverte a decisão num lugar só.
 *
 * ── Por que em pedaços, e duas por chamada ───────────────────────────────
 *
 * O navegador sobe partes durante a chamada, não um arquivo no fim: aparelho
 * que desliga no meio levaria a apuração junto. E cada lado grava a própria
 * versão — se um navegador fecha, a do outro sobrevive. Numa apuração, perder
 * metade é perder tudo.
 */

/** Trocar para `true` grava vídeo junto. Leia o bloco acima antes. */
export const GRAVAR_VIDEO = false;

/** O tipo que o navegador deve produzir. */
export const MIME_PADRAO = GRAVAR_VIDEO ? 'video/webm' : 'audio/webm';

/**
 * Quanto tempo a gravação fica guardada.
 *
 * Denúncia costuma chegar dias depois, não meses. 90 dias é o mesmo prazo já
 * usado para anexo de conversa, o que evita duas políticas de retenção
 * concorrendo no mesmo produto.
 */
const RETENCAO_PADRAO_DIAS = 90;
const DIA_EM_MS = 86_400_000;

/** Teto por parte. O navegador manda a cada 15 s; passar disso é anomalia. */
const TAMANHO_MAXIMO_PARTE = 8 * 1024 * 1024;

/**
 * Uma chamada não dura um dia. Passado isso sem `finalizar`, a gravação está
 * órfã — o navegador sumiu sem avisar — e a varredura a fecha como
 * `interrompida`, que é estado normal e não erro: o material gravado até ali
 * continua valendo para a apuração.
 */
const HORAS_ATE_CONSIDERAR_INTERROMPIDA = 6;

export function diasDeRetencao(): number {
  const configurado = Number.parseInt(process.env.GRAVACAO_RETENCAO_DIAS || '', 10);
  if (!Number.isFinite(configurado)) return RETENCAO_PADRAO_DIAS;
  // Menos de uma semana não dá tempo de denunciar; mais de um ano é acervo.
  return Math.min(365, Math.max(7, configurado));
}

const chaveDaParte = (gravacaoId: string, indice: number) =>
  `gravacoes/${gravacaoId}/${String(indice).padStart(5, '0')}.webm`;

/** O papel de quem está gravando, decidido pelo VÍNCULO com o atendimento. */
async function papelNoAtendimento(atendimentoId: string, tenantId: string, usuarioId: string) {
  const atendimento = await prisma.solicitacao.findFirst({
    where: { id: atendimentoId, tenant_id: tenantId },
    select: {
      id: true,
      tipo_atendimento: true,
      tutor_id: true,
      veterinario: { select: { usuario_id: true } }
    }
  });

  if (!atendimento) throw new NotFoundError('Atendimento não encontrado');

  // Pelo vínculo, nunca pelo `tipo_usuario`: o veterinário também pode ser
  // tutor do próprio pet, e nesse atendimento ele é o tutor.
  if (atendimento.tutor_id === usuarioId) return { atendimento, papel: 'tutor' as const };
  if (atendimento.veterinario?.usuario_id === usuarioId) return { atendimento, papel: 'veterinario' as const };

  throw new ForbiddenError('Você não participa deste atendimento');
}

export type GravacaoAberta = { id: string; indiceProximo: number };

/**
 * Abre (ou reencontra) a gravação deste participante nesta chamada.
 *
 * Reentrante de propósito: quem cai da chamada e volta continua na MESMA
 * gravação, com os índices seguindo de onde pararam. Criar outra a cada
 * reconexão picotaria a conversa em arquivos que ninguém consegue remontar.
 */
export async function abrirGravacao({
  atendimentoId,
  tenantId,
  usuarioId
}: {
  atendimentoId: string;
  tenantId: string;
  usuarioId: string;
}): Promise<GravacaoAberta> {
  const { atendimento, papel } = await papelNoAtendimento(atendimentoId, tenantId, usuarioId);

  if (atendimento.tipo_atendimento !== 'teleorientacao') {
    throw new ValidationError('Só teleorientação tem chamada para gravar.');
  }

  const emCurso = await prisma.gravacaoChamada.findFirst({
    where: { atendimento_id: atendimentoId, autor_usuario_id: usuarioId, status: 'gravando' },
    select: { id: true, _count: { select: { partes: true } } },
    orderBy: { iniciada_em: 'desc' }
  });

  if (emCurso) {
    return { id: emCurso.id, indiceProximo: emCurso._count.partes };
  }

  const criada = await prisma.gravacaoChamada.create({
    data: {
      tenant_id: tenantId,
      atendimento_id: atendimentoId,
      autor_usuario_id: usuarioId,
      autor_papel: papel,
      mime_type: MIME_PADRAO,
      expira_em: new Date(Date.now() + diasDeRetencao() * DIA_EM_MS)
    },
    select: { id: true }
  });

  return { id: criada.id, indiceProximo: 0 };
}

/**
 * Guarda um pedaço.
 *
 * O índice vem do navegador e é conferido contra o banco: `@@unique` recusa
 * duas partes com o mesmo número, o que impede que uma retransmissão duplicada
 * embaralhe a ordem do áudio.
 */
export async function guardarParte({
  gravacaoId,
  tenantId,
  usuarioId,
  indice,
  conteudo
}: {
  gravacaoId: string;
  tenantId: string;
  usuarioId: string;
  indice: number;
  conteudo: Buffer;
}) {
  if (!conteudo?.length) throw new ValidationError('Parte vazia.');
  if (conteudo.length > TAMANHO_MAXIMO_PARTE) {
    throw new ValidationError('Parte de gravação acima do tamanho aceito.');
  }

  const gravacao = await prisma.gravacaoChamada.findFirst({
    where: { id: gravacaoId, tenant_id: tenantId },
    select: { id: true, autor_usuario_id: true, status: true, mime_type: true }
  });

  if (!gravacao) throw new NotFoundError('Gravação não encontrada');
  // Só quem está gravando escreve na própria gravação.
  if (gravacao.autor_usuario_id !== usuarioId) throw new ForbiddenError('Gravação de outro participante');
  if (gravacao.status !== 'gravando') throw new ValidationError('Esta gravação já foi encerrada.');

  const key = chaveDaParte(gravacaoId, indice);
  await uploadBuffer(conteudo, key, gravacao.mime_type);

  await prisma.gravacaoChamadaParte.create({
    data: { gravacao_id: gravacaoId, indice, storage_key: key, tamanho_bytes: conteudo.length }
  });

  await prisma.gravacaoChamada.update({
    where: { id: gravacaoId },
    data: { tamanho_bytes: { increment: conteudo.length } }
  });

  return { indice, bytes: conteudo.length };
}

/** Fecha a gravação. Chamado quando a pessoa encerra ou sai da tela. */
export async function finalizarGravacao({
  gravacaoId,
  tenantId,
  usuarioId,
  duracaoSeg
}: {
  gravacaoId: string;
  tenantId: string;
  usuarioId: string;
  duracaoSeg?: number;
}) {
  const gravacao = await prisma.gravacaoChamada.findFirst({
    where: { id: gravacaoId, tenant_id: tenantId },
    select: { id: true, autor_usuario_id: true, status: true }
  });

  if (!gravacao) throw new NotFoundError('Gravação não encontrada');
  if (gravacao.autor_usuario_id !== usuarioId) throw new ForbiddenError('Gravação de outro participante');
  if (gravacao.status !== 'gravando') return { id: gravacao.id, status: gravacao.status };

  const fechada = await prisma.gravacaoChamada.update({
    where: { id: gravacaoId },
    data: {
      status: 'finalizada',
      finalizada_em: new Date(),
      duracao_seg: Number.isFinite(Number(duracaoSeg)) ? Math.max(0, Math.round(Number(duracaoSeg))) : null
    },
    select: { id: true, status: true, tamanho_bytes: true, duracao_seg: true }
  });

  return fechada;
}

/**
 * O que a moderação vê de um atendimento: a ficha, nunca o áudio.
 *
 * A separação é proposital — listar é barato e não expõe nada; ouvir é o passo
 * que precisa de motivo e deixa rastro.
 */
export async function listarDoAtendimento(atendimentoId: string, tenantId: string) {
  const gravacoes = await prisma.gravacaoChamada.findMany({
    where: { atendimento_id: atendimentoId, tenant_id: tenantId },
    select: {
      id: true,
      autor_papel: true,
      status: true,
      duracao_seg: true,
      tamanho_bytes: true,
      iniciada_em: true,
      finalizada_em: true,
      expira_em: true,
      _count: { select: { partes: true } }
    },
    orderBy: { iniciada_em: 'asc' }
  });

  return gravacoes.map((g: any) => ({
    id: g.id,
    papel: g.autor_papel,
    status: g.status,
    duracao_seg: g.duracao_seg,
    tamanho_bytes: g.tamanho_bytes,
    partes: g._count.partes,
    iniciada_em: g.iniciada_em,
    finalizada_em: g.finalizada_em,
    expira_em: g.expira_em,
    // Vencida é linha sem áudio: a varredura já apagou o arquivo e a ficha
    // ficou para o histórico mostrar que existiu.
    vencida: g.expira_em < new Date()
  }));
}

/**
 * Abre o áudio para a moderação — o único caminho de leitura que existe.
 *
 * Exige `motivo` porque auditoria sem motivo registrado é vigilância: quem
 * abriu, quando e por quê tem que caber numa linha do `AuditLog`, e é o que o
 * controller grava logo depois.
 */
export async function abrirParaAuditoria({
  gravacaoId,
  tenantId,
  motivo
}: {
  gravacaoId: string;
  tenantId: string;
  motivo?: string | null;
}) {
  if (!motivo || !String(motivo).trim()) {
    throw new ValidationError('Informe o motivo da auditoria para abrir a gravação.');
  }

  const gravacao = await prisma.gravacaoChamada.findFirst({
    where: { id: gravacaoId, tenant_id: tenantId },
    select: {
      id: true,
      atendimento_id: true,
      autor_papel: true,
      autor_usuario_id: true,
      mime_type: true,
      duracao_seg: true,
      expira_em: true,
      partes: { select: { indice: true, storage_key: true }, orderBy: { indice: 'asc' } }
    }
  });

  if (!gravacao) throw new NotFoundError('Gravação não encontrada');
  if (gravacao.expira_em < new Date()) {
    throw new NotFoundError('Esta gravação já venceu e o áudio foi apagado.');
  }
  if (gravacao.partes.length === 0) {
    throw new NotFoundError('Esta gravação não tem áudio guardado.');
  }

  // Uma URL por parte, na ordem. Tocar é concatenar — a parte 0 traz o
  // cabeçalho do contêiner e sem ela as seguintes não abrem.
  const partes = await Promise.all(
    gravacao.partes.map(async (parte: { indice: number; storage_key: string }) => ({
      indice: parte.indice,
      url: await getSignedDownloadUrl(parte.storage_key, 900)
    }))
  );

  return {
    id: gravacao.id,
    atendimento_id: gravacao.atendimento_id,
    papel: gravacao.autor_papel,
    autor_usuario_id: gravacao.autor_usuario_id,
    mime_type: gravacao.mime_type,
    duracao_seg: gravacao.duracao_seg,
    partes
  };
}

export type ResultadoDaVarredura = { interrompidas: number; vencidas: number; arquivos: number };

/**
 * Varredura de manutenção: fecha o que ficou aberto e apaga o que venceu.
 *
 * As duas coisas juntas porque são a mesma pergunta feita ao mesmo índice —
 * e porque uma gravação eternamente "gravando" nunca venceria pela regra de
 * status, ficando guardada para sempre por acidente.
 */
export async function varrerGravacoes(agora = new Date()): Promise<ResultadoDaVarredura> {
  const limiteOrfa = new Date(agora.getTime() - HORAS_ATE_CONSIDERAR_INTERROMPIDA * 3_600_000);

  const interrompidas = await prisma.gravacaoChamada.updateMany({
    where: { status: 'gravando', iniciada_em: { lt: limiteOrfa } },
    data: { status: 'interrompida', finalizada_em: agora }
  });

  const vencidas = await prisma.gravacaoChamada.findMany({
    where: { expira_em: { lt: agora }, partes: { some: {} } },
    select: { id: true, partes: { select: { id: true, storage_key: true } } },
    take: 200
  });

  let arquivos = 0;

  for (const gravacao of vencidas) {
    for (const parte of gravacao.partes) {
      // Melhor esforço: arquivo já ausente no R2 não pode travar a limpeza da
      // linha, senão a varredura trava para sempre no mesmo registro.
      await deleteObject(parte.storage_key).catch(() => {});
      arquivos += 1;
    }

    // A LINHA fica: o histórico precisa mostrar que existiu uma gravação e que
    // ela venceu. Some só o áudio.
    await prisma.gravacaoChamadaParte.deleteMany({ where: { gravacao_id: gravacao.id } });
    await prisma.gravacaoChamada.update({
      where: { id: gravacao.id },
      data: { tamanho_bytes: 0 }
    });
  }

  return { interrompidas: interrompidas.count, vencidas: vencidas.length, arquivos };
}

module.exports = {
  GRAVAR_VIDEO,
  MIME_PADRAO,
  diasDeRetencao,
  abrirGravacao,
  guardarParte,
  finalizarGravacao,
  listarDoAtendimento,
  abrirParaAuditoria,
  varrerGravacoes
};
