import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';

const alertaVacinaTemplate = function ({
  nomeTutor,
  nomePet,
  nomeVacina = 'V10 / Raiva',
  dataVencimento,
  solicitarVacinaUrl
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-amber">💉 Vacinação Preventiva</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Vacina do ${nomePet} prestes a vencer!
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>${nomeTutor}</strong>! Manter as doses de vacina em dia é essencial para proteger o(a) <strong>${nomePet}</strong> contra doenças graves e zoonoses.
      </p>

      <div class="card-info" style="border-left: 4px solid #f97316; background-color: #fff7ed;">
        <p style="margin: 0; color: #9a3412; font-weight: 700; font-size: 14px;">
          ⚠️ Vacina Vencendo: <span style="color: #ea580c;">${nomeVacina}</span>
        </p>
        <p style="margin: 4px 0 0; color: #7c2d12; font-size: 13px;">
          Vencimento previsto: <strong>${dataVencimento || 'Nos próximos 7 dias'}</strong>
        </p>
      </div>

      <p style="color: #475569; font-size: 14px;">
        Proteja seu melhor amigo sem estresse: receba um veterinário credenciado em casa com a vacina refrigerada na temperatura ideal.
      </p>

      <div style="text-align: center; margin-top: 28px;">
        <a href="${solicitarVacinaUrl || 'https://saudepet.app.br/app/vacinas'}" class="btn-orange" target="_blank">
          Solicitar Aplicação de Vacina em Casa →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `Vacina ${nomeVacina} do ${nomePet} vence em breve — Saúde PET`,
    previewText: `Mantenha seu pet protegido. Agende a vacinação domiciliar sem estresse.`,
    content
  });
};

export = alertaVacinaTemplate;
