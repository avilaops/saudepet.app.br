import { dataBr } from '../utils/datas';
import type { Request, Response } from 'express';
import type { Partner, Pet, Prisma, ReferralStatus } from '@prisma/client';
import crypto from 'crypto';
import prisma from '../config/database';
import emailService from '../services/email.service';
import { asyncHandler, NotFoundError, BadRequestError, UnauthorizedError } from '../middleware/error.middleware';

// Rotas autenticadas. Sem `req.user` o JavaScript estourava TypeError (500) ao
// ler `id`; aqui o erro tem nome.
const usuarioDe = (req: Request) => {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
};

/** Primeiro valor de um parâmetro de query, como string; vazio vira undefined. */
const textoDaQuery = (valor: unknown): string | undefined => {
  if (valor === undefined || valor === null || valor === '') return undefined;
  return String(Array.isArray(valor) ? valor[0] : valor);
};

/**
 * 🐶 TUTOR: Solicitar indicação para estabelecimento parceiro
 */
const createReferral = asyncHandler(async (req: Request, res: Response) => {
  const { petId, partnerId, partnerUnitId, partnerServiceId, reason } = req.body;
  const usuario = usuarioDe(req);
  const tutorId = usuario.id;
  const tenantId = usuario.tenant_id || 'saudepet';

  if (!petId || !partnerId || !partnerUnitId) {
    throw new BadRequestError('Informe o Pet, o Parceiro e a Unidade para gerar a indicação');
  }

  // Verificar pet e parceiro
  const [pet, partner, unit] = await Promise.all([
    prisma.pet.findFirst({ where: { id: String(petId), tutor_id: tutorId } }),
    prisma.partner.findUnique({ where: { id: String(partnerId) } }),
    prisma.partnerUnit.findFirst({
      where: { id: String(partnerUnitId), partnerId: String(partnerId) },
      // `email` entra aqui porque é para a unidade que o aviso vai primeiro:
      // quem atende é a unidade, não a matriz.
      select: { id: true, name: true, email: true, city: true, addressLine: true, phone: true }
    })
  ]);

  if (!pet) throw new NotFoundError('Pet não encontrado ou não pertence a este tutor');
  if (!partner || partner.status !== 'ACTIVE') throw new BadRequestError('Estabelecimento parceiro indisponível');
  if (!unit) throw new NotFoundError('Unidade do parceiro não encontrada');

  // Gerar código amigável e token seguro para o QR Code
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  const year = new Date().getFullYear();
  const referralCode = `SP-${year}-${randomHex}`;

  // QR Code payload token criptograficamente seguro (sem dados sensíveis no QR Code)
  const qrTokenPayload = JSON.stringify({
    code: referralCode,
    tid: tenantId,
    timestamp: Date.now()
  });

  // Validade padrão: 7 dias
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const referral = await prisma.referral.create({
    data: {
      tenantId,
      referralCode,
      tutorId,
      petId: String(petId),
      partnerId: String(partnerId),
      partnerUnitId: String(partnerUnitId),
      partnerServiceId: partnerServiceId ? String(partnerServiceId) : null,
      reason,
      status: 'CREATED',
      qrCodePayload: qrTokenPayload,
      expiresAt
    },
    include: {
      partner: { select: { tradeName: true, logoUrl: true, phone: true } },
      unit: { select: { name: true, city: true, addressLine: true, phone: true } },
      service: { select: { name: true, publicPrice: true } }
    }
  });

  // A tela do tutor afirma "o parceiro já foi avisado da sua solicitação" — e
  // nada era enviado a ninguém: a indicação nascia e ficava esperando o tutor
  // aparecer com o código na mão, sem que o estabelecimento soubesse de nada.
  void avisarParceiroDaIndicacao({ referral, pet, partner, unit });

  return res.status(201).json({
    success: true,
    message: 'Indicação gerada com sucesso! Apresente o código ou QR Code no atendimento.',
    referral
  });
});

type ReferralCriada = Prisma.ReferralGetPayload<{
  include: {
    partner: { select: { tradeName: true; logoUrl: true; phone: true } };
    unit: { select: { name: true; city: true; addressLine: true; phone: true } };
    service: { select: { name: true; publicPrice: true } };
  };
}>;

type UnidadeAvisada = { name: string; email: string | null } | null;

/**
 * Aviso ao parceiro. Best-effort: um e-mail que falha não pode transformar uma
 * indicação criada em erro na tela do tutor.
 */
async function avisarParceiroDaIndicacao({ referral, pet, partner, unit }: {
  referral: ReferralCriada;
  pet: Pet | null;
  partner: Partner | null;
  unit: UnidadeAvisada;
}) {
  try {
    const destinatarios = [unit?.email, partner?.email].filter((email): email is string => Boolean(email));
    if (destinatarios.length === 0) return;

    const validade = dataBr(referral.expiresAt);
    const linha = (rotulo: string, valor: unknown) =>
      valor ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px">${rotulo}</td><td style="padding:4px 0;font-weight:600;font-size:13px">${valor}</td></tr>` : '';

    await emailService.sendMail({
      to: [...new Set(destinatarios)].join(','),
      subject: `Nova indicação Saúde PET — ${referral.referralCode}`,
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 4px;font-size:18px">Você recebeu uma indicação</h2>
        <p style="margin:0 0 16px;font-size:13px;color:#64748b">Um tutor do Saúde PET foi encaminhado à sua unidade.</p>
        <p style="margin:0 0 16px;font-size:22px;font-weight:800;letter-spacing:1px">${referral.referralCode}</p>
        <table style="border-collapse:collapse;margin-bottom:16px">
          ${linha('Pet', pet?.nome)}
          ${linha('Unidade', unit?.name)}
          ${linha('Serviço', referral.service?.name)}
          ${linha('Motivo', referral.reason)}
          ${linha('Válida até', validade)}
        </table>
        <p style="margin:0;font-size:12px;color:#94a3b8">Confirme o atendimento no painel do parceiro para que a comissão entre no fechamento do período.</p>
      </div>`
    });
  } catch (erro) {
    console.error('⚠️  [INDICAÇÃO] Aviso ao parceiro falhou (ignorado):', erro instanceof Error ? erro.message : String(erro));
  }
}

/**
 * 📱 TUTOR: Listar minhas indicações
 */
const getTutorReferrals = asyncHandler(async (req: Request, res: Response) => {
  const tutorId = usuarioDe(req).id;

  const referrals = await prisma.referral.findMany({
    where: { tutorId },
    include: {
      partner: { select: { tradeName: true, logoUrl: true, phone: true, whatsapp: true } },
      unit: { select: { name: true, city: true, addressLine: true } },
      service: { select: { name: true, publicPrice: true } },
      conversions: { select: { grossAmount: true, status: true, confirmedAt: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return res.json({ success: true, count: referrals.length, referrals });
});

/**
 * 🩺 PARCEIRO: Validar código de voucher/indicação no balcão
 */
const validateReferralCode = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.params;
  const partnerId = textoDaQuery(req.query.partnerId);

  if (!code || !String(code).trim()) {
    throw new BadRequestError('Informe o código do voucher para validação');
  }

  const cleanCode = String(code).trim().toUpperCase();

  const referral = await prisma.referral.findFirst({
    where: {
      referralCode: cleanCode
    },
    include: {
      partner: { select: { id: true, tradeName: true, logoUrl: true } },
      unit: { select: { id: true, name: true, city: true, addressLine: true, phone: true } },
      service: { select: { id: true, name: true, publicPrice: true, priceType: true } },
      conversions: { select: { id: true, grossAmount: true, commissionAmount: true, partnerNetAmount: true, confirmedAt: true, status: true } }
    }
  });

  if (!referral) {
    throw new NotFoundError('Voucher de indicação não encontrado. Verifique o código digitado.');
  }

  if (partnerId && referral.partnerId !== partnerId && req.userType !== 'admin' && req.userType !== 'super_admin') {
    throw new BadRequestError(`Este voucher foi emitido para ${referral.partner?.tradeName || 'outro estabelecimento'}.`);
  }

  const [tutor, pet] = await Promise.all([
    prisma.usuario.findUnique({
      where: { id: referral.tutorId },
      select: { id: true, nome: true, email: true, telefone: true }
    }),
    prisma.pet.findUnique({
      where: { id: referral.petId },
      // `Pet` guarda `foto` e `peso`; a API expõe `foto_url` e `peso_kg`. O
      // select pedia os nomes da API e o Prisma recusava a consulta inteira
      // (500 em toda validação de voucher). Mesmo mapeamento do commit 94a76b6.
      select: { id: true, nome: true, especie: true, raca: true, foto: true, sexo: true, peso: true }
    })
  ]);

  const petFormatado = pet ? { ...pet, foto_url: pet.foto, peso_kg: pet.peso } : null;

  const agora = new Date();
  const expirado = new Date(referral.expiresAt) < agora;
  const jaConvertido = referral.status === 'CONVERTED' || referral.conversions.length > 0;
  const cancelado = referral.status === 'CANCELLED';

  const rule = await prisma.commissionRule.findFirst({
    where: {
      tenantId: referral.tenantId,
      active: true,
      OR: [
        { partnerServiceId: referral.partnerServiceId },
        { partnerUnitId: referral.partnerUnitId },
        { partnerId: referral.partnerId },
        { partnerId: null }
      ]
    },
    orderBy: [
      { priority: 'desc' },
      { partnerServiceId: 'desc' },
      { partnerUnitId: 'desc' },
      { partnerId: 'desc' }
    ]
  });

  const percentage = rule ? Number(rule.percentage) : 10.0;
  const fixed = rule ? Number(rule.fixedAmount) : 0.0;
  const calcType = rule ? rule.calculationType : 'PERCENTAGE';

  return res.json({
    success: true,
    referral: {
      ...referral,
      tutor: tutor || { nome: 'Tutor', telefone: '' },
      pet: petFormatado || { nome: 'Pet', especie: 'canino' },
      isExpired: expirado,
      isConverted: jaConvertido,
      isCancelled: cancelado,
      canConvert: !expirado && !jaConvertido && !cancelado,
      commissionPreview: {
        type: calcType,
        percentage,
        fixed
      }
    }
  });
});

/**
 * 🩺 PARCEIRO: Listar indicações recebidas
 */
const getPartnerReferrals = asyncHandler(async (req: Request, res: Response) => {
  const partnerId = String(req.params.partnerId);
  const status = textoDaQuery(req.query.status);
  const unitId = textoDaQuery(req.query.unitId);

  const where: Prisma.ReferralWhereInput = { partnerId };
  // O valor vai ao Prisma como veio da URL; fora do enum ele recusa a consulta.
  if (status) where.status = status as ReferralStatus;
  if (unitId) where.partnerUnitId = unitId;

  const referrals = await prisma.referral.findMany({
    where,
    include: {
      unit: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, publicPrice: true } },
      conversions: {
        select: {
          id: true,
          grossAmount: true,
          discountAmount: true,
          commissionAmount: true,
          partnerNetAmount: true,
          confirmedAt: true,
          status: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  // Enriquecer com tutores e pets
  const tutorIds = [...new Set(referrals.map((r) => r.tutorId).filter(Boolean))];
  const petIds = [...new Set(referrals.map((r) => r.petId).filter(Boolean))];

  const [tutores, pets] = await Promise.all([
    tutorIds.length > 0
      ? prisma.usuario.findMany({
          where: { id: { in: tutorIds } },
          select: { id: true, nome: true, telefone: true }
        })
      : [],
    petIds.length > 0
      ? prisma.pet.findMany({
          where: { id: { in: petIds } },
          // Idem: `foto` no banco, `foto_url` na API.
          select: { id: true, nome: true, especie: true, raca: true, foto: true }
        })
      : []
  ]);

  const tutorMap = new Map(tutores.map((t) => [t.id, t]));
  const petMap = new Map(pets.map((p) => [p.id, { ...p, foto_url: p.foto }]));

  const enrichedReferrals = referrals.map((ref) => ({
    ...ref,
    tutor: tutorMap.get(ref.tutorId) || { nome: 'Tutor', telefone: '' },
    pet: petMap.get(ref.petId) || { nome: 'Pet', especie: 'canino' }
  }));

  return res.json({ success: true, count: enrichedReferrals.length, referrals: enrichedReferrals });
});

/**
 * 🩺 PARCEIRO: Registrar atendimento e calcular comissão dinamicamente
 */
const registerConversion = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { grossAmount, discountAmount = 0 } = req.body;

  if (!grossAmount || parseFloat(grossAmount) <= 0) {
    throw new BadRequestError('Informe o valor bruto total cobrado no atendimento');
  }

  const referral = await prisma.referral.findUnique({
    where: { id },
    include: { partner: true, conversions: true }
  });

  if (!referral) throw new NotFoundError('Indicação não encontrada');
  if (referral.conversions.length > 0) {
    throw new BadRequestError('Esta indicação já possui uma conversão/comissão registrada');
  }

  const gross = parseFloat(grossAmount);
  const discount = parseFloat(discountAmount);
  const eligible = Math.max(0, gross - discount);

  // 🧠 Motor de Hierarquia de Comissão Dinâmica
  // Regra 1: Serviço específico -> Regra 2: Unidade -> Regra 3: Parceiro -> Regra 4: Tenant Padrão (10%)
  const rule = await prisma.commissionRule.findFirst({
    where: {
      tenantId: referral.tenantId,
      active: true,
      OR: [
        { partnerServiceId: referral.partnerServiceId },
        { partnerUnitId: referral.partnerUnitId },
        { partnerId: referral.partnerId },
        { partnerId: null }
      ]
    },
    orderBy: [
      { priority: 'desc' },
      { partnerServiceId: 'desc' },
      { partnerUnitId: 'desc' },
      { partnerId: 'desc' }
    ]
  });

  const percentage = rule ? Number(rule.percentage) : 10.0;
  const fixed = rule ? Number(rule.fixedAmount) : 0.0;
  const calcType = rule ? rule.calculationType : 'PERCENTAGE';

  let calculatedCommission = 0;
  if (calcType === 'PERCENTAGE') {
    calculatedCommission = (eligible * percentage) / 100;
  } else if (calcType === 'FIXED') {
    calculatedCommission = fixed;
  } else if (calcType === 'PERCENTAGE_PLUS_FIXED') {
    calculatedCommission = ((eligible * percentage) / 100) + fixed;
  }

  // Aplicar piso e teto se definidos
  if (rule?.minimumCommission && calculatedCommission < Number(rule.minimumCommission)) {
    calculatedCommission = Number(rule.minimumCommission);
  }
  if (rule?.maximumCommission && calculatedCommission > Number(rule.maximumCommission)) {
    calculatedCommission = Number(rule.maximumCommission);
  }

  const netPartner = Math.max(0, eligible - calculatedCommission);

  // Transação atômica: atualiza status da indicação e cria a conversão com snapshot
  const [updatedReferral, conversion] = await prisma.$transaction([
    prisma.referral.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        attendedAt: new Date()
      }
    }),
    prisma.referralConversion.create({
      data: {
        referralId: id,
        grossAmount: gross,
        eligibleAmount: eligible,
        discountAmount: discount,
        commissionTypeSnapshot: calcType,
        commissionPercentageSnapshot: percentage,
        commissionFixedSnapshot: fixed,
        commissionAmount: calculatedCommission,
        partnerNetAmount: netPartner,
        confirmedBy: String(req.userId),
        status: 'CONFIRMED'
      }
    })
  ]);

  return res.json({
    success: true,
    message: 'Atendimento e comissão registrados com sucesso!',
    referral: updatedReferral,
    conversion
  });
});

const referralController = {
  createReferral,
  getTutorReferrals,
  validateReferralCode,
  getPartnerReferrals,
  registerConversion
};

module.exports = referralController;

export default referralController;
export {
  createReferral,
  getTutorReferrals,
  validateReferralCode,
  getPartnerReferrals,
  registerConversion
};
