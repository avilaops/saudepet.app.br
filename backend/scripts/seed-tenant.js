const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/**
 * Seed para criar tenant demo e super admin
 * Execução: node backend/scripts/seed-tenant.js
 */

async function main() {
  console.log('🌱 [SEED] Iniciando seed de tenant demo...');

  // Criar super admin
  const superAdminEmail = 'superadmin@saudepet.com';
  const superAdminExiste = await prisma.usuario.findFirst({
    where: { email: superAdminEmail }
  });

  let superAdmin;
  if (!superAdminExiste) {
    const senhaHash = await bcrypt.hash('Admin@123', 10);
    superAdmin = await prisma.usuario.create({
      data: {
        nome: 'Super Admin',
        email: superAdminEmail,
        telefone: '(11) 00000-0000',
        senha: senhaHash,
        tipo_usuario: 'super_admin',
        cidade: 'São Paulo',
        tenant_id: null // Super admin não tem tenant
      }
    });
    console.log('✅ [SEED] Super Admin criado:', superAdmin.email);
  } else {
    console.log('ℹ️  [SEED] Super Admin já existe');
    superAdmin = superAdminExiste;
  }

  // Criar tenant demo
  const tenantSlug = 'clinica-demo';
  const tenantExiste = await prisma.tenant.findUnique({
    where: { slug: tenantSlug }
  });

  let tenant;
  if (!tenantExiste) {
    tenant = await prisma.tenant.create({
      data: {
        nome: 'Clínica Veterinária Demo',
        slug: tenantSlug,
        email: 'contato@clinica-demo.com',
        telefone: '(11) 98765-4321',
        endereco: 'Rua das Flores, 123',
        cidade: 'São Paulo',
        estado: 'SP',
        plano: 'premium',
        status: 'ativo',
        limite_usuarios: 50,
        limite_pets: 500,
        configuracoes: {
          create: {
            permitir_cadastro: true,
            requer_aprovacao_vet: false, // Para facilitar demo
            notificacoes_email: true,
            notificacoes_sms: false,
            cor_primaria: '#3B82F6',
            cor_secundaria: '#10B981'
          }
        }
      },
      include: {
        configuracoes: true
      }
    });
    console.log('✅ [SEED] Tenant demo criado:', tenant.slug);
  } else {
    console.log('ℹ️  [SEED] Tenant demo já existe');
    tenant = tenantExiste;
  }

  // Criar admin do tenant
  const adminEmail = 'admin@clinica-demo.com';
  const adminExiste = await prisma.usuario.findFirst({
    where: {
      email: adminEmail,
      tenant_id: tenant.id
    }
  });

  if (!adminExiste) {
    const senhaHash = await bcrypt.hash('Admin@123', 10);
    const admin = await prisma.usuario.create({
      data: {
        tenant_id: tenant.id,
        nome: 'Admin Demo',
        email: adminEmail,
        telefone: '(11) 91111-1111',
        senha: senhaHash,
        tipo_usuario: 'admin',
        cidade: 'São Paulo'
      }
    });
    console.log('✅ [SEED] Admin do tenant criado:', admin.email);
  } else {
    console.log('ℹ️  [SEED] Admin do tenant já existe');
  }

  // Criar veterinário de teste
  const vetEmail = 'vet@clinica-demo.com';
  const vetExiste = await prisma.usuario.findFirst({
    where: {
      email: vetEmail,
      tenant_id: tenant.id
    }
  });

  if (!vetExiste) {
    const senhaHash = await bcrypt.hash('Vet@123', 10);
    const vet = await prisma.usuario.create({
      data: {
        tenant_id: tenant.id,
        nome: 'Dr. João Silva',
        email: vetEmail,
        telefone: '(11) 92222-2222',
        senha: senhaHash,
        tipo_usuario: 'veterinario',
        cidade: 'São Paulo'
      }
    });

    await prisma.veterinario.create({
      data: {
        tenant_id: tenant.id,
        usuario_id: vet.id,
        crmv: 'SP-12345',
        especialidade: 'Clínica Geral',
        aprovado_admin: true, // Já aprovado para demo
        online: false
      }
    });

    console.log('✅ [SEED] Veterinário criado:', vet.email);
  } else {
    console.log('ℹ️  [SEED] Veterinário já existe');
  }

  // Criar tutor de teste
  const tutorEmail = 'tutor@clinica-demo.com';
  const tutorExiste = await prisma.usuario.findFirst({
    where: {
      email: tutorEmail,
      tenant_id: tenant.id
    }
  });

  let tutor;
  if (!tutorExiste) {
    const senhaHash = await bcrypt.hash('Tutor@123', 10);
    tutor = await prisma.usuario.create({
      data: {
        tenant_id: tenant.id,
        nome: 'Maria Santos',
        email: tutorEmail,
        telefone: '(11) 93333-3333',
        senha: senhaHash,
        tipo_usuario: 'tutor',
        cidade: 'São Paulo'
      }
    });
    console.log('✅ [SEED] Tutor criado:', tutor.email);
  } else {
    console.log('ℹ️  [SEED] Tutor já existe');
    tutor = tutorExiste;
  }

  // Criar pet de teste
  const petExiste = await prisma.pet.findFirst({
    where: {
      tutor_id: tutor.id
    }
  });

  if (!petExiste) {
    const pet = await prisma.pet.create({
      data: {
        tenant_id: tenant.id,
        tutor_id: tutor.id,
        nome: 'Rex',
        tipo: 'cachorro',
        raca: 'Labrador',
        idade: 3,
        peso: 25.5
      }
    });
    console.log('✅ [SEED] Pet criado:', pet.nome);
  } else {
    console.log('ℹ️  [SEED] Pet já existe');
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🎉 [SEED] Seed concluído com sucesso!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n📋 CREDENCIAIS:');
  console.log('\nSuper Admin:');
  console.log('  Email: superadmin@saudepet.com');
  console.log('  Senha: Admin@123');
  console.log('\nTenant: clinica-demo');
  console.log('  Admin: admin@clinica-demo.com / Admin@123');
  console.log('  Vet: vet@clinica-demo.com / Vet@123');
  console.log('  Tutor: tutor@clinica-demo.com / Tutor@123');
  console.log('\n═══════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ [SEED] Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
