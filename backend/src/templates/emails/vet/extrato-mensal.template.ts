import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';
import { urlDoSite } from '../../../config/site';

const extratoMensalVetTemplate = function ({
  nomeVet,
  mesAno = 'Janeiro/2026',
  qtdConsultas = 12,
  valorLiquido = '2.160,00',
  chavePix,
  extratoUrl
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-teal">💰 Extrato Financeiro</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Resumo de repasses de ${mesAno}
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>Dra(o). ${nomeVet}</strong>! Apresentamos o fechamento das suas atividades e repasses financeiros na plataforma <strong>Saúde PET</strong> relativos a <strong>${mesAno}</strong>.
      </p>

      <div class="card-info" style="border-left: 4px solid #0d9488; background-color: #f0fdfa;">
        <table style="width: 100%; font-size: 14px; color: #475569; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; font-weight: 600;">Consultas Realizadas:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #0f766e;">${qtdConsultas} atendimentos</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600;">Chave PIX Destino:</td>
            <td style="padding: 6px 0;">${chavePix || 'Cadastrada'}</td>
          </tr>
          <tr style="border-top: 1px dashed #99f6e4;">
            <td style="padding: 10px 0 0; font-weight: 800; color: #0f766e; font-size: 15px;">Total Líquido Repassado:</td>
            <td style="padding: 10px 0 0; font-weight: 800; color: #0f766e; font-size: 18px;">R$ ${valorLiquido}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="${extratoUrl || urlDoSite('/veterinario/repasses')}" class="btn-primary" target="_blank">
          Ver Extrato Detalhado no App →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `Extrato Financeiro de ${mesAno} — Saúde PET`,
    previewText: `Seu repasse de R$ ${valorLiquido} referente a ${qtdConsultas} atendimentos foi processado.`,
    content
  });
};

export = extratoMensalVetTemplate;
