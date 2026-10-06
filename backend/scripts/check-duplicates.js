const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDuplicates() {
  console.log('\n🔍 Verificando duplicatas no banco de dados...\n');

  try {
    // Buscar todos os usuários
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        tipo_usuario: true,
        criado_em: true
      },
      orderBy: {
        email: 'asc'
      }
    });

    // Agrupar por email
    const emailCount = {};
    usuarios.forEach(user => {
      if (emailCount[user.email]) {
        emailCount[user.email].push(user);
      } else {
        emailCount[user.email] = [user];
      }
    });

    // Verificar duplicatas
    let duplicatesFound = false;
    Object.keys(emailCount).forEach(email => {
      if (emailCount[email].length > 1) {
        duplicatesFound = true;
        console.log(`❌ Email duplicado encontrado: ${email}`);
        emailCount[email].forEach((user, index) => {
          console.log(`   ${index + 1}. ${user.nome} (${user.tipo_usuario}) - Criado: ${new Date(user.criado_em).toLocaleString('pt-BR')}`);
          console.log(`      ID: ${user.id}`);
        });
        console.log('');
      }
    });

    if (!duplicatesFound) {
      console.log('✅ Nenhuma duplicata encontrada! Todos os emails são únicos.\n');
    }

    // Mostrar estatísticas
    console.log(`📊 Total de usuários: ${usuarios.length}`);
    console.log(`📧 Emails únicos: ${Object.keys(emailCount).length}\n`);

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicates();
