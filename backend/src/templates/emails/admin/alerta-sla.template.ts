import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';
import { urlDoSite } from '../../../config/site';

const alertaSlaAdminTemplate = function ({
  protocolo,
  bairroCidade,
  tempoDecorrido = '12 minutos',
  adminUrl = urlDoSite('/admin/operacoes')
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-orange">🚨 SLA Crítico de Emergência</span>
        <h1 style="color: #9f1239; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Chamado #${protocolo} sem aceite!
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Atenção equipe operacional: o chamado de emergência <strong>#${protocolo}</strong> em <strong>${bairroCidade}</strong> está há <strong>${tempoDecorrido}</strong> sem aceite automático por nenhum veterinário parceiro.
      </p>

      <div class="card-info" style="border-left: 4px solid #ef4444; background-color: #fff1f2;">
        <p style="margin: 0; color: #9f1239; font-weight: 700; font-size: 14px;">
          ⚠️ Ação Manual Requerida:
        </p>
        <p style="margin: 4px 0 0; color: #881337; font-size: 13px;">
          Acesse a central de operações para direcionar manualmente o veterinário plantonista mais próximo ou contatar o tutor.
        </p>
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="${adminUrl}" class="btn-orange" target="_blank" style="background-color: #dc2626;">
          Intervir no Chamado Agora →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: `🚨 [SLA URGENTE] Chamado #${protocolo} sem aceite há ${tempoDecorrido}`,
    previewText: `Intervenção operacional necessária para atendimento em ${bairroCidade}`,
    content
  });
};

export = alertaSlaAdminTemplate;
