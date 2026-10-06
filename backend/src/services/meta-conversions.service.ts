import crypto from 'crypto';
import { graphPost, hashSha256 } from './meta-graph.service';

function isConfigured(): boolean {
  return Boolean(process.env.META_PIXEL_ID && process.env.META_CONVERSIONS_API_TOKEN);
}

interface DadosDoUsuario {
  email?: string | null;
  phone?: string | null;
  ip?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
}

/**
 * Envia um evento server-side pra Conversions API. Nunca lança erro pra quem chama —
 * tracking de conversão não pode derrubar um cadastro/lead/solicitação real.
 * userData (email, phone, ip, userAgent) é hasheado (email/phone) antes de sair daqui,
 * como a Meta exige.
 */
async function trackConversion(
  eventName: string,
  { email, phone, ip, userAgent, fbp, fbc }: DadosDoUsuario = {},
  customData: Record<string, unknown> = {}
): Promise<void> {
  if (!isConfigured()) return;
  try {
    await graphPost(`${process.env.META_PIXEL_ID}/events`, process.env.META_CONVERSIONS_API_TOKEN as string, {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: crypto.randomUUID(),
          action_source: 'website',
          user_data: {
            em: hashSha256(email),
            ph: hashSha256(phone),
            client_ip_address: ip,
            client_user_agent: userAgent,
            fbp,
            fbc
          },
          custom_data: customData
        }
      ],
      ...(process.env.META_CONVERSIONS_TEST_CODE ? { test_event_code: process.env.META_CONVERSIONS_TEST_CODE } : {})
    });
  } catch (error) {
    const erro = error as { response?: { data?: unknown }; message?: string };
    console.error('❌ [META_CAPI] Falha ao enviar evento de conversão (ignorado):', erro.response?.data || erro.message);
  }
}

export { isConfigured, trackConversion };
