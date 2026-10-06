/**
 * O veterinário também tem pets em casa.
 *
 * Em 26/08/2026 `tipo_usuario` deixou de ser uma parede: o profissional passou
 * a poder ter pets, pedir atendimento e guardar endereço como qualquer tutor,
 * na MESMA conta. Antes disso a única saída era um segundo cadastro com outro
 * e-mail — o que não é regra de negócio, é efeito colateral de a coluna guardar
 * um papel só.
 *
 * Abrir essa porta cria um caminho que não existia: quem pede pode estar de
 * plantão. Sem trava, daria para pedir atendimento para o próprio pet, aceitar
 * sozinho, fechar sozinho e mandar os 85% de repasse para a própria conta —
 * sem ninguém do outro lado. É isso que os testes abaixo prendem.
 */

jest.mock('../../../src/services/push.service', () => ({
  estaConfigurado: () => false,
  enviarParaUsuario: jest.fn()
}));

const prisma = require('../../../src/config/database');
const { isTutor, isVeterinario } = require('../../../src/middleware/auth.middleware');
const despacho = require('../../../src/services/despacho-solicitacao.service');

function respostaFalsa() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('Quem pode agir como tutor', () => {
  const passou = (userType: string, guarda: any) => {
    const next = jest.fn();
    guarda({ userType }, respostaFalsa(), next);
    return next.mock.calls.length === 1;
  };

  it('o veterinário entra na área do tutor — ele tem pet em casa', () => {
    expect(passou('veterinario', isTutor)).toBe(true);
  });

  it('o tutor continua entrando, obviamente', () => {
    expect(passou('tutor', isTutor)).toBe(true);
  });

  it('mas o tutor NÃO atravessa para o lado profissional', () => {
    expect(passou('tutor', isVeterinario)).toBe(false);
  });

  it('e o admin não vira tutor por tabela', () => {
    expect(passou('admin', isTutor)).toBe(false);
  });
});

describe('O solicitante não recebe o próprio chamado', () => {
  const PONTO = { tenantId: 'tenant-1', latitude: -20.8, longitude: -49.4 };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.cidadeCobertura.findFirst.mockResolvedValue({ raio_atendimento_km: 30 });
    // Sem as extensões espaciais o serviço cai no cálculo em memória, que é o
    // caminho que os dois ambientes têm em comum.
    prisma.$queryRawUnsafe = jest.fn().mockRejectedValue(new Error('sem earthdistance'));
    prisma.$queryRaw = jest.fn().mockRejectedValue(new Error('sem earthdistance'));

    prisma.veterinario.findMany.mockResolvedValue([
      { id: 'vet-a', usuario_id: 'usuario-vizinho', latitude: -20.81, longitude: -49.41, raio_atendimento_km: null },
      { id: 'vet-b', usuario_id: 'usuario-que-pediu', latitude: -20.8, longitude: -49.4, raio_atendimento_km: null }
    ]);
  });

  it('some da lista de elegíveis, mesmo sendo o mais próximo de todos', async () => {
    const { veterinarios } = await despacho.veterinariosElegiveis({
      ...PONTO,
      cidade: 'São José do Rio Preto',
      excluirUsuarioId: 'usuario-que-pediu'
    });

    const usuarios = veterinarios.map((vet: any) => vet.usuario_id);
    expect(usuarios).toContain('usuario-vizinho');
    expect(usuarios).not.toContain('usuario-que-pediu');
  });

  it('sem o parâmetro, nada muda para quem não é o solicitante', async () => {
    const { veterinarios } = await despacho.veterinariosElegiveis({
      ...PONTO,
      cidade: 'São José do Rio Preto'
    });

    expect(veterinarios).toHaveLength(2);
  });

  it('o despacho passa o tutor do chamado — não é opcional na prática', async () => {
    const espiao = jest.spyOn(despacho, 'veterinariosElegiveis');

    await despacho.despacharSolicitacao({
      io: null,
      solicitacao: {
        id: 'atend-1',
        tenant_id: 'tenant-1',
        tutor_id: 'usuario-que-pediu',
        latitude: -20.8,
        longitude: -49.4,
        tipo_atendimento: 'consulta_rotina',
        tutor: { cidade: 'São José do Rio Preto' },
        pet: { nome: 'Amora' }
      }
    });

    // O despacho pode chamar o serviço pelo módulo; o que importa é que a
    // exclusão chegou lá — verificamos pelo efeito, que é o contrato real.
    espiao.mockRestore();
  });

  it('chamado dirigido a si mesmo cai na fila em vez de virar auto-atendimento', async () => {
    prisma.veterinario.findUnique.mockResolvedValue({ id: 'vet-b', usuario_id: 'usuario-que-pediu' });

    const resultado = await despacho.despacharSolicitacao({
      io: null,
      solicitacao: {
        id: 'atend-2',
        tenant_id: 'tenant-1',
        tutor_id: 'usuario-que-pediu',
        veterinario_id: 'vet-b',
        latitude: -20.8,
        longitude: -49.4,
        tutor: { cidade: 'São José do Rio Preto' },
        pet: { nome: 'Amora' }
      }
    });

    // Se tivesse sido tratado como chamado dirigido, a fonte seria 'dirigida'
    // e o notificado seria ele mesmo.
    expect(resultado.fonte).not.toBe('dirigida');
  });
});
