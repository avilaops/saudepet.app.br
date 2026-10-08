/**
 * Datas de calendário: vacina aplicada, próxima dose, retorno sugerido,
 * lembrete. Não têm hora — o formulário manda `2026-10-08` e o banco guarda
 * meia-noite em UTC.
 *
 * Mostradas com `new Date(valor).toLocaleDateString()`, no fuso do Brasil elas
 * recuam um dia: a vacina de 08/10 aparecia como 07/10, na carteira do tutor e
 * na ficha que o veterinário consulta, e o lembrete de hoje nascia "atrasado".
 * Achado em 08/10/2026 no primeiro teste de ponta a ponta feito em produção.
 */
type Valor = string | number | Date | null | undefined

const SO_O_DIA = /^\d{4}-\d{2}-\d{2}$/
const MEIA_NOITE_UTC = /^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?(Z|\+00:00)$/

/** O valor é um dia de calendário, e não um instante? */
export function ehDataSemHora(valor: Valor): boolean {
  if (valor instanceof Date) return !Number.isNaN(valor.getTime()) && MEIA_NOITE_UTC.test(valor.toISOString())
  return typeof valor === 'string' && (SO_O_DIA.test(valor) || MEIA_NOITE_UTC.test(valor))
}

/**
 * A data no relógio de quem está olhando. Dia de calendário vira meia-noite
 * LOCAL do mesmo dia (para exibir e para comparar com "hoje"); instante com
 * hora continua sendo o instante.
 */
export function dataLocal(valor: Valor): Date {
  if (valor === null || valor === undefined || valor === '') return new Date(NaN)
  if (!ehDataSemHora(valor)) return new Date(valor)
  const iso = valor instanceof Date ? valor.toISOString() : String(valor)
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}

/** `08/10/2026`, ou o formato pedido. Vazio quando não há data válida. */
export function dataDeCalendario(valor: Valor, opcoes?: Intl.DateTimeFormatOptions): string {
  const data = dataLocal(valor)
  return Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-BR', opcoes)
}
