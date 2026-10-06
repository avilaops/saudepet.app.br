/**
 * O veterinário abriu a conversa com o tutor que estava atendendo e leu
 * "Você não tem permissão para acessar este perfil".
 *
 * `/tutores/:id` — cujo próprio comentário na rota diz "para mensagens/perfil"
 * — só liberava admin ou você mesmo. O chat do atendimento é exatamente o caso
 * que faltava: as duas pessoas dividem uma consulta e uma não podia ver quem
 * era a outra. O campo de mensagem ficava desabilitado, sem explicação.
 *
 * O curioso é que a regra certa JÁ EXISTIA, dentro do controller de mensagens
 * (`buscarVinculoProfissional`). O chat sabia quem podia falar com quem; o
 * perfil não. Duas telas do mesmo recurso discordando é o bug.
 *
 * Agora a regra tem uma dona só — `services/vinculo-atendimento` — e estes
 * testes travam o que o participante vê e, principalmente, o que ele NÃO vê.
 */

jest.mock('../../../src/services/vinculo-atendimento.service', () => ({
  buscarVinculoProfissional: jest.fn()
}));

const prisma = require('../../../src/config/database');
const { buscarVinculoProfissional } = require('../../../src/services/vinculo-atendimento.service');
const userController = require('../../../src/controllers/user.controller');

const TUTOR = {
  id: 'usuario-tutor',
  nome: 'Marina Alves',
  email: 'marina@exemplo.com.br',
  telefone: '(17) 99999-1234',
  tipo_usuario: 'tutor',
  cidade: 'São José do Rio Preto',
  sobre: 'Tenho dois gatos.',
  data_nascimento: new Date('1990-05-02'),
  foto_perfil: 'https://exemplo/foto.png',
  foto_capa: 'https://exemplo/capa.png',
  criado_em: new Date('2026-01-01'),
  veterinario: null,
  pets: [{ id: 'pet-1', nome: 'Amora' }, { id: 'pet-2', nome: 'Lufi' }]
};

function requisicao(userId: string, userType: string) {
  return { params: { id: TUTOR.id }, userId, userType, tenantId: 'tenant-1', user: { id: userId } } as any;
}

function resposta() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

/** `asyncHandler` devolve a promessa; o erro chega pelo `next`. */
async function chamar(req: any) {
  const res = resposta();
  const next = jest.fn();
  await userController.buscarPorId(req, res, next);
  return { res, erro: next.mock.calls[0]?.[0] };
}

describe('Perfil de quem divide um atendimento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.usuario.findFirst.mockResolvedValue(TUTOR);
  });

  it('o veterinário do atendimento CONSEGUE ver o tutor — era isto que faltava', async () => {
    buscarVinculoProfissional.mockResolvedValue({ id: 'atend-1', status: 'finalizado' });

    const { res, erro } = await chamar(requisicao('usuario-vet', 'veterinario'));

    expect(erro).toBeUndefined();
    const perfil = res.json.mock.calls[0][0];
    expect(perfil.nome).toBe('Marina Alves');
    // Precisa do telefone: existe um botão "Ligar" na tela do atendimento.
    expect(perfil.telefone).toBe('(17) 99999-1234');
  });

  it('e NÃO recebe o que a consulta não exige', async () => {
    buscarVinculoProfissional.mockResolvedValue({ id: 'atend-1', status: 'finalizado' });

    const { res } = await chamar(requisicao('usuario-vet', 'veterinario'));
    const perfil = res.json.mock.calls[0][0];

    expect(perfil.email).toBeUndefined();
    expect(perfil.data_nascimento).toBeUndefined();
    expect(perfil.foto_capa).toBeUndefined();
    // O atendimento já carrega o pet de que se trata. Devolver a coleção daria
    // a qualquer vet que atendeu uma vez o inventário de animais da casa.
    expect(perfil.pets).toBeUndefined();
  });

  it('estranho sem atendimento em comum continua barrado', async () => {
    buscarVinculoProfissional.mockResolvedValue(null);

    const { erro } = await chamar(requisicao('usuario-xereta', 'veterinario'));

    expect(erro).toBeDefined();
    expect(erro.message).toMatch(/permissão/i);
  });

  it('você mesmo vê o cadastro inteiro', async () => {
    const { res, erro } = await chamar(requisicao(TUTOR.id, 'tutor'));

    expect(erro).toBeUndefined();
    expect(res.json.mock.calls[0][0].email).toBe('marina@exemplo.com.br');
    // Nem consulta o vínculo: não é preciso perguntar se você é você.
    expect(buscarVinculoProfissional).not.toHaveBeenCalled();
  });

  it('admin vê o cadastro inteiro', async () => {
    const { res } = await chamar(requisicao('usuario-admin', 'admin'));

    expect(res.json.mock.calls[0][0].pets).toHaveLength(2);
  });

  it('atendimento ENCERRADO ainda dá acesso — o histórico do chat continua legível', async () => {
    buscarVinculoProfissional.mockResolvedValue({ id: 'atend-antigo', status: 'concluido' });

    const { res, erro } = await chamar(requisicao('usuario-vet', 'veterinario'));

    expect(erro).toBeUndefined();
    expect(res.json.mock.calls[0][0].nome).toBe('Marina Alves');
  });
});
