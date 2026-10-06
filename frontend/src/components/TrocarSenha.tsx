import type { ApiPayload } from '../types/api'
import { useState } from 'react'
import api from '../services/api'

/**
 * Trocar a senha estando logado.
 *
 * `POST /auth/change-password` existe há tempo e NENHUMA tela do produto o
 * expunha: quem quisesse trocar a senha precisava sair da conta, clicar em
 * "esqueci minha senha" e esperar um e-mail — para uma operação que a pessoa
 * já está autenticada para fazer.
 *
 * Usado pelo tutor e pelo veterinário, por isso só Tailwind: os dois lados têm.
 */
export default function TrocarSenha({ className = '' }) {
  const [form, setForm] = useState<ApiPayload>({ senha_atual: '', senha_nova: '', confirmacao: '' })
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const trocar = async (event: any) => {
    event.preventDefault()
    setErro('')
    setSucesso('')

    if (form.senha_nova !== form.confirmacao) {
      return setErro('A confirmação não confere com a senha nova.')
    }
    if (form.senha_nova.length < 6) {
      return setErro('A senha nova precisa ter pelo menos 6 caracteres.')
    }
    if (form.senha_nova === form.senha_atual) {
      return setErro('A senha nova precisa ser diferente da atual.')
    }

    setEnviando(true)
    try {
      await api.post('/auth/change-password', {
        senha_atual: form.senha_atual,
        senha_nova: form.senha_nova
      })
      setForm({ senha_atual: '', senha_nova: '', confirmacao: '' })
      // O backend derruba as outras sessões ao trocar a senha — dizer isso evita
      // o susto de ver o app do tablet pedindo login de novo.
      setSucesso('Senha alterada. Os outros aparelhos onde você estava logado precisarão entrar de novo.')
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível alterar a senha.')
    } finally {
      setEnviando(false)
    }
  }

  const campo = 'mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[0.85rem] text-slate-800 outline-none transition focus:border-primary focus:bg-white'
  const rotulo = 'text-[0.68rem] font-bold uppercase tracking-wider text-slate-400'

  return (
    <form
      onSubmit={trocar}
      className={`rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm ${className}`}
    >
      <h3 className="text-[0.9rem] font-semibold text-slate-900">Trocar senha</h3>
      <p className="mt-1 text-[0.75rem] leading-relaxed text-slate-500">
        Escolha uma senha que você lembre e que ninguém adivinhe.
      </p>

      {erro && (
        <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">
          {erro}
        </p>
      )}
      {sucesso && (
        <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[0.78rem] text-emerald-700" role="status">
          {sucesso}
        </p>
      )}

      <label className="mt-3 block">
        <span className={rotulo}>Senha atual</span>
        <input
          type="password"
          autoComplete="current-password"
          value={form.senha_atual}
          onChange={(e) => setForm({ ...form, senha_atual: e.target.value })}
          className={campo}
          required
        />
      </label>

      <label className="mt-3 block">
        <span className={rotulo}>Senha nova</span>
        <input
          type="password"
          autoComplete="new-password"
          value={form.senha_nova}
          onChange={(e) => setForm({ ...form, senha_nova: e.target.value })}
          className={campo}
          minLength={6}
          required
        />
      </label>

      <label className="mt-3 block">
        <span className={rotulo}>Repita a senha nova</span>
        <input
          type="password"
          autoComplete="new-password"
          value={form.confirmacao}
          onChange={(e) => setForm({ ...form, confirmacao: e.target.value })}
          className={campo}
          minLength={6}
          required
        />
      </label>

      <button
        type="submit"
        disabled={enviando}
        className="mt-4 w-full rounded-2xl bg-primary px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {enviando ? 'Alterando…' : 'Alterar senha'}
      </button>
    </form>
  )
}
