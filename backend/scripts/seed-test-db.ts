/**
 * Script para popular banco de dados de teste com dados mínimos
 * Uso: DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saudepet_test" npx tsx scripts/seed-test-db.ts
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedTestDatabase() {
  try {
    console.log('🌱 Iniciando seed do banco de teste...');

    // Limpar dados existentes (exceto migrations)
    console.log('🗑️  Limpando dados antigos...');
    await prisma.$executeRaw`TRUNCATE TABLE "configuracoes_tenant", "usuarios", "pets", "veterinarios", "solicitacoes", "mensagens", "avaliacoes", "tenants" RESTART IDENTITY CASCADE`;
    console.log('✅ Dados limpos');

    // Criar tenant de teste
    const tenant = await prisma.tenant.create({
      data: {
        nome: 'Clínica Demo Testes',
        slug: 'clinica-demo',
        email: 'demo@clinicateste.com',
        telefone: '(11) 99999-9999',
        cidade: 'São Paulo',
        estado: 'SP',
        plano: 'premium',
        status: 'ativo',
        limite_usuarios: 10000,  // Limite alto para testes
        limite_pets: 50000       // Limite alto para testes
      }
    });

    console.log('✅ Tenant criado:', tenant.nome);
    console.log('📝 Slug:', tenant.slug);
    console.log('🎯 Plano:', tenant.plano);

    // Criar configurações do tenant
    await prisma.configuracaoTenant.create({
      data: {
        tenant_id: tenant.id,
        permitir_cadastro: true,
        requer_aprovacao_vet: false, // Para facilitar testes
        notificacoes_email: false,
        notificacoes_sms: false
      }
    });

    console.log('✅ Configurações do tenant criadas');

    // Criar usuário veterinário pré-aprovado para testes
    const bcrypt = require('bcryptjs');
    const senhaHash = await bcrypt.hash('SenhaSegura@123', 10);

    const vetUsuario = await prisma.usuario.create({
      data: {
        tenant_id: tenant.id,
        nome: 'Dr. Teste Auto-Aprovado',
        email: 'vet.aprovado@test.com',
        telefone: '(11) 99999-0000',
        senha: senhaHash,
        tipo_usuario: 'veterinario',
        cidade: 'São Paulo',
        email_verificado: true
      }
    });

    await prisma.veterinario.create({
      data: {
        tenant_id: tenant.id,
        usuario_id: vetUsuario.id,
        crmv: 'CRMV-SP 12345',
        especialidade: 'Clínico Geral',
        aprovado_admin: true  // Pré-aprovado para testes
      }
    });

    console.log('✅ Veterinário de teste criado e aprovado');
    console.log('\n✅ Seed do banco de teste concluído com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao popular banco de teste:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedTestDatabase();

export {};
