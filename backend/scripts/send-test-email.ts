require('dotenv').config();
const emailService = require('../src/services/email.service');

async function enviarEmailTeste() {
  console.log('📧 Enviando email de teste para nicolas@avilaops.com...\n');

  try {
    await emailService.enviarEmailPendenciaAprovacao(
      'nicolas@avilaops.com',
      'Nicolas (Teste Manual)'
    );
    console.log('\n✅ Email de teste enviado com sucesso!');
    console.log('📬 Verifique a caixa de entrada (e spam) de nicolas@avilaops.com\n');
  } catch (error) {
    console.error('\n❌ Erro ao enviar:', error.message);
  }

  process.exit(0);
}

enviarEmailTeste();

export {};
