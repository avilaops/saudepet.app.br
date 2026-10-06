import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * As três telas de apresentação.
 *
 * O aplicativo ia do site direto para o login: quem instalava o Saúde Pet na
 * tela inicial e abria não recebia nenhuma explicação do que a plataforma faz.
 *
 * Três telas, não sete, e com "pular" à vista desde a primeira: onboarding é
 * cortesia, não pedágio. Quem já sabe o que veio fazer não pode ser obrigado a
 * ler propaganda antes de pedir socorro.
 */

const CHAVE = 'saudepet_onboarding_visto'

const TELAS = [
  {
    emoji: '🏠',
    titulo: 'Veterinário onde seu pet estiver',
    texto:
      'Você pede pelo aplicativo e o profissional vai até você. Sem transporte, sem sala de espera, sem o estresse da viagem para um animal que já não está bem.'
  },
  {
    emoji: '🩺',
    titulo: 'Profissionais verificados',
    texto:
      'Todo veterinário passa por conferência de CRMV e documentos antes de atender. Você vê o nome, o registro e as avaliações de quem vai receber em casa.'
  },
  {
    emoji: '📋',
    titulo: 'Tudo fica registrado',
    texto:
      'Receita, prontuário, vacinas e fotos ficam no aplicativo, presos ao seu pet. Quem atender da próxima vez lê o histórico inteiro — inclusive outro profissional.'
  }
]

/** Quem já viu não vê de novo. */
export function onboardingJaVisto(): boolean {
  try {
    return localStorage.getItem(CHAVE) === 'sim'
  } catch {
    // Navegador com armazenamento bloqueado: mostrar de novo é melhor do que
    // quebrar a abertura do app.
    return false
  }
}

function marcarComoVisto() {
  try {
    localStorage.setItem(CHAVE, 'sim')
  } catch {
    /* sem armazenamento, vale a sessão */
  }
}

export default function OnboardingTutor() {
  const navigate = useNavigate()
  const [indice, setIndice] = useState(0)

  const sair = () => {
    marcarComoVisto()
    navigate('/login', { replace: true })
  }

  const tela = TELAS[indice]
  const ultima = indice === TELAS.length - 1

  return (
    <div className="container-app flex min-h-dvh flex-col bg-surface-page px-6 py-8">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={sair}
          className="text-[0.8rem] font-semibold text-slate-400 transition hover:text-slate-600"
        >
          Pular
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="text-[3.5rem]" role="img" aria-hidden="true">{tela.emoji}</span>

        <h1 className="mt-6 text-[1.35rem] font-semibold leading-tight tracking-tight text-ink">
          {tela.titulo}
        </h1>

        <p className="mt-3 max-w-sm text-[0.9rem] leading-relaxed text-slate-500">
          {tela.texto}
        </p>
      </div>

      <div className="mb-6 flex justify-center gap-2" role="tablist" aria-label="Passos">
        {TELAS.map((_, posicao) => (
          <button
            key={posicao}
            type="button"
            role="tab"
            aria-selected={posicao === indice}
            aria-label={`Tela ${posicao + 1} de ${TELAS.length}`}
            onClick={() => setIndice(posicao)}
            className={`h-2 rounded-full transition-all ${posicao === indice ? 'w-6 bg-primary' : 'w-2 bg-slate-300'}`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => (ultima ? sair() : setIndice(indice + 1))}
        className="w-full rounded-2xl bg-primary px-4 py-4 text-[0.9rem] font-semibold text-white transition hover:opacity-90"
      >
        {ultima ? 'Começar' : 'Continuar'}
      </button>
    </div>
  )
}
