import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';
import { urlDoSite } from '../../../config/site';

const boasVindasTutorTemplate = function ({ nomeTutor, appUrl = urlDoSite('/app') }: DadosDoEmail) {
  const content = `
    <div style="text-align: center;">
      <span class="badge badge-teal">🐾 Boas-Vindas ao Saúde PET</span>
      <h1 style="color: #0f172a; font-size: 26px; font-weight: 800; margin: 12px 0 16px;">
        Que bom ter você e seu pet aqui, ${nomeTutor}! 🎉
      </h1>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
        O <strong>Saúde PET</strong> nasceu para simplificar o cuidado médico veterinário: consultas domiciliares, vacinação e emergências rápidas diretamente no aconchego da sua casa.
      </p>

      <div class="card-info" style="text-align: left; background-color: #f0fdf4; border-color: #bbf7d0;">
        <p style="margin: 0 0 12px; color: #166534; font-weight: 800; font-size: 15px;">
          🚀 Primeiros passos recomendados:
        </p>
        <ul style="margin: 0; padding-left: 20px; color: #15803d; font-size: 14px; line-height: 1.8;">
          <li><strong>Cadastre a carteira do seu pet</strong> (raça, idade, peso e vacinas).</li>
          <li><strong>Salve seu endereço principal</strong> para atendimentos em minutos.</li>
          <li><strong>Tenha acesso a médicos veterinários 24h</strong> credenciados no CRMV.</li>
        </ul>
      </div>

      <a href="${appUrl}" class="btn-primary" target="_blank">
        Cadastrar Meu Primeiro Pet →
      </a>

      <p style="color: #94a3b8; font-size: 13px; margin-top: 24px;">
        Precisa de atendimento urgente? Acesse o app e solicite um veterinário em poucos toques!
      </p>
    </div>
  `;

  return baseLayout({
    title: 'Bem-vindo ao Saúde PET!',
    previewText: 'Cuidado veterinário domiciliar rápido, seguro e sem estresse para seu pet',
    content
  });
};

export = boasVindasTutorTemplate;
