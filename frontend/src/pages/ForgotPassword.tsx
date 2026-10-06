import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import BrandLogo from '../components/brand/BrandLogo'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await api.post('/auth/forgot-password', { email })
      setEnviado(true)
    } catch (err: any) {
      // O backend já responde de forma neutra de propósito (não revela se o
      // e-mail existe). Então 4xx aqui continua sendo "enviado". O que NÃO pode
      // é engolir falha de rede e 5xx: o servidor fora do ar aparecia para a
      // pessoa como "e-mail enviado com sucesso", e ela ficava esperando.
      const status = err.response?.status
      if (!status || status >= 500) {
        setError('Não conseguimos falar com o servidor agora. Tente de novo em instantes.')
      } else {
        setEnviado(true)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-app">
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="mb-8 text-center">
          <Link to="/" aria-label="Saúde PET — página inicial">
            <BrandLogo className="mx-auto" />
          </Link>
        </div>

        <div className="w-full max-w-md">
          <div className="card">
            <h2 className="text-2xl font-bold mb-2 text-center">Esqueci minha senha</h2>

            {enviado ? (
              <div className="text-center py-4">
                <p className="text-slate-700 mb-6">
                  Se esse e-mail estiver cadastrado, você vai receber um link para redefinir sua senha em instantes.
                </p>
                <Link to="/login" className="text-primary font-semibold">
                  Voltar para o login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p className="text-slate-600 text-sm mb-6 text-center">
                  Digite seu e-mail cadastrado e enviaremos um link para você criar uma nova senha.
                </p>

                {error && (
                  <div className="bg-red-500 text-white px-4 py-3 rounded-lg mb-4">
                    {error}
                  </div>
                )}

                <div className="mb-6">
                  <label className="block text-slate-700 font-semibold mb-2">Email</label>
                  <input
                    type="email"
                    className="input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="seu@email.com"
                  />
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Enviando...' : 'Enviar link de recuperação'}
                </button>

                <div className="mt-4 text-center">
                  <Link to="/login" className="text-primary font-semibold">
                    Voltar para o login
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
