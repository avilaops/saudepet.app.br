import { cotarCepCerto, emitirEtiquetaCepCerto } from '../../../src/services/cepcerto.service';

describe('CepCerto', () => {
  const fetchOriginal = global.fetch;

  beforeEach(() => {
    process.env.CEP_CERTO_POSTAGEM_API_KEY = 'token-de-teste';
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    delete process.env.CEP_CERTO_POSTAGEM_API_KEY;
    jest.restoreAllMocks();
  });

  it('normaliza preço brasileiro e remove serviços indisponíveis', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'sucesso',
        frete: {
          valor_pac: '26,57', prazo_pac: 'até 5 dias',
          valor_sedex: '37,81', prazo_sedex: 'até 1 dia',
          valor_jadlog_package: '', valor_jadlog_dotcom: null, valor_loggi: 0
        }
      })
    }) as typeof fetch;

    const opcoes = await cotarCepCerto({
      cepOrigem: '14000000', cepDestino: '01001000', pesoKg: 1,
      alturaCm: 10, larguraCm: 15, comprimentoCm: 20, valorEncomenda: 25
    });

    expect(opcoes).toEqual([
      expect.objectContaining({ servico: 'pac', valor: 26.57 }),
      expect.objectContaining({ servico: 'sedex', valor: 37.81 })
    ]);
    const requisicao = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(requisicao.body)).toEqual(expect.objectContaining({ valor_encomenda: '50.00' }));
  });

  it('preserva o request_id do pedido na emissão', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ frete: { codigoObjeto: 'AB123BR', pdfUrlEtiqueta: 'https://cepcerto.com/etiqueta/1' } })
    }) as typeof fetch;

    await emitirEtiquetaCepCerto({
      requestId: 'pedido-123', servico: 'pac', cepRemetente: '14000000', cepDestinatario: '01001000',
      pesoKg: 1, alturaCm: 10, larguraCm: 15, comprimentoCm: 20, valorEncomenda: 100,
      remetente: { nome: 'Loja', cpfCnpj: '12345678000190', whatsapp: '16999999999', email: 'loja@teste.com', numero: '10' },
      destinatario: { nome: 'Tutor', cpfCnpj: '12345678900', whatsapp: '11999999999', email: 'tutor@teste.com', numero: '20' },
      produtos: [{ descricao: 'Ração', valor: 100, quantidade: 1 }]
    });

    const requisicao = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(requisicao.body)).toEqual(expect.objectContaining({ request_id: 'pedido-123' }));
  });
});

