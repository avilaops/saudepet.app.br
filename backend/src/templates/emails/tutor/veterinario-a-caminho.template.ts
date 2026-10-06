import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';
import { urlDoSite } from '../../../config/site';

const veterinarioACaminhoTemplate = function ({
  nomeTutor,
  nomePet,
  nomeVet,
  crmvVet,
  especialidadeVet,
  tempoEstimado = '25 minutos',
  chatUrl
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-teal">🚗 Veterinário a Caminho</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Seu médico veterinário já está em trânsito!
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>${nomeTutor}</strong>! Ótimas notícias: <strong>${nomeVet}</strong> aceitou o atendimento do <strong>${nomePet}</strong> e já se deslocou.
      </p>

      <div class="card-info" style="border-left: 4px solid #0d9488; background-color: #f0fdfa;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div>
            <h3 style="margin: 0 0 4px; color: #0f766e; font-size: 16px;">${nomeVet}</h3>
            <p style="margin: 0; color: #115e59; font-size: 13px;">
              <strong>CRMV:</strong> ${crmvVet || 'Credenciado CFMV'} • ${especialidadeVet || 'Clínico Geral'}
            </p>
          </div>
        </div>
        <hr style="border: none; border-top: 1px dashed #99f6e4; margin: 16px 0;">
        <p style="margin: 0; color: #0f766e; font-weight: 700; font-size: 14px;">
          ⏱️ Chegada estimada em: <span style="color: #f97316;">${tempoEstimado}</span>
        </p>
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="${chatUrl || urlDoSite('/tutor/mensagens')}" class="btn-primary" target="_blank">
          Abrir Chat / Falar com o Vet →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `O veterinário está a caminho para atender ${nomePet} — Saúde PET`,
    previewText: `${nomeVet} aceitou o chamado. Chegada estimada em ${tempoEstimado}`,
    content
  });
};

export = veterinarioACaminhoTemplate;
