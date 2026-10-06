import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';

/**
 * E-mails de agendamento para o VETERINÁRIO: o que o tutor fez com a consulta.
 * Mesmo racional do template do tutor — um arquivo, eventos como variação.
 */

const EVENTOS = {
  confirmado: {
    badge: '✅ Consulta Confirmada',
    titulo: (nomeTutor: string) => `${nomeTutor} confirmou a consulta`,
    frase: 'O tutor confirmou presença no horário marcado. A consulta está de pé.'
  },
  cancelado: {
    badge: '❌ Consulta Cancelada',
    titulo: (nomeTutor: string) => `${nomeTutor} cancelou a consulta`,
    frase: 'O tutor cancelou o agendamento e o horário voltou a ficar livre na sua agenda.'
  }
};

const agendamentoConsultaVetTemplate = function ({
  evento,
  nomeVet,
  nomeTutor,
  nomePet,
  dataHora,
  tipoConsulta,
  motivo
}: DadosDoEmail) {
  // `evento` chega como texto livre de quem envia; o `||` abaixo já é
  // o caminho de quando não casa com nenhum evento conhecido.
  const config = EVENTOS[String(evento) as keyof typeof EVENTOS] || EVENTOS.confirmado;

  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-teal">${config.badge}</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          ${config.titulo(String(nomeTutor))}
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>Dr(a). ${nomeVet}</strong>! ${config.frase}
      </p>

      <div class="card-info" style="border-left: 4px solid #0d9488;">
        <p style="margin: 0; color: #0f766e; font-weight: 700; font-size: 14px;">
          🗓️ Consulta:
        </p>
        <p style="margin: 4px 0 0; color: #334155; font-size: 14px;">
          <strong>${dataHora}</strong> · ${nomePet}${tipoConsulta ? ` · ${tipoConsulta}` : ''}
        </p>
        ${motivo ? `
        <p style="margin: 12px 0 0; color: #0f766e; font-weight: 700; font-size: 14px;">💬 Motivo do cancelamento:</p>
        <p style="margin: 4px 0 0; color: #334155; font-size: 14px;">${motivo}</p>
        ` : ''}
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="https://saudepet.app.br/veterinario/crm/agenda" class="btn-primary" target="_blank">
          Abrir minha agenda →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `${config.badge.replace(/^\S+\s/, '')} — Saúde PET`,
    previewText: `${config.titulo(String(nomeTutor))} — ${dataHora}`,
    content
  });
};

export = agendamentoConsultaVetTemplate;
