/**
 * Datas escritas para gente ler: e-mail, notificação, PDF, mensagem de erro.
 *
 * O contêiner roda em UTC. `new Date().toLocaleString('pt-BR')` no servidor,
 * sem fuso, escreve a hora de Londres: a receita emitida às 22h saía datada
 * do dia seguinte, e o aviso de "senha alterada em…" mostrava três horas a
 * mais. Tudo que vai para a tela de alguém passa por aqui.
 *
 * Duas coisas diferentes, que não podem ser misturadas:
 *
 *   - INSTANTE (quando algo aconteceu: emissão, expiração, login) — é mostrado
 *     no fuso do Brasil;
 *   - DIA DE CALENDÁRIO (vacina aplicada, próxima dose, retorno, lembrete) —
 *     não tem hora, o banco guarda meia-noite em UTC, e o dia é o que está
 *     escrito. Converter para o fuso do Brasil faria recuar um dia.
 */

type Valor = Date | string | number;

/** Um país, um fuso para exibição; `TZ_EXIBICAO` troca sem tocar no código. */
export const fusoDeExibicao = (): string => process.env.TZ_EXIBICAO || 'America/Sao_Paulo';

/** Instante → `08/10/2026`, no fuso do Brasil. */
export function dataBr(instante: Valor = new Date()): string {
  return new Date(instante).toLocaleDateString('pt-BR', { timeZone: fusoDeExibicao() });
}

/** Instante → `08/10/2026, 14:30`, no fuso do Brasil. */
export function dataHoraBr(instante: Valor = new Date()): string {
  return new Date(instante).toLocaleString('pt-BR', {
    timeZone: fusoDeExibicao(),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Dia de calendário (gravado como meia-noite UTC) → `08/10/2026`, o dia que está escrito. */
export function diaDeCalendarioBr(dia: Valor): string {
  return new Date(dia).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

// ── Relógio de parede ────────────────────────────────────────────────────────
//
// Regra de negócio com hora ("atendo das 09:00 às 17:00", "hoje", "este mês")
// fala do relógio de quem usa, não do relógio do servidor. Em 08/10/2026 a
// grade do veterinário era lida em UTC: quem cadastrava 09:00–17:00 era
// oferecido ao tutor das 06:00 às 14:00.

const partesNoFuso = (instante: Date, fuso: string) => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value);
  return { ano: valor('year'), mes: valor('month'), dia: valor('day'), hora: valor('hour'), minuto: valor('minute'), segundo: valor('second') };
};

export interface RelogioDeParede {
  ano: number;
  /** 1 a 12. */
  mes: number;
  dia: number;
  /** 0 = domingo, como `Date.getDay()`. */
  diaDaSemana: number;
  /** Minutos desde a meia-noite. */
  minutos: number;
}

/** O que o relógio e o calendário do Brasil marcam neste instante. */
export function relogioDeParede(instante: Valor = new Date(), fuso: string = fusoDeExibicao()): RelogioDeParede {
  const p = partesNoFuso(new Date(instante), fuso);
  return {
    ano: p.ano,
    mes: p.mes,
    dia: p.dia,
    diaDaSemana: new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay(),
    minutos: p.hora * 60 + p.minuto
  };
}

/** O instante em que o relógio do Brasil marca esse dia e esses minutos. */
export function instanteDoRelogio(ano: number, mes: number, dia: number, minutos = 0, fuso: string = fusoDeExibicao()): Date {
  const alvo = Date.UTC(ano, mes - 1, dia, 0, minutos);
  // O fuso não é um número fixo (horário de verão já existiu e pode voltar):
  // mede-se a diferença no próprio instante, em duas passadas.
  let instante = alvo;
  for (let passada = 0; passada < 2; passada += 1) {
    const p = partesNoFuso(new Date(instante), fuso);
    const marcado = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
    instante += alvo - marcado;
  }
  return new Date(instante);
}

/**
 * O dia de calendário pedido. `2026-10-09` (ou meia-noite UTC) é o próprio
 * dia; um instante com hora é o dia que o calendário do Brasil marca nele.
 */
export function diaPedido(data: Valor, fuso: string = fusoDeExibicao()): { ano: number; mes: number; dia: number; diaDaSemana: number } {
  const texto = data instanceof Date ? data.toISOString() : String(data);
  const soODia = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.0+)?(?:Z|\+00:00))?$/.exec(texto);
  if (soODia) {
    const [ano, mes, dia] = [Number(soODia[1]), Number(soODia[2]), Number(soODia[3])];
    return { ano, mes, dia, diaDaSemana: new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() };
  }
  const r = relogioDeParede(new Date(data), fuso);
  return { ano: r.ano, mes: r.mes, dia: r.dia, diaDaSemana: r.diaDaSemana };
}

/** Meia-noite de hoje no Brasil (ou do dia do instante informado). */
export function inicioDoDiaBr(instante: Valor = new Date()): Date {
  const r = relogioDeParede(instante);
  return instanteDoRelogio(r.ano, r.mes, r.dia);
}

/** Meia-noite do dia 1 do mês no Brasil; `deslocamento` -1 é o mês anterior. */
export function inicioDoMesBr(instante: Valor = new Date(), deslocamento = 0): Date {
  const r = relogioDeParede(instante);
  const base = new Date(Date.UTC(r.ano, r.mes - 1 + deslocamento, 1));
  return instanteDoRelogio(base.getUTCFullYear(), base.getUTCMonth() + 1, 1);
}

/**
 * Hoje, como dia de calendário: meia-noite UTC do dia que o Brasil está
 * vivendo. É a régua para comparar com colunas sem hora (`data_lembrete`),
 * que são gravadas assim.
 */
export function hojeComoDiaDeCalendario(instante: Valor = new Date()): Date {
  const r = relogioDeParede(instante);
  return new Date(Date.UTC(r.ano, r.mes - 1, r.dia));
}
