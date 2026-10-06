import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';

const verificacaoEmailTemplate = function ({ nomeUsuario, verifyUrl }: DadosDoEmail) {
  const content = `
    <div style="text-align: center;">
      <span class="badge badge-teal">📧 Verificação de Conta</span>
      <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
        Falta pouco para ativar sua conta!
      </h1>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
        Olá, <strong>${nomeUsuario}</strong>! Obrigado por cadastrar-se no <strong>Saúde PET</strong>. Para garantir a segurança da sua conta, por favor confirme seu endereço de e-mail clicando no botão abaixo.
      </p>

      <a href="${verifyUrl}" class="btn-primary" target="_blank">
        Confirmar Meu E-mail
      </a>

      <div class="card-info" style="text-align: left; margin-top: 32px;">
        <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
          <strong>💡 Dúvidas comuns:</strong> Este link é seguro e válido por 24 horas. Se você não criou uma conta no Saúde PET, pode ignorar esta mensagem com segurança.
        </p>
      </div>

      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; word-break: break-all;">
        Se o botão acima não funcionar, copie e cole o link no seu navegador:<br>
        <a href="${verifyUrl}" style="color: #0d9488;">${verifyUrl}</a>
      </p>
    </div>
  `;

  return baseLayout({
    title: 'Verifique seu e-mail — Saúde PET',
    previewText: 'Confirme seu endereço de e-mail para ativar sua conta no Saúde PET',
    content
  });
};

export = verificacaoEmailTemplate;
