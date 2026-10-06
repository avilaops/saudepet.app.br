import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';
import { urlDoSite } from '../../../config/site';

const novoVetPendenteAdminTemplate = function ({
  nomeVet,
  crmvVet,
  ufCrmv,
  emailVet,
  adminUrl = urlDoSite('/admin/veterinarios')
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-amber">🔔 Alerta Interno Admin</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Novo CRMV pendente de moderação
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Um novo médico veterinário realizou o cadastro na plataforma e enviou os documentos para verificação.
      </p>

      <div class="card-info" style="border-left: 4px solid #f59e0b;">
        <p style="margin: 0 0 6px; color: #334155; font-size: 14px;"><strong>Nome:</strong> Dra(o). ${nomeVet}</p>
        <p style="margin: 0 0 6px; color: #334155; font-size: 14px;"><strong>CRMV:</strong> ${crmvVet} / ${ufCrmv || 'SP'}</p>
        <p style="margin: 0; color: #334155; font-size: 14px;"><strong>E-mail:</strong> ${emailVet}</p>
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="${adminUrl}" class="btn-orange" target="_blank">
          Analisar Documentos no Painel Admin →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `[ADMIN] Novo CRMV para análise: ${nomeVet}`,
    previewText: `Analise a documentação do Dr(a). ${nomeVet} para aprovação no Saúde PET`,
    content
  });
};

export = novoVetPendenteAdminTemplate;
