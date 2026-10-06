import type { Prisma } from '@prisma/client';
import prisma from '../config/database';

/**
 * A central de notificações de uma pessoa.
 *
 * O produto já avisava nos momentos certos, mas só por push: quem não estava
 * com o aparelho na mão no segundo exato perdia o aviso, e a tela que dizia
 * guardar esse histórico mostrava quatro exemplos escritos à mão, iguais para
 * todo mundo. Aqui o histórico é real e nasce do mesmo funil que envia o push
 * (`push.service.enviarParaUsuario`), então não existe segunda lista para
 * alguém esquecer de alimentar.
 */

export interface PedidoDeRegistro {
  tenantId: string;
  usuarioId: string;
  titulo: string;
  mensagem: string;
  link?: string | null;
  icone?: string;
  urgente?: boolean;
}

/**
 * Guarda um aviso.
 *
 * Melhor esforço, como o push: nenhum fluxo do produto pode falhar porque o
 * histórico não gravou. Um atendimento não pode deixar de ser finalizado
 * porque a tabela de avisos recusou a linha.
 */
export async function registrar(pedido: PedidoDeRegistro): Promise<void> {
  const { tenantId, usuarioId, titulo, mensagem } = pedido;
  if (!tenantId || !usuarioId || !titulo) return;

  try {
    await prisma.notificacao.create({
      data: {
        tenant_id: tenantId,
        usuario_id: usuarioId,
        titulo,
        mensagem,
        link: pedido.link || null,
        icone: pedido.icone || 'bell',
        urgente: pedido.urgente || false
      }
    });
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message : String(erro);
    console.error('⚠️  [NOTIFICAÇÃO] não foi possível guardar o aviso (ignorado):', texto);
  }
}

export interface FiltroDaLista {
  usuarioId: string;
  apenasNaoLidas?: boolean;
  limite?: number;
  /** `criado_em` do último item da página anterior. */
  antesDe?: Date;
}

/** Teto por página. Sem ele, `?limite=999999` vira dump da tabela. */
const LIMITE_MAXIMO = 50;
const LIMITE_PADRAO = 20;

/** As notificações da pessoa, mais novas primeiro, paginadas por cursor de data. */
export async function listar({ usuarioId, apenasNaoLidas, limite, antesDe }: FiltroDaLista) {
  const where: Prisma.NotificacaoWhereInput = { usuario_id: usuarioId };
  if (apenasNaoLidas) where.lida = false;
  if (antesDe) where.criado_em = { lt: antesDe };

  const tamanho = Math.min(Math.max(Number(limite) || LIMITE_PADRAO, 1), LIMITE_MAXIMO);

  const notificacoes = await prisma.notificacao.findMany({
    where,
    orderBy: { criado_em: 'desc' },
    take: tamanho
  });

  return {
    notificacoes,
    // O cursor é a data do último item: com `take` cheio, ainda pode haver mais.
    proximoCursor: notificacoes.length === tamanho
      ? notificacoes[notificacoes.length - 1].criado_em.toISOString()
      : null
  };
}

/** Quantas ainda não foram lidas. É o número do sino. */
export async function contarNaoLidas(usuarioId: string): Promise<number> {
  return prisma.notificacao.count({ where: { usuario_id: usuarioId, lida: false } });
}


/**
 * Marca uma como lida.
 *
 * O `usuario_id` entra no `where` da própria escrita, e não numa checagem
 * antes: assim ninguém marca como lida a notificação de outra pessoa, mesmo
 * conhecendo o id.
 */
export async function marcarComoLida(usuarioId: string, id: string): Promise<boolean> {
  const { count } = await prisma.notificacao.updateMany({
    where: { id, usuario_id: usuarioId, lida: false },
    data: { lida: true, lida_em: new Date() }
  });
  return count > 0;
}

/** Marca todas as pendentes da pessoa. Devolve quantas mudaram. */
export async function marcarTodasComoLidas(usuarioId: string): Promise<number> {
  const { count } = await prisma.notificacao.updateMany({
    where: { usuario_id: usuarioId, lida: false },
    data: { lida: true, lida_em: new Date() }
  });
  return count;
}
