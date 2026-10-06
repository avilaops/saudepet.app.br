import prisma from '../config/database';

/**
 * O pedido de avaliação que nunca era feito.
 *
 * O template `tutor/avaliacao-nps` existia pronto, com estrelas e link, e
 * nenhuma linha do sistema o chamava. Na prática, o tutor só avaliava se
 * voltasse ao aplicativo por conta própria e lembrasse de fazer isso — e quem
 * teve um bom atendimento raramente volta só para elogiar. O resultado é uma
 * média construída quase só por quem teve motivo de reclamar.
 *
 * O pedido sai algumas horas depois do atendimento, não na hora: pedir nota no
 * mesmo minuto em que o veterinário saiu pela porta é pedir impressão, não
 * avaliação — e chega junto do e-mail com a receita, que é o que a pessoa
 * realmente quer ler naquele momento.
 */

const emailService = require('./email.service');

/** Tempo de decantação. Cedo demais é impressão; tarde demais, esquecimento. */
const HORAS_DE_ESPERA = 4;

/** Depois disso não se pede mais: ninguém avalia consulta da semana passada. */
const HORAS_LIMITE = 72;

const INTERVALO_PADRAO_MS = 60 * 60 * 1000;

const SITE = process.env.FRONTEND_URL || 'https://saudepet.app.br';

export type ResultadoDaRodada = { candidatos: number; pedidos: number };

/**
 * Pede avaliação dos atendimentos que já decantaram e ainda não foram avaliados.
 */
export async function pedirAvaliacoesPendentes(): Promise<ResultadoDaRodada> {
  const agora = Date.now();

  const candidatos = await prisma.solicitacao.findMany({
    where: {
      status: { in: ['finalizado', 'concluido'] },
      finalizado_em: {
        lte: new Date(agora - HORAS_DE_ESPERA * 3600_000),
        gte: new Date(agora - HORAS_LIMITE * 3600_000)
      },
      // A marca de que já pedimos. Sem ela, o tutor receberia o mesmo pedido a
      // cada hora até avaliar — que é a melhor forma de ensinar alguém a
      // ignorar os nossos e-mails.
      avaliacao_pedida_em: null,
      // Quem já avaliou não recebe pedido: a nota do tutor é a `autor_papel`
      // 'tutor'; a do veterinário sobre ele não conta aqui.
      avaliacoes: { none: { autor_papel: 'tutor' } }
    },
    select: {
      id: true,
      tenant_id: true,
      tutor: { select: { nome: true, email: true } },
      pet: { select: { nome: true } },
      veterinario: { select: { usuario: { select: { nome: true } } } }
    },
    take: 100
  });

  let pedidos = 0;

  for (const atendimento of candidatos) {
    const email = atendimento.tutor?.email;

    // Sem e-mail não há pedido — mas a marca é gravada assim mesmo, senão este
    // atendimento seria varrido de hora em hora para sempre.
    if (email) {
      try {
        await emailService.enviarEmailAvaliacaoNps(email, {
          nomeTutor: atendimento.tutor?.nome || 'tutor',
          nomePet: atendimento.pet?.nome || 'seu pet',
          nomeVet: atendimento.veterinario?.usuario?.nome || 'o veterinário',
          avaliacaoUrl: `${SITE}/tutor/avaliar/${atendimento.id}`
        });
        pedidos += 1;
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.error(`⚠️  [Avaliação] Pedido de ${atendimento.id} não saiu:`, mensagem);
        // Falhou o envio: NÃO marca, para a próxima rodada tentar de novo.
        continue;
      }
    }

    await prisma.solicitacao
      .update({ where: { id: atendimento.id }, data: { avaliacao_pedida_em: new Date() } })
      .catch(() => {});
  }

  return { candidatos: candidatos.length, pedidos };
}

export function iniciarWorkerDeAvaliacao(intervaloMs: number = INTERVALO_PADRAO_MS) {
  const ciclo = () => {
    pedirAvaliacoesPendentes().catch((erro: unknown) => {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error('⚠️  [Avaliação] Ciclo falhou (ignorado):', mensagem);
    });
  };

  ciclo();
  const timer = setInterval(ciclo, intervaloMs);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`⏱️  Worker de pedido de avaliação ativo (a cada ${Math.round(intervaloMs / 60000)} min)`);
  return timer;
}

export { HORAS_DE_ESPERA, HORAS_LIMITE };
