import prisma from '../config/database';

const emailService = require('./email.service');
const notificacaoController = require('../controllers/notificacao.controller');

/**
 * Avisos para a equipe administrativa.
 *
 * O produto tinha vários e-mails de alerta prontos em `email.service`
 * (`enviarEmailNovoVetAdmin`, `enviarEmailAlertaSlaAdmin`,
 * `enviarEmailAlertaNpsRuimAdmin`) e NENHUM deles era chamado de lugar nenhum.
 * Na prática, nada no sistema avisava a equipe de coisa alguma: um lead entrava
 * na landing, era gravado corretamente, a página dizia "nossa equipe fará o
 * contato" — e o único caminho para alguém descobrir era abrir `/admin/leads`
 * por conta própria.
 *
 * Tudo aqui é melhor esforço: nenhum aviso pode derrubar a ação que o originou.
 * Um e-mail que não sai não pode impedir um lead de ser gravado.
 */

/** E-mails dos administradores ativos de um tenant, mais os avulsos do ambiente. */
export async function destinatariosAdmin(tenantId: string): Promise<string[]> {
  const admins = await prisma.usuario.findMany({
    where: { tenant_id: tenantId, tipo_usuario: { in: ['admin', 'super_admin'] }, ativo: true },
    select: { email: true }
  });

  const emails = admins
    .map((admin: { email: string | null }) => admin.email)
    .filter((email): email is string => Boolean(email));

  // `ADMIN_ALERT_EMAIL` cobre a operação que ainda não tem admin cadastrado no
  // tenant — sem isso o primeiro lead da vida do produto não avisaria ninguém.
  const extras = (process.env.ADMIN_ALERT_EMAIL || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set([...emails, ...extras])];
}

export type Lead = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  pet_name?: string | null;
  pet_type?: string | null;
  interest?: string | null;
  preferred_contact_time?: string | null;
  source_page?: string | null;
  created_at?: Date | string | null;
};

/** Linha da tabela do e-mail; campo vazio não vira linha em branco. */
const linhaDoResumo = (rotulo: string, valor?: string | null): string =>
  valor
    ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px">${rotulo}</td><td style="padding:4px 0;font-weight:600;font-size:13px">${valor}</td></tr>`
    : '';

/**
 * Novo lead da landing: e-mail para a equipe e evento na sala dos admins, para
 * quem estiver com o painel aberto ver a linha aparecer.
 */
export async function avisarNovoLead(
  { tenantId, lead, io }: { tenantId: string; lead: Lead; io?: any }
): Promise<void> {
  try {
    if (io) {
      io.to(`tenant:${tenantId}:admins`).emit('lead:novo', {
        id: lead.id,
        nome: lead.name,
        telefone: lead.phone,
        interesse: lead.interest,
        cidade: lead.city || null,
        criado_em: lead.created_at
      });
    }
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('⚠️  [NOTIF ADMIN] Socket de novo lead falhou (ignorado):', mensagem);
  }

  try {
    const destinatarios = await destinatariosAdmin(tenantId);
    if (destinatarios.length === 0) return;

    const telefoneLimpo = String(lead.phone || '').replace(/\D/g, '');

    await emailService.sendMail({
      to: destinatarios.join(','),
      subject: `Novo contato no site: ${lead.name}`,
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 4px;font-size:18px">Novo contato pelo site</h2>
        <p style="margin:0 0 16px;font-size:13px;color:#64748b">Alguém pediu contato na landing do Saúde PET.</p>
        <table style="border-collapse:collapse;margin-bottom:20px">
          ${linhaDoResumo('Nome', lead.name)}
          ${linhaDoResumo('Telefone', lead.phone)}
          ${linhaDoResumo('E-mail', lead.email)}
          ${linhaDoResumo('Cidade', [lead.city, lead.state].filter(Boolean).join(' / '))}
          ${linhaDoResumo('Pet', [lead.pet_name, lead.pet_type].filter(Boolean).join(' · '))}
          ${linhaDoResumo('Interesse', lead.interest)}
          ${linhaDoResumo('Melhor horário', lead.preferred_contact_time)}
          ${linhaDoResumo('Origem', lead.source_page)}
        </table>
        ${telefoneLimpo ? `<a href="https://wa.me/55${telefoneLimpo}" style="display:inline-block;padding:10px 18px;border-radius:10px;background:#159fa3;color:#fff;font-weight:700;font-size:13px;text-decoration:none">Falar no WhatsApp</a>` : ''}
        <p style="margin:20px 0 0;font-size:12px;color:#94a3b8">A pessoa leu que a equipe entraria em contato pelo canal informado.</p>
      </div>`
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('⚠️  [NOTIF ADMIN] E-mail de novo lead falhou (ignorado):', mensagem);
  }
}

export type VeterinarioPendente = {
  id: string;
  tenant_id?: string;
  nome: string;
  email?: string | null;
  cidade?: string | null;
  crmv?: string | null;
  uf?: string | null;
  especialidade?: string | null;
};

/**
 * Novo veterinário aguardando credenciamento.
 *
 * Os seis interruptores de notificação em `/admin/sistema` gravavam a
 * preferência em `ConfiguracaoNotificacao` e NADA no sistema os lia:
 * `deveNotificar()` não era chamado por nenhum arquivo fora do próprio
 * controller. Ligar ou desligar não mudava absolutamente nada. Aqui eles valem:
 * o canal só dispara se o admin quiser esse canal.
 *
 * Desde 26/08/2026 este aviso tem dois pontos de entrada: o cadastro público de
 * veterinário e o pedido de credenciamento feito de dentro de uma conta de
 * tutor (`POST /veterinarios/credenciamento`).
 */
export async function avisarNovoVeterinario(
  { tenantId, veterinario, io }: { tenantId: string; veterinario: VeterinarioPendente; io?: any }
): Promise<void> {
  let canais: { email: boolean; popup: boolean } = { email: true, popup: true };

  try {
    canais = await notificacaoController.deveNotificar('novo_veterinario');
  } catch {
    // Sem preferência gravada, o padrão é avisar: perder um credenciamento na
    // fila é pior do que um e-mail a mais.
  }

  if (canais.popup && io) {
    try {
      io.to(`tenant:${tenantId}:admins`).emit('novo:veterinario', veterinario);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error('⚠️  [NOTIF ADMIN] Socket de novo veterinário falhou (ignorado):', mensagem);
    }
  }

  if (!canais.email) return;

  try {
    const destinatarios = await destinatariosAdmin(tenantId);
    if (destinatarios.length === 0) return;

    await emailService.enviarEmailNovoVetAdmin(destinatarios.join(','), {
      nomeVet: veterinario.nome,
      crmvVet: veterinario.crmv,
      ufCrmv: veterinario.uf || '',
      email: veterinario.email,
      cidade: veterinario.cidade,
      especialidade: veterinario.especialidade
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('⚠️  [NOTIF ADMIN] E-mail de novo veterinário falhou (ignorado):', mensagem);
  }
}

module.exports = { destinatariosAdmin, avisarNovoLead, avisarNovoVeterinario };
