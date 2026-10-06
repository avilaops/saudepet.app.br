import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { verifyWebhookSignature } from '../services/meta-graph.service';
import { fetchAndStoreLead } from '../services/meta-leads.service';
import { processIncomingMessage } from '../services/whatsapp.service';
import type { MudancaDoWebhook } from '../services/whatsapp.service';

/** Uma entrada de `changes[]`: leadgen (Lead Ads) ou messages (WhatsApp). */
interface MudancaDaMeta {
  field: string;
  value: MudancaDoWebhook['value'] & { leadgen_id?: string };
}

/** O que a Meta manda no POST: `entry[]`, cada uma com `changes[]` e/ou `messaging`. */
interface PayloadDaMeta {
  entry?: Array<{
    changes?: MudancaDaMeta[];
    messaging?: MudancaDoWebhook['value'];
  }>;
}

const mensagemDoErro = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * GET /api/v1/webhooks/meta
 * Challenge de verificação exigido pela Meta ao registrar a URL do webhook.
 */
const verify = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ [META_WEBHOOK] Verificação de webhook confirmada');
    return res.status(200).send(challenge);
  }
  console.warn('⚠️  [META_WEBHOOK] Falha na verificação do webhook (token não confere)');
  return res.sendStatus(403);
};

/**
 * POST /api/v1/webhooks/meta
 * Recebe eventos de leadgen (Lead Ads) e de WhatsApp (messages/statuses) no mesmo
 * endpoint — é assim que a Meta consolida webhooks de um único App.
 */
const receive = asyncHandler(async (req: Request, res: Response) => {
  const assinatura = req.headers['x-hub-signature-256'];
  const signature = Array.isArray(assinatura) ? assinatura[0] : assinatura;
  const rawBody: Buffer = req.body; // Buffer, por causa do express.raw() na rota

  if (!verifyWebhookSignature(rawBody, signature, process.env.META_APP_SECRET)) {
    console.error('❌ [META_WEBHOOK] Assinatura inválida');
    return res.sendStatus(401);
  }

  // Responde 200 imediatamente pra Meta não ficar reenviando; processa depois.
  res.sendStatus(200);

  let payload: PayloadDaMeta;
  try {
    payload = JSON.parse(rawBody.toString('utf-8'));
  } catch (error) {
    console.error('❌ [META_WEBHOOK] Payload inválido:', mensagemDoErro(error));
    return;
  }

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      try {
        if (change.field === 'leadgen') {
          const leadgenId = String(change.value.leadgen_id);
          const pageAccessToken = process.env.WHATSAPP_API_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || '';
          await fetchAndStoreLead(leadgenId, pageAccessToken);
        } else if (change.field === 'messages') {
          await processIncomingMessage(change);
        } else {
          console.log(`ℹ️  [META_WEBHOOK] Campo não tratado: ${change.field}`);
        }
      } catch (error) {
        console.error(`❌ [META_WEBHOOK] Erro processando change.field=${change.field}:`, mensagemDoErro(error));
      }
    }

    // Payload de WhatsApp às vezes vem direto em entry, sem "changes" (formato messaging)
    if (entry.messaging) {
      try {
        await processIncomingMessage({ value: entry.messaging });
      } catch (error) {
        console.error('❌ [META_WEBHOOK] Erro processando entry.messaging:', mensagemDoErro(error));
      }
    }
  }
});

export { verify, receive };
