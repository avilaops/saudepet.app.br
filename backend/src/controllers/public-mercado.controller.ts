import type { Request, Response } from 'express';
import { baseDoSite, feedCsv, feedXml, montarFeed } from '../services/mercado/feed.service';
import { renderizarIndice, renderizarLoja, renderizarProduto } from '../services/mercado/mercado-render.service';
import { lojaPublica, lojasPublicas, produtoPublico, produtosPublicos } from '../services/mercado/vitrine-publica.service';

const { asyncHandler } = require('../middleware/error.middleware');
const { resolvePublicTenant } = require('../services/public-tenant.service');

/**
 * O mercado sem sessão: vitrine pública, feed de produtos e HTML para robôs.
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

// ── HTML inicial para robôs e prévias de link ────────────────────────────────

export const renderIndice = asyncHandler(async (_req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const { status, html } = await renderizarIndice(tenant.id, baseDoSite());
  res.set('Cache-Control', CACHE_CURTO);
  return res.status(status).type('html').send(html);
});

export const renderLoja = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const { status, html } = await renderizarLoja(tenant.id, String(req.params.slug), baseDoSite());
  res.set('Cache-Control', CACHE_CURTO);
  return res.status(status).type('html').send(html);
});

export const renderProduto = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const { status, html } = await renderizarProduto(
    tenant.id,
    String(req.params.slug),
    String(req.params.produto),
    baseDoSite()
  );
  res.set('Cache-Control', CACHE_CURTO);
  return res.status(status).type('html').send(html);
});
