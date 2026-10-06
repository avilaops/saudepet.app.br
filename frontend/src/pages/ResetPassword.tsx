import { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import api from '../services/api'
import BrandLogo from '../components/brand/BrandLogo'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sucesso, setSucesso] = useState(false)

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setError('')

    if (senha !== confirmarSenha) {
      setError('As senhas não coincidem')
      return
    }

    if (!token) {
      setError('Link inválido ou expirado')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, senha })
      setSucesso(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Não foi possível redefinir sua senha. Peça um novo link.')
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
            <h2 className="text-2xl font-bold mb-6 text-center">Nova senha</h2>

            {sucesso ? (
              <div className="text-center py-4">
                <p className="text-slate-700 mb-2">✅ Senha redefinida com sucesso!</p>
                <p className="text-slate-500 text-sm">Redirecionando para o login...</p>
              </div>
            ) : !token ? (
              <div className="text-center py-4">
                <p className="text-slate-700 mb-6">Este link é inválido ou expirou.</p>
                <Link to="/esqueci-senha" className="text-primary font-semibold">
                  Solicitar novo link
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-500 text-white px-4 py-3 rounded-lg mb-4">
                    {error}
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-slate-700 font-semibold mb-2">Nova senha</label>
                  <input
                    type="password"
                    className="input"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    required
                    minLength={6}
                    placeholder="••••••••"
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-slate-700 font-semibold mb-2">Confirmar nova senha</label>
                  <input
                    type="password"
                    className="input"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    required
                    minLength={6}
                    placeholder="••••••••"
                  />
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Salvando...' : 'Redefinir senha'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
