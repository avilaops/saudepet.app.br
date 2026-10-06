import baseLayout from '../layout.email';
import type { DadosDoEmail } from '../tipos';

const cadastroAjusteVetTemplate = function ({
  nomeVet,
  motivo,
  reenvioUrl = 'https://saudepet.app.br/app/vet/documentos'
}: DadosDoEmail) {
  const content = `
    <div>
      <div style="text-align: center;">
        <span class="badge badge-orange">⚠️ Ajuste Pendente</span>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 12px 0 16px;">
          Precisamos de uma correção no seu cadastro
        </h1>
      </div>

      <p style="color: #475569; font-size: 16px; line-height: 1.6;">
        Olá, <strong>Dra(o). ${nomeVet}</strong>. Ao analisar sua documentação cadastral, nossa equipe de conformidade identificou uma pendência que precisa ser corrigida antes de liberarmos seu acesso.
      </p>

      <div class="card-info" style="border-left: 4px solid #f97316; background-color: #fff7ed;">
        <p style="margin: 0; color: #9a3412; font-weight: 700; font-size: 14px;">
          📌 Pendência Identificada:
        </p>
        <p style="margin: 6px 0 0; color: #7c2d12; font-size: 14px; line-height: 1.5;">
          ${motivo || 'Foto do documento de CRMV ilegível ou vencida.'}
        </p>
      </div>

      <div style="text-align: center; margin-top: 28px;">
        <a href="${reenvioUrl}" class="btn-orange" target="_blank">
          Reenviar Documento Corrigido →
        </a>
      </div>
    </div>
  `;

  return baseLayout({
    title: 'Ajuste necessário no seu cadastro — Saúde PET',
    previewText: 'Por favor, corrija a pendência indicada para liberar seu acesso',
    content
  });
};

export = cadastroAjusteVetTemplate;
