/**
 * Layout base responsivo para todos os e-mails do ecossistema Saúde PET
 */
/** O que o layout precisa para montar o corpo do e-mail. */
interface Envelope {
  title: string;
  content: string;
  previewText?: string;
}

const baseEmailLayout = function ({ title, content, previewText = '' }: Envelope) {
  const logoUrl = 'https://saudepet.app.br/brand/logo-completa.png';
  const siteUrl = 'https://saudepet.app.br';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Saúde PET'}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #0f172a;
    }
    .wrapper {
      width: 100%;
      background-color: #f1f5f9;
      padding: 32px 16px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.05);
      border: 1px solid #e2e8f0;
    }
    .header {
      background-color: #ffffff;
      padding: 28px 32px 20px;
      text-align: center;
      border-bottom: 1px solid #f1f5f9;
    }
    .header img {
      width: 220px;
      max-width: 100%;
      height: auto;
    }
    .content {
      padding: 36px 32px;
    }
    .footer {
      background-color: #0f172a;
      color: #94a3b8;
      padding: 28px 32px;
      text-align: center;
      font-size: 13px;
      line-height: 1.6;
    }
    .footer a {
      color: #38bdf8;
      text-decoration: none;
    }
    .btn-primary {
      display: inline-block;
      background-color: #0d9488;
      color: #ffffff !important;
      font-weight: 700;
      font-size: 15px;
      padding: 14px 32px;
      border-radius: 9999px;
      text-decoration: none;
      margin: 20px 0;
      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25);
    }
    .btn-orange {
      display: inline-block;
      background-color: #f97316;
      color: #ffffff !important;
      font-weight: 700;
      font-size: 15px;
      padding: 14px 32px;
      border-radius: 9999px;
      text-decoration: none;
      margin: 20px 0;
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.25);
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .badge-teal { background-color: #ccf0ec; color: #0f766e; }
    .badge-orange { background-color: #ffedd5; color: #c2410c; }
    .badge-amber { background-color: #fef3c7; color: #b45309; }
    .card-info {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
    }
    .preview-text {
      display: none !important;
      visibility: hidden;
      mso-hide: all;
      font-size: 1px;
      line-height: 1px;
      max-height: 0px;
      max-width: 0px;
      opacity: 0;
      overflow: hidden;
    }
    @media only screen and (max-width: 600px) {
      .content { padding: 24px 20px; }
      .header { padding: 20px; }
      .footer { padding: 20px; }
    }
  </style>
</head>
<body>
  ${previewText ? `<div class="preview-text">${previewText}</div>` : ''}
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <a href="${siteUrl}" target="_blank">
          <img src="${logoUrl}" alt="Saúde PET">
        </a>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p style="margin: 0 0 12px; color: #ffffff; font-weight: 700; font-size: 14px;">
          Saúde PET — Cuidado veterinário mais próximo.
        </p>
        <p style="margin: 0 0 16px;">
          Conectando tutores e veterinários credenciados para atendimento domiciliar, emergências e vacinação.
        </p>
        <p style="margin: 0; font-size: 12px; color: #64748b;">
          © 2026 Saúde PET. Um produto <a href="https://avila.inc" target="_blank" style="color: #94a3b8;">Avila Ops</a>. Todos os direitos reservados.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
};

export = baseEmailLayout;
