import { Router } from 'express';
const router = Router();
const multer = require('multer');
const bannerController = require('../controllers/banner.controller');
const { authMiddleware, requireRoles, isAdmin } = require('../middleware/auth.middleware');
import type { NextFunction, Request, Response } from 'express';

/** Erro que chega no tratador da rota; o middleware global refina depois. */
type ErroDeRota = Error & { status?: number; code?: string };

// Multer memory storage para repassar buffers ao Cloudflare R2
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const bannerFields = upload.fields([
  { name: 'desktopImage', maxCount: 1 },
  { name: 'mobileImage', maxCount: 1 }
]);

// O multer rejeita o arquivo antes de o controller rodar. Sem esta tradução o
// erro cai no handler genérico e o admin recebe um 500 sem saber que o
// problema é o tamanho da imagem.
const receberImagens = (req: Request, res: Response, next: NextFunction) =>
  bannerFields(req, res, (err: ErroDeRota) => {
    if (!err) return next();

    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'A imagem deve ter no máximo 5MB.'
      : 'Não foi possível receber o arquivo enviado.';

    return res.status(400).json({ success: false, message });
  });

// 🌐 Rota Pública (Landing Page)
router.get('/public', (req: Request, res: Response) => bannerController.getPublicBanners(req, res));

// 🏢 Rotas Administrativas (Requerem autenticação + role admin)
router.get('/', authMiddleware, isAdmin, (req: Request, res: Response) => bannerController.getAdminBanners(req, res));
router.post('/', authMiddleware, isAdmin, receberImagens, (req: Request, res: Response) => bannerController.createBanner(req, res));
router.post('/ai-copy', authMiddleware, isAdmin, receberImagens, (req: Request, res: Response) => bannerController.suggestCopy(req, res));
router.put('/reorder', authMiddleware, isAdmin, (req: Request, res: Response) => bannerController.reorderBanners(req, res));
router.put('/:id', authMiddleware, isAdmin, receberImagens, (req: Request, res: Response) => bannerController.updateBanner(req, res));
router.post('/:id/publish', authMiddleware, isAdmin, (req: Request, res: Response) => bannerController.publishBannerWithPassword(req, res));
router.post('/:id/status', authMiddleware, isAdmin, (req: Request, res: Response) => bannerController.setBannerStatus(req, res));
router.post('/:id/restore', authMiddleware, isAdmin, (req: Request, res: Response) => bannerController.rollbackBanner(req, res));
router.delete('/:id', authMiddleware, isAdmin, (req: Request, res: Response) => bannerController.deleteBanner(req, res));

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
