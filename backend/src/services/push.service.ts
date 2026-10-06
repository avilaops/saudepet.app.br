import webpush from 'web-push';
import prisma from '../config/database';
import { registrar as registrarNoHistorico } from './notificacao-usuario.service';

/**
 * Web Push (PWA) — o canal que alcança quem está com o app fechado.
 *
 * É o que separa "o veterinário aceitou" de "o veterinário aceitou e o tutor
 * ficou sabendo": socket só fala com quem está com a tela aberta.
 *
 * Mesmo padrão da integração Meta: sem as chaves VAPID no ambiente
 * (`WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY`) tudo aqui fica
 * inerte e responde "não configurado" em vez de quebrar. As chaves são geradas
 * uma única vez com `npx web-push generate-vapid-keys`.
 */

const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || null;
const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || null;
const subject = process.env.WEB_PUSH_CONTACT || 'mailto:contato@saudepet.app.br';

let configurado = false;
if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configurado = true;
}

export function estaConfigurado(): boolean {
  return configurado;
}

export function chavePublica(): string | null {
  return publicKey;
}

/** O que o navegador entrega ao se inscrever. */
export type InscricaoDoNavegador = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export type PedidoDeInscricao = {
  tenantId: string;
  usuarioId: string;
  subscription?: InscricaoDoNavegador | null;
  userAgent?: string | null;
};

/**
 * Guarda (ou atualiza) a inscrição de um navegador.
 *
 * O `endpoint` identifica o NAVEGADOR, não a pessoa — por isso o upsert por
 * ele: se alguém entrar com outra conta no mesmo aparelho, a inscrição migra
 * para o usuário atual em vez de mandar os avisos de um para o outro.
 */
export async function salvarInscricao({ tenantId, usuarioId, subscription, userAgent }: PedidoDeInscricao) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    const erro = new Error('Inscrição de push inválida') as Error & { statusCode?: number };
    erro.statusCode = 400;
    throw erro;
  }

  return prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { tenant_id: tenantId, usuario_id: usuarioId, p256dh, auth, user_agent: userAgent || null },
    create: { tenant_id: tenantId, usuario_id: usuarioId, endpoint, p256dh, auth, user_agent: userAgent || null }
  });
}

/** Só apaga a inscrição SE ela for do próprio usuário — o endpoint vem do cliente. */
export async function removerInscricao({ usuarioId, endpoint }: { usuarioId: string; endpoint?: string | null }) {
  if (!endpoint) return { count: 0 };
  return prisma.pushSubscription.deleteMany({ where: { endpoint, usuario_id: usuarioId } });
}

/**
 * `ttlSegundos` é o prazo de validade do aviso no servidor do navegador.
 *
 * Uma hora serve para "seu atendimento foi finalizado", que continua verdadeiro
 * depois. NÃO serve para "chamada recebida": um telefone tocando 40 minutos
 * depois não é aviso atrasado, é aviso FALSO — a pessoa abre e não há ninguém
 * do outro lado. Aviso com validade curta simplesmente não é entregue quando o
 * aparelho volta tarde, que é o comportamento certo.
 */
export type Aviso = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  ttlSegundos?: number;

  // ── Histórico ───────────────────────────────────────────────────────────
  // Todo aviso enviado daqui também vira linha na central de notificações da
  // pessoa. Estes campos só afinam como ele aparece lá.
  icone?: string;
  urgente?: boolean;
  /**
   * Some da central. Para aviso que só faz sentido no instante em que toca e
   * cuja permanência atrapalha — a chamada de vídeo chamando, por exemplo.
   */
  semHistorico?: boolean;
};

/** Uma hora: bom para status, péssimo para chamada. */
const TTL_PADRAO_SEG = 60 * 60;

/**
 * Envia para todos os aparelhos do usuário, em melhor esforço.
 *
 * Falha de rede não propaga: push é aviso, e nenhum fluxo do produto pode
 * depender dele para concluir. Inscrição morta (404/410 do provedor) é apagada
 * na hora — o navegador desinstalou o app ou revogou a permissão, e insistir
 * só faria a tabela crescer com endereços que nunca mais respondem.
 */
export async function enviarParaUsuario(
  usuarioId: string,
  { title, body, url = '/', tag, ttlSegundos = TTL_PADRAO_SEG, icone, urgente, semHistorico }: Aviso
): Promise<{ enviados: number }> {
  if (!usuarioId) return { enviados: 0 };

  const inscricoes = configurado
    ? await prisma.pushSubscription.findMany({ where: { usuario_id: usuarioId } })
    : [];

  // O histórico vem ANTES de qualquer desistência, e é o que separa esta
  // função de um envio puro. Sem VAPID no ambiente, sem aparelho inscrito ou
  // com a permissão bloqueada no navegador não há push para entregar — e é
  // justamente aí que a pessoa mais precisa achar o aviso depois, na central.
  // Guardar só quando o push sai daria um histórico que some quando falha.
  if (!semHistorico) {
    // Melhor esforço de ponta a ponta: nem a busca do tenant nem a gravação
    // podem derrubar quem chamou. Push é aviso, e nenhum fluxo do produto
    // pode falhar porque o histórico falhou.
    try {
      // A inscrição já carrega o tenant. Só quando não há aparelho inscrito
      // é que vale uma consulta a mais — e é justamente o caso em que o
      // histórico é a única forma de a pessoa ficar sabendo.
      const tenantId = inscricoes[0]?.tenant_id
        || (await prisma.usuario.findUnique({
          where: { id: usuarioId },
          select: { tenant_id: true }
        }))?.tenant_id;

      if (tenantId) {
        await registrarNoHistorico({
          tenantId,
          usuarioId,
          titulo: title,
          mensagem: body,
          link: url === '/' ? null : url,
          icone,
          urgente
        });
      }
    } catch (erro) {
      const texto = erro instanceof Error ? erro.message : String(erro);
      console.error('⚠️  [NOTIFICAÇÃO] histórico não gravado (ignorado):', texto);
    }
  }

  if (!inscricoes.length) return { enviados: 0 };

  const payload = JSON.stringify({ title, body, url, tag });
  let enviados = 0;

  await Promise.all(
    inscricoes.map(async (inscricao: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
          payload,
          { TTL: ttlSegundos }
        );
        enviados += 1;
      } catch (erro) {
        const status = (erro as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: inscricao.id } }).catch(() => {});
        } else {
          const mensagem = erro instanceof Error ? erro.message : String(erro);
          console.error('⚠️  Push não entregue:', status || mensagem);
        }
      }
    })
  );

  return { enviados };
}

module.exports = {
  estaConfigurado,
  chavePublica,
  salvarInscricao,
  removerInscricao,
  enviarParaUsuario
};
