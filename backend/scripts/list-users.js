const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listUsers() {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        tipo_usuario: true,
        telefone: true,
        cidade: true,
        criado_em: true
      },
      orderBy: {
        criado_em: 'desc'
      }
    });

    console.log(`\n📊 Total de usuários: ${usuarios.length}\n`);

    const tutores = usuarios.filter(u => u.tipo_usuario === 'tutor');
    const veterinarios = usuarios.filter(u => u.tipo_usuario === 'veterinario');
    const admins = usuarios.filter(u => u.tipo_usuario === 'admin');

    console.log(`👥 Tutores: ${tutores.length}`);
    console.log(`🏥 Veterinários: ${veterinarios.length}`);
    console.log(`👨‍💼 Admins: ${admins.length}\n`);

    if (veterinarios.length > 0) {
      console.log('🏥 VETERINÁRIOS CADASTRADOS:\n');
      veterinarios.forEach((vet, index) => {
        console.log(`${index + 1}. ${vet.nome}`);
        console.log(`   📧 Email: ${vet.email}`);
        console.log(`   📱 Telefone: ${vet.telefone}`);
        console.log(`   📍 Cidade: ${vet.cidade}`);
        console.log(`   📅 Criado em: ${new Date(vet.criado_em).toLocaleString('pt-BR')}`);
        console.log('');
      });
    }

    if (tutores.length > 0) {
      console.log('👥 TUTORES CADASTRADOS:\n');
      tutores.forEach((tutor, index) => {
        console.log(`${index + 1}. ${tutor.nome}`);
        console.log(`   📧 Email: ${tutor.email}`);
        console.log(`   📱 Telefone: ${tutor.telefone}`);
        console.log(`   📍 Cidade: ${tutor.cidade}`);
        console.log('');
      });
    }

    if (admins.length > 0) {
      console.log('👨‍💼 ADMINISTRADORES:\n');
      admins.forEach((admin, index) => {
        console.log(`${index + 1}. ${admin.nome}`);
        console.log(`   📧 Email: ${admin.email}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

listUsers();
