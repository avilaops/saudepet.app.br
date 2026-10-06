import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';
import { urlDoSite } from '../../../config/site';

const prontuarioPrescricaoTemplate = function ({
  nomeTutor,
  nomePet,
  nomeVet,
  diagnostico,
  pdfUrl,
  comprarRemediosUrl
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-teal">📄 Prontuário & Receita Digital</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Resumo do atendimento do ${nomePet}
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>${nomeTutor}</strong>! O atendimento presencial do(a) <strong>${nomePet}</strong> realizado pelo(a) <strong>${nomeVet}</strong> foi finalizado. Os documentos clínicos oficiais já estão disponíveis na sua conta.
      </p>

      ${diagnostico ? `
      <div class="card-info" style="border-left: 4px solid #0d9488;">
        <h3 style="margin: 0 0 8px; color: #0f766e; font-size: 15px;">Diagnóstico / Parecer Médico:</h3>
        <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6;">
          ${diagnostico}
        </p>
      </div>` : ''}

      <div style="text-align: center; margin: 32px 0 20px;">
        <a href="${pdfUrl || urlDoSite('/tutor/historico')}" class="btn-primary" target="_blank" style="margin-right: 8px;">
          📥 Baixar Prontuário & Receita em PDF
        </a>
      </div>

      ${comprarRemediosUrl ? `
      <div style="text-align: center;">
        <a href="${comprarRemediosUrl}" class="btn-orange" target="_blank">
          🛒 Comprar Medicamentos Prescritos
        </a>
      </div>` : ''}
    </div>
  `;

  return baseLayout({
    title: `Prontuário e Receita Digital de ${nomePet} — Saúde PET`,
    previewText: `Baixe o PDF da receita e receba orientações da consulta do ${nomePet}`,
    content
  });
};

export = prontuarioPrescricaoTemplate;
