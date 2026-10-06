import { Router } from 'express';
const router = Router();
const rateLimit = require('express-rate-limit');
const geocoding = require('../services/geocoding.service');
const rotaService = require('../services/rota.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { asyncHandler, ValidationError } = require('../middleware/error.middleware');
import type { NextFunction, Request, Response } from 'express';

// A política do Nominatim é generosa, mas não infinita. O teto por sessão evita
// que uma tela com bug (ou alguém curioso) transforme a nossa aplicação num
// proxy de geocodificação para a internet inteira.
const limitador = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas consultas de endereço. Aguarde alguns segundos.' }
});

router.use(authMiddleware, limitador);

// Coordenada → endereço. É o caminho do "usar minha localização".
router.get('/reverso', asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng } = req.query;
  const resultado = await geocoding.reverso({ latitude: lat, longitude: lng });

  if (!resultado) {
    throw new ValidationError('Não foi possível identificar o endereço desta localização.');
  }

  return res.json({ success: true, local: resultado });
}));

// Rota por rua entre dois pontos, com tempo de deslocamento.
//
// O mapa só sabia distância em linha reta — honesto, mas pouco útil: quem
// espera um veterinário quer saber quanto falta, e 3 km em linha reta podem ser
// 12 minutos ou 35, dependendo do que existe no caminho.
router.get('/rota', asyncHandler(async (req: Request, res: Response) => {
  const [origemLat, origemLng] = String(req.query.de || '').split(',');
  const [destinoLat, destinoLng] = String(req.query.para || '').split(',');

  const rota = await rotaService.calcular({
    origem: { latitude: origemLat, longitude: origemLng },
    destino: { latitude: destinoLat, longitude: destinoLng }
  });

  // Sem rota não é erro: a tela volta para a linha reta, que é o que ela já
  // fazia. Um mapa sem trajeto é melhor do que uma tela de erro.
  return res.json({ success: true, rota });
}));

// Endereço → coordenadas. É o caminho de quem nega o GPS e digita.
router.get('/buscar', asyncHandler(async (req: Request, res: Response) => {
  const { q } = req.query;
  const resultados = await geocoding.buscar({ termo: q });
  return res.json({ success: true, locais: resultados });
}));

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
