import axios, { type InternalAxiosRequestConfig } from 'axios'
import type { Usuario } from '../types/api'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Interceptor para adicionar token em todas as requisições
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

/**
 * Renovação de sessão.
 *
 * O backend emite um refresh token a cada login e grava no banco — e o
 * aplicativo NUNCA o guardava nem chamava `POST /auth/refresh`. Resultado: a
 * sessão simplesmente morria em 7 dias e a pessoa era jogada na tela de login
 * sem explicação. Para um tutor idoso que entrou pelo Google ou que não lembra a
 * senha, isso é perder o acesso ao aplicativo.
 */
const CHAVE_REFRESH = 'refresh_token'

type DadosDaSessao = {
  token?: string | null
  refreshToken?: string | null
  usuario?: Usuario | null
}

type RequisicaoRenovavel = InternalAxiosRequestConfig & { _jaRenovou?: boolean }

type RespostaDeRefresh = {
  access_token: string
  refresh_token: string
}

export function guardarSessao({ token, refreshToken, usuario }: DadosDaSessao) {
  if (token) {
    localStorage.setItem('token', token)
    api.defaults.headers.Authorization = `Bearer ${token}`
  }
  if (refreshToken) localStorage.setItem(CHAVE_REFRESH, refreshToken)
  if (usuario) localStorage.setItem('user', JSON.stringify(usuario))
}

export function limparSessao() {
  localStorage.removeItem('token')
  localStorage.removeItem(CHAVE_REFRESH)
  localStorage.removeItem('user')
  // `viewAs` é o "ver como tutor/veterinário" do super_admin. Ficava para trás
  // quando a sessão caía por 401, e na entrada seguinte jogava a pessoa numa
  // área onde ela não tem cadastro — o super_admin virava um veterinário
  // inexistente e era despejado na página pública, sem nenhum controle à mão
  // para desfazer, porque o botão de voltar ao modo real vive dentro do app que
  // ele não conseguia alcançar.
  localStorage.removeItem('viewAs')
  delete api.defaults.headers.Authorization
}

// Uma renovação por vez: sem isto, cinco requisições que expirassem juntas
// disparariam cinco refreshes, e o backend revoga o token anterior a cada um —
// as quatro últimas falhariam e derrubariam a sessão que acabou de ser salva.
let renovacaoEmCurso: Promise<string> | null = null

function renovarSessao() {
  if (renovacaoEmCurso) return renovacaoEmCurso

  const refreshToken = localStorage.getItem(CHAVE_REFRESH)
  if (!refreshToken) return Promise.reject(new Error('sem refresh token'))

  // Instância limpa: usar `api` aqui faria o interceptor de resposta tentar
  // renovar a própria renovação, em laço.
  renovacaoEmCurso = axios
    .post<RespostaDeRefresh>(`${API_URL}/auth/refresh`, { refresh_token: refreshToken })
    .then(({ data }) => {
      guardarSessao({ token: data.access_token, refreshToken: data.refresh_token })
      return data.access_token
    })
    .finally(() => { renovacaoEmCurso = null })

  return renovacaoEmCurso
}

// Interceptor para tratar erros de autenticação
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const requisicao = error.config as RequisicaoRenovavel | undefined

    const podeRenovar =
      error.response?.status === 401 &&
      requisicao &&
      !requisicao._jaRenovou &&
      // A própria renovação e o login não entram no ciclo.
      !String(requisicao.url || '').includes('/auth/refresh') &&
      !String(requisicao.url || '').includes('/auth/login') &&
      localStorage.getItem(CHAVE_REFRESH)

    if (podeRenovar) {
      requisicao._jaRenovou = true
      try {
        const novoToken = await renovarSessao()
        requisicao.headers.set('Authorization', `Bearer ${novoToken}`)
        return api(requisicao)
      } catch {
        // Refresh recusado (revogado, expirado, conta suspensa): aí a sessão
        // acabou mesmo.
      }
    }

    if (error.response?.status === 401) {
      limparSessao()
      // `replace` para a tela morta não ficar no histórico do "voltar".
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login')
      }
    }

    return Promise.reject(error)
  }
)

export default api
