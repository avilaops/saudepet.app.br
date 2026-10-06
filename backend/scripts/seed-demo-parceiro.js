const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Criando parceiro de demonstração para comprovação do Portão 1...');

  // 1. Obter ou criar tenant default
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        nome: 'Saúde Pet Brasil',
        slug: 'saudepet',
        dominio: 'saudepet.app.br',
        ativo: true,
      },
    });
  }

  // 2. Criar ou atualizar Usuário Parceiro
  const senhaHash = await bcrypt.hash('Parceiro2026@Avila', 10);
  let user = await prisma.usuario.findFirst({
    where: { email: 'parceiro@biovet.com.br' },
  });

  if (!user) {
    user = await prisma.usuario.create({
      data: {
        tenant_id: tenant.id,
        nome: 'Dr. Roberto Biovet',
        email: 'parceiro@biovet.com.br',
        senha_hash: senhaHash,
        tipo_usuario: 'tutor', // base role, permissions via partner_users
        telefone: '17998877665',
        cidade: 'São José do Rio Preto',
        estado: 'SP',
        ativo: true,
        email_verificado: true,
      },
    });
  }

  // 3. Criar Categoria de Parceiro se não existir
  let category = await prisma.partnerCategory.findFirst({
    where: { name: 'Laboratórios e Exames' },
  });
  if (!category) {
    category = await prisma.partnerCategory.create({
      data: {
        name: 'Laboratórios e Exames',
        slug: 'laboratorios-e-exames',
        description: 'Exames laboratoriais, de imagem e diagnósticos especializados.',
        icon: 'FlaskConical',
        active: true,
      },
    });
  }

  // 4. Criar Partner
  let partner = await prisma.partner.findFirst({
    where: { tradeName: 'Laboratório BioVet Rio Preto' },
  });

  if (!partner) {
    partner = await prisma.partner.create({
      data: {
        tenantId: tenant.id,
        legalName: 'BioVet Diagnósticos Veterinários Ltda',
        tradeName: 'Laboratório BioVet Rio Preto',
        documentNumber: '44555666000199',
        partnerType: 'LABORATORY',
        description: 'Laboratório clínico e diagnóstico por imagem com laudos em 24h para cães e gatos.',
        email: 'contato@biovet.com.br',
        phone: '1732345678',
        whatsapp: '17998877665',
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        rating: 5.0,
      },
    });
  }

  // 5. Vincular Usuário ao Partner (partner_users)
  const existingUserLink = await prisma.partnerUser.findFirst({
    where: { partnerId: partner.id, userId: user.id },
  });
  if (!existingUserLink) {
    await prisma.partnerUser.create({
      data: {
        partnerId: partner.id,
        userId: user.id,
        role: 'OWNER',
        active: true,
      },
    });
  }

  // 6. Criar Unidade física
  const existingUnit = await prisma.partnerUnit.findFirst({
    where: { partnerId: partner.id },
  });
  if (!existingUnit) {
    await prisma.partnerUnit.create({
      data: {
        partnerId: partner.id,
        name: 'Unidade Central — Rio Preto',
        email: 'central@biovet.com.br',
        phone: '1732345678',
        addressLine: 'Av. Alberto Andaló',
        addressNumber: '3200',
        district: 'Centro',
        city: 'São José do Rio Preto',
        state: 'SP',
        postalCode: '15015000',
        latitude: -20.8113,
        longitude: -49.3758,
        active: true,
      },
    });
  }

  // 7. Criar Serviços
  const existingService = await prisma.partnerService.findFirst({
    where: { partnerId: partner.id, name: 'Hemograma Completo + Bioquímico' },
  });
  if (!existingService) {
    await prisma.partnerService.create({
      data: {
        partnerId: partner.id,
        categoryId: category.id,
        name: 'Hemograma Completo + Bioquímico',
        description: 'Painel completo com contagem de plaquetas e perfil hepático/renal.',
        publicPrice: 180.0,
        active: true,
      },
    });
  }

  // 8. Regra de Comissão
  const existingRule = await prisma.commissionRule.findFirst({
    where: { partnerId: partner.id },
  });
  if (!existingRule) {
    await prisma.commissionRule.create({
      data: {
        tenantId: tenant.id,
        partnerId: partner.id,
        name: 'Comissão padrão BioVet',
        calculationType: 'PERCENTAGE',
        percentage: 10.0,
        active: true,
      },
    });
  }

  // 9. Obter ou criar um Tutor e Pet para a indicação
  let tutor = await prisma.usuario.findFirst({ where: { tipo_usuario: 'tutor' } });
  if (!tutor) {
    tutor = await prisma.usuario.create({
      data: {
        tenant_id: tenant.id,
        nome: 'Marcos Silveira (Tutor)',
        email: 'marcos.tutor@exemplo.com',
        senha_hash: senhaHash,
        tipo_usuario: 'tutor',
        telefone: '17991122334',
        cidade: 'São José do Rio Preto',
        estado: 'SP',
        ativo: true,
      },
    });
  }

  let pet = await prisma.pet.findFirst({ where: { tutor_id: tutor.id } });
  if (!pet) {
    pet = await prisma.pet.create({
      data: {
        tutor_id: tutor.id,
        nome: 'Thor',
        especie: 'cachorro',
        raca: 'Golden Retriever',
        porte: 'grande',
        sexo: 'macho',
        idade_anos: 3,
        peso_kg: 32.5,
      },
    });
  }

  // 10. Criar Referral / Voucher pendente
  const unit = existingUnit || (await prisma.partnerUnit.findFirst({ where: { partnerId: partner.id } }));
  const referralCode = 'SP-BIOVET-7742';
  let referral = await prisma.referral.findUnique({
    where: { referralCode },
  });

  if (!referral) {
    referral = await prisma.referral.create({
      data: {
        tenantId: tenant.id,
        partnerId: partner.id,
        tutorId: tutor.id,
        petId: pet.id,
        partnerUnitId: unit.id,
        referralCode,
        qrCodePayload: JSON.stringify({ referralCode, partnerId: partner.id }),
        status: 'CREATED',
        reason: 'Exame de triagem pré-operatória e perfil renal.',
        expiresAt: new Date(Date.now() + 15 * 86400_000),
      },
    });
  }

  console.log('✅ Parceiro e Voucher criados com sucesso!');
  console.log('----------------------------------------------------');
  console.log(`🏥 Parceiro: ${partner.tradeName} (ID: ${partner.id})`);
  console.log(`👤 Login do Parceiro: parceiro@biovet.com.br`);
  console.log(`🔑 Senha: Parceiro2026@Avila`);
  console.log(`🎟️ Código do Voucher para validação: ${referralCode}`);
  console.log(`🌐 URL do Painel: https://saudepet.app.br/parceiro/painel`);
  console.log('----------------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
