import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';

/**
 * E-mails de agendamento para o TUTOR, num template só.
 *
 * Os quatro eventos que chegam ao tutor (consulta marcada, remarcada, cancelada
 * e o lembrete de véspera) compartilham o mesmo corpo — o que muda é título,
 * selo e a frase de contexto. Um template por evento seria quatro arquivos
 * quase idênticos que envelheceriam separados.
 */

const EVENTOS = {
  marcado: {
    badge: '📅 Consulta Marcada',
    titulo: (nomePet: string) => `Consulta marcada para ${nomePet}!`,
    frase: (nomeVet: string) => `O(a) <strong>${nomeVet}</strong> marcou uma consulta na agenda. Se a data não funcionar para você, é só cancelar pelo aplicativo e combinar outro horário.`
  },
  remarcado: {
    badge: '🔁 Consulta Remarcada',
    titulo: (nomePet: string) => `A consulta de ${nomePet} mudou de horário`,
    frase: (nomeVet: string) => `O(a) <strong>${nomeVet}</strong> remarcou a consulta para um novo horário. Confira se a nova data funciona para você.`
  },
  cancelado: {
    badge: '❌ Consulta Cancelada',
    titulo: (nomePet: string) => `A consulta de ${nomePet} foi cancelada`,
    frase: (nomeVet: string) => `A consulta com o(a) <strong>${nomeVet}</strong> foi cancelada. Se ainda precisar do atendimento, você pode solicitar um novo horário pelo aplicativo.`
  },
  lembrete: {
    badge: '⏰ Lembrete de Consulta',
    titulo: (nomePet: string) => `A consulta de ${nomePet} é amanhã!`,
    frase: (nomeVet: string) => `Passando para lembrar da consulta com o(a) <strong>${nomeVet}</strong>. Deixe seu pet preparado no horário combinado.`
  }
};

const agendamentoConsultaTutorTemplate = function ({
  evento,
  nomeTutor,
  nomePet,
  nomeVet,
  dataHora,
  tipoConsulta,
  motivo
}: DadosDoEmail) {
  // `evento` chega como texto livre de quem envia; o `||` abaixo já é
  // o caminho de quando não casa com nenhum evento conhecido.
  const config = EVENTOS[String(evento) as keyof typeof EVENTOS] || EVENTOS.marcado;

  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-teal">${config.badge}</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          ${config.titulo(String(nomePet))}
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>${nomeTutor}</strong>! ${config.frase(String(nomeVet))}
      </p>

      <div class="card-info" style="border-left: 4px solid #0d9488;">
        <p style="margin: 0; color: #0f766e; font-weight: 700; font-size: 14px;">
          🗓️ ${evento === 'cancelado' ? 'Horário que estava marcado' : 'Data e horário'}:
        </p>
        <p style="margin: 4px 0 0; color: #334155; font-size: 14px;">
          <strong>${dataHora}</strong>${tipoConsulta ? ` · ${tipoConsulta}` : ''}
        </p>
        ${motivo ? `
        <p style="margin: 12px 0 0; color: #0f766e; font-weight: 700; font-size: 14px;">💬 Motivo:</p>
        <p style="margin: 4px 0 0; color: #334155; font-size: 14px;">${motivo}</p>
        ` : ''}
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="https://saudepet.app.br/tutor/agendamentos" class="btn-primary" target="_blank">
          Ver meus agendamentos →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `${config.badge.replace(/^\S+\s/, '')} — Saúde PET`,
    previewText: `${config.titulo(String(nomePet))} ${dataHora}`,
    content
  });
};

export = agendamentoConsultaTutorTemplate;
