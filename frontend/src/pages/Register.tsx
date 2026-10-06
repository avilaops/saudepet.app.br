import type { ApiPayload } from '../types/api'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import BrandLogo from '../components/brand/BrandLogo'
import GoogleAuthButton from '../components/GoogleAuthButton'
import api from '../services/api'

/**
 * O cadastro pede o MÍNIMO — e o mínimo é o que o Google já entrega.
 *
 * Até 26/08/2026 esta tela pedia tipo de conta, nome, e-mail, telefone,
 * cidade, senha, confirmação de senha e, para veterinário, CRMV e
 * especialidade: nove campos antes de ver o produto. Ao lado, o botão do
 * Google criava a conta com três cliques e nenhum campo — o formulário era
 * caro exatamente para quem NÃO usa Google.
 *
 * Telefone e cidade saíram porque o app já os coleta onde importam: o
 * endereço do atendimento vem com a cidade (e com a coordenada, que é melhor)
 * e o telefone é pedido no perfil. Confirmação de senha saiu porque existe
 * "esqueci minha senha". Escolher ser veterinário saiu porque credenciamento
 * é documento, não caixinha de formulário — agora se pede de dentro da conta.
 */
const FORM_INICIAL = {
  nome: '',
  email: '',
  telefone: '',
  senha: '',
  crmv: '',
  crmv_uf: '',
  especialidade: ''
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

// (XX) XXXXX-XXXX — o backend valida o mesmo formato.
const formatarTelefone = (valor: string) => {
  const digitos = valor.replace(/\D/g, '').slice(0, 11)
  if (digitos.length <= 2) return digitos ? `(${digitos}` : ''
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`
  if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
}

export default function Register() {
  const [form, setForm] = useState(FORM_INICIAL)
  // v1.0: o veterinário se cadastra aqui mesmo, com CRMV, UF e especialidade.
  // A conta nasce pendente; a área profissional abre depois do e-mail
  // confirmado e da aprovação da equipe.
  const [perfil, setPerfil] = useState<'tutor' | 'veterinario'>('tutor')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('form') // 'form' | 'confirmacao' | 'ja_cadastrado'
  const [reenviando, setReenviando] = useState(false)
  const [reenvio, setReenvio] = useState<ApiPayload | null>(null) // { ok: boolean, texto: string }
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()

  const mudar = (campo: string) => (e: any) => {
    setForm((atual) => ({ ...atual, [campo]: e.target.value }))
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setError('')

    if (form.senha.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (perfil === 'veterinario') {
      if (!/^\(\d{2}\)\s?\d{4,5}-?\d{4}$/.test(form.telefone)) {
        setError('Informe um telefone válido, com DDD.')
        return
      }
      if (!form.crmv.trim() || !form.crmv_uf) {
        setError('Informe o número e o estado do seu CRMV.')
        return
      }
      if (form.especialidade.trim().length < 3) {
        setError('Informe sua especialidade (ex.: clínica geral).')
        return
      }
    }

    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', {
        tipo_usuario: perfil,
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        senha: form.senha,
        telefone: form.telefone || undefined,
        tenant_slug: 'saudepet',
        ...(perfil === 'veterinario' && {
          crmv: form.crmv.trim(),
          crmv_uf: form.crmv_uf,
          especialidade: form.especialidade.trim()
        })
      })

      // Quem se cadastra ENTRA. Antes esta tela mandava a pessoa para a caixa
      // de entrada antes de ver o produto — e o backend nem exigia isso:
      // `REQUIRE_EMAIL_VERIFICATION` não está ligada em produção, o cadastro
      // já devolvia um `access_token` funcionando, e quem fechasse a tela e
      // fosse direto ao /login entrava numa boa. Ou seja, o passo era
      // obrigatório na aparência e opcional na prática.
      //
      // O e-mail de verificação continua saindo; ele vira lembrete, não
      // pedágio. Quando `REQUIRE_EMAIL_VERIFICATION` for ligada, o backend
      // devolve `access_token: null` e a tela de confirmação volta sozinha.
      if (data?.access_token) {
        loginWithToken(data.access_token, data.usuario, data.refresh_token)
        navigate('/tutor', { replace: true })
        return
      }

      setStep('confirmacao')
    } catch (err: any) {
      const status = err.response?.status
      const dados = err.response?.data
      if (status === 409) {
        setStep('ja_cadastrado')
      } else if (dados?.details?.length) {
        // O middleware de validação devolve details[{field,message}].
        setError(dados.details.map((item: ApiPayload) => item.message).join(' • '))
      } else {
        setError(dados?.error || dados?.message || 'Não foi possível concluir o cadastro. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleReenviar = async () => {
    setReenviando(true)
    setReenvio(null)
    try {
      await api.post('/auth/resend-verification', {
        email: form.email.trim().toLowerCase(),
        tenant_slug: 'saudepet'
      })
      setReenvio({ ok: true, texto: 'Novo e-mail de confirmação enviado com sucesso!' })
    } catch (err: any) {
      setReenvio({ ok: false, texto: err.response?.data?.error || 'Não foi possível reenviar agora. Tente novamente em instantes.' })
    } finally {
      setReenviando(false)
    }
  }

  if (step === 'ja_cadastrado') {
    return (
      <div className="container-app">
        <div className="flex flex-col items-center justify-center min-h-screen p-6 py-10">
          <div className="w-full max-w-md card text-center p-6">
            <BrandLogo className="mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2 text-slate-800">E-mail já cadastrado</h2>
            <p className="text-slate-600 text-sm mb-4">
              O e-mail <strong>{form.email}</strong> já possui uma conta no Saúde PET.
            </p>
            <div className="flex flex-col gap-3 mt-6">
              <button onClick={() => navigate('/login')} className="btn-primary w-full py-3 font-bold">
                Fazer login com este e-mail
              </button>
              <Link to="/esqueci-senha" className="text-primary text-sm font-semibold">
                Esqueci minha senha
              </Link>
              <button onClick={() => setStep('form')} className="btn-outline w-full py-2.5 text-sm">
                Tentar outro e-mail
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'confirmacao') {
    return (
      <div className="container-app">
        <div className="flex flex-col items-center justify-center min-h-screen p-6 py-10">
          <div className="w-full max-w-md card text-center p-6">
            <BrandLogo className="mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2 text-slate-800">Confirme seu e-mail</h2>
            {perfil === 'veterinario' && (
              <p className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-3 py-2 mb-4">
                Sua conta profissional está <strong>pendente</strong>: depois de confirmar o e-mail, a equipe confere o CRMV
                e avisa quando a área do veterinário for liberada.
              </p>
            )}
            <p className="text-slate-600 text-sm mb-4">Enviamos um link de confirmação para:</p>
            <div className="bg-teal-50 border border-teal-200 text-teal-800 font-semibold py-2 px-4 rounded-xl text-sm mb-6 inline-block">
              {form.email}
            </div>
            <p className="text-slate-500 text-xs mb-6">
              Verifique sua caixa de entrada (ou a pasta de spam) e clique no link para ativar a conta.
              Depois é só entrar com o e-mail e a senha que você escolheu.
            </p>
            {reenvio && (
              <div
                className={`text-xs p-3 rounded-xl mb-4 font-semibold border ${reenvio.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}
                role="status"
              >
                {reenvio.texto}
              </div>
            )}
            <div className="flex flex-col gap-3">
              <button onClick={handleReenviar} disabled={reenviando} className="btn-outline w-full py-2.5 text-sm">
                {reenviando ? 'Reenviando…' : 'Reenviar e-mail de confirmação'}
              </button>
              <button onClick={() => navigate('/login')} className="btn-primary w-full py-3">
                Ir para o login
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container-app">
      <div className="flex flex-col items-center justify-start min-h-screen p-6 py-10">
        <div className="w-full max-w-md">
          <Link to="/login" className="text-primary font-semibold mb-4 inline-block">
            ← Voltar para o login
          </Link>

          <form onSubmit={handleSubmit} className="card p-6">
            <BrandLogo className="mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2 text-center text-slate-800">Criar conta</h2>
            <p className="text-slate-500 text-sm mb-6 text-center">
              Leva menos de um minuto. O resto do perfil você completa quando quiser.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-semibold" role="alert">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mb-5" role="radiogroup" aria-label="Tipo de conta">
              {([['tutor', 'Sou tutor(a)'], ['veterinario', 'Sou veterinário(a)']] as const).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={perfil === valor}
                  onClick={() => setPerfil(valor)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition ${perfil === valor ? 'bg-primary text-white border-primary shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            {/* O Google vem PRIMEIRO de propósito: é o caminho mais curto e o
                único em que o e-mail já chega verificado, sem a ida ao inbox.
                Só para tutor: credenciamento é documento, não OAuth. */}
            {perfil === 'tutor' && (
              <>
                <GoogleAuthButton label="Continuar com o Google" />
                <div className="flex items-center gap-3 my-5">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs text-slate-400">ou use seu e-mail</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
              </>
            )}

            <div className="mb-4">
              <label className="block text-slate-700 font-semibold mb-2 text-sm">Nome completo</label>
              <input type="text" className="input py-3 px-4" value={form.nome} onChange={mudar('nome')} required minLength={2} maxLength={100} placeholder="Seu nome" />
            </div>

            <div className="mb-4">
              <label className="block text-slate-700 font-semibold mb-2 text-sm">E-mail</label>
              <input type="email" className="input py-3 px-4" value={form.email} onChange={mudar('email')} required placeholder="seu.email@exemplo.com" />
            </div>

            <div className="mb-4">
              <label className="block text-slate-700 font-semibold mb-2 text-sm">
                Telefone {perfil === 'tutor' && <span className="font-normal text-slate-400">(opcional)</span>}
              </label>
              <input
                type="tel"
                inputMode="tel"
                className="input py-3 px-4"
                value={form.telefone}
                onChange={(e) => setForm((atual) => ({ ...atual, telefone: formatarTelefone(e.target.value) }))}
                required={perfil === 'veterinario'}
                placeholder="(11) 99999-9999"
                autoComplete="tel"
              />
            </div>

            <div className="mb-6">
              <label className="block text-slate-700 font-semibold mb-2 text-sm">Senha</label>
              <input type="password" className="input py-3 px-4" value={form.senha} onChange={mudar('senha')} required minLength={6} maxLength={72} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
            </div>

            {perfil === 'veterinario' && (
              <fieldset className="mb-6 rounded-xl border border-teal-100 bg-teal-50/40 p-4">
                <legend className="px-1 text-xs font-bold uppercase tracking-wide text-teal-700">Dados profissionais</legend>
                <div className="grid grid-cols-[1fr_auto] gap-3 mb-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-2 text-sm">CRMV</label>
                    <input type="text" className="input py-3 px-4" value={form.crmv} onChange={mudar('crmv')} required maxLength={20} placeholder="Número do conselho" />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-2 text-sm">UF</label>
                    <select className="input py-3 px-3" value={form.crmv_uf} onChange={mudar('crmv_uf')} required aria-label="Estado do CRMV">
                      <option value="">UF</option>
                      {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-2 text-sm">Especialidade</label>
                  <input type="text" className="input py-3 px-4" value={form.especialidade} onChange={mudar('especialidade')} required minLength={3} maxLength={100} placeholder="Ex.: clínica geral, dermatologia" />
                </div>
                <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                  A equipe confere o CRMV antes de liberar a área profissional. Documentos (carteira do CRMV, diploma)
                  podem ser enviados depois, em <span className="font-semibold">Documentação</span>.
                </p>
              </fieldset>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base font-bold shadow-md hover:shadow-lg transition-all">
              {loading ? 'Criando conta…' : perfil === 'veterinario' ? 'Pedir credenciamento' : 'Criar conta'}
            </button>

            {perfil === 'tutor' && (
              <p className="text-xs text-slate-500 mt-5 text-center leading-relaxed">
                Já tem conta de tutor e é veterinário(a)? Também dá para pedir o credenciamento
                de dentro do app, em <span className="font-semibold text-slate-600">Perfil</span>.
              </p>
            )}

            <div className="text-center mt-6 pt-4 border-t border-slate-100">
              <span className="text-slate-500 text-sm">Já possui uma conta? </span>
              <Link to="/login" className="text-primary font-bold text-sm hover:underline">
                Fazer login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
