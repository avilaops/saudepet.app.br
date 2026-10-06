import { Router } from 'express';
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate.middleware');
const controller = require('../controllers/public-content.controller');
const { leadSchema, pageViewSchema, paginationQuerySchema } = require('../schemas/content.schema');

const router = Router();
const leadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const analyticsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 150, standardHeaders: true, legacyHeaders: false });
// A tag da coleira é pública e devolve contato do tutor: sem limite, um
// raspador percorreria ids atrás de telefones. Generoso para quem achou um
// animal e apertado para quem varre.
const petTagLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const bannerController = require('../controllers/banner.controller');
const petPublicController = require('../controllers/pet-public.controller');
const mercadoPublico = require('../controllers/public-mercado.controller');
import type { NextFunction, Request, Response } from 'express';

router.get('/landing-banners', (req: Request, res: Response) => bannerController.getPublicBanners(req, res));
router.get('/banners', (req: Request, res: Response) => bannerController.getPublicBanners(req, res));
router.get('/pet-tag/:id', petTagLimiter, petPublicController.getPublicTag);
// Registro da leitura da coleira. O "Alertar Tutor" era só um link de WhatsApp:
// o sistema nunca ficava sabendo que a tag tinha sido lida.
router.post('/pet-tag/:id/scan', petTagLimiter, petPublicController.registrarLeitura);
router.post('/leads', leadLimiter, validate(leadSchema), controller.createLead);
router.post('/analytics/page-view', analyticsLimiter, validate(pageViewSchema), controller.trackPageView);
// A tela de planos do tutor sempre chamou `/public/planos`, mas a rota só
// existia em `/billing/planos` — a vitrine carregava vazia. Mesmo controller.
router.get('/planos', require('../controllers/billing.controller').listarPlanos);
router.get('/blog', validate(paginationQuerySchema, 'query'), controller.listPosts);
router.get('/blog/categories', controller.listCategories);
router.get('/render/page/:page', controller.renderPage);
router.get('/render/blog/:slug', controller.renderPost);
router.get('/markdown/blog/:slug', controller.postMarkdown);
router.get('/blog/:slug', controller.getPost);
router.get('/sitemap.xml', controller.sitemap);

// Saúde Pet Mercado sem sessão: a vitrine que o Google, o WhatsApp e o Google
// Business Profile conseguem apontar. Só loja aprovada, só campo público.
router.get('/mercado/lojas', mercadoPublico.lojas);
router.get('/mercado/lojas/:slug', mercadoPublico.loja);
router.get('/mercado/lojas/:slug/produtos', mercadoPublico.produtos);
router.get('/mercado/lojas/:slug/produtos/:produto', mercadoPublico.produto);
// Feed de produtos no formato do Google (que o Meta/WhatsApp também lê).
router.get('/mercado/feed.xml', mercadoPublico.feedEmXml);
router.get('/mercado/feed.csv', mercadoPublico.feedEmCsv);
// HTML inicial com metadata e JSON-LD, como o blog.
router.get('/render/mercado', mercadoPublico.renderIndice);
router.get('/render/mercado/:slug', mercadoPublico.renderLoja);
router.get('/render/mercado/:slug/:produto', mercadoPublico.renderProduto);
router.get('/llms.txt', controller.llmsIndex);
router.get('/llms-full.txt', controller.llmsFull);
router.get('/rss.xml', controller.rss);
router.get('/indexnow-key/:key', controller.indexNowKey);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
