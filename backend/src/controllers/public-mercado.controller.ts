import type { Request, Response } from 'express';
import { baseDoSite, feedCsv, feedXml, montarFeed } from '../services/mercado/feed.service';
import { chaveDoDado, montarPaginaPublica, NAO_ENCONTRADO } from '../services/pagina-publica.service';
import type { DadosIniciais } from '../services/pagina-publica.service';
import { lojaPublica, lojasPublicas, produtoPublico, produtosPublicos } from '../services/mercado/vitrine-publica.service';

const { asyncHandler } = require('../middleware/error.middleware');
const { resolvePublicTenant } = require('../services/public-tenant.service');

/**
 * O mercado sem sessão: vitrine pública, feed de produtos e HTML inicial.
 *
 * Tudo aqui lê o tenant PÚBLICO — o mesmo do blog e da landing — e só devolve
 * loja aprovada com produto disponível. Não há escrita nenhuma neste arquivo.
 */

const CACHE_CURTO = 'public, max-age=300, stale-while-revalidate=3600';
const CACHE_FEED = 'public, max-age=600, stale-while-revalidate=3600';

export const lojas = asyncHandler(async (_req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  res.set('Cache-Control', CACHE_CURTO);
  return res.json({ lojas: await lojasPublicas(tenant.id) });
});

export const loja = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  res.set('Cache-Control', CACHE_CURTO);
  return res.json(await lojaPublica(tenant.id, String(req.params.slug)));
});

export const produtos = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  res.set('Cache-Control', CACHE_CURTO);
  return res.json(
    await produtosPublicos({
      tenantId: tenant.id,
      lojaSlug: String(req.params.slug),
      busca: (req.query.busca as string) || null,
      categoriaSlug: (req.query.categoria as string) || null,
      especie: (req.query.especie as string) || null,
      pagina: Number(req.query.pagina) || undefined,
      limite: Number(req.query.limite) || undefined
    })
  );
});

export const produto = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  res.set('Cache-Control', CACHE_CURTO);
  return res.json({ produto: await produtoPublico(tenant.id, String(req.params.slug), String(req.params.produto)) });
});

// ── Feed ──────────────────────────────────────────────────────────────────────

export const feedEmXml = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const { itens, base } = await montarFeed({ tenantId: tenant.id, lojaSlug: (req.query.loja as string) || null });
  res.set('Cache-Control', CACHE_FEED);
  return res.type('application/xml').send(
    feedXml(itens, {
      titulo: req.query.loja ? `Catálogo ${String(req.query.loja)} — Saúde PET Mercado` : 'Saúde PET Mercado',
      base,
      descricao: 'Produtos para pets vendidos pelas lojas do Saúde PET Mercado.'
    })
  );
});

export const feedEmCsv = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const { itens } = await montarFeed({ tenantId: tenant.id, lojaSlug: (req.query.loja as string) || null });
  res.set('Cache-Control', CACHE_FEED);
  res.set('Content-Disposition', 'inline; filename="saudepet-mercado.csv"');
  return res.type('text/csv; charset=utf-8').send(feedCsv(itens));
});

// ── HTML inicial das páginas públicas do mercado ─────────────────────────────
//
// O nginx manda `/mercado`, `/mercado/:slug` e `/mercado/:slug/:produto` para
// cá. O HTML é o do `.tsx` de cada página, desenhado no servidor
// (`pagina-publica.service`); aqui só se juntam os dados que a página pediria
// à API — pelas mesmas funções que a API usa.

/** Produtos por página na vitrine; o `PublicMercadoLoja.tsx` pede o mesmo número. */
const PRODUTOS_POR_PAGINA = 24;

const enviarPagina = (res: Response, html: string, encontrado: boolean) => {
  if (!encontrado) return res.status(404).type('html').send(html);
  res.set('Cache-Control', CACHE_CURTO);
  return res.type('html').send(html);
};

export const renderIndice = asyncHandler(async (_req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const dados: DadosIniciais = { '/public/mercado/lojas': { lojas: await lojasPublicas(tenant.id) } };
  return enviarPagina(res, await montarPaginaPublica({ url: '/mercado', dados, baseDoSite: baseDoSite() }), true);
});

export const renderLoja = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const slug = String(req.params.slug);
  const pagina = Math.max(1, Math.floor(Number(req.query.pagina)) || 1);
  const dados: DadosIniciais = {};
  let encontrada = true;
  try {
    dados[`/public/mercado/lojas/${slug}`] = await lojaPublica(tenant.id, slug);
    dados[chaveDoDado(`/public/mercado/lojas/${slug}/produtos`, { pagina, limite: PRODUTOS_POR_PAGINA })] =
      await produtosPublicos({ tenantId: tenant.id, lojaSlug: slug, pagina, limite: PRODUTOS_POR_PAGINA });
  } catch {
    encontrada = false;
    dados[`/public/mercado/lojas/${slug}`] = NAO_ENCONTRADO;
  }
  const url = pagina > 1 ? `/mercado/${slug}?pagina=${pagina}` : `/mercado/${slug}`;
  return enviarPagina(res, await montarPaginaPublica({ url, dados, baseDoSite: baseDoSite() }), encontrada);
});

export const renderProduto = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const slug = String(req.params.slug);
  const produtoSlug = String(req.params.produto);
  const chave = `/public/mercado/lojas/${slug}/produtos/${produtoSlug}`;
  const dados: DadosIniciais = {};
  let encontrado = true;
  try {
    dados[chave] = { produto: await produtoPublico(tenant.id, slug, produtoSlug) };
  } catch {
    encontrado = false;
    dados[chave] = NAO_ENCONTRADO;
  }
  const html = await montarPaginaPublica({ url: `/mercado/${slug}/${produtoSlug}`, dados, baseDoSite: baseDoSite() });
  return enviarPagina(res, html, encontrado);
});
