import type { ApiPayload } from '../types/api'
import { useEffect, useState } from 'react'
import api, { guardarSessao } from '../services/api'

/**
 * Faixa fixa durante uma visita de suporte.
 *
 * O recurso anterior ("ver como tutor/veterinário") não avisava nada: a pessoa
 * trocava de papel e o aplicativo ficava igual. Foi assim que a marca ficou
 * presa no navegador do Abraão e ele passou a entrar com a senha certa e cair
 * na página pública, sem entender por quê.
 *
 * Uma visita à conta de outra pessoa precisa ser impossível de esquecer — e ter
 * a saída sempre à mão, na tela, não escondida num menu.
 */

const CHAVE_VISITA = 'visita_suporte'

/** Guarda a sessão do admin e assume a da pessoa visitada. */
export function iniciarVisita({ token, usuario, adminToken, adminRefresh, adminUsuario }: ApiPayload) {
  localStorage.setItem(CHAVE_VISITA, JSON.stringify({
    visitado: { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo_usuario },
    admin: { token: adminToken, refresh: adminRefresh, usuario: adminUsuario }
  }))
  // A sessão de suporte não tem refresh: ela termina quando termina, e não se
  // renova sozinha no bolso de ninguém.
  guardarSessao({ token, refreshToken: null, usuario })
}

export function visitaEmCurso() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_VISITA) || 'null')
  } catch {
    return null
  }
}

export default function FaixaDeSuporte() {
  const [visita, setVisita] = useState(visitaEmCurso)
  const [saindo, setSaindo] = useState(false)

  // Outra aba pode encerrar a visita: a faixa some junto.
  useEffect(() => {
    const aoMudar = () => setVisita(visitaEmCurso())
    window.addEventListener('storage', aoMudar)
    return () => window.removeEventListener('storage', aoMudar)
  }, [])

  if (!visita) return null

  const voltar = async () => {
    setSaindo(true)
    // Registra o fim antes de trocar a sessão: depois de voltar, o token da
    // visita não existe mais para dizer que acabou.
    await api.post('/v1/admin/impersonar/sair').catch(() => {})

    localStorage.removeItem(CHAVE_VISITA)
    guardarSessao({
      token: visita.admin.token,
      refreshToken: visita.admin.refresh,
      usuario: visita.admin.usuario
    })
    // Recarga inteira: metade das telas guarda dados da pessoa visitada em
    // memória, e voltar sem recarregar deixaria retalhos das duas sessões.
    window.location.replace('/dev')
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-3 bg-amber-400 px-4 py-2 text-amber-950 shadow-md">
      <p className="min-w-0 text-[0.75rem] font-bold leading-tight">
        Visita de suporte — você está vendo o aplicativo como{' '}
        <span className="underline">{visita.visitado?.nome}</span>. Tudo que fizer fica registrado no seu nome.
      </p>
      <button
        type="button"
        onClick={voltar}
        disabled={saindo}
        className="shrink-0 rounded-lg bg-amber-950 px-3 py-1.5 text-[0.72rem] font-bold text-amber-50 transition hover:bg-amber-900 disabled:opacity-60"
      >
        {saindo ? 'Saindo…' : 'Voltar para minha conta'}
      </button>
    </div>
  )
}
