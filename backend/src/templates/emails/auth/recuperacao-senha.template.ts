import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';

const recuperacaoSenhaTemplate = function ({ nomeUsuario, resetUrl }: DadosDoEmail) {
  const content = `
    <div style="text-align: center;">
      <span class="badge badge-orange">🔐 Recuperação de Acesso</span>
      <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
        Esqueceu sua senha?
      </h1>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
        Olá, <strong>${nomeUsuario}</strong>! Recebemos um pedido de redefinição de senha para a sua conta no <strong>Saúde PET</strong>. Clique no botão abaixo para escolher uma nova senha.
      </p>

      <a href="${resetUrl}" class="btn-orange" target="_blank">
        Redefinir Minha Senha
      </a>

      <div class="card-info" style="text-align: left; margin-top: 32px; border-left: 4px solid #f97316;">
        <p style="margin: 0; color: #9a3412; font-size: 13px; font-weight: 700; margin-bottom: 4px;">
          ⚠️ Link válido por 60 minutos
        </p>
        <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
          Se você não solicitou esta redefinição de senha, fique tranquilo: sua senha atual continua segura e você pode ignorar este e-mail.
        </p>
      </div>

      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; word-break: break-all;">
        Se o botão não funcionar, copie este link no navegador:<br>
        <a href="${resetUrl}" style="color: #f97316;">${resetUrl}</a>
      </p>
    </div>
  `;

  return baseLayout({
    title: 'Redefinição de Senha — Saúde PET',
    previewText: 'Instruções seguras para criar uma nova senha no Saúde PET',
    content
  });
};

export = recuperacaoSenhaTemplate;
