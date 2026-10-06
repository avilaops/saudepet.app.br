import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * O "Entrar" que pergunta quem está entrando.
 *
 * Tutor e veterinário usam o mesmo aplicativo, mas fazem coisas opostas: um
 * pede socorro para o próprio animal, o outro está de plantão esperando
 * chamado. Mandar os dois para a mesma porta obriga cada um a se localizar
 * sozinho depois de entrar.
 *
 * ── O que isto NÃO é ──────────────────────────────────────────────────────
 *
 * Não é uma trava. A escolha aqui é só apresentação: quem entra pela porta do
 * tutor e tem conta de veterinário continua caindo na área do veterinário,
 * porque o destino depois do login vem do `tipo_usuario` real, e não daqui.
 *
 * Isso é obrigatório e não é detalhe: o produto aceita de propósito que o
 * veterinário seja também tutor, já que ele tem pet em casa. Se esta escolha
 * virasse trava, essa pessoa ficaria de fora da própria conta.
 *
 * ── Por que aqui e não em outro domínio ───────────────────────────────────
 *
 * Separar em `vet.` e `tutor.` daria duas origens, e o token vive em
 * `localStorage`, que é por origem: quem é veterinário e tutor logaria duas
 * vezes. Duas portas no mesmo domínio entregam a mesma clareza sem esse custo,
 * e deixam o caminho pronto para dois aplicativos nas lojas, cada um abrindo
 * na sua porta.
 */
export default function MenuDeEntrada({ aoNavegar }: { aoNavegar?: () => void }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return

    const aoClicarFora = (evento: MouseEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false)
    }
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false)
    }

    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  const fechar = () => {
    setAberto(false)
    aoNavegar?.()
  }

  return (
    <div className="entrada-menu" ref={caixa}>
      <button
        type="button"
        className="nav-cta"
        aria-expanded={aberto}
        aria-haspopup="menu"
        onClick={() => setAberto((valor) => !valor)}
      >
        Entrar
      </button>

      {aberto && (
        <div className="entrada-menu__lista" role="menu">
          <Link role="menuitem" to="/login?perfil=tutor" onClick={fechar}>
            <strong>Sou tutor</strong>
            <span>Cuidar do meu pet</span>
          </Link>
          <Link role="menuitem" to="/login?perfil=veterinario" onClick={fechar}>
            <strong>Sou veterinário</strong>
            <span>Atender e receber chamados</span>
          </Link>
        </div>
      )}
    </div>
  )
}
