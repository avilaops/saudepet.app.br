import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';

const alertaNpsRuimAdminTemplate = function ({
  protocolo,
  nota = 1,
  comentario,
  nomeTutor,
  nomeVet,
  adminUrl = 'https://saudepet.app.br/admin/nps'
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-orange">⚠️ Alerta de Qualidade (NPS)</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Avaliação de ${nota} estrela(s) recebida
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        O tutor <strong>${nomeTutor}</strong> atribuiu nota <strong>${nota}/5</strong> para o atendimento <strong>#${protocolo}</strong> realizado pelo(a) <strong>Dra(o). ${nomeVet}</strong>.
      </p>

      <div class="card-info" style="border-left: 4px solid #f97316; background-color: #fff7ed;">
        <p style="margin: 0 0 4px; color: #9a3412; font-weight: 700; font-size: 14px;">
          💬 Comentário do Tutor:
        </p>
        <p style="margin: 0; color: #7c2d12; font-size: 14px; font-style: italic;">
          "${comentario || 'Sem comentário por escrito.'}"
        </p>
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="${adminUrl}" class="btn-orange" target="_blank">
          Abrir Auditoria de Atendimento →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `⚠️ [QUALIDADE] Avaliação ${nota} estrelas no Atendimento #${protocolo}`,
    previewText: `Feedback do tutor ${nomeTutor} referente à consulta com ${nomeVet}`,
    content
  });
};

export = alertaNpsRuimAdminTemplate;
