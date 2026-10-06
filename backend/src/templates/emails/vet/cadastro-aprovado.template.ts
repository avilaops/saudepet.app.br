import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';
import { urlDoSite } from '../../../config/site';

const cadastroAprovadoVetTemplate = function ({
  nomeVet,
  loginUrl = urlDoSite('/login')
}: DadosDoEmail) {
  const content = `
    <div style="text-align: center;">
      <span class="badge badge-teal">🎉 CRMV Aprovado</span>
      <h1 style="color: #0f172a; font-size: 26px; font-weight: 800; margin: 12px 0 16px;">
        Parabéns, Dra(o). ${nomeVet}!
      </h1>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
        Seu credenciamento profissional na plataforma <strong>Saúde PET</strong> foi **aprovado com sucesso**! Você já pode acessar o aplicativo, ficar online e começar a receber chamados de atendimento na sua região.
      </p>

      <div class="card-info" style="text-align: left; background-color: #f0fdf4; border-color: #bbf7d0;">
        <p style="margin: 0 0 12px; color: #166534; font-weight: 800; font-size: 15px;">
          💡 Como funciona a rotina de atendimento:
        </p>
        <ul style="margin: 0; padding-left: 20px; color: #15803d; font-size: 14px; line-height: 1.8;">
          <li>Fique <strong>Online</strong> no aplicativo quando estiver disponível.</li>
          <li>Receba alertas de chamados com distância, queixa e valor do repasse.</li>
          <li>Emita o prontuário e receita digital direto no app ao fim da consulta.</li>
        </ul>
      </div>

      <a href="${loginUrl}" class="btn-primary" target="_blank">
        Acessar Painel do Veterinário →
      </a>
    </div>
  `;

  return baseLayout({
    title: 'Seu cadastro profissional foi aprovado! — Saúde PET',
    previewText: 'Acesse o app e comece a atender tutores na sua região',
    content
  });
};

export = cadastroAprovadoVetTemplate;
