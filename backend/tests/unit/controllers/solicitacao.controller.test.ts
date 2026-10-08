/**
 * Testes REAIS do controller de solicitação.
 *
 * A versão anterior fazia asserções sobre objetos literais escritos no próprio
 * teste (com status que nem existem no enum) e passava com o controller
 * quebrado. Aqui o controller é executado de verdade, com prisma mockado e a
 * máquina de estados interceptada — o que se testa é autorização, validação e
 * o contrato com `transicionar`.
 */
jest.mock('../../../src/services/atendimento-state.service', () => {
  const real = jest.requireActual('../../../src/services/atendimento-state.service');
  return {
    ...real,
    transicionar: jest.fn()
  };
});

const prisma = require('../../../src/config/database');
const { transicionar } = require('../../../src/services/atendimento-state.service');
const solicitacaoController = require('../../../src/controllers/solicitacao.controller');

function responseDouble() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const reqBase = (extra = {}) => ({
  tenantId: 'tenant-a',
  userId: 'user-tutor',
  userType: 'tutor',
  params: {},
  body: {},
  query: {},
  app: { get: () => null },
  ...extra
});

describe('solicitacao.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('prontuario', () => {
    it('nega a quem não participa do atendimento, sem revelar que ele existe', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'at-1',
        tenant_id: 'tenant-a',
        tutor_id: 'outro-tutor',
        veterinario: { usuario_id: 'outro-vet' }
      });
      const req = reqBase({ params: { id: 'at-1' }, userId: 'intruso', userType: 'tutor' });
      const res = responseDouble();
      const next = jest.fn();

      await solicitacaoController.prontuario(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
      expect(res.json).not.toHaveBeenCalled();
    });

    it('entrega o prontuário ao tutor do atendimento', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'at-1',
        tenant_id: 'tenant-a',
        tutor_id: 'user-tutor',
        status: 'finalizado',
        diagnostico: 'Otite',
        receita: 'Limpeza diária',
        observacoes: 'Coceira na orelha',
        receita_pdf_url: null,
        prontuario_pdf_url: null,
        finalizado_em: new Date('2026-08-15'),
        veterinario: { usuario_id: 'vet-1' }
      });
      prisma.prontuarioEletronico.findUnique.mockResolvedValue({
        id: 'pront-1',
        queixa_principal: 'Coceira',
        itensPrescricao: [],
        examesSolicitados: []
      });
      const req = reqBase({ params: { id: 'at-1' } });
      const res = responseDouble();
      const next = jest.fn();

      await solicitacaoController.prontuario(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        atendimento_id: 'at-1',
        diagnostico: 'Otite',
        prontuario: expect.objectContaining({ queixa_principal: 'Coceira' })
      }));
    });
  });

  describe('encaminharEmergencia', () => {
    const reqVet = (body) => reqBase({
      params: { id: 'at-1' },
      userId: 'user-vet',
      userType: 'veterinario',
      body
    });

    it('rejeita motivo curto antes de tocar no banco', async () => {
      const res = responseDouble();
      const next = jest.fn();

      await solicitacaoController.encaminharEmergencia(reqVet({ motivo: 'curto' }), res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
      expect(prisma.veterinario.findFirst).not.toHaveBeenCalled();
      expect(transicionar).not.toHaveBeenCalled();
    });

    it('impede veterinário não atribuído de encaminhar', async () => {
      prisma.veterinario.findFirst.mockResolvedValue({ id: 'vet-99' });
      prisma.solicitacao.findFirst.mockResolvedValue({ id: 'at-1', veterinario_id: 'vet-1' });
      const res = responseDouble();
      const next = jest.fn();

      await solicitacaoController.encaminharEmergencia(
        reqVet({ motivo: 'suspeita de torção gástrica' }), res, next
      );

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
      expect(transicionar).not.toHaveBeenCalled();
    });

    it('encaminha pelo vet atribuído usando a máquina de estados', async () => {
      prisma.veterinario.findFirst.mockResolvedValue({ id: 'vet-1' });
      prisma.solicitacao.findFirst.mockResolvedValue({ id: 'at-1', veterinario_id: 'vet-1' });
      transicionar.mockResolvedValue({ id: 'at-1', status: 'encaminhado' });
      const res = responseDouble();
      const next = jest.fn();

      await solicitacaoController.encaminharEmergencia(
        reqVet({ motivo: 'suspeita de torção gástrica', orientacao: 'levar ao hospital X' }), res, next
      );

      expect(next).not.toHaveBeenCalled();
      expect(transicionar).toHaveBeenCalledWith(expect.objectContaining({
        id: 'at-1',
        tenantId: 'tenant-a',
        para: 'encaminhado',
        // Campos próprios: motivo e orientação deixaram de ser enfiados em
        // `diagnostico`/`receita` com prefixo `[EMERGÊNCIA]`.
        dados: expect.objectContaining({ encaminhamento_motivo: expect.any(String) })
      }));
      expect(res.json).toHaveBeenCalledWith({ solicitacao: expect.objectContaining({ status: 'encaminhado' }) });
    });
  });

  describe('historicoDoPet', () => {
    /**
     * A rota devolvia sempre os 20 mais recentes e anunciava um total maior em
     * `resumo.total_atendimentos` — mostrava 20 e afirmava 60, sem forma de
     * chegar aos outros 40. Estes testes cobrem a paginação que fecha isso.
     */
    function montarHistorico({ total = 60, retornados = 20 } = {}) {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'at-1',
        tenant_id: 'tenant-a',
        tutor_id: 'user-tutor',
        pet_id: 'pet-1',
        pet: { id: 'pet-1', nome: 'Rex' },
        veterinario: { usuario_id: 'vet-1' }
      });
      prisma.solicitacao.findMany.mockResolvedValue(
        Array.from({ length: retornados }, (_, indice) => ({
          id: `anterior-${indice}`,
          tipo_atendimento: 'consulta_domiciliar',
          finalizado_em: new Date('2026-08-01'),
          criado_em: new Date('2026-08-01'),
          prontuario: null,
          veterinario: { crmv: 'SP-1', usuario: { nome: 'Dra. Ana' } }
        }))
      );
      prisma.solicitacao.count.mockResolvedValue(total);
      prisma.petAlergia.findMany.mockResolvedValue([]);
      prisma.petVacina.findMany.mockResolvedValue([]);
      prisma.petMedicamento.findMany.mockResolvedValue([]);
      prisma.lembretePet.findMany.mockResolvedValue([]);
    }

    it('sem query: primeira página de 20 e o total real de páginas', async () => {
      montarHistorico({ total: 60, retornados: 20 });
      const req = reqBase({ params: { id: 'at-1' } });
      const res = responseDouble();

      await solicitacaoController.historicoDoPet(req, res, jest.fn());

      const consulta = prisma.solicitacao.findMany.mock.calls[0][0];
      expect(consulta.skip).toBe(0);
      expect(consulta.take).toBe(20);

      const corpo = res.json.mock.calls[0][0];
      expect(corpo.paginacao).toEqual({ pagina: 1, por_pagina: 20, total: 60, paginas: 3 });
      expect(corpo.resumo.total_atendimentos).toBe(60);
      expect(corpo.atendimentos).toHaveLength(20);
    });

    it('?pagina=3 salta os 40 anteriores em vez de repetir os mesmos 20', async () => {
      montarHistorico({ total: 60, retornados: 20 });
      const req = reqBase({ params: { id: 'at-1' }, query: { pagina: '3' } });
      const res = responseDouble();

      await solicitacaoController.historicoDoPet(req, res, jest.fn());

      const consulta = prisma.solicitacao.findMany.mock.calls[0][0];
      expect(consulta.skip).toBe(40);
      expect(consulta.take).toBe(20);
      expect(res.json.mock.calls[0][0].paginacao.pagina).toBe(3);
    });

    it('por_pagina respeita o pedido e é limitado a 100', async () => {
      montarHistorico({ total: 500, retornados: 5 });
      const req = reqBase({ params: { id: 'at-1' }, query: { por_pagina: '5' } });
      const res = responseDouble();

      await solicitacaoController.historicoDoPet(req, res, jest.fn());
      expect(prisma.solicitacao.findMany.mock.calls[0][0].take).toBe(5);

      jest.clearAllMocks();
      montarHistorico({ total: 500, retornados: 100 });
      const reqAbusivo = reqBase({ params: { id: 'at-1' }, query: { por_pagina: '100000' } });
      const resAbusivo = responseDouble();

      await solicitacaoController.historicoDoPet(reqAbusivo, resAbusivo, jest.fn());

      expect(prisma.solicitacao.findMany.mock.calls[0][0].take).toBe(100);
      expect(resAbusivo.json.mock.calls[0][0].paginacao.por_pagina).toBe(100);
    });

    it('página inválida cai na primeira em vez de gerar skip negativo', async () => {
      montarHistorico({ total: 60, retornados: 20 });
      const req = reqBase({ params: { id: 'at-1' }, query: { pagina: '-4', por_pagina: '0' } });
      const res = responseDouble();

      await solicitacaoController.historicoDoPet(req, res, jest.fn());

      const consulta = prisma.solicitacao.findMany.mock.calls[0][0];
      expect(consulta.skip).toBe(0);
      expect(consulta.take).toBe(20);
    });

    it('pet sem atendimento anterior: uma página, total zero', async () => {
      montarHistorico({ total: 0, retornados: 0 });
      const req = reqBase({ params: { id: 'at-1' } });
      const res = responseDouble();

      await solicitacaoController.historicoDoPet(req, res, jest.fn());

      expect(res.json.mock.calls[0][0].paginacao).toEqual({
        pagina: 1, por_pagina: 20, total: 0, paginas: 1
      });
    });

    it('continua negando a quem não participa do atendimento', async () => {
      montarHistorico();
      const req = reqBase({ params: { id: 'at-1' }, userId: 'intruso', userType: 'tutor' });
      const res = responseDouble();
      const next = jest.fn();

      await solicitacaoController.historicoDoPet(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('recusar', () => {
    it('impede veterinário não atribuído de recusar o chamado', async () => {
      prisma.veterinario.findFirst.mockResolvedValue({ id: 'vet-99' });
      prisma.solicitacao.findFirst.mockResolvedValue({ id: 'at-1', veterinario_id: 'vet-1' });
      const req = reqBase({ params: { id: 'at-1' }, userId: 'user-vet', userType: 'veterinario', body: {} });
      const res = responseDouble();
      const next = jest.fn();

      await solicitacaoController.recusar(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
      expect(transicionar).not.toHaveBeenCalled();
    });
  });
});

export {};
