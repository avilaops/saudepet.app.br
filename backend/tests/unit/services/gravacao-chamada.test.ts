/**
 * Gravação de chamada — o que ela pode e, sobretudo, o que ela NÃO pode.
 *
 * Toda teleorientação é gravada para auditoria interna. A parte fácil é
 * gravar; a parte que precisa de teste é o cerco: participante escreve e nunca
 * lê, moderação lê e sempre deixa motivo, e o áudio vence.
 *
 * Um acervo de consulta veterinária com a voz de duas pessoas é dado sensível.
 * O que separa "controle de risco" de "vigilância" são exatamente estas
 * regras, e por isso elas vivem num teste em vez de viverem só na intenção.
 */

jest.mock('../../../src/config/r2', () => ({
  uploadBuffer: jest.fn().mockResolvedValue(undefined),
  deleteObject: jest.fn().mockResolvedValue(undefined),
  getSignedDownloadUrl: jest.fn(async (key: string) => `https://r2/assinada/${key}`)
}));

const prisma = require('../../../src/config/database');
const r2 = require('../../../src/config/r2');
const servico = require('../../../src/services/gravacao-chamada.service');

const TENANT = 'tenant-1';
const TUTOR = 'usuario-tutor';
const VET = 'usuario-vet';

const teleorientacao = {
  id: 'atend-1',
  tipo_atendimento: 'teleorientacao',
  tutor_id: TUTOR,
  veterinario: { usuario_id: VET }
};

describe('Abrir a gravação', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.findFirst.mockResolvedValue(teleorientacao);
    prisma.gravacaoChamada.findFirst.mockResolvedValue(null);
    prisma.gravacaoChamada.create.mockResolvedValue({ id: 'grav-1' });
  });

  it('o papel sai do VÍNCULO, não do tipo de usuário', async () => {
    // O veterinário pode ser tutor do próprio pet; ali ele é o tutor.
    await servico.abrirGravacao({ atendimentoId: 'atend-1', tenantId: TENANT, usuarioId: TUTOR });

    expect(prisma.gravacaoChamada.create.mock.calls[0][0].data.autor_papel).toBe('tutor');
  });

  it('quem não participa do atendimento não abre gravação', async () => {
    await expect(
      servico.abrirGravacao({ atendimentoId: 'atend-1', tenantId: TENANT, usuarioId: 'estranho' })
    ).rejects.toThrow(/não participa/i);
  });

  it('só teleorientação grava — consulta domiciliar não tem chamada', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue({ ...teleorientacao, tipo_atendimento: 'consulta_domiciliar' });

    await expect(
      servico.abrirGravacao({ atendimentoId: 'atend-1', tenantId: TENANT, usuarioId: TUTOR })
    ).rejects.toThrow(/teleorientação/i);
  });

  it('reconectar CONTINUA a mesma gravação, dos índices onde parou', async () => {
    prisma.gravacaoChamada.findFirst.mockResolvedValue({ id: 'grav-ja-aberta', _count: { partes: 7 } });

    const r = await servico.abrirGravacao({ atendimentoId: 'atend-1', tenantId: TENANT, usuarioId: TUTOR });

    // Abrir outra a cada queda picotaria a conversa em arquivos irremontáveis.
    expect(r).toEqual({ id: 'grav-ja-aberta', indiceProximo: 7 });
    expect(prisma.gravacaoChamada.create).not.toHaveBeenCalled();
  });

  it('nasce com prazo de validade — dado sensível não fica para sempre', async () => {
    await servico.abrirGravacao({ atendimentoId: 'atend-1', tenantId: TENANT, usuarioId: TUTOR });

    const expira = prisma.gravacaoChamada.create.mock.calls[0][0].data.expira_em;
    expect(expira.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('Guardar um pedaço', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.gravacaoChamada.findFirst.mockResolvedValue({
      id: 'grav-1', autor_usuario_id: TUTOR, status: 'gravando', mime_type: 'audio/webm'
    });
    prisma.gravacaoChamadaParte.create.mockResolvedValue({});
    prisma.gravacaoChamada.update.mockResolvedValue({});
  });

  const parte = (extras = {}) => ({
    gravacaoId: 'grav-1', tenantId: TENANT, usuarioId: TUTOR,
    indice: 0, conteudo: Buffer.from('audio'), ...extras
  });

  it('sobe o trecho e soma no tamanho da gravação', async () => {
    await servico.guardarParte(parte());

    expect(r2.uploadBuffer).toHaveBeenCalled();
    expect(prisma.gravacaoChamada.update.mock.calls[0][0].data.tamanho_bytes).toEqual({ increment: 5 });
  });

  it('a chave do arquivo é ordenável — fora de ordem o áudio não toca', async () => {
    await servico.guardarParte(parte({ indice: 12 }));

    const [, chave] = r2.uploadBuffer.mock.calls[0];
    expect(chave).toBe('gravacoes/grav-1/00012.webm');
  });

  it('ninguém escreve na gravação de outro participante', async () => {
    await expect(servico.guardarParte(parte({ usuarioId: VET }))).rejects.toThrow(/outro participante/i);
    expect(r2.uploadBuffer).not.toHaveBeenCalled();
  });

  it('gravação já encerrada não recebe mais nada', async () => {
    prisma.gravacaoChamada.findFirst.mockResolvedValue({
      id: 'grav-1', autor_usuario_id: TUTOR, status: 'finalizada', mime_type: 'audio/webm'
    });

    await expect(servico.guardarParte(parte())).rejects.toThrow(/encerrada/i);
  });

  it('trecho gigante é recusado — a rota não é depósito de arquivo', async () => {
    await expect(
      servico.guardarParte(parte({ conteudo: Buffer.alloc(9 * 1024 * 1024) }))
    ).rejects.toThrow(/tamanho/i);
    expect(r2.uploadBuffer).not.toHaveBeenCalled();
  });
});

describe('Abrir para auditoria — o único caminho de leitura', () => {
  const comPartes = {
    id: 'grav-1',
    atendimento_id: 'atend-1',
    autor_papel: 'veterinario',
    autor_usuario_id: VET,
    mime_type: 'audio/webm',
    duracao_seg: 300,
    expira_em: new Date(Date.now() + 86_400_000),
    partes: [
      { indice: 0, storage_key: 'gravacoes/grav-1/00000.webm' },
      { indice: 1, storage_key: 'gravacoes/grav-1/00001.webm' }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.gravacaoChamada.findFirst.mockResolvedValue(comPartes);
  });

  it('SEM MOTIVO não abre — auditoria sem motivo registrado é vigilância', async () => {
    await expect(
      servico.abrirParaAuditoria({ gravacaoId: 'grav-1', tenantId: TENANT, motivo: '  ' })
    ).rejects.toThrow(/motivo/i);
    expect(r2.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('com motivo, devolve as partes NA ORDEM', async () => {
    const r = await servico.abrirParaAuditoria({
      gravacaoId: 'grav-1', tenantId: TENANT, motivo: 'denúncia 42'
    });

    expect(r.partes.map((p: any) => p.indice)).toEqual([0, 1]);
    // A parte 0 traz o cabeçalho do contêiner; sem ela as seguintes não abrem.
    expect(r.partes[0].url).toContain('00000.webm');
  });

  it('as URLs são assinadas e de vida curta, não links permanentes', async () => {
    await servico.abrirParaAuditoria({ gravacaoId: 'grav-1', tenantId: TENANT, motivo: 'apuração' });

    for (const [, segundos] of r2.getSignedDownloadUrl.mock.calls) {
      expect(segundos).toBeLessThanOrEqual(900);
    }
  });

  it('gravação vencida não abre, mesmo com motivo', async () => {
    prisma.gravacaoChamada.findFirst.mockResolvedValue({
      ...comPartes, expira_em: new Date(Date.now() - 1000)
    });

    await expect(
      servico.abrirParaAuditoria({ gravacaoId: 'grav-1', tenantId: TENANT, motivo: 'tarde demais' })
    ).rejects.toThrow(/venceu/i);
  });
});

describe('Varredura de manutenção', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.gravacaoChamada.updateMany.mockResolvedValue({ count: 2 });
    prisma.gravacaoChamada.findMany.mockResolvedValue([]);
    prisma.gravacaoChamadaParte.deleteMany.mockResolvedValue({ count: 0 });
    prisma.gravacaoChamada.update.mockResolvedValue({});
  });

  it('fecha o que ficou aberto — navegador que sumiu sem avisar', async () => {
    const r = await servico.varrerGravacoes();

    expect(prisma.gravacaoChamada.updateMany.mock.calls[0][0].data.status).toBe('interrompida');
    expect(r.interrompidas).toBe(2);
  });

  it('sem isso, uma gravação eterna nunca venceria e ficaria guardada para sempre', async () => {
    await servico.varrerGravacoes();

    const where = prisma.gravacaoChamada.updateMany.mock.calls[0][0].where;
    expect(where.status).toBe('gravando');
    expect(where.iniciada_em.lt).toBeInstanceOf(Date);
  });

  it('apaga o ÁUDIO vencido e MANTÉM a linha', async () => {
    prisma.gravacaoChamada.findMany.mockResolvedValue([
      { id: 'grav-velha', partes: [{ id: 'p1', storage_key: 'gravacoes/grav-velha/00000.webm' }] }
    ]);

    const r = await servico.varrerGravacoes();

    expect(r2.deleteObject).toHaveBeenCalledWith('gravacoes/grav-velha/00000.webm');
    expect(prisma.gravacaoChamadaParte.deleteMany).toHaveBeenCalled();
    // A ficha fica: o histórico mostra que existiu uma gravação e que venceu.
    expect(prisma.gravacaoChamada.delete).not.toHaveBeenCalled();
    expect(r.arquivos).toBe(1);
  });

  it('arquivo já ausente no R2 não trava a limpeza no mesmo registro', async () => {
    prisma.gravacaoChamada.findMany.mockResolvedValue([
      { id: 'grav-velha', partes: [{ id: 'p1', storage_key: 'sumiu.webm' }] }
    ]);
    r2.deleteObject.mockRejectedValueOnce(new Error('NoSuchKey'));

    await expect(servico.varrerGravacoes()).resolves.toMatchObject({ vencidas: 1 });
  });
});
