const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Iniciando seed do banco de dados...');

  try {
    // Limpar dados existentes (cuidado em produção!)
    console.log('🗑️  Limpando dados existentes...');
    await prisma.avaliacao.deleteMany();
    await prisma.solicitacao.deleteMany();
    await prisma.pet.deleteMany();
    await prisma.veterinario.deleteMany();
    await prisma.usuario.deleteMany();

    // Criar Admin
    console.log('👨‍💼 Criando administrador...');
    const senhaHashAdmin = await bcrypt.hash('admin123', 10);
    const admin = await prisma.usuario.create({
      data: {
        nome: 'Administrador',
        email: 'admin@saudepet.com',
        telefone: '11999999999',
        senha: senhaHashAdmin,
        tipo_usuario: 'admin',
        cidade: 'São Paulo'
      }
    });
    console.log('✅ Admin criado:', admin.email);

    // Criar Tutores
    console.log('🏠 Criando tutores...');
    const senhaHashTutor = await bcrypt.hash('123456', 10);
    
    const tutor1 = await prisma.usuario.create({
      data: {
        nome: 'João Silva',
        email: 'joao@teste.com',
        telefone: '11988888888',
        senha: senhaHashTutor,
        tipo_usuario: 'tutor',
        cidade: 'São Paulo'
      }
    });

    const tutor2 = await prisma.usuario.create({
      data: {
        nome: 'Maria Oliveira',
        email: 'maria@teste.com',
        telefone: '11977777777',
        senha: senhaHashTutor,
        tipo_usuario: 'tutor',
        cidade: 'São Paulo'
      }
    });
    console.log('✅ 2 tutores criados');

    // Criar Pets
    console.log('🐾 Criando pets...');
    await prisma.pet.createMany({
      data: [
        {
          tutor_id: tutor1.id,
          nome: 'Thor',
          tipo: 'cachorro',
          raca: 'Golden Retriever',
          idade: 3,
          peso: 28.5
        },
        {
          tutor_id: tutor1.id,
          nome: 'Luna',
          tipo: 'gato',
          raca: 'Siamês',
          idade: 2,
          peso: 4.2
        },
        {
          tutor_id: tutor2.id,
          nome: 'Bob',
          tipo: 'cachorro',
          raca: 'Vira-lata',
          idade: 5,
          peso: 15.0
        }
      ]
    });
    console.log('✅ 3 pets criados');

    // Criar Veterinários
    console.log('👨‍⚕️ Criando veterinários...');
    const senhaHashVet = await bcrypt.hash('123456', 10);

    const usuarioVet1 = await prisma.usuario.create({
      data: {
        nome: 'Dra. Ana Santos',
        email: 'ana@vet.com',
        telefone: '11966666666',
        senha: senhaHashVet,
        tipo_usuario: 'veterinario',
        cidade: 'São Paulo'
      }
    });

    await prisma.veterinario.create({
      data: {
        usuario_id: usuarioVet1.id,
        crmv: 'SP-12345',
        especialidade: 'Clínico Geral',
        aprovado_admin: true,
        avaliacao_media: 4.8,
        total_atendimentos: 15
      }
    });

    const usuarioVet2 = await prisma.usuario.create({
      data: {
        nome: 'Dr. Carlos Mendes',
        email: 'carlos@vet.com',
        telefone: '11955555555',
        senha: senhaHashVet,
        tipo_usuario: 'veterinario',
        cidade: 'São Paulo'
      }
    });

    await prisma.veterinario.create({
      data: {
        usuario_id: usuarioVet2.id,
        crmv: 'SP-67890',
        especialidade: 'Cirurgião',
        aprovado_admin: true,
        avaliacao_media: 4.9,
        total_atendimentos: 23
      }
    });

    // Veterinário pendente de aprovação
    const usuarioVet3 = await prisma.usuario.create({
      data: {
        nome: 'Dra. Paula Costa',
        email: 'paula@vet.com',
        telefone: '11944444444',
        senha: senhaHashVet,
        tipo_usuario: 'veterinario',
        cidade: 'São Paulo'
      }
    });

    await prisma.veterinario.create({
      data: {
        usuario_id: usuarioVet3.id,
        crmv: 'SP-11111',
        especialidade: 'Dermatologia Veterinária',
        aprovado_admin: false
      }
    });

    console.log('✅ 3 veterinários criados (2 aprovados, 1 pendente)');

    console.log('\n🎉 Seed concluído com sucesso!\n');
    console.log('📧 Credenciais de acesso:\n');
    console.log('ADMIN:');
    console.log('  Email: admin@saudepet.com');
    console.log('  Senha: admin123\n');
    console.log('TUTOR:');
    console.log('  Email: joao@teste.com ou maria@teste.com');
    console.log('  Senha: 123456\n');
    console.log('VETERINÁRIO:');
    console.log('  Email: ana@vet.com ou carlos@vet.com');
    console.log('  Senha: 123456\n');
    console.log('VETERINÁRIO PENDENTE:');
    console.log('  Email: paula@vet.com');
    console.log('  Senha: 123456\n');

  } catch (error) {
    console.error('❌ Erro ao executar seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed();

export {};
