import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';
import { urlDoSite } from '../../../config/site';

const lembreteRetornoTemplate = function ({
  nomeTutor,
  nomePet,
  nomeVet,
  motivoRetorno = 'Acompanhamento pós-tratamento',
  agendarUrl
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-teal">🩺 Retorno Médico Sugerido</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Hora do retorno de acompanhamento do ${nomePet}!
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>${nomeTutor}</strong>! Na última consulta do(a) <strong>${nomePet}</strong>, o(a) <strong>${nomeVet}</strong> recomendou uma revisão de saúde para este período.
      </p>

      <div class="card-info" style="border-left: 4px solid #0d9488;">
        <p style="margin: 0; color: #0f766e; font-weight: 700; font-size: 14px;">
          🎯 Motivo do Retorno:
        </p>
        <p style="margin: 4px 0 0; color: #334155; font-size: 14px;">
          ${motivoRetorno}
        </p>
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="${agendarUrl || urlDoSite('/tutor/marcar-consulta')}" class="btn-primary" target="_blank">
          Agendar Consulta de Retorno Domiciliar →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `Lembrete de retorno para ${nomePet} — Saúde PET`,
    previewText: `Hora da consulta de retorno recomendada pelo veterinário`,
    content
  });
};

export = lembreteRetornoTemplate;
