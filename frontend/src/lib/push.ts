import api from '../services/api'

// Helpers de Web Push compartilhados pela ativação automática
// (usePushAutomatico) e pelas preferências de notificação do perfil.

export function suportaPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function base64ParaUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalizado = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const bruto = window.atob(normalizado)
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)))
}

export async function inscricaoAtual(): Promise<PushSubscription | null> {
  if (!suportaPush()) return null
  const registro = await navigator.serviceWorker.ready
  return registro.pushManager.getSubscription()
}

/** Pede permissão, inscreve o navegador e registra no backend. */
/**
 * Liga as notificações neste navegador.
 *
 * Devolve `{ ok, motivo }` em vez de um booleano seco. O booleano era o
 * problema: quem chamava não tinha como distinguir "a pessoa negou" de "o
 * service worker não estava pronto" de "o servidor recusou a inscrição" — e
 * acabava tratando tudo como sucesso silencioso.
 *
 * Só devolve `ok: true` depois que o BACKEND confirmou a inscrição. Assinar no
 * navegador e não conseguir gravar no servidor é o pior desfecho possível: o
 * navegador acha que está inscrito, o servidor não sabe que existe, e nenhum
 * aviso chega para sempre.
 */
export type ResultadoAtivacaoPush =
  | { ok: true }
  | { ok: false; motivo: 'sem-suporte' | 'negado' | 'adiado' }
  | { ok: false; motivo: 'falhou'; erro: unknown }

export async function ativarPush(): Promise<ResultadoAtivacaoPush> {
  if (!suportaPush()) return { ok: false, motivo: 'sem-suporte' }

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') {
    return { ok: false, motivo: permissao === 'denied' ? 'negado' : 'adiado' }
  }

  try {
    const { data } = await api.get('/v1/push/vapid-public-key')
    const registro = await navigator.serviceWorker.ready
    const subscription = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ParaUint8Array(data.publicKey)
    })
    await api.post('/v1/push/subscribe', { subscription })
    return { ok: true }
  } catch (erro) {
    console.error('[PUSH] Inscrição não concluída:', erro)
    return { ok: false, motivo: 'falhou', erro }
  }
}

/**
 * Este aparelho está inscrito DE VERDADE — isto é, no servidor?
 *
 * `inscricaoAtual()` responde pelo navegador, e o navegador diz "sim" desde o
 * instante em que `subscribe()` roda. Se o POST para o backend falhou logo
 * depois, as duas pontas discordam: a tela mostra "ativo" e nenhum aviso
 * chega. Quem sabe a verdade é quem envia.
 */
export async function inscricaoConfirmada() {
  const inscricao = await inscricaoAtual().catch(() => null)
  if (!inscricao) return false

  try {
    const { data } = await api.get('/v1/push/inscricao', { params: { endpoint: inscricao.endpoint } })
    return Boolean(data?.inscrito)
  } catch {
    // Sem resposta do servidor, não afirmamos que está ativo.
    return false
  }
}

/** Desfaz a inscrição no navegador e no backend. */
export async function desativarPush() {
  const subscription = await inscricaoAtual()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await api.delete('/v1/push/subscribe', { data: { endpoint } }).catch(() => {})
}

/**
 * O aparelho passa a pertencer a QUEM ESTÁ LOGADO AGORA.
 *
 * O `endpoint` identifica o navegador, não a pessoa, e ninguém o reapresentava
 * ao servidor depois da primeira vez. Num aparelho dividido — a recepção da
 * clínica, o telefone de casa — a inscrição continuava amarrada à conta
 * anterior: quem entrava depois recebia, na tela de bloqueio, os avisos de
 * outra pessoa. Num aplicativo de saúde isso não é aviso trocado, é dado
 * clínico e financeiro entregue a quem não é o dono.
 *
 * O `upsert` por endpoint no backend já sabia migrar a inscrição; faltava
 * alguém pedir. Roda na entrada e na volta da sessão, calada e em melhor
 * esforço: é reparo, não uma funcionalidade que a pessoa acionou.
 *
 * Não pede permissão nem inscreve ninguém: sem permissão concedida e sem
 * inscrição viva no navegador, não há nada para reassociar e a função sai.
 */
export async function sincronizarInscricao() {
  if (!suportaPush() || Notification.permission !== 'granted') return

  const inscricao = await inscricaoAtual().catch(() => null)
  if (!inscricao) return

  await api.post('/v1/push/subscribe', { subscription: inscricao }).catch(() => {})
}

/**
 * Sair da conta desliga as notificações DESTE aparelho.
 *
 * O contrário de reassociar, para o caminho em que dá tempo de fazer direito:
 * quem saiu não deve continuar recebendo, e o próximo a entrar aqui começa sem
 * herdar inscrição de ninguém. `sincronizarInscricao` cobre a saída suja — aba
 * fechada, sessão expirada — onde este código nunca chega a rodar.
 *
 * O token é lido na PRIMEIRA linha, antes de qualquer `await`: o interceptor do
 * `api` busca o token no `localStorage` na hora de montar a requisição, e nessa
 * altura o `limparSessao()` do logout — síncrono, logo em seguida — já o apagou.
 * A inscrição precisa morrer com a sessão que a criou, então o cabeçalho vai
 * explícito.
 */
export async function encerrarInscricaoDoDispositivo() {
  const token = localStorage.getItem('token')

  const inscricao = await inscricaoAtual().catch(() => null)
  if (!inscricao) return

  const endpoint = inscricao.endpoint
  await inscricao.unsubscribe().catch(() => {})
  if (!token) return

  await api
    .delete('/v1/push/subscribe', {
      data: { endpoint },
      headers: { Authorization: `Bearer ${token}` }
    })
    .catch(() => {})
}
