import type { StatusAtendimento } from '@prisma/client';
import prisma from '../config/database';

/**
 * Estados de cobrança que JÁ consumiram o benefício.
 *
 * Inclui pendente e em processamento de propósito: quem gerou um Pix com
 * desconto e ainda não pagou já usou a vaga do mês. Contar só o que foi pago
 * deixaria alguém gerar cinco cobranças com desconto e pagar todas depois.
 */
const COBRANCA_QUE_CONSOME = ['PAID', 'CREATED', 'PENDING', 'PROCESSING', 'AUTHORIZED'];

/**
 * Benefício do plano de assinatura no preço do atendimento.
 *
 * `limite_atendimentos` estava gravado e nunca era aplicado, e sozinho era
 * ambíguo. A economia dos planos cadastrados desfaz a dúvida:
 *
 *   "Saúde PET Básico" — R$ 29,90/mês, benefício anunciado "10% de desconto em
 *   todas as consultas", `limite_atendimentos = 2`. A consulta domiciliar custa
 *   R$ 150; 10% são R$ 15; dois por mês são R$ 30 — praticamente a mensalidade.
 *
 * Ou seja, o número diz **quantos atendimentos por mês recebem o desconto**.
 * Não é teto de atendimento — bloquear alguém de chamar veterinário para um pet
 * doente seria inaceitável num produto de saúde animal — nem franquia de
 * consulta grátis, que nenhum plano promete no próprio texto.
 *
 * Quem banca o desconto é a plataforma, saindo da comissão dela. O veterinário
 * recebe exatamente o que receberia sem plano nenhum: ele não vendeu a
 * assinatura e não tem por que pagar por ela.
 */

/** Início do mês corrente, que é a janela do benefício. */
export function inicioDoMes(referencia = new Date()): Date {
  return new Date(referencia.getFullYear(), referencia.getMonth(), 1);
}

/**
 * Quanto o tutor paga neste atendimento, considerando o plano dele.
 *
 * Devolve sempre o mesmo formato, com ou sem plano — assim quem chama não
 * precisa saber se existe assinatura.
 */
/**
 * Benefícios que não são desconto percentual.
 *
 * O plano VIP promete "Teleorientação Veterinária Ilimitada" e "Vacina anual
 * preventiva inclusa". Isso não cabe na mecânica de desconto: a comissão da
 * plataforma sobre uma teleorientação de R$ 80 é de R$ 16, e ilimitado custa
 * mais do que isso arrecada. O plano está aprovado com esse texto, então o
 * benefício é real e o custo é assumido pela operação — o que não pode é a
 * vitrine prometer e o sistema não entregar.
 *
 * Lidos de `PlanoAssinatura.beneficios`, que é JSON: mudar o corte comercial
 * continua sendo pelo banco, sem deploy.
 */
function beneficiosEspeciais(plano?: { beneficios?: string | null } | null) {
  try {
    const lista = JSON.parse(plano?.beneficios || '[]');
    const texto = (Array.isArray(lista) ? lista : []).join(' | ').toLowerCase();
    return {
      teleorientacao_ilimitada: texto.includes('teleorienta') && texto.includes('ilimitad'),
      vacina_anual_inclusa: texto.includes('vacina') && (texto.includes('inclus') || texto.includes('sem custo'))
    };
  } catch {
    // Benefício mal escrito no banco não pode derrubar a cobrança: sem
    // benefício especial, o desconto percentual continua valendo.
    return { teleorientacao_ilimitada: false, vacina_anual_inclusa: false };
  }
}

/**
 * Quantas vezes o tutor já usou um benefício anual, contando a partir de hoje.
 *
 * ISTO ESTAVA QUEBRADO ATÉ 26/08/2026, e de um jeito caro. A consulta filtrava
 * por `atendimento: { tipo_atendimento: tipo }` — mas `Payment` NÃO tem relação
 * chamada `atendimento`, só a coluna `atendimento_id`. O Prisma recusava o
 * `where` inteiro, o `.catch(() => 0)` engolia o erro, e a função devolvia
 * SEMPRE zero.
 *
 * Consequência: `if (jaUsou === 0)` dava verdadeiro toda vez, e a "vacina anual
 * inclusa" do plano VIP virava vacina ILIMITADA inclusa — com a plataforma
 * bancando cada uma, saindo da comissão. O compilador achou na primeira
 * passagem; o teste não achava porque nunca existiu teste para este caminho.
 *
 * Agora são dois passos, porque sem relação não dá para aninhar: primeiro os
 * atendimentos do tipo, depois as cobranças que usaram o benefício em algum
 * deles.
 */
async function usosNoAno(
  { tenantId, tutorId, assinaturaId, tipo }:
    { tenantId: string; tutorId: string; assinaturaId: string; tipo: string }
): Promise<number> {
  const umAnoAtras = new Date();
  umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);

  try {
    const atendimentos = await prisma.solicitacao.findMany({
      where: {
        tenant_id: tenantId,
        tutor_id: tutorId,
        tipo_atendimento: tipo as any,
        criado_em: { gte: umAnoAtras }
      },
      select: { id: true }
    });

    if (atendimentos.length === 0) return 0;

    return await prisma.payment.count({
      where: {
        tenant_id: tenantId,
        tutor_id: tutorId,
        desconto_assinatura_id: assinaturaId,
        status: { in: COBRANCA_QUE_CONSOME as any },
        criado_em: { gte: umAnoAtras },
        atendimento_id: { in: atendimentos.map((a: { id: string }) => a.id) }
      }
    });
  } catch (erro) {
    // Na dúvida, NÃO dar o benefício de graça: falhar a contagem e devolver 0
    // era exatamente o bug acima. Devolver 1 faz o caminho cair no desconto
    // percentual normal, que é o pior caso aceitável — o tutor paga com
    // desconto em vez de não pagar.
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('⚠️  [BENEFÍCIO] Contagem anual falhou, tratando como já usado:', mensagem);
    return 1;
  }
}

export type Beneficio = {
  preco_cheio: number;
  desconto_valor: number;
  valor_a_pagar: number;
  plano: { nome: string; desconto_pct: number } | null;
  assinatura_id: string | null;
  usados_no_mes: number;
  limite_mensal: number | null;
  esgotado?: boolean;
  beneficio?: 'teleorientacao_ilimitada' | 'vacina_anual_inclusa';
};

export async function calcularBeneficio(
  { tenantId, tutorId, precoCheio, tipoAtendimento = null }:
    {
      tenantId: string;
      tutorId: string;
      precoCheio: number | string;
      tipoAtendimento?: StatusAtendimento | string | null;
    }
): Promise<Beneficio> {
  const cheio = Math.round(Number(precoCheio) * 100) / 100;
  const semBeneficio: Beneficio = {
    preco_cheio: cheio,
    desconto_valor: 0,
    valor_a_pagar: cheio,
    plano: null,
    assinatura_id: null,
    usados_no_mes: 0,
    limite_mensal: null
  };

  if (!Number.isFinite(cheio) || cheio <= 0) return semBeneficio;

  const assinatura = await prisma.assinaturaUsuario.findFirst({
    where: { tenant_id: tenantId, usuario_id: tutorId, status: 'ativa' },
    include: { plano: { select: { nome: true, desconto_pct: true, limite_atendimentos: true, beneficios: true } } },
    orderBy: { criado_em: 'desc' }
  });

  if (!assinatura) return semBeneficio;

  const especiais = beneficiosEspeciais(assinatura.plano);

  // Teleorientação ilimitada: o plano cobre inteira, sempre. Não consome o
  // limite mensal do desconto — é benefício à parte, e contar as duas coisas
  // juntas faria o VIP perder o desconto das consultas por ter conversado.
  if (especiais.teleorientacao_ilimitada && tipoAtendimento === 'teleorientacao') {
    return {
      ...semBeneficio,
      plano: { nome: assinatura.plano.nome, desconto_pct: 100 },
      assinatura_id: assinatura.id,
      desconto_valor: cheio,
      valor_a_pagar: 0,
      beneficio: 'teleorientacao_ilimitada'
    };
  }

  // Vacina anual inclusa: uma por ano, contada pelas cobranças de vacinação
  // que já usaram o benefício. A segunda do ano volta ao desconto normal.
  if (especiais.vacina_anual_inclusa && tipoAtendimento === 'vacinacao') {
    const jaUsou = await usosNoAno({
      tenantId, tutorId, assinaturaId: assinatura.id, tipo: 'vacinacao'
    });

    if (jaUsou === 0) {
      return {
        ...semBeneficio,
        plano: { nome: assinatura.plano.nome, desconto_pct: 100 },
        assinatura_id: assinatura.id,
        desconto_valor: cheio,
        valor_a_pagar: 0,
        beneficio: 'vacina_anual_inclusa'
      };
    }
  }

  const percentual = Number(assinatura?.plano?.desconto_pct || 0);
  if (percentual <= 0) return semBeneficio;

  const limite = assinatura.plano.limite_atendimentos;

  // Quantos atendimentos já usaram o benefício neste mês. Contamos pelas
  // cobranças que registraram desconto: é o único lugar onde o benefício
  // realmente aconteceu — atendimento sem cobrança não consumiu nada.
  const usados = await prisma.payment.count({
    where: {
      tenant_id: tenantId,
      tutor_id: tutorId,
      desconto_assinatura_id: assinatura.id,
      status: { in: COBRANCA_QUE_CONSOME as any },
      criado_em: { gte: inicioDoMes() }
    }
  });

  const base = {
    ...semBeneficio,
    plano: { nome: assinatura.plano.nome, desconto_pct: percentual },
    assinatura_id: assinatura.id,
    usados_no_mes: usados,
    limite_mensal: limite ?? null
  };

  // Benefício esgotado no mês: o atendimento continua disponível, só sem
  // desconto. É a diferença entre limitar o benefício e limitar o cuidado.
  if (limite != null && usados >= limite) {
    return { ...base, esgotado: true };
  }

  const desconto = Math.round(cheio * (percentual / 100) * 100) / 100;

  return {
    ...base,
    desconto_valor: desconto,
    valor_a_pagar: Math.round((cheio - desconto) * 100) / 100
  };
}

/** Resumo do benefício para as telas, sem precisar de um atendimento em curso. */
export async function resumoDoBeneficio(
  { tenantId, tutorId }: { tenantId: string; tutorId: string }
) {
  const assinatura = await prisma.assinaturaUsuario.findFirst({
    where: { tenant_id: tenantId, usuario_id: tutorId, status: 'ativa' },
    include: { plano: { select: { nome: true, desconto_pct: true, limite_atendimentos: true } } },
    orderBy: { criado_em: 'desc' }
  });

  if (!assinatura) return { plano: null };

  const usados = await prisma.payment.count({
    where: {
      tenant_id: tenantId,
      tutor_id: tutorId,
      desconto_assinatura_id: assinatura.id,
      status: { in: COBRANCA_QUE_CONSOME as any },
      criado_em: { gte: inicioDoMes() }
    }
  });

  const limite = assinatura.plano.limite_atendimentos;

  return {
    plano: {
      nome: assinatura.plano.nome,
      desconto_pct: Number(assinatura.plano.desconto_pct || 0),
      limite_mensal: limite ?? null,
      usados_no_mes: usados,
      restantes: limite == null ? null : Math.max(0, limite - usados)
    }
  };
}

module.exports = { calcularBeneficio, resumoDoBeneficio, inicioDoMes };
