import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { asyncHandler } from '../middleware/error.middleware';
import { resolveAdminTenant } from '../services/public-tenant.service';
import * as whatsappService from '../services/whatsapp.service';

const texto = (valor: unknown): string | undefined => (typeof valor === 'string' ? valor : undefined);

export const listWhatsappMessages = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const phone = texto(req.query.phone);
  const where: Prisma.WhatsappMessageWhereInput = {
    tenant_id: tenantId,
    ...(phone ? { wa_phone: { contains: phone.replace(/\D/g, '') } } : {})
  };

  const [messages, total] = await Promise.all([
    prisma.whatsappMessage.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.whatsappMessage.count({ where })
  ]);

  res.json({ messages, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const sendWhatsappMessage = asyncHandler(async (req: Request, res: Response) => {
  const corpo = (req.body ?? {}) as Record<string, unknown>;
  const to = texto(corpo.to);
  const body = texto(corpo.body);
  if (!to || !body) return res.status(400).json({ error: 'Informe "to" e "body"' });

  const result = await whatsappService.sendTextMessage({ to, body, usuarioId: req.user?.id });
  if (!result) return res.status(503).json({ error: 'Integração com WhatsApp ainda não configurada' });
  res.status(201).json({ message: result });
});

export const integrationsStatus = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    whatsapp: whatsappService.isConfigured(),
    leadAds: Boolean(process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN),
    conversionsApi: Boolean(process.env.META_PIXEL_ID && process.env.META_CONVERSIONS_API_TOKEN),
    threads: Boolean(process.env.META_THREADS_USER_ID && process.env.META_THREADS_ACCESS_TOKEN),
    facebookLogin: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET)
  });
});
