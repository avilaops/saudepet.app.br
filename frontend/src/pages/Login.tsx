import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, type NavigateFunction } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import BrandLogo from '../components/brand/BrandLogo'
import { Icon } from '../components/ui/AppKit'
import GoogleAuthButton from '../components/GoogleAuthButton'
import api from '../services/api'
import type { PapelUsuario } from '../types/api'
import { onboardingJaVisto } from './OnboardingTutor'

// Código de troca já consumido nesta carga da página. Fica fora do componente
// de propósito — ver o comentário no efeito que o usa.
let exchangeCodeEmUso: string | null = null

// O backend distingue os motivos de falha; a tela dizia "cancelado ou falhou"
// para todos. Quem expirou precisa saber que basta tentar de novo, e quem
// esbarrou em configuração nossa não deve ficar tentando à toa.
const MENSAGEM_ERRO_GOOGLE: Record<string, string> = {
  auth_cancelled: 'Login com o Google cancelado.',
  csrf_invalid: 'A sessão de login expirou por segurança. Tente novamente.',
  codigo_expirado: 'O login com o Google demorou demais e expirou. Tente novamente.',
  unverified_email: 'A conta do Google precisa ter o e-mail verificado.',
  config_invalida: 'O login com o Google está indisponível. Já fomos avisados — use e-mail e senha por enquanto.',
  server_error: 'Não foi possível entrar com o Google. Tente novamente.'
}

// Onde cada tipo de usuário mora. É o mesmo mapa do `App.tsx`; se um dia
// mudar lá, muda aqui.
const AREA_DO_TIPO: Record<PapelUsuario, string> = {
  tutor: '/tutor',
  veterinario: '/veterinario',
  admin: '/admin',
  super_admin: '/dev'
}

/**
 * Para onde a pessoa queria ir antes de o login aparecer.
 *
 * A vitrine pública do mercado manda `?next=/tutor/mercado/produto/<id>`: quem
 * clicou em "Comprar" no Google ou no WhatsApp não pode cair na home e ter de
 * procurar o produto de novo. Só caminho relativo dentro do app — `//outro.site`
 * e `https://…` ficam de fora, senão o login viraria redirecionador aberto.
 */
function destinoSeguro(): string | null {
  const proximo = new URLSearchParams(window.location.search).get('next')
  return proximo && /^\/(?!\/)/.test(proximo) ? proximo : null
}

/**
 * Leva a pessoa para a área dela. Sempre com `replace`: a tela de login não
 * deve ficar no histórico, senão o "voltar" do celular traz o formulário de
 * novo para quem acabou de entrar — e ele redireciona para a frente outra vez.
 */
function irParaArea(navigate: NavigateFunction, tipo: PapelUsuario) {
  navigate(destinoSeguro() || AREA_DO_TIPO[tipo] || '/', { replace: true })
}

/**
 * Quem está entrando, segundo a porta escolhida no site.
 *
 * É só apresentação: o destino depois do login vem do `tipo_usuario` real da
 * conta, nunca daqui. Quem entra pela porta do tutor e tem conta de
 * veterinário continua caindo na área do veterinário, e isso é obrigatório,
 * porque o produto aceita de propósito que o veterinário seja também tutor.
 */
function perfilDaPorta(): 'tutor' | 'veterinario' | null {
  const valor = new URLSearchParams(window.location.search).get('perfil')
  return valor === 'tutor' || valor === 'veterinario' ? valor : null
}

const TEXTO_DA_PORTA = {
  tutor: {
    titulo: 'Entrar como tutor',
    apoio: 'Acompanhe o atendimento do seu pet e o histórico dele.',
    cadastro: 'Ainda não tem conta? Cadastre seu pet'
  },
  veterinario: {
    titulo: 'Entrar como veterinário',
    apoio: 'Entre no plantão e receba chamados perto de você.',
    cadastro: 'Quer atender pelo Saúde PET? Faça seu cadastro'
  }
} as const

// Tempo que a mensagem de erro fica na tela antes de sumir sozinha.
const DURACAO_DO_ERRO_MS = 5000

export default function Login() {
  const perfil = perfilDaPorta()
  const textoDaPorta = perfil ? TEXTO_DA_PORTA[perfil] : null
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { user, loading: carregandoSessao, login, loginWithToken } = useAuth()
  const navigate = useNavigate()
  const temporizadorDoErro = useRef<number | null>(null)

  // Quem já está com a sessão aberta não tem o que fazer aqui: o atalho do
  // app, um link antigo ou o "voltar" do navegador traziam o formulário de
  // novo para quem já estava dentro, e a pessoa digitava a senha à toa. Este
  // efeito também é o único lugar que redireciona depois de entrar: `login()`
  // e a troca do código do Google só precisam preencher `user`.
  useEffect(() => {
    if (carregandoSessao || !user) return
    // Com `exchange_code` na URL a troca ainda vai acontecer; quem redireciona
    // é a sessão nova, não a que estava guardada.
    if (new URLSearchParams(window.location.search).get('exchange_code')) return
    irParaArea(navigate, user.tipo_usuario)
  }, [user, carregandoSessao, navigate])

  // Quem instalou o app e abre pela primeira vez merece saber o que ele faz
  // antes de encarar um formulário de login. Só no app instalado: no navegador
  // a pessoa veio do site, que já explica.
  useEffect(() => {
    const instalado = window.matchMedia?.('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true
    if (instalado && !onboardingJaVisto()) navigate('/onboarding/tutor', { replace: true })
  }, [navigate])

  // Retorno do Google/Facebook Login: backend redireciona pra cá com ?exchange_code=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const exchangeCode = params.get('exchange_code')
    const errorStr = params.get('google_error') || params.get('error')
    const fbErrorStr = params.get('fb_error')

    if (exchangeCode) {
      // O código de troca é de uso único e morre na primeira chamada: o backend
      // marca `used_at` e passa a responder 403. Em StrictMode o React monta,
      // desmonta e remonta este efeito, então sem esta guarda a segunda chamada
      // recebia o 403 do código que a PRIMEIRA já tinha gasto com sucesso — e o
      // `setError` da segunda apagava o login que já tinha dado certo. A guarda
      // é um ref de módulo, não de componente: o remount do StrictMode cria um
      // componente novo, e um `useRef` seria reinicializado junto com ele.
      if (exchangeCodeEmUso === exchangeCode) return
      exchangeCodeEmUso = exchangeCode

      // Limpar a URL ANTES da chamada, não depois: enquanto o código ficava no
      // endereço, recarregar a página no meio da troca reenviava um código já
      // gasto e a pessoa via "código inválido" numa sessão que estava correta.
      window.history.replaceState({}, '', '/login')

      // Trocar código temporário por sessão de forma segura via POST
      setLoading(true)
      api.post('/auth/google/exchange', { code: exchangeCode })
        .then((res) => {
          const { access_token, refresh_token, usuario } = res.data
          // O refresh token vinha na resposta e era descartado: quem entrava
          // pelo Google perdia a sessão em 7 dias sem nunca ter tido senha.
          loginWithToken(access_token, usuario, refresh_token)
        })
        .catch((err) => {
          setError(err.response?.data?.message || 'Código de login expirado ou inválido.')
        })
        .finally(() => setLoading(false))
    } else if (errorStr) {
      setError(MENSAGEM_ERRO_GOOGLE[errorStr] || MENSAGEM_ERRO_GOOGLE.server_error)
      window.history.replaceState({}, '', '/login')
    } else if (fbErrorStr) {
      setError('Login com o Facebook cancelado ou falhou. Tente novamente.')
      window.history.replaceState({}, '', '/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // O temporizador que apaga o erro não pode sobreviver à tela.
  useEffect(() => () => {
    if (temporizadorDoErro.current) window.clearTimeout(temporizadorDoErro.current)
  }, [])

  const mostrarErro = (mensagem: string) => {
    setError(mensagem)
    if (temporizadorDoErro.current) window.clearTimeout(temporizadorDoErro.current)
    temporizadorDoErro.current = window.setTimeout(() => setError(''), DURACAO_DO_ERRO_MS)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(email, senha)
    setLoading(false)

    // Deu certo: `user` foi preenchido e o efeito lá em cima redireciona.
    if (!result.success) mostrarErro(result.error)
  }

  return (
    <div className="container-app">
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="mb-8 text-center">
          <Link to="/" aria-label="Saúde PET — página inicial">
            <BrandLogo className="mx-auto" />
          </Link>
          <p className="text-slate-600 mt-4">Cuidado veterinário mais próximo</p>
        </div>

        {/* Formulário */}
        <div className="w-full max-w-md">
          <form onSubmit={handleSubmit} className="card">
            <h1 className="text-2xl font-bold text-center">{textoDaPorta ? textoDaPorta.titulo : 'Entrar'}</h1>
            {textoDaPorta && (
              <p className="mt-2 mb-6 text-center text-sm text-slate-500">{textoDaPorta.apoio}</p>
            )}
            {!textoDaPorta && <div className="mb-6" />}

            {error && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 animate-shake"
              >
                <div className="flex items-center gap-2">
                  <Icon name="alert" size={18} className="shrink-0" />
                  <span className="font-semibold">{error}</span>
                </div>
              </div>
            )}

            {/* `id` + `htmlFor` e `autoComplete`: sem isso o leitor de tela lia
                um campo sem nome e o gerenciador de senhas do celular não
                reconhecia o formulário — a pessoa digitava tudo à mão. */}
            <div className="mb-4">
              <label htmlFor="login-email" className="block text-slate-700 font-semibold mb-2">E-mail</label>
              <input
                id="login-email"
                name="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={loading}
                placeholder="seu@email.com"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="login-senha" className="block text-slate-700 font-semibold mb-2">Senha</label>
              <div className="relative">
                <input
                  id="login-senha"
                  name="senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  className="input pr-12"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((atual) => !atual)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={mostrarSenha}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-r-xl"
                >
                  {mostrarSenha ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-60 disabled:cursor-wait"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <GoogleAuthButton className="mt-3" />

            <div className="mt-4 text-center">
              <Link
                to={perfil ? `/register?perfil=${perfil}` : '/register'}
                className="text-primary font-semibold"
              >
                {textoDaPorta ? textoDaPorta.cadastro : 'Não tem conta? Cadastre-se'}
              </Link>
            </div>
            <div className="mt-2 text-center">
              <Link to="/esqueci-senha" className="text-slate-500 text-sm hover:text-primary">
                Esqueci minha senha
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
