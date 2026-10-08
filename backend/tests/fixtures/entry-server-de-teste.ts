// Faz o papel do `entry-server.cjs` do frontend nos testes do backend: devolve
// um corpo previsível e o `<Seo>` que a "página" declarou, a partir da URL.
exports.renderizar = (url, dados, opcoes) => {
  if (url === '/quebra') throw new Error('página quebrada de propósito');
  if (url === '/sem-seo') return { html: '<main>sem seo</main>', seo: null };
  return {
    html: `<main data-url="${url}" data-chaves="${Object.keys(dados).join(',')}" data-base="${opcoes.baseDoSite}">corpo de $& teste</main>`,
    seo: {
      title: 'Título da página | Saúde PET',
      description: 'Descrição "com aspas" & e comercial',
      path: url.split('?')[0],
      image: '/blog-media/social/capa.jpg',
      imageWidth: '1200',
      imageHeight: '630',
      type: 'article',
      jsonLd: url.startsWith('/blog/') ? { '@context': 'https://schema.org', '@type': 'Article', headline: '</script><b>' } : undefined,
      noindex: url.includes('nao-existe')
    }
  };
};
