import { inicioDoMesBr, relogioDeParede } from '../utils/datas';
import prisma from '../config/database';

/**
 * O extrato mensal do veterinário.
 *
 * O template `vet/extrato-mensal` existia pronto — quantas consultas, quanto
 * líquido, chave Pix — e nada o chamava. O profissional só sabia quanto tinha
 * recebido se abrisse a tela de repasses e somasse na cabeça.
 *
 * Um extrato que chega sozinho no começo do mês é o que transforma "acho que
 * atendi bastante" em número, e é o documento que ele usa para conferir o que
 * caiu na conta. Vale mais do que qualquer painel: chega sem ser procurado.
 */

const emailService = require('./email.service');

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/** De hora em hora; o envio só acontece na janela certa. */
const INTERVALO_PADRAO_MS = 60 * 60 * 1000;

/**
 * Dia e hora do envio.
 *
 * Dia 1 é cedo demais — o fechamento do último dia do mês ainda está
 * liquidando. Dia 2 pela manhã pega o mês inteiro já consolidado, e chega antes
 * de o profissional começar a se perguntar.
 */
const DIA_DO_ENVIO = 2;
const HORA_DO_ENVIO = 9;

const SITE = process.env.FRONTEND_URL || 'https://saudepet.app.br';

const emReais = (valor: number) =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ehJanelaDeEnvio(agora = new Date()): boolean {
  // Dia e hora do relógio do Brasil: o servidor roda em UTC.
  const relogio = relogioDeParede(agora);
  return relogio.dia === DIA_DO_ENVIO && Math.floor(relogio.minutos / 60) === HORA_DO_ENVIO;
}

/** Primeiro e último instante do mês anterior ao de referência. */
export function mesAnterior(referencia = new Date()) {
  const inicio = inicioDoMesBr(referencia, -1);
  const fim = inicioDoMesBr(referencia);
  const mes = relogioDeParede(inicio);
  return { inicio, fim, rotulo: `${MESES[mes.mes - 1]}/${mes.ano}` };
}

export type ResultadoDoExtrato = { veterinarios: number; enviados: number };

/**
 * Monta e envia o extrato de cada profissional que teve movimento no mês.
 *
 * Quem não atendeu não recebe: extrato zerado não informa nada e parece
 * cobrança.
 */
export async function enviarExtratosDoMes(referencia = new Date()): Promise<ResultadoDoExtrato> {
  const { inicio, fim, rotulo } = mesAnterior(referencia);

  // `recipient_id` guarda o id do veterinário quando `recipient_type` é
  // VETERINARIAN — o split é genérico e serve também para plataforma e
  // parceiro, por isso o filtro pelo tipo é obrigatório aqui.
  const repasses = await prisma.paymentSplit.findMany({
    where: {
      criado_em: { gte: inicio, lt: fim },
      recipient_type: 'VETERINARIAN',
      recipient_id: { not: null },
      // Só o que de fato foi pago: split pendente não é dinheiro que caiu.
      status: 'PAID'
    },
    select: { recipient_id: true, recipient_amount: true }
  }).catch(() => [] as Array<Record<string, unknown>>);

  if (!Array.isArray(repasses) || repasses.length === 0) {
    return { veterinarios: 0, enviados: 0 };
  }

  type Acumulado = { nome: string; email: string | null; consultas: number; liquido: number };
  const porVeterinario = new Map<string, Acumulado>();

  for (const repasse of repasses as Array<{ recipient_id: string | null; recipient_amount: unknown }>) {
    const id = repasse.recipient_id;
    if (!id) continue;

    const atual = porVeterinario.get(id) || { nome: 'Doutor(a)', email: null, consultas: 0, liquido: 0 };
    atual.consultas += 1;
    atual.liquido += Number(repasse.recipient_amount) || 0;
    porVeterinario.set(id, atual);
  }

  // Nome e e-mail numa consulta só, depois de somar: buscar por repasse traria
  // o mesmo profissional dezenas de vezes.
  const profissionais = await prisma.veterinario.findMany({
    where: { id: { in: [...porVeterinario.keys()] } },
    select: { id: true, usuario: { select: { nome: true, email: true } } }
  }).catch(() => [] as Array<{ id: string; usuario?: { nome?: string | null; email?: string | null } | null }>);

  for (const profissional of profissionais) {
    const acumulado = porVeterinario.get(profissional.id);
    if (!acumulado) continue;
    acumulado.nome = profissional.usuario?.nome || 'Doutor(a)';
    acumulado.email = profissional.usuario?.email || null;
  }

  let enviados = 0;

  for (const [, dados] of porVeterinario) {
    if (!dados.email) continue;

    try {
      await emailService.enviarEmailExtratoMensalVet(dados.email, {
        nomeVet: dados.nome,
        mesAno: rotulo,
        qtdConsultas: dados.consultas,
        valorLiquido: emReais(dados.liquido),
        // A chave Pix vive cifrada nos dados bancários; o extrato aponta para a
        // tela em vez de decifrar aqui só para exibir.
        chavePix: null,
        extratoUrl: `${SITE}/veterinario/repasses`
      });
      enviados += 1;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error(`⚠️  [Extrato] ${dados.email} não recebeu (ignorado):`, mensagem);
    }
  }

  return { veterinarios: porVeterinario.size, enviados };
}

export function iniciarWorkerDeExtrato(intervaloMs: number = INTERVALO_PADRAO_MS) {
  const ciclo = () => {
    // A varredura roda de hora em hora; o envio só na janela. Assim o worker
    // sobrevive a reinício do servidor sem precisar de agendador externo.
    if (!ehJanelaDeEnvio()) return;

    enviarExtratosDoMes().catch((erro: unknown) => {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error('⚠️  [Extrato] Ciclo falhou (ignorado):', mensagem);
    });
  };

  ciclo();
  const timer = setInterval(ciclo, intervaloMs);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`⏱️  Worker de extrato mensal ativo (envia dia ${DIA_DO_ENVIO} às ${HORA_DO_ENVIO}h)`);
  return timer;
}

export { DIA_DO_ENVIO, HORA_DO_ENVIO };
