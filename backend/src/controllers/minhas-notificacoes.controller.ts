import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import {
  contarNaoLidas,
  listar,
  marcarComoLida,
  marcarTodasComoLidas
} from '../services/notificacao-usuario.service';

/**
 * A central de notificações de quem está logado.
 *
 * Tudo aqui é do próprio usuário: o `usuario_id` sai do token, nunca da URL ou
 * do corpo. Não existe rota para ler a central de outra pessoa.
 */

/** Cursor de paginação: data inválida vira "sem cursor", não erro. */
function dataDaQuery(valor: unknown): Date | undefined {
  if (typeof valor !== 'string' || !valor) return undefined;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? undefined : data;
}

class MinhasNotificacoesController {
  listar = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = String(req.userId);

    const { notificacoes, proximoCursor } = await listar({
      usuarioId,
      apenasNaoLidas: req.query.nao_lidas === 'true',
      limite: Number(req.query.limite) || undefined,
      antesDe: dataDaQuery(req.query.antes_de)
    });

    // O contador vem junto: é o número do sino, e a tela que lista é a mesma
    // que precisa dele. Duas chamadas para montar um cabeçalho é desperdício.
    const naoLidas = await contarNaoLidas(usuarioId);

    return res.json({ notificacoes, naoLidas, proximoCursor });
  });

  contar = asyncHandler(async (req: Request, res: Response) => {
    return res.json({ naoLidas: await contarNaoLidas(String(req.userId)) });
  });

  marcarComoLida = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = String(req.userId);

    // A escrita filtra por dono, então id de outra pessoa simplesmente não
    // muda nada. Marcar como lida é idempotente e não tem por que falhar:
    // responder erro para quem já tinha lido só faria a tela inventar um
    // aviso que a pessoa não precisa ver.
    await marcarComoLida(usuarioId, String(req.params.id));

    return res.json({ ok: true, naoLidas: await contarNaoLidas(usuarioId) });
  });

  marcarTodasComoLidas = asyncHandler(async (req: Request, res: Response) => {
    const marcadas = await marcarTodasComoLidas(String(req.userId));
    return res.json({ ok: true, marcadas, naoLidas: 0 });
  });
}

const minhasNotificacoesController = new MinhasNotificacoesController();

// `export =` compila para `module.exports = ...` exato. As rotas fazem
// `require(...)` e leem os métodos da instância; com `export default` o
// require devolveria o módulo e os métodos ficariam atrás de `.default` —
// foi assim que o e-mail de receita e prontuário parou de sair em 31/08.
export = minhasNotificacoesController;
