/**
 * Duas pessoas estão ligadas por um atendimento?
 *
 * É a regra que decide quem pode falar com quem no produto, e ela vive aqui
 * porque tem DOIS donos: o chat (quem pode mandar mensagem) e o perfil (quem
 * pode ver com quem está falando). Estava escrita só dentro do controller de
 * mensagens, e a segunda cópia — no perfil — simplesmente não existia: o
 * veterinário abria a conversa com o tutor que estava atendendo e batia num
 * 403 com o campo de mensagem desabilitado.
 *
 * Vale nos dois sentidos e em QUALQUER status, inclusive encerrado: quem se
 * atendeu mês passado continua podendo abrir a conversa para tirar dúvida do
 * que foi dito. Cortar no fim da consulta transformaria o histórico do chat
 * numa tela de erro.
 *
 * A checagem é pelo VÍNCULO (`tutor_id` e `veterinario.usuario_id`), nunca
 * pelo `tipo_usuario`: desde 26/08/2026 o veterinário também pode ser tutor do
 * próprio pet, e naquele atendimento ele é o tutor.
 */
import prisma from '../config/database';

/**
 * `tutorId` e `veterinarioUsuarioId` respondem QUEM É QUEM naquele atendimento,
 * não só que as duas pessoas se conhecem.
 *
 * Quem tinha essa pergunta era o aviso de mensagem nova, e ele a respondia pelo
 * `tipo_usuario` de quem enviou — exatamente o critério que o cabeçalho deste
 * arquivo diz para não usar. Sem os dois campos aqui, quem chama não tem como
 * fazer diferente.
 */
export type Vinculo = {
  id: string;
  status: string;
  tutorId: string;
  veterinarioUsuarioId: string | null;
} | null;

export async function buscarVinculoProfissional(
  tenantId: string,
  usuarioA?: string | null,
  usuarioB?: string | null
): Promise<Vinculo> {
  if (!tenantId || !usuarioA || !usuarioB || usuarioA === usuarioB) return null;

  const solicitacao = await prisma.solicitacao.findFirst({
    where: {
      tenant_id: tenantId,
      OR: [
        { tutor_id: usuarioA, veterinario: { usuario_id: usuarioB } },
        { tutor_id: usuarioB, veterinario: { usuario_id: usuarioA } }
      ]
    },
    orderBy: { criado_em: 'desc' },
    select: { id: true, status: true, tutor_id: true, veterinario: { select: { usuario_id: true } } }
  });

  if (!solicitacao) return null;

  return {
    id: solicitacao.id,
    status: solicitacao.status,
    tutorId: solicitacao.tutor_id,
    veterinarioUsuarioId: solicitacao.veterinario?.usuario_id ?? null
  };
}

module.exports = { buscarVinculoProfissional };
