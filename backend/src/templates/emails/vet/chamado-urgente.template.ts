import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';

const chamadoUrgenteVetTemplate = function ({
  nomeVet,
  bairroCidade,
  especiePet,
  queixa,
  valorRepasse,
  aceitarUrl
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-orange">🚨 Atendimento Disponível</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Novo chamado em ${bairroCidade || 'sua região'}!
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>Dra(o). ${nomeVet}</strong>! Há um novo chamado aguardando atendimento próximo de você.
      </p>

      <div class="card-info" style="border-left: 4px solid #f97316;">
        <table style="width: 100%; font-size: 14px; color: #475569; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; font-weight: 600; width: 40%;">Região:</td>
            <td style="padding: 6px 0;">${bairroCidade || 'São Paulo'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600;">Espécie:</td>
            <td style="padding: 6px 0;">${especiePet || 'Cão / Gato'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600;">Queixa Principal:</td>
            <td style="padding: 6px 0;">${queixa || 'Consulta presencial'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600; color: #166534;">Repasse Estimado:</td>
            <td style="padding: 6px 0; font-weight: 800; color: #166534; font-size: 16px;">R$ ${valorRepasse || '180,00'}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="${aceitarUrl || 'https://saudepet.app.br/app/vet/chamados'}" class="btn-orange" target="_blank">
          Visualizar e Aceitar Chamado no App →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `🚨 Chamado disponível em ${bairroCidade || 'sua região'} — Saúde PET`,
    previewText: `Aceite o atendimento para ${especiePet || 'pet'} com repasse de R$ ${valorRepasse || '180,00'}`,
    content
  });
};

export = chamadoUrgenteVetTemplate;
