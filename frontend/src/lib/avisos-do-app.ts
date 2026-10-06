import { suportaPush } from './push'

/**
 * Recado curto do próprio aplicativo, não do servidor.
 *
 * São coisas que o navegador ou o aparelho impõem e que a pessoa precisa saber
 * ("suas notificações estão bloqueadas"), mas que não são evento de
 * atendimento. Até 31/08/2026 o único recado assim era desenhado como uma
 * faixa amarela no meio da home, empurrando o conteúdo para baixo em toda
 * visita. Agora ele mora atrás do sino, junto do resto.
 *
 * Não é notificação do servidor: nada aqui vai para o banco nem some quando
 * alguém "marca como lida". O recado existe enquanto a condição existir, e
 * desaparece sozinho quando ela deixa de valer.
 */
export interface AvisoDoApp {
  id: string
  titulo: string
  mensagem: string
  /** Rota interna para onde o recado leva, quando há o que fazer na tela. */
  para?: string
  textoDaAcao?: string
}

/** Disparado quando algo pode ter mudado a lista (ex.: o pedido de permissão terminou). */
const EVENTO = 'avisos-do-app:mudou'

/**
 * A lista de agora. É calculada na hora, lendo o estado real do navegador, em
 * vez de guardada: permissão de notificação muda pelas configurações do site,
 * fora do aplicativo, e um valor em memória ficaria mentindo até o próximo F5.
 */
export function avisosDoApp(): AvisoDoApp[] {
  const avisos: AvisoDoApp[] = []

  if (suportaPush() && Notification.permission === 'denied') {
    avisos.push({
      id: 'push-bloqueado',
      titulo: 'Notificações bloqueadas',
      mensagem: 'Você não vai ser avisado quando o veterinário aceitar, estiver a caminho ou finalizar. Libere as notificações nas permissões do site, no cadeado ao lado do endereço.'
    })
  }

  return avisos
}

/** Avisa a interface de que a lista pode ter mudado. */
export function avisarMudancaDeAvisos(): void {
  window.dispatchEvent(new Event(EVENTO))
}

/** Escuta mudanças na lista. Devolve a função que cancela a escuta. */
export function assinarAvisosDoApp(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO, aoMudar)
  // A permissão pode ser liberada nas configurações do navegador, com o
  // aplicativo aberto atrás: ao voltar para a aba, conferimos de novo.
  document.addEventListener('visibilitychange', aoMudar)

  return () => {
    window.removeEventListener(EVENTO, aoMudar)
    document.removeEventListener('visibilitychange', aoMudar)
  }
}
