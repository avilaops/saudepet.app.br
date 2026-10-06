import { Router } from 'express';
import * as loja from '../controllers/mercado-loja.controller';

const multer = require('multer');
const { authMiddleware, bloquearVisitaDeSuporte } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

// Foto de produto: só imagem, até 12 MB (foto de celular passa fácil de 5).
// O arquivo fica em memória e vai para o R2 já convertido em WebP — nada toca
// o disco do container.
const fotoDeProduto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req: unknown, file: { mimetype: string }, cb: (erro: Error | null, aceita?: boolean) => void) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Só imagens são aceitas como foto de produto'));
  }
});

/**
 * Saúde Pet Mercado — o lado de quem vende.
 *
 * Não há guarda de papel aqui, e é proposital: qualquer conta do tenant pode
 * ABRIR uma loja, porque é assim que um petshop entra na plataforma — pela
 * tela, sozinho, sem pedir cadastro a ninguém. O que separa é o vínculo: cada
 * rota resolve a loja por `responsavel_id`, e quem não responde por nenhuma
 * recebe 404 em vez de ver a de outro.
 *
 * `bloquearVisitaDeSuporte` cobre as escritas. Ver a loja de alguém para
 * entender um problema é uma coisa; cadastrar produto, mudar preço ou cancelar
 * pedido em nome da pessoa é outra — e o registro de "quem fez" não desfaz o
 * preço errado que foi ao ar.
 */
const router = Router();

router.use(authMiddleware, tenantContext, requireActiveTenant);

// ── Cadastro ──────────────────────────────────────────────────────────────────
router.get('/', asyncHandler(loja.minha));
router.post('/', bloquearVisitaDeSuporte, asyncHandler(loja.criar));
router.put('/', bloquearVisitaDeSuporte, asyncHandler(loja.atualizar));
router.post('/enviar', bloquearVisitaDeSuporte, asyncHandler(loja.enviar));
router.get('/painel', asyncHandler(loja.painel));

// ── Catálogo ──────────────────────────────────────────────────────────────────
router.get('/categorias', asyncHandler(loja.categorias));
router.get('/preco-sugerido', asyncHandler(loja.sugerirPreco));
router.get('/produtos', asyncHandler(loja.produtos));
router.post('/produtos', bloquearVisitaDeSuporte, asyncHandler(loja.novoProduto));
router.put('/produtos/:id', bloquearVisitaDeSuporte, asyncHandler(loja.editarProduto));
router.delete('/produtos/:id', bloquearVisitaDeSuporte, asyncHandler(loja.tirarDaVitrine));
router.post('/produtos/:id/fotos', bloquearVisitaDeSuporte, fotoDeProduto.single('foto'), asyncHandler(loja.subirFoto));
router.delete('/produtos/:id/fotos', bloquearVisitaDeSuporte, asyncHandler(loja.removerFoto));
router.put('/produtos/:id/fotos/capa', bloquearVisitaDeSuporte, asyncHandler(loja.definirCapa));

// ── Catálogo para WhatsApp e Google ──────────────────────────────────────────
router.get('/feed', asyncHandler(loja.feed));

// ── Pedidos ───────────────────────────────────────────────────────────────────
router.get('/pedidos', asyncHandler(loja.pedidos));
router.get('/assinaturas', asyncHandler(loja.assinaturas));
router.get('/pedidos/:id', asyncHandler(loja.pedido));
router.post('/pedidos/:id/avancar', bloquearVisitaDeSuporte, asyncHandler(loja.avancar));
router.post('/pedidos/:id/etiqueta', bloquearVisitaDeSuporte, asyncHandler(loja.emitirEtiqueta));
router.post('/pedidos/:id/cancelar', bloquearVisitaDeSuporte, asyncHandler(loja.cancelar));

export = router;
