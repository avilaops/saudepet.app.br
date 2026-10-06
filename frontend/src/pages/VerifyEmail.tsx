import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import api from '../services/api'
import BrandLogo from '../components/brand/BrandLogo'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('verificando') // verificando | sucesso | erro
  // A tela mandava "peça um novo link" e não oferecia como pedir: a rota de
  // reenvio existia (`POST /auth/resend-verification`) e o único botão levava
  // de volta ao login, onde a pessoa também não conseguia entrar — porque o
  // e-mail ainda não estava verificado.
  const [email, setEmail] = useState('')
  const [reenviando, setReenviando] = useState(false)
  const [aviso, setAviso] = useState('')

  const reenviar = async (evento: any) => {
    evento.preventDefault()
    setReenviando(true)
    setAviso('')
    try {
      await api.post('/auth/resend-verification', { email: email.trim() })
      // A resposta do servidor é neutra de propósito (não revela se o e-mail
      // existe), então a mensagem aqui também é.
      setAviso('Se este e-mail estiver cadastrado e ainda não verificado, o link novo chega em instantes.')
    } catch {
      setAviso('Não foi possível pedir o link agora. Tente de novo em alguns instantes.')
    } finally {
      setReenviando(false)
    }
  }

  useEffect(() => {
    const token = searchParams.get('token')

    if (!token) {
      setStatus('erro')
      return
    }

    api.post('/auth/verify-email', { token })
      .then(() => setStatus('sucesso'))
      .catch(() => setStatus('erro'))
  }, [searchParams])

  return (
    <div className="container-app">
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <Link to="/" aria-label="Saúde PET — página inicial" className="mb-8">
          <BrandLogo className="mx-auto" />
        </Link>

        {status === 'verificando' && (
          <>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
            <p className="text-slate-600">Verificando seu e-mail...</p>
          </>
        )}

        {status === 'sucesso' && (
          <>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">E-mail verificado!</h1>
            <p className="text-slate-600 mb-6">Sua conta foi ativada com sucesso.</p>
            <Link to="/login" className="btn-primary px-6 py-3">
              Ir para o login
            </Link>
          </>
        )}

        {status === 'erro' && (
          <>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Link inválido ou expirado</h1>
            <p className="text-slate-600 mb-5">
              Links de verificação valem por tempo limitado. Informe seu e-mail que enviamos um novo agora.
            </p>

            <form onSubmit={reenviar} className="w-full max-w-sm space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-primary focus:bg-white"
              />
              <button
                type="submit"
                disabled={reenviando || email.trim().length < 5}
                className="btn-primary w-full px-6 py-3 disabled:opacity-50"
              >
                {reenviando ? 'Enviando…' : 'Enviar novo link'}
              </button>
            </form>

            {aviso && (
              <p className="mt-4 max-w-sm rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" role="status">
                {aviso}
              </p>
            )}

            <Link to="/login" className="mt-5 text-sm font-semibold text-primary">
              Voltar para o login
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
