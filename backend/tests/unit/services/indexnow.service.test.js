describe('indexnow.service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      PUBLIC_SITE_URL: 'https://saudepet.app.br',
      INDEXNOW_ENABLED: 'true',
      INDEXNOW_KEY: 'a'.repeat(32),
      INDEXNOW_ENDPOINT: 'https://api.indexnow.org/indexnow'
    };
    delete process.env.N8N_SEO_WEBHOOK_URL;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('normaliza, remove duplicatas e rejeita URLs de outro host', () => {
    const service = require('../../../src/services/indexnow.service');
    expect(service.normalizeUrls(['/blog/a', 'https://saudepet.app.br/blog/a', 'https://example.com/outro'])).toEqual([
      'https://saudepet.app.br/blog/a'
    ]);
  });

  test('envia lote IndexNow com chave e keyLocation do domínio', async () => {
    const service = require('../../../src/services/indexnow.service');
    const result = await service.notifyUrls(['/blog/a'], 'blog_post_published');
    expect(result.indexNowStatus).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [endpoint, request] = global.fetch.mock.calls[0];
    expect(endpoint).toBe('https://api.indexnow.org/indexnow');
    const payload = JSON.parse(request.body);
    expect(payload.host).toBe('saudepet.app.br');
    expect(payload.urlList).toEqual(['https://saudepet.app.br/blog/a']);
    expect(payload.keyLocation).toBe(`https://saudepet.app.br/${'a'.repeat(32)}.txt`);
  });

  test('não chama serviço externo quando a integração está desligada', async () => {
    process.env.INDEXNOW_ENABLED = 'false';
    const service = require('../../../src/services/indexnow.service');
    const result = await service.notifyUrls(['/blog/a']);
    expect(result.indexNowSkipped).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
