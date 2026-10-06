import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';
import { urlDoSite } from '../../../config/site';

const solicitacaoRecebidaTemplate = function ({
  nomeTutor,
  nomePet,
  especiePet,
  tipoServico,
  endereco,
  protocolo,
  trackingUrl
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-amber">⏳ Solicitação # ${protocolo || '1234'}</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Recebemos seu pedido de atendimento!
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>${nomeTutor}</strong>! Sua solicitação de <strong>${tipoServico || 'Consulta Domiciliar'}</strong> para o pet <strong>${nomePet}</strong> foi registrada. Nossa plataforma já está conectando o veterinário parceiro mais próximo.
      </p>

      <div class="card-info" style="border-left: 4px solid #f59e0b;">
        <h3 style="margin: 0 0 12px; color: #78350f; font-size: 15px;">Resumo do Chamado</h3>
        <table style="width: 100%; font-size: 14px; color: #475569; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; font-weight: 600; width: 40%;">Pet:</td>
            <td style="padding: 6px 0;">${nomePet} (${especiePet || 'Pet'})</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600;">Tipo de Atendimento:</td>
            <td style="padding: 6px 0;">${tipoServico || 'Consulta Presencial Domiciliar'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600;">Endereço:</td>
            <td style="padding: 6px 0;">${endereco || 'Endereço cadastrado'}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="${trackingUrl || urlDoSite('/tutor/historico')}" class="btn-orange" target="_blank">
          Acompanhar Status em Tempo Real →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `Solicitação #${protocolo || '1234'} recebida — Saúde PET`,
    previewText: `Buscando o veterinário mais próximo para atender o ${nomePet}`,
    content
  });
};

export = solicitacaoRecebidaTemplate;
