import type { StatusAtendimento } from '@prisma/client';
import prisma from '../config/database';

/**
 * Direitos do titular sobre os próprios dados (LGPD, art. 18).
 *
 * A Política de Privacidade do produto promete acesso, portabilidade e
 * exclusão — e não existia NENHUM endpoint nem tela para nada disso. Na
 * prática, quem pedisse pelo `sac@` dependia de alguém abrir o banco à mão.
 *
 * Duas operações moram aqui:
 *
 * 1. **Exportar** — reúne tudo o que o produto guarda sobre a pessoa num único
 *    pacote legível, sem exigir que ela saiba o que é uma "solicitação" ou um
 *    "prontuário".
 *
 * 2. **Encerrar a conta** — e aqui está a parte que exige cuidado: prontuário
 *    veterinário NÃO pode ser apagado. É documento clínico do animal, com
 *    retenção obrigatória, e apagar o histórico de vacina e alergia de um pet
 *    pode custar a vida dele num atendimento futuro. Também não se apaga
 *    registro fiscal de pagamento. Então encerrar a conta ANONIMIZA os dados
 *    pessoais do tutor e preserva o registro clínico do animal — que é o
 *    equilíbrio que a própria LGPD prevê entre o art. 18 e as obrigações
 *    legais de guarda (art. 16, I).
 */

/**
 * Campos que identificam a pessoa. O que não estiver aqui é dado do animal ou
 * do atendimento, e continua existindo depois do encerramento.
 *
 * O e-mail vira `removido+<id>@saudepet.invalido` em vez de `null` porque a
 * coluna é única e serve de chave de login: dois encerramentos com `null`
 * colidiriam, e um domínio reservado garante que ninguém consegue receber
 * mensagem nem recuperar a conta por ali.
 */
const ANONIMO = (id: string) => ({
  nome: 'Usuário removido',
  email: `removido+${id}@saudepet.invalido`,
  telefone: null,
  cpf: null,
  cep: null,
  endereco: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  estado: null,
  avatar: null,
  foto_perfil: null,
  foto_capa: null,
  sobre: null,
  senha: null,
  senha_hash: null,
  ativo: false,
  preferencias: null
});

/** O que o titular recebe ao pedir portabilidade. */
export type PacoteDeDados = {
  gerado_em: string;
  aviso: string;
  conta: Record<string, unknown>;
  pets: unknown[];
  atendimentos: unknown[];
  mensagens: unknown[];
  avaliacoes: unknown[];
  lembretes: unknown[];
  pagamentos: unknown[];
  assinaturas: unknown[];
};

/**
 * Pacote de portabilidade: tudo o que o produto sabe sobre a pessoa.
 */
export async function exportarDados(usuarioId: string, tenantId: string): Promise<PacoteDeDados | null> {
  const usuario = await prisma.usuario.findFirst({
    where: { id: usuarioId, tenant_id: tenantId },
    select: {
      id: true, nome: true, email: true, telefone: true, cpf: true,
      cep: true, endereco: true, numero: true, complemento: true, bairro: true,
      cidade: true, estado: true, sobre: true, tipo_usuario: true,
      email_verificado: true, criado_em: true, data_ultimo_acesso: true
    }
  });

  if (!usuario) return null;

  const [pets, atendimentos, mensagens, avaliacoes, lembretes, pagamentos, assinaturas] = await Promise.all([
    prisma.pet.findMany({
      where: { tutor_id: usuarioId, tenant_id: tenantId },
      include: {
        vacinas: true,
        alergias: true,
        medicamentos: true
      }
    }),
    prisma.solicitacao.findMany({
      where: { tutor_id: usuarioId, tenant_id: tenantId },
      include: {
        pet: { select: { nome: true } },
        prontuario: true,
        timeline: true
      },
      orderBy: { criado_em: 'desc' }
    }),
    prisma.mensagem.findMany({
      where: {
        tenant_id: tenantId,
        OR: [{ remetente_id: usuarioId }, { destinatario_id: usuarioId }]
      },
      select: { id: true, conteudo: true, criado_em: true, remetente_id: true, atendimento_id: true },
      orderBy: { criado_em: 'asc' }
    }),
    // As duas direções: o titular tem direito ao que escreveu e ao que
    // escreveram sobre ele. `autor_papel` diz qual é qual.
    prisma.avaliacao.findMany({
      where: { tutor_id: usuarioId, tenant_id: tenantId },
      select: { id: true, nota: true, comentario: true, criado_em: true, atendimento_id: true, autor_papel: true }
    }),
    prisma.lembretePet.findMany({
      where: { tenant_id: tenantId, pet: { tutor_id: usuarioId } }
    }),
    prisma.payment.findMany({
      where: { tutor_id: usuarioId, tenant_id: tenantId },
      select: { id: true, amount: true, method: true, status: true, paid_at: true, criado_em: true, atendimento_id: true }
    }),
    prisma.assinaturaUsuario.findMany({
      where: { usuario_id: usuarioId, tenant_id: tenantId },
      include: { plano: { select: { nome: true } } }
    })
  ]);

  return {
    gerado_em: new Date().toISOString(),
    aviso: 'Este arquivo reúne os dados pessoais que o Saúde PET guarda sobre você, conforme o art. 18 da LGPD.',
    conta: usuario,
    pets,
    atendimentos,
    mensagens,
    avaliacoes,
    lembretes,
    // `Decimal` do Prisma não serializa como número em JSON — vira objeto.
    // Quem baixa o arquivo espera ver o valor, não `{s:1,e:2,d:[...]}`.
    pagamentos: pagamentos.map((item: any) => ({ ...item, amount: Number(item.amount) })),
    assinaturas: assinaturas.map((item: any) => ({ ...item, valor_mensal: Number(item.valor_mensal) }))
  };
}

/**
 * O que impede o encerramento agora. Encerrar no meio de um atendimento
 * deixaria o veterinário a caminho de um endereço que acabou de sumir.
 */
export async function impedimentosParaEncerrar(usuarioId: string, tenantId: string): Promise<string[]> {
  const EM_CURSO: StatusAtendimento[] = [
    'criado', 'procurando_veterinario', 'oferta_enviada', 'veterinario_encontrado',
    'aceito', 'a_caminho', 'chegou', 'atendimento_em_andamento'
  ];

  const [atendimentoAtivo, cobrancaAberta] = await Promise.all([
    prisma.solicitacao.findFirst({
      where: { tutor_id: usuarioId, tenant_id: tenantId, status: { in: EM_CURSO } },
      select: { id: true }
    }),
    prisma.payment.findFirst({
      where: {
        tutor_id: usuarioId,
        tenant_id: tenantId,
        status: { in: ['CREATED', 'PENDING', 'PROCESSING', 'AUTHORIZED'] }
      },
      select: { id: true }
    })
  ]);

  const impedimentos: string[] = [];
  if (atendimentoAtivo) {
    impedimentos.push('Você tem um atendimento em andamento. Conclua ou cancele antes de encerrar a conta.');
  }
  if (cobrancaAberta) {
    impedimentos.push('Existe uma cobrança em aberto. Pague ou peça o cancelamento antes de encerrar a conta.');
  }

  return impedimentos;
}

/**
 * Encerra a conta anonimizando os dados pessoais.
 *
 * O que É apagado: nome, e-mail, telefone, CPF, endereço, fotos, senha.
 * O que PERMANECE: prontuário, vacina, alergia e medicação do pet (documento
 * clínico com guarda obrigatória) e o registro dos pagamentos (obrigação
 * fiscal). O pet deixa de ter dono identificável.
 */
export async function encerrarConta(
  { usuarioId, tenantId, motivo }: { usuarioId: string; tenantId: string; motivo?: string | null }
) {
  const agora = new Date();

  return prisma.$transaction(async (tx: any) => {
    const usuario = await tx.usuario.update({
      where: { id: usuarioId },
      data: {
        ...ANONIMO(usuarioId),
        // Derruba toda sessão aberta: a conta encerrada não pode continuar
        // navegando com o token que já tinha.
        sessoes_revogadas_em: agora
      },
      select: { id: true, tenant_id: true }
    });

    // Push é dado de dispositivo, não faz sentido guardar.
    await tx.pushSubscription.deleteMany({ where: { usuario_id: usuarioId } });

    await tx.auditLog.create({
      data: {
        usuario_id: usuarioId,
        tenant_id: tenantId,
        // O modelo tem `acao`; não existe coluna `action`.
        acao: 'lgpd.conta_encerrada',
        entity_type: 'usuario',
        entity_id: usuarioId,
        recurso: 'usuario',
        recurso_id: usuarioId,
        detalhes: JSON.stringify({
          motivo: motivo || null,
          anonimizado_em: agora.toISOString(),
          preservado: 'prontuário, vacinas, alergias e pagamentos (guarda obrigatória)'
        })
      }
    });

    return usuario;
  });
}

export { ANONIMO };

module.exports = { exportarDados, impedimentosParaEncerrar, encerrarConta, ANONIMO };
