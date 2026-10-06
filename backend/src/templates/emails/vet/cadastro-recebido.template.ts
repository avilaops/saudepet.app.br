import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';

const cadastroRecebidoVetTemplate = function ({
  nomeVet,
  crmvVet,
  ufCrmv
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-amber">⏳ Cadastro em Análise</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Seu cadastro profissional foi recebido!
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>Dra(o). ${nomeVet}</strong>! Obrigado por cadastrar-se no <strong>Saúde PET</strong> como médico(a) veterinário(a) parceiro(a).
      </p>

      <div class="card-info" style="border-left: 4px solid #f59e0b; background-color: #fffbeb;">
        <h3 style="margin: 0 0 8px; color: #92400e; font-size: 15px;">Dados Enviados para Validação:</h3>
        <p style="margin: 0; color: #78350f; font-size: 14px;">
          <strong>CRMV:</strong> ${crmvVet || 'Enviado'} / ${ufCrmv || 'SP'}<br>
          <strong>Status:</strong> Em análise pela equipe de conformidade técnica.
        </p>
      </div>

      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        Nossa equipe verifica ativamente a regularidade junto ao CFMV/CRMV para garantir a máxima segurança dos tutores. Este processo costuma levar **até 24 horas úteis**. Assim que aprovado, você receberá um e-mail de ativação.
      </p>
    </div>
  `;

  return baseLayout({
    title: 'Cadastro recebido em análise — Saúde PET',
    previewText: 'Recebemos seus dados cadastrais e CRMV para validação',
    content
  });
};

export = cadastroRecebidoVetTemplate;
