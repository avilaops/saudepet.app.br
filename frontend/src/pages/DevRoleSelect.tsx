import type { ApiPayload } from '../types/api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { iniciarVisita } from '../components/FaixaDeSuporte'

const ROTULO_TIPO: Record<string, string> = { tutor: 'Tutor', veterinario: 'Veterinário' }
const AREA_DO_TIPO: Record<string, string> = { tutor: '/tutor', veterinario: '/veterinario' }

export default function DevRoleSelect() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [busca, setBusca] = useState('')
  const [usuarios, setUsuarios] = useState<ApiPayload[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [alvo, setAlvo] = useState<ApiPayload | null>(null)
  const [motivo, setMotivo] = useState('')
  const [entrando, setEntrando] = useState(false)

  const carregar = useCallback(async (termo: string) => {
    setCarregando(true)
    setErro('')
    try {
      const { data } = await api.get('/v1/admin/impersonar/usuarios', { params: { busca: termo || undefined } })
      setUsuarios(data.usuarios || [])
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar os usuários.')
    } finally {
      setCarregando(false)
    }
  }, [])

  // Busca com respiro: uma consulta por tecla digitada é desperdício dos dois
  // lados.
  //
  // Havia DOIS efeitos aqui: um chamava `carregar('')` na montagem e este
  // chamava de novo 350 ms depois, com a busca vazia. Toda abertura da tela
  // custava duas consultas idênticas — e como entrar e sair de uma visita
  // recarrega a página inteira (`window.location.replace('/dev')`), cada ciclo
  // de suporte gastava quatro. Foi assim que esta tela sozinha estourou o
  // limite de requisições e passou a mostrar "Não foi possível carregar os
  // usuários", que parecia erro de permissão e era 429.
  //
  // Agora é um efeito só: a primeira carga é imediata, as seguintes esperam.
  const primeiraCarga = useRef(true)
  useEffect(() => {
    if (primeiraCarga.current) {
      primeiraCarga.current = false
      carregar('')
      return
    }
    const timer = setTimeout(() => carregar(busca), 350)
    return () => clearTimeout(timer)
  }, [busca, carregar])

  const entrar = async () => {
    setEntrando(true)
    setErro('')
    try {
      const { data } = await api.post(`/v1/admin/impersonar/${alvo.id}`, { motivo: motivo.trim() })

      iniciarVisita({
        token: data.access_token,
        usuario: data.usuario,
        // A sessão do admin fica guardada para a volta — sem isso ele teria que
        // digitar a senha de novo ao terminar cada atendimento.
        adminToken: localStorage.getItem('token'),
        adminRefresh: localStorage.getItem('refresh_token'),
        adminUsuario: user
      })

      window.location.replace(AREA_DO_TIPO[data.usuario.tipo_usuario] || '/')
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível iniciar a visita.')
      setEntrando(false)
    }
  }

  return (
    <div className="container-app bg-surface-page min-h-screen">
      <div className="mx-auto max-w-2xl px-5 py-8">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Visita de suporte</h1>
        <p className="mt-1 text-[0.82rem] leading-relaxed text-slate-500">
          Entre na conta de um tutor ou veterinário para ver exatamente o que ele vê. A visita dura uma hora,
          fica registrada com o seu nome e mostra um aviso na tela o tempo todo.
        </p>

        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[0.8rem] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Ir para o painel administrativo
        </button>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          className="mt-5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[0.85rem] text-slate-800 outline-none transition focus:border-primary"
        />

        {erro && (
          <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">
            {erro}
          </p>
        )}

        {carregando ? (
          <p className="mt-6 text-center text-[0.8rem] font-semibold text-slate-400">Carregando…</p>
        ) : usuarios.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center text-[0.8rem] font-semibold text-slate-400">
            Nenhum usuário encontrado.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            {usuarios.map((pessoa) => (
              <li key={pessoa.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[0.88rem] font-semibold text-slate-900">{pessoa.nome}</p>
                  <p className="truncate text-[0.75rem] text-slate-500">{pessoa.email}</p>
                  <p className="mt-0.5 text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">
                    {ROTULO_TIPO[pessoa.tipo_usuario] || pessoa.tipo_usuario}
                    {pessoa.cidade ? ` · ${pessoa.cidade}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setAlvo(pessoa); setMotivo('') }}
                  className="shrink-0 rounded-xl bg-primary px-3.5 py-2 text-[0.75rem] font-bold text-white transition hover:opacity-90"
                >
                  Ver como
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {alvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-[1rem] font-bold text-slate-900">Ver como {alvo.nome}</h2>
            <p className="mt-1.5 text-[0.78rem] leading-relaxed text-slate-500">
              Você vai enxergar os dados reais desta pessoa. Trocar a senha dela e encerrar a conta ficam
              bloqueados durante a visita.
            </p>

            <label className="mt-4 block">
              <span className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-400">
                Por que precisa ver esta conta?
              </span>
              <textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: tutor relatou que o pet não aparece na lista"
                className="mt-1.5 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[0.85rem] text-slate-800 outline-none focus:border-primary focus:bg-white"
              />
            </label>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setAlvo(null)}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-[0.82rem] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={entrar}
                disabled={entrando || motivo.trim().length < 5}
                className="flex-1 rounded-2xl bg-primary px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                {entrando ? 'Entrando…' : 'Iniciar visita'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
