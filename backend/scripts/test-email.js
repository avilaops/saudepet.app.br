require('dotenv').config();
const emailService = require('../src/services/email.service');

async function testarEmail() {
  console.log('🧪 Testando serviço de e-mail...\n');

  // Testar conexão SMTP
  console.log('1️⃣ Testando conexão SMTP...');
  const resultado = await emailService.testarConexao();
  console.log('Resultado:', resultado);
  console.log('');

  // Testar envio de email de boas-vindas TUTOR
  console.log('2️⃣ Testando e-mail de boas-vindas (TUTOR)...');
  try {
    await emailService.enviarEmailBoasVindasTutor(
      'nicolasrosaab@gmail.com',
      'Nicolas Tutor Teste'
    );
    console.log('✅ E-mail de boas-vindas (tutor) enviado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail:', error.message);
  }
  console.log('');

  // Testar envio de email de pendência VETERINÁRIO
  console.log('3️⃣ Testando e-mail de pendência (VETERINÁRIO)...');
  try {
    await emailService.enviarEmailPendenciaAprovacao(
      'nicolasrosaab@gmail.com',
      'Nicolas Veterinário Teste'
    );
    console.log('✅ E-mail de pendência (veterinário) enviado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail:', error.message);
  }

  process.exit(0);
}

testarEmail();
