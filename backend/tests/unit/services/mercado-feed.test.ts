/**
 * O feed de produtos — o mesmo catálogo no WhatsApp e no Google.
 *
 * O que os dois leitores recusam não pode sair daqui como se fosse válido:
 * item sem foto fica de fora (e é contado), preço leva moeda, e o link aponta
 * para a vitrine PÚBLICA — não para a área logada, aonde o Google não chega.
 */

const { feedCsv, feedXml, itemDoFeed, precoDoFeed } = require('../../../src/services/mercado/feed.service');

const BASE = 'https://saudepet.app.br';

function produto(sobrescreve: Record<string, unknown> = {}) {
  return {
    id: 'produto-1',
    nome: 'Golden Formula Cães Adultos',
    slug: 'golden-formula-caes-adultos',
    descricao: 'Ração para cães adultos de todos os portes.',
    marca: 'Golden',
    variacao: 'Frango & arroz',
    tamanho: '15 kg',
    preco: 196.5,
    preco_promocional: null,
    ean: '7896029000123',
    peso_gramas: 15000,
    estoque: 0,
    controla_estoque: false,
    sob_encomenda: false,
    ativo: true,
    imagem_url: 'https://cdn.saudepet.app.br/mercado/foto.webp',
    imagens: ['https://cdn.saudepet.app.br/mercado/foto.webp', 'https://cdn.saudepet.app.br/mercado/verso.webp'],
    categoria: { nome: 'Ração' },
    loja: { nome_fantasia: 'Casa de Rações Filhos de 4 Patas', slug: 'filhos-de-4-patas', cidade: 'Ribeirão Preto', estado: 'SP' },
    ...sobrescreve
  };
}

describe('itemDoFeed: o que vira item', () => {
  it('produto sem foto fica de fora — os dois leitores recusam', () => {
    expect(itemDoFeed(produto({ imagem_url: null, imagens: [] }), BASE)).toBeNull();
    expect(itemDoFeed(produto({ imagem_url: null, imagens: null }), BASE)).toBeNull();
  });

  it('usa a primeira foto da lista como capa quando `imagem_url` está vazia', () => {
    const item = itemDoFeed(produto({ imagem_url: null }), BASE);
    expect(item?.image_link).toBe('https://cdn.saudepet.app.br/mercado/foto.webp');
    expect(item?.additional_image_link).toEqual(['https://cdn.saudepet.app.br/mercado/verso.webp']);
  });

  it('preço com moeda e ponto decimal, do jeito que o Google e o Meta exigem', () => {
    expect(precoDoFeed(196.5)).toBe('196.50 BRL');
    expect(precoDoFeed('7')).toBe('7.00 BRL');
    expect(itemDoFeed(produto(), BASE)?.price).toBe('196.50 BRL');
  });

  it('promoção vira sale_price; sem promoção o campo não existe', () => {
    expect(itemDoFeed(produto(), BASE)?.sale_price).toBeNull();
    const promo = itemDoFeed(produto({ preco_promocional: 179.9 }), BASE);
    expect(promo?.price).toBe('196.50 BRL');
    expect(promo?.sale_price).toBe('179.90 BRL');
  });

  it('o link é a vitrine pública, não a área logada', () => {
    expect(itemDoFeed(produto(), BASE)?.link).toBe(`${BASE}/mercado/filhos-de-4-patas/golden-formula-caes-adultos`);
  });

  it('disponibilidade segue a regra da vitrine: quem não conta estoque está em estoque', () => {
    expect(itemDoFeed(produto({ controla_estoque: false, estoque: 0 }), BASE)?.availability).toBe('in_stock');
    expect(itemDoFeed(produto({ controla_estoque: true, estoque: 0 }), BASE)?.availability).toBe('out_of_stock');
    expect(itemDoFeed(produto({ controla_estoque: true, estoque: 3 }), BASE)?.availability).toBe('in_stock');
  });

  it('com EAN vai gtin; sem EAN o feed DIZ que não existe identificador', () => {
    const com = itemDoFeed(produto(), BASE);
    expect(com?.gtin).toBe('7896029000123');
    expect(com?.identifier_exists).toBe('yes');

    const sem = itemDoFeed(produto({ ean: null }), BASE);
    expect(sem?.gtin).toBeNull();
    expect(sem?.identifier_exists).toBe('no');

    // EAN inválido (o levantamento de campo trouxe zero códigos; um dia alguém
    // digita "abc") não pode ir como gtin.
    expect(itemDoFeed(produto({ ean: '12' }), BASE)?.identifier_exists).toBe('no');
  });

  it('título junta nome, variação e tamanho; peso vira quilos', () => {
    const item = itemDoFeed(produto(), BASE);
    expect(item?.title).toBe('Golden Formula Cães Adultos · Frango & arroz · 15 kg');
    expect(item?.shipping_weight).toBe('15.00 kg');
    expect(item?.product_type).toBe('Ração');
    expect(item?.brand).toBe('Golden');
  });
});

describe('feedXml e feedCsv: os dois formatos', () => {
  const itens = [itemDoFeed(produto(), BASE), itemDoFeed(produto({ id: 'produto-2', slug: 'p2', ean: null, descricao: 'Sabor "premium" & cia' }), BASE)];

  it('XML no RSS 2.0 com o namespace do Google e caracteres escapados', () => {
    const xml = feedXml(itens, { titulo: 'Saúde PET Mercado', base: BASE });

    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml).toContain('<g:id>produto-1</g:id>');
    expect(xml).toContain('<g:price>196.50 BRL</g:price>');
    expect(xml).toContain('<g:availability>in_stock</g:availability>');
    // O "&" do sabor não pode quebrar o XML.
    expect(xml).toContain('Frango &amp; arroz');
    expect(xml).not.toContain('Frango & arroz');
    expect(xml).toContain('<g:identifier_exists>no</g:identifier_exists>');
    // Campo vazio não vira tag vazia.
    expect(xml).not.toContain('<g:sale_price>');
    expect(xml).toContain('<g:additional_image_link>https://cdn.saudepet.app.br/mercado/verso.webp</g:additional_image_link>');
  });

  it('CSV com BOM, cabeçalho do Meta e aspas dobradas', () => {
    const csv = feedCsv(itens);
    const linhas = csv.split('\r\n');

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(linhas[0].slice(1)).toBe(
      'id,title,description,availability,condition,price,sale_price,link,image_link,additional_image_link,brand,gtin,identifier_exists,product_type,shipping_weight'
    );
    expect(linhas[1]).toContain('"produto-1"');
    expect(linhas[1]).toContain('"196.50 BRL"');
    // Aspas dentro do texto viram aspas duplas, como o Excel e o Meta esperam.
    expect(linhas[2]).toContain('Sabor ""premium"" & cia');
    // Linha fecha com quebra e o arquivo termina com quebra.
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('feed vazio ainda é um documento válido', () => {
    const xml = feedXml([], { titulo: 'Vazio', base: BASE });
    expect(xml).toContain('<channel>');
    expect(xml).toContain('</rss>');
    expect(feedCsv([]).split('\r\n')).toHaveLength(2);
  });
});
