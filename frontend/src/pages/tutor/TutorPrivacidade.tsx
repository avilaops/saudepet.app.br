import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import TrocarSenha from '../../components/TrocarSenha'
import { Icon, PageHeader, Panel } from '../../components/ui/AppKit'

// Privacidade e conta.
//
// A Política de Privacidade do produto promete acesso, portabilidade e exclusão
// dos dados (LGPD, art. 18) — e não existia NENHUM endpoint nem tela para nada
// disso: quem escrevesse para o `sac@` dependia de alguém abrir o banco à mão.
// Trocar a senha estando logado também não existia em lugar nenhum, embora a
// rota estivesse pronta.

export default function TutorPrivacidade() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [baixando, setBaixando] = useState(false)
  const [pendencias, setPendencias] = useState<ApiPayload | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [form, setForm] = useState<ApiPayload>({ senha: '', motivo: '', entendi: false })
  const [encerrando, setEncerrando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregarPendencias = useCallback(async () => {
    try {
      const { data } = await api.get('/v1/users/minha-conta/pendencias')
      setPendencias(data)
    } catch {
      // A tela continua útil sem isto — o backend recusa de novo na hora do
      // encerramento, com a mesma mensagem.
    }
  }, [])
  useEffect(() => { carregarPendencias() }, [carregarPendencias])

  const baixarDados = async () => {
    setBaixando(true)
    setErro('')
    try {
      const resposta = await api.get('/v1/users/meus-dados', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([resposta.data], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `saudepet-meus-dados-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      window.URL.revokeObjectURL(url)
      setAviso('Arquivo gerado. Ele está na pasta de downloads do seu aparelho.')
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível gerar o arquivo agora.')
    } finally {
      setBaixando(false)
    }
  }

  const encerrar = async () => {
    setEncerrando(true)
    setErro('')
    try {
      await api.post('/v1/users/minha-conta/encerrar', {
        senha: form.senha,
        motivo: form.motivo.trim() || undefined
      })
      // A sessão já foi derrubada no servidor; limpar aqui evita a tela seguinte
      // piscar com dados de uma conta que não existe mais.
      logout()
      navigate('/', { replace: true })
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível encerrar a conta.')
      setEncerrando(false)
    }
  }

  const bloqueado = pendencias && pendencias.pode_encerrar === false

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader
        title="Privacidade e conta"
        subtitle="Seus dados e sua senha"
        onBack={() => navigate('/tutor/perfil')}
      />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {erro && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">{erro}</p>
        )}
        {aviso && (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[0.78rem] text-emerald-700" role="status">{aviso}</p>
        )}

        <TrocarSenha />

        <Panel className="px-4 py-4">
          <h3 className="text-[0.9rem] font-semibold text-ink">Baixar meus dados</h3>
          <p className="mt-1.5 text-[0.75rem] leading-relaxed text-slate-500">
            Um arquivo com tudo o que guardamos sobre você: seu cadastro, seus pets, os atendimentos, as mensagens,
            os pagamentos e os lembretes. É seu direito pela Lei Geral de Proteção de Dados.
          </p>
          <button
            type="button"
            onClick={baixarDados}
            disabled={baixando}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-[0.82rem] font-semibold text-ink transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Icon name="clipboard" size={16} />
            {baixando ? 'Preparando…' : 'Baixar meus dados'}
          </button>
        </Panel>

        <Panel className="border-red-100 px-4 py-4">
          <h3 className="text-[0.9rem] font-semibold text-red-600">Encerrar minha conta</h3>
          <p className="mt-1.5 text-[0.75rem] leading-relaxed text-slate-500">
            Seus dados pessoais — nome, e-mail, telefone, endereço e fotos — são apagados e você perde o acesso ao
            aplicativo. <strong>Não tem volta.</strong>
          </p>
          <p className="mt-2 rounded-2xl bg-slate-50 px-3.5 py-3 text-[0.72rem] leading-relaxed text-slate-500">
            O histórico clínico dos seus pets (vacinas, alergias, prontuários) e os registros de pagamento continuam
            guardados sem ligação com você: são documentos que a lei obriga a manter, e apagar o histórico de vacina
            de um animal pode custar caro num atendimento futuro.
          </p>

          {bloqueado && (
            <ul className="mt-3 space-y-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.75rem] text-amber-800">
              {pendencias.impedimentos.map((item: ApiPayload) => <li key={item}>{item}</li>)}
            </ul>
          )}

          {!confirmando ? (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={bloqueado}
              className="mt-3 w-full rounded-2xl border border-red-200 px-4 py-3 text-[0.82rem] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40"
            >
              Quero encerrar minha conta
            </button>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-400">Confirme sua senha</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  className="input mt-1.5 text-[0.85rem]"
                />
              </label>

              <label className="block">
                <span className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-400">Por que está saindo? (opcional)</span>
                <textarea
                  rows={2}
                  value={form.motivo}
                  onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                  className="input mt-1.5 resize-none text-[0.85rem]"
                  placeholder="Ajuda a gente a melhorar"
                />
              </label>

              <label className="flex items-start gap-2.5 text-[0.75rem] leading-relaxed text-slate-600">
                <input
                  type="checkbox"
                  checked={form.entendi}
                  onChange={(e) => setForm({ ...form, entendi: e.target.checked })}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                Entendi que meus dados pessoais serão apagados e que não é possível recuperar a conta depois.
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setConfirmando(false); setForm({ senha: '', motivo: '', entendi: false }) }}
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-[0.82rem] font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={encerrar}
                  disabled={!form.entendi || !form.senha || encerrando}
                  className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:bg-red-700 disabled:opacity-40"
                >
                  {encerrando ? 'Encerrando…' : 'Encerrar conta'}
                </button>
              </div>
            </div>
          )}
        </Panel>

        <button
          type="button"
          onClick={() => navigate('/privacidade')}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-[0.8rem] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Ler a Política de Privacidade
        </button>
      </div>

      <TutorBottomNav />
    </div>
  )
}
