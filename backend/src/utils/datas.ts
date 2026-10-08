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
