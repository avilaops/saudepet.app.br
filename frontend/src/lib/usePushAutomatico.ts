import { useEffect } from 'react'
import api from '../services/api'
import { ativarPush, suportaPush } from './push'
import { avisarMudancaDeAvisos } from './avisos-do-app'

const CHAVE_TENTATIVA = 'push-tentativa-automatica'

/**
 * Notificação é padrão, não convite.
 *
 * Até 28/08/2026 uma faixa perguntava "Ative as notificações" e esperava um
 * toque. Isso está errado para o que o Saúde Pet faz: o tutor precisa saber
 * que o veterinário aceitou, que está a caminho e que finalizou — e a maior
 * parte das pessoas nunca toca em banner nenhum. Quem dispensasse ficava sem
 * aviso justamente durante um atendimento do próprio animal.
 *
 * A ativação é tentada sozinha, uma vez por navegador, assim que a tela abre.
 * Sem faixa, sem botão, sem "agora não".
 *
 * ── O limite que o navegador impõe ────────────────────────────────────────
 *
 * `Notification.requestPermission()` só pode ser concedido pelo próprio
 * usuário: o navegador abre o diálogo dele e nós não temos como responder.
 * "Deixar sempre ativado" no código significa PEDIR sempre que possível, não
 * conceder — não existe API que dispense o diálogo.
 *
 * Chrome e Firefox aceitam a chamada sem gesto do usuário; Safari (iOS
 * incluído) exige que ela nasça de um toque, então lá a tentativa automática
 * falha em silêncio como 'adiado' — e nós não insistimos, porque insistir sem
 * gesto não muda o resultado e o iOS ainda exige a PWA instalada.
 *
 * ── Quando a pessoa fica sabendo ──────────────────────────────────────────
 *
 * Só quando o navegador BLOQUEIA. Aí não há o que tentar de novo em código: a
 * pessoa precisa liberar nas permissões do site, e ela merece saber que está
 * sem aviso. Isso vira um recado atrás do sino (`avisos-do-app`), em vez de
 * uma faixa ocupando a home em toda visita. Este hook não desenha nada.
 */
export function usePushAutomatico(): void {
  useEffect(() => {
    if (!suportaPush()) return

    // Já bloqueado de antes: nada a tentar, mas o sino precisa mostrar o recado.
    if (Notification.permission === 'denied') {
      avisarMudancaDeAvisos()
      return
    }
    if (Notification.permission !== 'default') return

    // Uma tentativa por navegador. Sem isso, quem fechou o diálogo do
    // navegador veria ele reabrir a cada visita — e o Chrome pune site que
    // insiste, passando a bloquear o pedido sem nem mostrar.
    if (localStorage.getItem(CHAVE_TENTATIVA)) return

    let vigente = true

    // Só tenta se o backend tiver push configurado; sem as chaves VAPID a
    // permissão seria pedida para guardar uma inscrição que ninguém usa.
    api.get('/v1/push/vapid-public-key')
      .then(async () => {
        if (!vigente) return
        localStorage.setItem(CHAVE_TENTATIVA, '1')

        const resultado = await ativarPush()
        if (!vigente) return
        if (!resultado.ok && resultado.motivo === 'negado') avisarMudancaDeAvisos()
      })
      .catch(() => {})

    return () => { vigente = false }
  }, [])
}

export default usePushAutomatico
