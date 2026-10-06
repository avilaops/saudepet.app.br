import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';

const alertaSenhaAlteradaTemplate = function ({ nomeUsuario, dataHora, suporteUrl }: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-teal">🛡️ Segurança da Conta</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Sua senha foi alterada com sucesso!
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>${nomeUsuario}</strong>! Confirmamos que a senha da sua conta no <strong>Saúde PET</strong> foi alterada em <strong>${dataHora || new Date().toLocaleString('pt-BR')}</strong>.
      </p>

      <div class="card-info" style="border-left: 4px solid #10b981;">
        <p style="margin: 0; color: #065f46; font-size: 14px; font-weight: 700;">
          ✅ Alteração Confirmada
        </p>
        <p style="margin: 4px 0 0; color: #475569; font-size: 13px;">
          Sua conta está segura e você já pode acessar com sua nova senha em qualquer dispositivo.
        </p>
      </div>

      <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 20px; margin-top: 24px;">
        <p style="margin: 0; color: #9f1239; font-weight: 700; font-size: 14px;">
          🚨 Não reconhece esta alteração?
        </p>
        <p style="margin: 6px 0 16px; color: #881337; font-size: 13px; line-height: 1.5;">
          Se você não fez essa mudança, sua conta pode ter sido acessada sem permissão. Recomendamos redefinir sua senha imediatamente e contatar nosso suporte.
        </p>
        <a href="${suporteUrl || 'https://saudepet.app.br/suporte'}" style="color: #e11d48; font-weight: 700; font-size: 13px; text-decoration: underline;">
          Falar com o Suporte do Saúde PET →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: 'Sua senha foi alterada — Saúde PET',
    previewText: 'Confirmação de alteração de senha na sua conta Saúde PET',
    content
  });
};

export = alertaSenhaAlteradaTemplate;
