const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    // Verificar se já existe um admin
    const adminExiste = await prisma.usuario.findFirst({
      where: { tipo_usuario: 'admin' }
    });

    if (adminExiste) {
      console.log('❌ Já existe um administrador cadastrado');
      console.log('Email:', adminExiste.email);
      process.exit(0);
    }

    // Criar admin
    const senhaHash = await bcrypt.hash('admin123', 10);

    const admin = await prisma.usuario.create({
      data: {
        nome: 'Administrador',
        email: 'admin@saudepet.com',
        telefone: '11999999999',
        senha: senhaHash,
        tipo_usuario: 'admin',
        cidade: 'São Paulo'
      }
    });

    console.log('✅ Administrador criado com sucesso!');
    console.log('');
    console.log('📧 Email:', admin.email);
    console.log('🔑 Senha: admin123');
    console.log('');
    console.log('⚠️  IMPORTANTE: Altere a senha após o primeiro login!');

  } catch (error) {
    console.error('❌ Erro ao criar administrador:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
