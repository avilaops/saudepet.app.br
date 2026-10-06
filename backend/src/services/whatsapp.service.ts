import type { WhatsappMessage } from '@prisma/client';
import prisma from '../config/database';
import { graphPost } from './meta-graph.service';
import { resolvePublicTenant } from './public-tenant.service';

/** O que a Graph API devolve ao aceitar uma mensagem. */
interface RespostaDeEnvio {
  messages?: { id?: string }[];
}

export interface EnvioDeTexto {
  to: string;
  body: string;
  usuarioId?: string | null;
  solicitacaoId?: string | null;
}

export interface EnvioDeTemplate {
  to: string;
  templateName: string;
  languageCode?: string;
  params?: string[];
  usuarioId?: string | null;
  solicitacaoId?: string | null;
}

/** Uma entrada de `changes[]` do webhook de mensagens da Meta. */
export interface MudancaDoWebhook {
  value: {
    messages?: { id: string; from: string; type: string; text?: { body?: string } }[];
    statuses?: { id: string; status: string }[];
  };
}

/** `erro.response?.data || erro.message`, sem supor que o erro é um Error. */
function detalheDoErro(erro: unknown): unknown {
  const e = erro as { response?: { data?: unknown }; message?: string } | null;
  return e?.response?.data || e?.message;
}

function isConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_API_TOKEN);
}

// Normaliza telefone brasileiro "(11) 91234-5678" pro formato E.164 sem "+" que a API espera.
// Com telefone garantido devolve string; a sobrecarga poupa quem já validou o número.
function toE164(phone: string): string;
function toE164(phone?: string | null): string | null;
function toE164(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

async function sendTextMessage({ to, body, usuarioId, solicitacaoId }: EnvioDeTexto): Promise<WhatsappMessage | null> {
  if (!isConfigured()) {
    console.log('ℹ️  [WHATSAPP] Integração não configurada (WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_API_TOKEN ausentes), envio ignorado');
    return null;
  }
  const tenant = await resolvePublicTenant();
  const waPhone = toE164(to);

  try {
    const response = await graphPost<RespostaDeEnvio>(
      `${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      process.env.WHATSAPP_API_TOKEN as string, // garantido por isConfigured()
      { messaging_product: 'whatsapp', to: waPhone, type: 'text', text: { body } }
    );
    return await prisma.whatsappMessage.create({
      data: {
        tenant_id: tenant.id,
        direction: 'outbound',
        wa_message_id: response.messages?.[0]?.id || null,
        wa_phone: waPhone,
        usuario_id: usuarioId || null,
        solicitacao_id: solicitacaoId || null,
        body,
        status: 'enviada'
      }
    });
  } catch (error) {
    console.error('❌ [WHATSAPP] Falha ao enviar mensagem:', detalheDoErro(error));
    return await prisma.whatsappMessage.create({
      data: {
        tenant_id: tenant.id,
        direction: 'outbound',
        wa_phone: waPhone,
        usuario_id: usuarioId || null,
        solicitacao_id: solicitacaoId || null,
        body,
        status: 'falhou',
        error_detail: JSON.stringify(detalheDoErro(error)).slice(0, 2000)
      }
    });
  }
}

// Mensagens de template são obrigatórias pra notificar fora da janela de 24h de uma
// conversa iniciada pelo usuário. O nome do template precisa já estar aprovado na Meta.
async function sendTemplateMessage({
  to,
  templateName,
  languageCode = 'pt_BR',
  params = [],
  usuarioId,
  solicitacaoId
}: EnvioDeTemplate): Promise<WhatsappMessage | null> {
  if (!isConfigured()) {
    console.log('ℹ️  [WHATSAPP] Integração não configurada, envio de template ignorado');
    return null;
  }
  const tenant = await resolvePublicTenant();
  const waPhone = toE164(to);

  try {
    const response = await graphPost<RespostaDeEnvio>(
      `${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      process.env.WHATSAPP_API_TOKEN as string, // garantido por isConfigured()
      {
        messaging_product: 'whatsapp',
        to: waPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: params.length ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] : []
        }
      }
    );
    return await prisma.whatsappMessage.create({
      data: {
        tenant_id: tenant.id,
        direction: 'outbound',
        wa_message_id: response.messages?.[0]?.id || null,
        wa_phone: waPhone,
        usuario_id: usuarioId || null,
        solicitacao_id: solicitacaoId || null,
        template_name: templateName,
        status: 'enviada'
      }
    });
  } catch (error) {
    console.error('❌ [WHATSAPP] Falha ao enviar template:', detalheDoErro(error));
    return await prisma.whatsappMessage.create({
      data: {
        tenant_id: tenant.id,
        direction: 'outbound',
        wa_phone: waPhone,
        usuario_id: usuarioId || null,
        solicitacao_id: solicitacaoId || null,
        template_name: templateName,
        status: 'falhou',
        error_detail: JSON.stringify(detalheDoErro(error)).slice(0, 2000)
      }
    });
  }
}

// Nunca deve derrubar o fluxo principal (aceitar atendimento, etc.) por causa de uma
// notificação secundária — por isso é sempre chamado com .catch(() => {}) por quem usa.
async function notifySolicitacaoAceita({
  tutorPhone,
  tutorUsuarioId,
  solicitacaoId,
  veterinarioNome
}: {
  tutorPhone?: string | null;
  tutorUsuarioId?: string | null;
  solicitacaoId?: string | null;
  veterinarioNome?: string | null;
}): Promise<WhatsappMessage | null> {
  if (!tutorPhone) return null;
  return sendTemplateMessage({
    to: tutorPhone,
    templateName: process.env.WHATSAPP_TEMPLATE_SOLICITACAO_ACEITA || 'solicitacao_aceita',
    params: [veterinarioNome || 'um veterinário'],
    usuarioId: tutorUsuarioId,
    solicitacaoId
  });
}

async function processIncomingMessage(entryChange: MudancaDoWebhook): Promise<void> {
  const tenant = await resolvePublicTenant();
  const value = entryChange.value;

  for (const message of value.messages || []) {
    const from = message.from;
    const usuario = await prisma.usuario.findFirst({
      where: { tenant_id: tenant.id, telefone: { contains: from.slice(-8) } },
      select: { id: true }
    });

    await prisma.whatsappMessage.create({
      data: {
        tenant_id: tenant.id,
        direction: 'inbound',
        wa_message_id: message.id,
        wa_phone: from,
        usuario_id: usuario?.id || null,
        body: message.text?.body || `[${message.type}]`,
        status: 'recebida'
      }
    }).catch((error: unknown) => {
      // wa_message_id duplicado = webhook retry da Meta, ignora silenciosamente
      if ((error as { code?: string }).code !== 'P2002') throw error;
    });
  }

  for (const status of value.statuses || []) {
    await prisma.whatsappMessage.updateMany({
      where: { wa_message_id: status.id },
      data: { status: status.status }
    }).catch(() => {});
  }
}

module.exports = {
  isConfigured,
  toE164,
  sendTextMessage,
  sendTemplateMessage,
  notifySolicitacaoAceita,
  processIncomingMessage
};

export {
  isConfigured,
  toE164,
  sendTextMessage,
  sendTemplateMessage,
  notifySolicitacaoAceita,
  processIncomingMessage
};
