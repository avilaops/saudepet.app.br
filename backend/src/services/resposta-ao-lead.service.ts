/**
 * A resposta a quem deixou contato no site.
 *
 * Quem preenchia o formulário recebia silêncio: o e-mail de "novo contato" ia
 * para a EQUIPE, e a pessoa que digitou nome, telefone e o nome do pet não
 * recebia nada. Ela lê na tela que "a equipe entrará em contato" e fica sem
 * qualquer confirmação de que o pedido chegou — e a primeira dúvida de quem
 * espera é sempre "será que enviou?".
 *
 * Esta é uma resposta automática, não uma campanha: confirma o recebimento,
 * diz o que acontece a seguir, e — o que mais importa — oferece o caminho
 * imediato para quem não pode esperar contato. Alguém com um animal passando
 * mal não deveria estar esperando alguém ligar.
 */

const emailService = require('./email.service');

type Lead = {
  name?: string | null;
  email?: string | null;
  pet_name?: string | null;
  interest?: string | null;
};

const SITE = process.env.FRONTEND_URL || 'https://saudepet.app.br';

/** Primeiro nome: "Olá, Maria Aparecida da Silva" soa como cobrança. */
function primeiroNome(nome: string | null | undefined): string {
  const limpo = String(nome || '').trim();
  if (!limpo) return 'tudo bem';
  return limpo.split(/\s+/)[0];
}

export function corpoDaResposta(lead: Lead): string {
  const pet = lead.pet_name?.trim();

  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="margin:0 0 8px;font-size:19px">Recebemos seu contato</h2>

  <p style="margin:0 0 14px;font-size:14px;line-height:1.6">
    Olá, ${primeiroNome(lead.name)}. Sua mensagem chegou até a nossa equipe e alguém vai
    responder pelo canal que você informou.
  </p>

  <div style="padding:14px 16px;border:1px solid #fde68a;background:#fffbeb;border-radius:12px;margin-bottom:16px">
    <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e">
      <strong>Se ${pet ? pet : 'seu pet'} estiver passando mal agora</strong>, não espere nosso
      retorno: peça um veterinário direto pelo aplicativo, ou procure um pronto-socorro
      veterinário.
    </p>
  </div>

  <a href="${SITE}/login" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#159fa3;color:#fff;font-weight:700;font-size:14px;text-decoration:none">
    Abrir o Saúde Pet
  </a>

  <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#94a3b8">
    Você recebeu este e-mail porque deixou seu contato em ${SITE}. Não é preciso responder —
    se preferir falar antes, é só usar o mesmo formulário.
  </p>
</div>`;
}

/**
 * Envia a confirmação. Nunca lança: a resposta é cortesia, e falhar o e-mail
 * não pode derrubar a gravação do lead — perder o contato de alguém interessado
 * é o pior desfecho possível aqui.
 */
export async function responderAoLead(lead: Lead) {
  const destino = String(lead.email || '').trim();
  if (!destino) return { enviado: false, motivo: 'sem_email' };

  try {
    await emailService.sendMail({
      to: destino,
      subject: 'Recebemos seu contato — Saúde Pet',
      html: corpoDaResposta(lead)
    });
    return { enviado: true };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('⚠️  [LEAD] Resposta automática não saiu (ignorado):', mensagem);
    return { enviado: false, motivo: 'falhou', erro: mensagem };
  }
}
