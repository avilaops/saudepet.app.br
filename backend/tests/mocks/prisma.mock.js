const prisma = require('../../src/config/database');

// ═══════════════════════════════════════════════════════
// MOCKS COMPLETOS DO PRISMA
// ═══════════════════════════════════════════════════════

// Mock básico que pode ser customizado por teste
const createPrismaMock = () => ({
  // Tenants
  tenant: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },

  // Usuários
  usuario: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn()
  },

  // Pets
  pet: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },

  // Submissões de credenciamento (histórico das decisões do admin)
  veterinarioSubmissao: {
    findMany: jest.fn(),
    create: jest.fn()
  },

  // Veterinários
  veterinario: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },

  // Solicitações
  solicitacao: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn()
  },

  // Linha do tempo do atendimento
  solicitacaoTimeline: {
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn()
  },

  // Cartão guardado pelo tutor — referência do gateway, nunca o cartão.
  cartaoSalvo: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },

  // Mídia do atendimento: o que o tutor anexa ao pedir e o que o vet registra.
  midiaAtendimento: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },

  // Prontuário eletrônico do atendimento
  prontuarioEletronico: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },

  // Mensagens
  mensagem: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },

  // Anexos do chat. Lidos pela política de retenção (`anexo-retencao.worker.js`),
  // que apaga o binário no R2 e carimba `arquivo_removido_em` sem tocar na linha.
  mensagemAnexo: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },

  // Formulários
  formulario: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn()
  },

  // Respostas de Formulário
  respostaFormulario: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn()
  },

  // Violações
  violacao: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn()
  },

  // Punições
  punicao: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },

  // Histórico de Moderação
  historicoModeracaoUsuario: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn()
  },

  // Transações
  transacao: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn()
  },

  // Carteiras
  carteiraTutor: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn()
  },

  carteiraVeterinario: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn()
  },

  // Planos e Assinaturas
  planoAssinatura: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },

  assinaturaUsuario: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    groupBy: jest.fn(),
    count: jest.fn()
  },

  // Avaliações
  avaliacao: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn()
  },

  // Auth Advanced
  refreshToken: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn()
  },

  passwordResetToken: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn()
  },

  emailVerificationToken: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn()
  },

  tokenBlacklist: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn()
  },

  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn()
  },

  // CRM do veterinário: clientela, agenda e retenção
  clienteVeterinario: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn()
  },

  agendamento: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },

  // Itens estruturados da prescrição e o histórico de retificações da receita.
  prescricaoItem: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn()
  },

  receitaRetificacao: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    count: jest.fn()
  },

  // Raio de atendimento e tabela de preços por cidade — lidos pelo despacho
  // por proximidade e pelo checkout.
  cidadeCobertura: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn()
  },

  // Credenciais do gateway por tenant. Faltava aqui, e a consequência era um
  // teste vermelho permanente em `tests/routes/billing.test.js`: sem o modelo,
  // `PaymentGatewayService.getGateway` estourava em `prisma.gatewayConfig`
  // undefined, o controller convertia em 400 e o teste dizia "criar pagamento"
  // enquanto na verdade só provava que a rota falhava.
  gatewayConfig: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },

  // Gravação de teleorientação, para auditoria interna.
  gravacaoChamada: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn()
  },
  gravacaoChamadaParte: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn()
  },

  agendaDisponivel: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn()
  },

  catalogoItemVeterinario: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn()
  },

  // Ficha clínica do pet: alergia, vacina e medicação. Corrigíveis e removíveis
  // (exclusão lógica) por ficha-clinica.controller.
  petAlergia: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn()
  },

  petVacina: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn()
  },

  petMedicamento: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn()
  },

  lembretePet: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },

  paymentSplit: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn()
  },

  payment: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn()
  },

  refund: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  paymentSplit: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    updateMany: jest.fn()
  },
  paymentEvent: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn()
  },

  configuracaoTenant: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn()
  },

  enderecoTutor: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },

  petTagScan: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn()
  },

  pushSubscription: {
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn()
  },

  // Rede de parceiros: indicações, comissões e fechamentos.
  partner: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },
  partnerUnit: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn()
  },
  partnerService: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn()
  },
  partnerCategory: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn()
  },
  referral: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  referralConversion: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn()
  },
  commissionRule: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn()
  },
  commissionSettlement: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },

  // ── Saúde Pet Mercado ──────────────────────────────────────────────────────
  lojaMercado: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn()
  },
  categoriaMercado: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn()
  },
  produtoMercado: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    // `updateMany` é o que faz a baixa condicional de estoque; sem ele no mock,
    // o teste de concorrência do checkout não teria o que exercitar.
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn()
  },
  carrinhoMercado: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn()
  },
  itemCarrinhoMercado: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn()
  },
  assinaturaMercado: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn()
  },
  itemAssinaturaMercado: {
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn()
  },
  pedidoMercado: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn()
  },
  itemPedidoMercado: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn()
  },
  eventoPedidoMercado: {
    findMany: jest.fn(),
    create: jest.fn()
  },

  // Transações do Prisma
  $transaction: jest.fn(callback => callback(prisma)),
  // Consultas cruas (busca geoespacial com cube/earthdistance). O padrão é
  // rejeitar: o serviço então usa o cálculo em memória, que é o caminho
  // reserva que os testes exercitam.
  $queryRaw: jest.fn(() => Promise.reject(new Error('queryRaw não mockado neste teste'))),
  $executeRaw: jest.fn(),
  $disconnect: jest.fn()
});

// Aplicar mocks
Object.assign(prisma, createPrismaMock());

module.exports = prisma;
