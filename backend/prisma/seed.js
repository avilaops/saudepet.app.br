const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Criar usuário admin
  const senhaHashAdmin = await bcrypt.hash('admin123', 10);

  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@saudepet.com' },
    update: {},
    create: {
      nome: 'Administrador',
      email: 'admin@saudepet.com',
      telefone: '+5511999999999',
      senha: senhaHashAdmin,
      tipo_usuario: 'admin',
      cidade: 'São Paulo'
    },
  });

  console.log('✅ Usuário admin criado:', admin.email);
  console.log('📧 Email: admin@saudepet.com');
  console.log('🔑 Senha: admin123');

  // Criar tutor de exemplo
  const senhaHashTutor = await bcrypt.hash('tutor123', 10);

  const tutor = await prisma.usuario.upsert({
    where: { email: 'tutor@exemplo.com' },
    update: {},
    create: {
      nome: 'Maria Silva',
      email: 'tutor@exemplo.com',
      telefone: '+5511988888888',
      senha: senhaHashTutor,
      tipo_usuario: 'tutor',
      cidade: 'São Paulo'
    },
  });

  console.log('✅ Tutor de exemplo criado:', tutor.email);
  console.log('📧 Email: tutor@exemplo.com');
  console.log('🔑 Senha: tutor123');

  // Criar tutor adicional para testes (abraao.saantos@gmail.com)
  const senhaHashTutorTeste = await bcrypt.hash('12345678', 10);

  const tutorTeste = await prisma.usuario.upsert({
    where: { email: 'abraao.saantos@gmail.com' },
    update: {},
    create: {
      nome: 'Abraão Santos',
      email: 'abraao.saantos@gmail.com',
      telefone: '+5511966666666',
      senha: senhaHashTutorTeste,
      tipo_usuario: 'tutor',
      cidade: 'São Paulo'
    },
  });

  console.log('✅ Tutor de teste criado:', tutorTeste.email);
  console.log('📧 Email: abraao.saantos@gmail.com');
  console.log('🔑 Senha: 12345678');

  // Criar pet para o tutor
  const pet = await prisma.pet.create({
    data: {
      tutor_id: tutor.id,
      nome: 'Rex',
      tipo: 'Cachorro',
      raca: 'Labrador',
      idade: 5,
      peso: 30.5
    }
  });

  console.log('✅ Pet criado:', pet.nome);

  // Criar pet para o tutor de teste
  const petTeste = await prisma.pet.create({
    data: {
      tutor_id: tutorTeste.id,
      nome: 'Bolinha',
      tipo: 'Cachorro',
      raca: 'Golden Retriever',
      idade: 3,
      peso: 28.0
    }
  });

  console.log('✅ Pet de teste criado:', petTeste.nome);

  // Criar veterinário de exemplo
  const senhaHashVet = await bcrypt.hash('vet123', 10);

  const veterinarioUsuario = await prisma.usuario.upsert({
    where: { email: 'vet@exemplo.com' },
    update: {},
    create: {
      nome: 'Dr. João Santos',
      email: 'vet@exemplo.com',
      telefone: '+5511977777777',
      senha: senhaHashVet,
      tipo_usuario: 'veterinario',
      cidade: 'São Paulo'
    },
  });

  const veterinario = await prisma.veterinario.upsert({
    where: { usuario_id: veterinarioUsuario.id },
    update: {},
    create: {
      usuario_id: veterinarioUsuario.id,
      crmv: 'SP-12345',
      especialidade: 'Clínica Geral',
      aprovado_admin: true,
      online: false,
      avaliacao_media: 4.5,
      total_atendimentos: 0
    }
  });

  console.log('✅ Veterinário criado:', veterinarioUsuario.email);
  console.log('📧 Email: vet@exemplo.com');
  console.log('🔑 Senha: vet123');
  console.log('🏥 CRMV:', veterinario.crmv);
  console.log('✅ Aprovado: Sim');

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('\n📋 Resumo das contas criadas:');
  console.log('═══════════════════════════════════════════════════════');
  console.log('👨‍💼 ADMIN');
  console.log('   Email: admin@saudepet.com');
  console.log('   Senha: admin123');
  console.log('');
  console.log('👤 TUTOR');
  console.log('   Email: tutor@exemplo.com');
  console.log('   Senha: tutor123');
  console.log('   Pet: Rex (Labrador, 5 anos)');
  console.log('');
  console.log('🏥 VETERINÁRIO');
  console.log('   Email: vet@exemplo.com');
  console.log('   Senha: vet123');
  console.log('   CRMV: SP-12345');
  console.log('   Status: Aprovado ✓');
  console.log('═══════════════════════════════════════════════════════');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Erro durante seed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
