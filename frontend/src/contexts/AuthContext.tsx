import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import axios from 'axios'
import api, { guardarSessao, limparSessao } from '../services/api'
import { encerrarInscricaoDoDispositivo, sincronizarInscricao } from '../lib/push'
import type { Usuario } from '../types/api'

type ResultadoAutenticacao =
  | { success: true; usuario: Usuario; message?: string }
  | { success: false; error: string }

interface AuthContextValue {
  user: Usuario | null
  loading: boolean
  signed: boolean
  login: (email: string, senha: string) => Promise<ResultadoAutenticacao>
  register: (dados: Record<string, unknown>) => Promise<ResultadoAutenticacao>
  loginWithToken: (token: string, usuario: Usuario, refreshToken?: string | null) => void
  logout: () => void
  updateUser: () => Promise<Usuario | undefined>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const mensagemDaApi = (error: unknown, fallback: string) =>
  axios.isAxiosError<{ error?: string }>(error) ? error.response?.data?.error || fallback : fallback

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  // `viewAs` (o "ver como tutor/veterinário") foi removido: era um interruptor
  // de papel guardado no navegador, sem nada por trás, que sobrevivia à queda da
  // sessão e prendia o super_admin numa área onde ele não tem cadastro. No lugar
  // dele existe a visita de suporte, que entra na conta de uma pessoa real.
  // A limpeza abaixo desarma quem ainda tiver a marca antiga no aparelho.
  useEffect(() => { localStorage.removeItem('viewAs') }, [])

  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem('token')
      const storedUser = localStorage.getItem('user')

      if (token && storedUser) {
        api.defaults.headers.Authorization = `Bearer ${token}`
        setUser(JSON.parse(storedUser))
        // A sessão anterior pode ter terminado sem passar pelo "Sair" — aba
        // fechada, token expirado. Nesse caminho a inscrição deste navegador
        // ficou apontando para a conta antiga; a volta é o momento de corrigir.
        void sincronizarInscricao()
      }

      setLoading(false)
    }

    loadUser()
  }, [])



  const login = async (email: string, senha: string): Promise<ResultadoAutenticacao> => {
    try {
      const response = await api.post('/auth/login', { email, senha })
      const { usuario, access_token: token, refresh_token: refreshToken } = response.data

      // O backend emite o refresh token a cada login e grava no banco; o app
      // jogava fora e nunca renovava nada — a sessão morria em 7 dias e a
      // pessoa caía na tela de login sem entender por quê.
      guardarSessao({ token, refreshToken, usuario })
      // Entrar na conta começa como você mesmo: um "ver como" de uma sessão
      // anterior mandava o super_admin para uma área onde ele não tem cadastro.
      // Direto no storage porque `setViewAs` só age depois que `user` existe no
      // estado — e aqui ele ainda não existe.
      setUser(usuario)
      // Este aparelho passa a ser desta conta. Sem isto, entrar num aparelho
      // dividido deixava a inscrição com o dono anterior — e os avisos dele
      // apareciam na tela de bloqueio de quem acabou de entrar.
      void sincronizarInscricao()

      return { success: true, usuario }
    } catch (error: any) {
      return {
        success: false,
        error: mensagemDaApi(error, 'Erro ao fazer login')
      }
    }
  }

  const register = async (dados: Record<string, unknown>): Promise<ResultadoAutenticacao> => {
    try {
      const response = await api.post('/auth/register', dados)
      const { usuario, access_token: token, refresh_token: refreshToken } = response.data

      guardarSessao({ token, refreshToken, usuario })
      setUser(usuario)
      void sincronizarInscricao()

      return { success: true, usuario, message: response.data.message }
    } catch (error: any) {
      return {
        success: false,
        error: mensagemDaApi(error, 'Erro ao registrar')
      }
    }
  }

  // Usado pelo retorno do Facebook Login: o backend já emitiu o token,
  // só falta guardar do mesmo jeito que login()/register() fazem.
  const loginWithToken = (token: string, usuario: Usuario, refreshToken: string | null = null) => {
    guardarSessao({ token, refreshToken, usuario })
    setUser(usuario)
    void sincronizarInscricao()
  }

  const logout = () => {
    // `POST /auth/logout` põe o token na blacklist. Sem esta chamada o "Sair"
    // só limpava o localStorage: quem copiasse o token antes seguia entrando
    // com ele por até 7 dias, e a blacklist do backend nunca era usada.
    // Não esperamos a resposta — sair da conta não pode depender da rede.
    api.post('/auth/logout').catch(() => {})
    // Antes do `limparSessao()`: a função lê o token na primeira linha, e é ele
    // que autoriza apagar a inscrição no servidor. Quem saiu não pode continuar
    // recebendo avisos neste aparelho, e o próximo a entrar não herda os dele.
    void encerrarInscricaoDoDispositivo()
    limparSessao()
    setUser(null)
  }

  const updateUser = async () => {
    try {
      const response = await api.get('/auth/me')
      const usuario = response.data as Usuario
      localStorage.setItem('user', JSON.stringify(usuario))
      setUser(usuario)
      return usuario
    } catch (error: any) {
      console.error('Erro ao atualizar usuário:', error)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        loginWithToken,
        logout,
        updateUser,
        signed: !!user
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
