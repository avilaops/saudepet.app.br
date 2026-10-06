import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';
import { urlDoSite } from '../../../config/site';

const avaliacaoNpsTemplate = function ({
  nomeTutor,
  nomePet,
  nomeVet,
  avaliacaoUrl
}: DadosDoEmail) {
  const content = `
    <div style="text-align: center;">
      <span class="badge badge-amber">⭐ Avaliação do Atendimento</span>
      <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
        Como foi a consulta do ${nomePet}?
      </h1>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
        Olá, <strong>${nomeTutor}</strong>! Sua opinião é fundamental para garantirmos o mais alto padrão de cuidado veterinário. Como foi a experiência com o(a) <strong>${nomeVet}</strong>?
      </p>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin: 24px 0;">
        <p style="margin: 0 0 16px; font-weight: 700; color: #334155; font-size: 15px;">
          Selecione sua nota de 1 a 5 estrelas:
        </p>
        <div style="font-size: 32px; letter-spacing: 8px;">
          <a href="${avaliacaoUrl}&nota=5" style="text-decoration: none;">⭐</a>
          <a href="${avaliacaoUrl}&nota=4" style="text-decoration: none;">⭐</a>
          <a href="${avaliacaoUrl}&nota=3" style="text-decoration: none;">⭐</a>
          <a href="${avaliacaoUrl}&nota=2" style="text-decoration: none;">⭐</a>
          <a href="${avaliacaoUrl}&nota=1" style="text-decoration: none;">⭐</a>
        </div>
      </div>

      <a href="${avaliacaoUrl || urlDoSite('/tutor/historico')}" class="btn-orange" target="_blank">
        Avaliar Atendimento Agora →
      </a>
    </div>
  `;

  return baseLayout({
    title: `Sua opinião é importante! Avalie a consulta do ${nomePet} — Saúde PET`,
    previewText: `Avalie o atendimento realizado por ${nomeVet} em menos de 1 minuto`,
    content
  });
};

export = avaliacaoNpsTemplate;
