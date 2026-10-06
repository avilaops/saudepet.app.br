const { leadSchema, pageViewSchema, blogPostSchema } = require('../../../src/schemas/content.schema');
const { registerSchema } = require('../../../src/schemas/auth.schema');

describe('content schemas', () => {
  test('normaliza telefone e aceita lead mínimo com finalidade específica', () => {
    const result = leadSchema.parse({
      name: 'Maria da Silva', phone: '(11) 99999-9999', interest: 'Atendimento veterinário',
      privacyAccepted: true, privacyPurpose: 'Contato sobre esta solicitação.'
    });
    expect(result.phone).toBe('11999999999');
  });

  test('rejeita lead sem aceite de privacidade', () => {
    expect(() => leadSchema.parse({ name: 'Maria da Silva', phone: '11999999999', interest: 'Contato', privacyAccepted: false, privacyPurpose: 'Contato sobre esta solicitação.' })).toThrow();
  });

  test('rejeita script no conteúdo editorial', () => {
    expect(() => blogPostSchema.parse({
      slug: 'artigo-seguro', title: 'Artigo seguro', excerpt: 'Resumo suficientemente longo para validação.',
      content: '## Título\n\nConteúdo editorial com tamanho suficiente. <script>alert(1)</script>',
      authorName: 'Equipe Saúde PET', tags: [], status: 'rascunho'
    })).toThrow();
  });

  test('aceita uma navegação identificada para deduplicação', () => {
    expect(pageViewSchema.parse({ anonymousVisitorId: 'visitor-1234', anonymousSessionId: 'session-1234', navigationId: 'navigation-1234', path: '/faq' }).path).toBe('/faq');
  });
});

describe('public registration roles', () => {
  const base = { nome: 'Administrador Teste', email: 'admin@example.com', telefone: '(11) 99999-9999', senha: 'segredo123', cidade: 'São Paulo', tenant_slug: 'saudepet' };
  test.each(['admin', 'super_admin'])('rejeita criação pública de %s', (tipo_usuario) => {
    expect(() => registerSchema.parse({ ...base, tipo_usuario })).toThrow();
  });
});
