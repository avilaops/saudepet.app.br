import type { Prisma } from '@prisma/client';
import prisma from '../config/database';

/**
 * Planos de assinatura da plataforma.
 *
 * O seed é UPSERT por (tenant, nome): rodar de novo atualiza descrição, preço e
 * benefícios do plano existente em vez de pular. Sem isso, o corte comercial do
 * CRM (as chaves `crm_*` que o `plano-vet.middleware` lê de `beneficios`) nunca
 * chegaria a um banco que já tivesse os planos antigos gravados.
 *
 * `beneficios` mistura dois tipos de entrada de propósito:
 *   - chaves de recurso (`crm_*`) — o que o middleware consulta para liberar
 *     rota; o frontend as traduz para rótulo humano;
 *   - frases de marketing — só exibição.
 * Assim o corte comercial continua morando no banco, sem deploy para mudar.
 */

const CRM = {
  NOTAS: 'crm_notas_privadas',
  RETENCAO: 'crm_retencao',
  RELATORIOS: 'crm_relatorios'
} as const;

/**
 * Cada plano com os campos escalares que o `create` recebe. É o formato
 * "unchecked" porque o seed grava `tenant_id` direto, sem `connect`.
 */
type PlanoSeed = Prisma.PlanoAssinaturaUncheckedCreateInput & {
  nome: string;
  descricao: string;
  valor_mensal: number;
  limite_atendimentos: number | null;
  beneficios: string;
  ativo: boolean;
};

function planosDoTenant(tenantId: string): PlanoSeed[] {
  return [
    {
      tenant_id: tenantId,
      nome: 'Saúde PET Básico',
      descricao:
        'Ideal para tutores com 1 pet. Inclui carteira digital, 10% OFF em consultas e lembretes automáticos.',
      tipo_usuario: 'tutor',
      valor_mensal: 29.9,
      limite_atendimentos: 2,
      beneficios: JSON.stringify([
        'Carteira Digital & Coleira Inteligente com QR Code',
        '10% de desconto em todas as consultas presenciais',
        'Histórico unificado de vacinas e vermífugos',
        'Lembretes automáticos por e-mail/SMS'
      ]),
      ativo: true
    },
    {
      tenant_id: tenantId,
      nome: 'Saúde PET VIP (Família Multipet)',
      descricao:
        'Para quem ama e protege todos os pets da casa. Consultas ilimitadas com desconto e teleorientação 24h.',
      tipo_usuario: 'tutor',
      valor_mensal: 69.9,
      limite_atendimentos: null,
      beneficios: JSON.stringify([
        'Tudo do Plano Básico para até 4 pets',
        '20% de desconto em todas as consultas presenciais',
        'Teleorientação Veterinária Ilimitada via Chat/Video',
        'Vacina anual preventiva inclusa sem custo adicional',
        'Atendimento prioritário na fila de emergência'
      ]),
      ativo: true
    },
    {
      tenant_id: tenantId,
      nome: 'Clube Vet Essencial',
      descricao:
        'O primeiro passo do CRM: anote sobre a sua clientela e nunca mais dependa da memória.',
      tipo_usuario: 'veterinario',
      valor_mensal: 49.9,
      limite_atendimentos: null,
      beneficios: JSON.stringify([
        CRM.NOTAS,
        'Clientela e agenda de consultas (também no gratuito)',
        'Suporte prioritário no chat da plataforma'
      ]),
      ativo: true
    },
    {
      tenant_id: tenantId,
      nome: 'Clube Vet Completo',
      descricao:
        'CRM inteiro: notas, campanhas de retorno para clientes sumidos e relatório real de faturamento.',
      tipo_usuario: 'veterinario',
      valor_mensal: 99.9,
      limite_atendimentos: null,
      beneficios: JSON.stringify([
        CRM.NOTAS,
        CRM.RETENCAO,
        CRM.RELATORIOS,
        'Clientela e agenda de consultas (também no gratuito)',
        'Suporte prioritário no chat da plataforma'
      ]),
      ativo: true
    },
    {
      tenant_id: tenantId,
      nome: 'Veterinário Pro (Parceiro Credenciado)',
      descricao:
        'Para veterinários autônomos que desejam receber chamados em tempo real na sua região — com o CRM completo incluso.',
      tipo_usuario: 'veterinario',
      valor_mensal: 149.9,
      limite_atendimentos: null,
      beneficios: JSON.stringify([
        CRM.NOTAS,
        CRM.RETENCAO,
        CRM.RELATORIOS,
        'Recebimento de solicitações de emergência e agendamento em tempo real',
        'Menor taxa de intermediação da plataforma (apenas 5%)',
        'Acesso ao prontuário eletrônico completo e prescrição digital em PDF',
        'Perfil verificado com selo oficial de autoridade Saúde PET'
      ]),
      ativo: true
    }
  ];
}

async function seedPlanos(): Promise<void> {
  const slug = process.env.PUBLIC_TENANT_SLUG || 'saudepet';
  console.log(`🌱 Sincronizando planos de assinatura do tenant "${slug}"...`);

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error(`❌ Tenant "${slug}" não encontrado.`);
    process.exit(1);
  }

  for (const planoData of planosDoTenant(tenant.id)) {
    const existente = await prisma.planoAssinatura.findFirst({
      where: { tenant_id: tenant.id, nome: planoData.nome }
    });

    if (!existente) {
      await prisma.planoAssinatura.create({ data: planoData });
      console.log(`✅ Plano criado: ${planoData.nome} (R$ ${planoData.valor_mensal}/mês)`);
    } else {
      await prisma.planoAssinatura.update({
        where: { id: existente.id },
        data: {
          descricao: planoData.descricao,
          valor_mensal: planoData.valor_mensal,
          limite_atendimentos: planoData.limite_atendimentos,
          beneficios: planoData.beneficios,
          ativo: planoData.ativo
        }
      });
      console.log(`🔄 Plano atualizado: ${planoData.nome} (R$ ${planoData.valor_mensal}/mês)`);
    }
  }

  console.log('🎉 Planos de assinatura sincronizados.');
  process.exit(0);
}

seedPlanos().catch((err: unknown) => {
  console.error('❌ Erro no seed de planos:', err);
  process.exit(1);
});
