import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';

const lembreteMedicamentoTemplate = function ({
  nomeTutor,
  nomePet,
  nomeMedicamento,
  posologia,
  recompraUrl
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-teal">💊 Lembrete de Medicamento</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Reposição do remédio do ${nomePet}
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>${nomeTutor}</strong>! Lembramos que o tratamento contínuo do(a) <strong>${nomePet}</strong> com <strong>${nomeMedicamento || 'o medicamento prescrito'}</strong> necessita de reposição em breve.
      </p>

      ${posologia ? `
      <div class="card-info" style="border-left: 4px solid #0d9488;">
        <p style="margin: 0; color: #0f766e; font-weight: 700; font-size: 14px;">
          📋 Posologia Recomendada:
        </p>
        <p style="margin: 4px 0 0; color: #334155; font-size: 13px;">
          ${posologia}
        </p>
      </div>` : ''}

      <div style="text-align: center; margin-top: 28px;">
        <a href="${recompraUrl || 'https://saudepet.app.br/app/medicamentos'}" class="btn-primary" target="_blank">
          Solicitar Nova Receita / Comprar Remedio →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `Lembrete de reposição de medicamento para ${nomePet} — Saúde PET`,
    previewText: `Mantenha o tratamento do seu pet em dia sem interrupções.`,
    content
  });
};

export = lembreteMedicamentoTemplate;
