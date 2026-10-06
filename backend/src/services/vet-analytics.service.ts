import prisma from '../config/database';

/**
 * Números reais do veterinário: faturamento, atendimentos e avaliações.
 *
 * Existe porque `GET /veterinarios/estatisticas` devolvia `ganhoTotal: 0` e
 * `ganhoMes: 0` com um `// TODO: implementar sistema de pagamento` ao lado —
 * enquanto `Payment`/`PaymentSplit` já guardavam o dinheiro de verdade. A tela
 * de estatísticas mostrava R$ 0,00 para quem tinha recebido, e um gráfico de
 * seis meses com rótulos fixos no código (`['11/25','12/25',...]`) e todas as
 * barras zeradas. Número inventado em tela de faturamento destrói a confiança
 * no resto do painel.
 *
 * A fonte é `PaymentSplit` com `recipient_type = 'VETERINARIAN'`, que é o que
 * de fato cai para o profissional depois da taxa da plataforma.
 */

const RECIPIENT_VET = 'VETERINARIAN';

interface EscopoDoVet {
  tenantId: string;
  veterinarioId: string;
}

export interface ResumoFinanceiro {
  total_recebido: number;
  total_pendente: number;
  recebido_no_mes: number;
  ticket_medio: number;
}

export interface FaturamentoDoMes {
  /** `AAAA-MM`, a chave de agrupamento. */
  mes: string;
  /** `MM/AA`, o que o gráfico mostra. */
  rotulo: string;
  valor: number;
  atendimentos: number;
}

function inicioDoMes(data: Date = new Date()): Date {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

function chaveDoMes(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Resumo de faturamento: total recebido, o que ainda está pendente e o mês
 * corrente. `PAID` é dinheiro liberado; o resto ainda não caiu.
 */
export async function resumoFinanceiro({ veterinarioId }: { veterinarioId: string }): Promise<ResumoFinanceiro> {
  const splits = await prisma.paymentSplit.findMany({
    where: { recipient_type: RECIPIENT_VET, recipient_id: veterinarioId },
    select: { recipient_amount: true, status: true, criado_em: true }
  });

  const comecoDoMes = inicioDoMes();
  let recebido = 0;
  let pendente = 0;
  let esteMes = 0;
  let pagos = 0;

  for (const split of splits) {
    const valor = Number(split.recipient_amount);
    if (split.status === 'PAID') {
      recebido += valor;
      pagos += 1;
      if (new Date(split.criado_em) >= comecoDoMes) esteMes += valor;
    } else if (split.status !== 'REFUNDED') {
      pendente += valor;
    }
  }

  return {
    total_recebido: Number(recebido.toFixed(2)),
    total_pendente: Number(pendente.toFixed(2)),
    recebido_no_mes: Number(esteMes.toFixed(2)),
    // Divisão protegida: sem nenhum split pago o ticket é 0, não NaN.
    ticket_medio: pagos > 0 ? Number((recebido / pagos).toFixed(2)) : 0
  };
}

/**
 * Faturamento mês a mês, para o gráfico.
 *
 * Os meses são gerados a partir da data de hoje — o gráfico antigo tinha os
 * rótulos escritos à mão no JSX, então em 2026 ele ainda dizia "11/25".
 * Meses sem receita entram com zero, senão o gráfico "pula" períodos e dá a
 * impressão de faturamento contínuo.
 */
export async function faturamentoPorMes({
  veterinarioId,
  meses = 6
}: {
  veterinarioId: string;
  meses?: number | string;
}): Promise<FaturamentoDoMes[]> {
  const quantidade = Math.min(Math.max(Number(meses) || 6, 1), 24);
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (quantidade - 1), 1);

  const splits = await prisma.paymentSplit.findMany({
    where: {
      recipient_type: RECIPIENT_VET,
      recipient_id: veterinarioId,
      status: 'PAID',
      criado_em: { gte: inicio }
    },
    select: { recipient_amount: true, criado_em: true }
  });

  const balde = new Map<string, FaturamentoDoMes>();
  for (let i = 0; i < quantidade; i += 1) {
    const mes = new Date(hoje.getFullYear(), hoje.getMonth() - (quantidade - 1) + i, 1);
    balde.set(chaveDoMes(mes), {
      mes: chaveDoMes(mes),
      rotulo: `${String(mes.getMonth() + 1).padStart(2, '0')}/${String(mes.getFullYear()).slice(2)}`,
      valor: 0,
      atendimentos: 0
    });
  }

  for (const split of splits) {
    const chave = chaveDoMes(new Date(split.criado_em));
    const linha = balde.get(chave);
    if (linha) {
      linha.valor = Number((linha.valor + Number(split.recipient_amount)).toFixed(2));
      linha.atendimentos += 1;
    }
  }

  return [...balde.values()];
}

/**
 * Quanto cada cliente já rendeu. É o cruzamento que o vet não tinha: saber
 * quem sustenta a agenda dele.
 */
export async function faturamentoPorCliente({
  tenantId,
  veterinarioId,
  limite = 10
}: EscopoDoVet & { limite?: number | string }) {
  const porTutor = await prisma.payment.groupBy({
    by: ['tutor_id'],
    where: {
      tenant_id: tenantId,
      veterinario_id: veterinarioId,
      status: 'PAID'
    },
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: Math.min(Math.max(Number(limite) || 10, 1), 50)
  });

  if (porTutor.length === 0) return [];

  const tutores = await prisma.usuario.findMany({
    where: { id: { in: porTutor.map((p) => p.tutor_id) } },
    select: { id: true, nome: true, email: true, foto_perfil: true }
  });
  const porId = new Map(tutores.map((t) => [t.id, t]));

  return porTutor.map((linha) => ({
    tutor: porId.get(linha.tutor_id) || { id: linha.tutor_id, nome: 'Cliente removido' },
    total: Number(Number(linha._sum.amount || 0).toFixed(2)),
    pagamentos: linha._count._all
  }));
}

/**
 * Distribuição das notas (5★ a 1★) e média. A tela mostrava todas as barras em
 * 0% porque o endpoint devolvia `totalAvaliacoes: 0` fixo.
 */
export async function distribuicaoDeAvaliacoes({ tenantId, veterinarioId }: EscopoDoVet) {
  const porNota = await prisma.avaliacao.groupBy({
    by: ['nota'],
    // Só o que ele RECEBEU: a nota que o profissional dá ao tutor não conta na
    // distribuição das dele.
    where: { tenant_id: tenantId, veterinario_id: veterinarioId, autor_papel: 'tutor' },
    _count: { _all: true }
  });

  // `nota` é Int no banco (1 a 5); o índice é `number` porque o tipo do
  // groupBy não estreita para o intervalo.
  const contagem: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let soma = 0;

  for (const linha of porNota) {
    contagem[linha.nota] = linha._count._all;
    total += linha._count._all;
    soma += linha.nota * linha._count._all;
  }

  return {
    total,
    media: total > 0 ? Number((soma / total).toFixed(2)) : null,
    distribuicao: [5, 4, 3, 2, 1].map((nota) => ({
      nota,
      total: contagem[nota],
      percentual: total > 0 ? Number(((contagem[nota] / total) * 100).toFixed(1)) : 0
    }))
  };
}

/**
 * Mix real por tipo de atendimento. A tela desenhava uma única barra
 * "🏠 Domiciliar" em 100%, independentemente do que o vet realmente atendia.
 */
export async function atendimentosPorTipo({ tenantId, veterinarioId }: EscopoDoVet) {
  const porTipo = await prisma.solicitacao.groupBy({
    by: ['tipo_atendimento'],
    where: { tenant_id: tenantId, veterinario_id: veterinarioId },
    _count: { _all: true }
  });

  const total = porTipo.reduce((s, l) => s + l._count._all, 0);

  return {
    total,
    tipos: porTipo
      .map((linha) => ({
        tipo: linha.tipo_atendimento,
        total: linha._count._all,
        percentual: total > 0 ? Number(((linha._count._all / total) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.total - a.total)
  };
}

/**
 * Painel completo. Uma chamada só porque a tela mostra tudo junto — seis
 * requisições em paralelo no carregamento seria pior para o celular.
 */
export async function painel({ tenantId, veterinarioId, meses = 6 }: EscopoDoVet & { meses?: number | string }) {
  const [financeiro, porMes, porCliente, avaliacoes, porTipo, agendaProxima] = await Promise.all([
    resumoFinanceiro({ veterinarioId }),
    faturamentoPorMes({ veterinarioId, meses }),
    faturamentoPorCliente({ tenantId, veterinarioId }),
    distribuicaoDeAvaliacoes({ tenantId, veterinarioId }),
    atendimentosPorTipo({ tenantId, veterinarioId }),
    prisma.agendamento.count({
      where: {
        tenant_id: tenantId,
        veterinario_id: veterinarioId,
        status: { in: ['pendente', 'confirmado'] },
        inicio: { gte: new Date() }
      }
    })
  ]);

  const clientes = await prisma.clienteVeterinario.aggregate({
    where: { tenant_id: tenantId, veterinario_id: veterinarioId },
    _count: { _all: true }
  });

  return {
    financeiro,
    faturamento_por_mes: porMes,
    melhores_clientes: porCliente,
    avaliacoes,
    atendimentos_por_tipo: porTipo,
    total_clientes: clientes._count._all,
    agendamentos_futuros: agendaProxima
  };
}

// Os controllers ainda são `.js` e fazem `require(...)`; `module.exports`
// mantém o contrato enquanto eles não migram.
module.exports = {
  resumoFinanceiro,
  faturamentoPorMes,
  faturamentoPorCliente,
  distribuicaoDeAvaliacoes,
  atendimentosPorTipo,
  painel
};
