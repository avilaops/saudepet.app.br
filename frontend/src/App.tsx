import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, matchPath } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SocketProvider } from './contexts/SocketContext'
import FaixaDeSuporte from './components/FaixaDeSuporte'
import AppErrorBoundary from './components/AppErrorBoundary'
import type { PapelUsuario } from './types/api'

/**
 * Página que chega desenhada pelo servidor (ver `entry-server.tsx`).
 *
 * Continua sendo carregada sob demanda, mas pode ser carregada ANTES de o
 * React assumir a tela (`preCarregarPaginaDoServidor`, chamado pelo
 * `main.tsx`). Sem isso o `lazy` suspendia no meio da hidratação; a sessão
 * (`AuthProvider`) atualizava antes de o código da página chegar e o React
 * desistia de aproveitar o HTML — erro 421, tela trocada pelo indicador de
 * carregamento e redesenhada do zero.
 */
function paginaDoServidor(importar: () => Promise<{ default: ComponentType }>) {
  const SobDemanda = lazy(importar)
  let Carregada: ComponentType | null = null
  const Pagina = () => (Carregada ? <Carregada /> : <SobDemanda />)
  Pagina.preCarregar = () => importar().then((modulo) => { Carregada = modulo.default })
  return Pagina
}

const Login = lazy(() => import('./pages/Login'))
const OnboardingTutor = lazy(() => import('./pages/OnboardingTutor'))
const TutorMarcarConsulta = lazy(() => import('./pages/tutor/TutorMarcarConsulta'))
const Register = lazy(() => import('./pages/Register'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const DevRoleSelect = lazy(() => import('./pages/DevRoleSelect'))
const ResponderFormulario = lazy(() => import('./pages/ResponderFormulario'))
const TutorHome = lazy(() => import('./pages/tutor/TutorHome'))
const MeusPets = lazy(() => import('./pages/tutor/MeusPets'))
const HistoricoAtendimentos = lazy(() => import('./pages/tutor/HistoricoAtendimentos'))
const TutorProntuario = lazy(() => import('./pages/tutor/TutorProntuario'))
const AvaliarAtendimento = lazy(() => import('./pages/tutor/AvaliarAtendimento'))
const TutorProfile = lazy(() => import('./pages/tutor/TutorProfile'))
const TutorPrivacidade = lazy(() => import('./pages/tutor/TutorPrivacidade'))
const TutorMensagens = lazy(() => import('./pages/tutor/TutorMensagens'))
const TutorChat = lazy(() => import('./pages/tutor/TutorChat'))
const TutorPartnerDirectory = lazy(() => import('./pages/tutor/TutorPartnerDirectory'))
const TutorSolicitarAtendimentoStepFlow = lazy(() => import('./pages/tutor/TutorSolicitarAtendimentoStepFlow'))
const TutorLiveTracking = lazy(() => import('./pages/tutor/TutorLiveTracking'))
const VetHome = lazy(() => import('./pages/veterinario/VetHome'))
const VetOnboarding = lazy(() => import('./pages/veterinario/VetOnboarding'))
const VetAtendimentoAtivo = lazy(() => import('./pages/veterinario/VetAtendimentoAtivo'))
const VetAgendamentos = lazy(() => import('./pages/veterinario/VetAgendamentos'))
const VetEstatisticas = lazy(() => import('./pages/veterinario/VetEstatisticas'))
const VetHistorico = lazy(() => import('./pages/veterinario/VetHistorico'))
const VetProfile = lazy(() => import('./pages/veterinario/VetProfile'))
const VetMensagens = lazy(() => import('./pages/veterinario/VetMensagens'))
const VetConfiguracoes = lazy(() => import('./pages/veterinario/VetConfiguracoes'))
const VetHorariosValores = lazy(() => import('./pages/veterinario/VetHorariosValores'))
const VetDocumentacao = lazy(() => import('./pages/veterinario/VetDocumentacao'))
const VetRepasses = lazy(() => import('./pages/veterinario/VetRepasses'))
const VetClube = lazy(() => import('./pages/veterinario/VetClube'))
const VetChat = lazy(() => import('./pages/veterinario/VetChat'))
const VetCobrancas = lazy(() => import('./pages/veterinario/VetCobrancas'))
const VetContaBancaria = lazy(() => import('./pages/veterinario/VetContaBancaria'))
const VetProntuario = lazy(() => import('./pages/veterinario/VetProntuario'))
const VetHistoricoPet = lazy(() => import('./pages/veterinario/VetHistoricoPet'))
const VetClientes = lazy(() => import('./pages/veterinario/VetClientes'))
const VetClienteFicha = lazy(() => import('./pages/veterinario/VetClienteFicha'))
const VetCrmAgenda = lazy(() => import('./pages/veterinario/VetCrmAgenda'))
const VetCrmPainel = lazy(() => import('./pages/veterinario/VetCrmPainel'))
const VetCrmRetencao = lazy(() => import('./pages/veterinario/VetCrmRetencao'))
const AdminShell = lazy(() => import('./components/admin/AdminShell'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminVeterinarios = lazy(() => import('./pages/admin/AdminVeterinariosManagement'))
const AdminUsuarios = lazy(() => import('./pages/admin/AdminUsuarios'))
const AdminAtendimentos = lazy(() => import('./pages/admin/AdminAtendimentos'))
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'))
const AdminLeads = lazy(() => import('./pages/admin/AdminLeads'))
const AdminBlog = lazy(() => import('./pages/admin/AdminBlog'))
const AdminBlogEditor = lazy(() => import('./pages/admin/AdminBlogEditor'))
const AdminWhatsapp = lazy(() => import('./pages/admin/AdminWhatsapp'))
const AdminPartnerManagement = lazy(() => import('./pages/admin/AdminPartnerManagement'))
const AdminLiveMonitoring = lazy(() => import('./pages/admin/AdminLiveMonitoring'))
const AdminFinanceiroAudit = lazy(() => import('./pages/admin/AdminFinanceiroAudit'))
const AdminPagamentos = lazy(() => import('./pages/admin/AdminPagamentos'))
const AdminModeracao = lazy(() => import('./pages/admin/AdminModeracao'))
const AdminFormularios = lazy(() => import('./pages/admin/AdminFormularios'))
const AdminPlanos = lazy(() => import('./pages/admin/AdminPlanos'))
const AdminRepasses = lazy(() => import('./pages/admin/AdminRepasses'))
const AdminTenants = lazy(() => import('./pages/admin/AdminTenants'))
const AdminSistema = lazy(() => import('./pages/admin/AdminSistema'))
const AdminAuditoriaCentral = lazy(() => import('./pages/admin/AdminAuditoriaCentral'))
const AdminAtendimentoForensicTimeline = lazy(() => import('./pages/admin/AdminAtendimentoForensicTimeline'))
const AdminCidadesCobertura = lazy(() => import('./pages/admin/AdminCidadesCobertura'))
const AdminBannerManager = lazy(() => import('./pages/admin/AdminBannerManager'))

// Saúde Pet Mercado
const TutorMercado = lazy(() => import('./pages/tutor/TutorMercado'))
const TutorMercadoProduto = lazy(() => import('./pages/tutor/TutorMercadoProduto'))
const TutorMercadoCarrinho = lazy(() => import('./pages/tutor/TutorMercadoCarrinho'))
const TutorMercadoPagamento = lazy(() => import('./pages/tutor/TutorMercadoPagamento'))
const TutorMercadoPedidos = lazy(() => import('./pages/tutor/TutorMercadoPedidos'))
const TutorMercadoAssinaturas = lazy(() => import('./pages/tutor/TutorMercadoAssinaturas'))
const TutorMercadoPedido = lazy(() => import('./pages/tutor/TutorMercadoPedido'))
const LojaCadastro = lazy(() => import('./pages/mercado/LojaCadastro'))
const LojaPainel = lazy(() => import('./pages/mercado/LojaPainel'))
const LojaCatalogo = lazy(() => import('./pages/mercado/LojaCatalogo'))
const AdminMercado = lazy(() => import('./pages/admin/AdminMercado'))
const LojaFeed = lazy(() => import('./pages/mercado/LojaFeed'))
// Vitrine pública do mercado: abre sem login, é o que o Google, o WhatsApp e
// o Google Business Profile apontam.
const PublicMercado = paginaDoServidor(() => import('./pages/public/PublicMercado'))
const PublicMercadoLoja = paginaDoServidor(() => import('./pages/public/PublicMercadoLoja'))
const PublicMercadoProduto = paginaDoServidor(() => import('./pages/public/PublicMercadoProduto'))
const TutorPaymentCheckout = lazy(() => import('./pages/tutor/TutorPaymentCheckout'))
const VetAgendaGrade = lazy(() => import('./pages/veterinario/VetAgendaGrade'))
const TutorPetCarteiraDigital = lazy(() => import('./pages/tutor/TutorPetCarteiraDigital'))
const TutorLembretes = lazy(() => import('./pages/tutor/TutorLembretes'))
const TutorAgenda = lazy(() => import('./pages/tutor/TutorAgenda'))
const TutorPlanosAssinatura = lazy(() => import('./pages/tutor/TutorPlanosAssinatura'))
const PublicHome = paginaDoServidor(() => import('./pages/public/PublicHome'))
const FaqPage = paginaDoServidor(() => import('./pages/public/FaqPage'))
const ContatoPage = paginaDoServidor(() => import('./pages/public/ContatoPage'))
const BlogPage = paginaDoServidor(() => import('./pages/public/BlogPage'))
const BlogPostPage = paginaDoServidor(() => import('./pages/public/BlogPostPage'))
const PrivacyPage = paginaDoServidor(() => import('./pages/public/PrivacyPage'))
const PublicPetIdentityTag = lazy(() => import('./pages/public/PublicPetIdentityTag'))
const NotificacoesCentral = lazy(() => import('./pages/notifications/NotificacoesCentral'))
const MeusDispositivos = lazy(() => import('./pages/notifications/MeusDispositivos'))
const ParceiroPainel = lazy(() => import('./pages/parceiro/ParceiroPainel'))
const ParceiroFinanceiro = lazy(() => import('./pages/parceiro/ParceiroFinanceiro'))
const ParceiroPerfil = lazy(() => import('./pages/parceiro/ParceiroPerfil'))

// As mesmas rotas de `ROTAS_DO_SERVIDOR`, em `entry-server.tsx`.
const PAGINAS_DO_SERVIDOR: [string, { preCarregar: () => Promise<void> }][] = [
  ['/', PublicHome],
  ['/faq', FaqPage],
  ['/contato', ContatoPage],
  ['/blog', BlogPage],
  ['/blog/:slug', BlogPostPage],
  ['/privacidade', PrivacyPage],
  ['/mercado', PublicMercado],
  ['/mercado/:slug', PublicMercadoLoja],
  ['/mercado/:slug/:produto', PublicMercadoProduto]
]

/** Carrega o código da página que o servidor desenhou, antes da hidratação. */
export async function preCarregarPaginaDoServidor(caminho: string): Promise<void> {
  const achada = PAGINAS_DO_SERVIDOR.find(([padrao]) => matchPath({ path: padrao, end: true }, caminho))
  // Falhou (rede)? A hidratação segue e o `lazy` tenta de novo.
  await achada?.[1].preCarregar().catch(() => {})
}

// Onde cada tipo de usuário mora.
const AREA_DO_TIPO: Record<PapelUsuario, string> = {
  tutor: '/tutor',
  veterinario: '/veterinario',
  admin: '/admin',
  super_admin: '/dev'
}

function PrivateRoute({ children, allowedTypes }: { children: ReactNode; allowedTypes?: PapelUsuario[] }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  if (allowedTypes && !allowedTypes.includes(user.tipo_usuario)) {
    return <Navigate to={AREA_DO_TIPO[user.tipo_usuario] || '/'} replace />
  }

  return children
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <SocketProvider>
          <AppErrorBoundary>
            <Suspense
              fallback={
                <div className="flex min-h-screen items-center justify-center bg-slate-50">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
                </div>
              }
            >
              <Routes>
                {/* Rotas Públicas */}
                <Route path="/" element={<PublicHome />} />
                <Route path="/faq" element={<FaqPage />} />
                <Route path="/contato" element={<ContatoPage />} />
                <Route path="/blog" element={<BlogPage />} />
                <Route path="/blog/:slug" element={<BlogPostPage />} />
                <Route path="/privacidade" element={<PrivacyPage />} />
                <Route path="/tag/:id" element={<PublicPetIdentityTag />} />
                {/* O QR code da carteira digital sempre gerou `/pet-tag/:id`, e há
                    etiquetas impressas com esse endereço: ele precisa abrir a
                    mesma página para sempre. */}
                <Route path="/pet-tag/:id" element={<PublicPetIdentityTag />} />
                {/* Vitrine pública do mercado. `/mercado/loja/*` (painel do lojista,
                    abaixo) vence estas rotas porque o roteador prefere o caminho
                    estático — e o slug `loja` é reservado no servidor. */}
                <Route path="/mercado" element={<PublicMercado />} />
                <Route path="/mercado/:slug" element={<PublicMercadoLoja />} />
                <Route path="/mercado/:slug/:produto" element={<PublicMercadoProduto />} />

                {/* Rotas de Autenticação */}
                <Route path="/login" element={<Login />} />
                <Route path="/onboarding/tutor" element={<OnboardingTutor />} />
                <Route path="/cadastrar" element={<Register />} />
                <Route path="/register" element={<Register />} />
                <Route path="/verificar-email" element={<VerifyEmail />} />
                <Route path="/esqueci-senha" element={<ForgotPassword />} />
                <Route path="/redefinir-senha" element={<ResetPassword />} />
                {/* Os e-mails já enviados e os links antigos usam os nomes em inglês.
                    Sem estas três, o catch-all abaixo jogava a pessoa em /app e o
                    token do e-mail se perdia no caminho. */}
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/dev" element={<PrivateRoute allowedTypes={['super_admin']}><DevRoleSelect /></PrivateRoute>} />
                <Route path="/dev/selecionar-papel" element={<PrivateRoute allowedTypes={['super_admin']}><DevRoleSelect /></PrivateRoute>} />
                <Route path="/f/:id" element={<ResponderFormulario />} />

                {/* Rotas do Tutor */}
                <Route
                  path="/tutor"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorHome />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/home"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorHome />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/pets"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <MeusPets />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/solicitar"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorSolicitarAtendimentoStepFlow />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/acompanhar/:id"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorLiveTracking />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/historico"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <HistoricoAtendimentos />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/atendimento/:id/prontuario"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorProntuario />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/lembretes"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorLembretes />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/agenda"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorAgenda />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/marcar-consulta"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorMarcarConsulta />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/avaliar/:id"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <AvaliarAtendimento />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/privacidade"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorPrivacidade />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/perfil"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorProfile />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/mensagens"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorMensagens />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/notificacoes"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <NotificacoesCentral />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/dispositivos"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <MeusDispositivos />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/chat/:veterinarioId"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorChat />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/parceiros"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorPartnerDirectory />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/pet/:id/carteira"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorPetCarteiraDigital />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/planos"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorPlanosAssinatura />
                    </PrivateRoute>
                  }
                />

                {/* Rotas do Veterinário */}
                <Route
                  path="/veterinario"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetHome />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/onboarding"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetOnboarding />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/plantao"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetHome />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/home"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetHome />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/agendamentos"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetAgendamentos />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/atendimento/:id"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetAtendimentoAtivo />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/atendimento/:id/prontuario"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetProntuario />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/atendimento/:id/historico-do-pet"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetHistoricoPet />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/estatisticas"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetEstatisticas />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/historico"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetHistorico />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/perfil"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetProfile />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/mensagens"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetMensagens />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/notificacoes"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <NotificacoesCentral />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/dispositivos"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <MeusDispositivos />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/chat/:tutorId"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetChat />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/veterinario/configuracoes"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetConfiguracoes /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/horarios-valores"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetHorariosValores /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/documentacao"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetDocumentacao /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/repasses"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetRepasses /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/cobrancas"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetCobrancas /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/conta-bancaria"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetContaBancaria /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/clube"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetClube /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/clientes"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetClientes /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/clientes/:tutorId"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetClienteFicha /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/crm/agenda"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetCrmAgenda /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/crm/painel"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetCrmPainel /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/crm/retencao"
                  element={<PrivateRoute allowedTypes={['veterinario']}><VetCrmRetencao /></PrivateRoute>}
                />
                <Route
                  path="/veterinario/agenda"
                  element={
                    <PrivateRoute allowedTypes={['veterinario']}>
                      <VetAgendaGrade />
                    </PrivateRoute>
                  }
                />

                {/* Rotas do Admin */}
                <Route
                  path="/admin"
                  element={
                    <PrivateRoute allowedTypes={['admin', 'super_admin']}>
                      <AdminShell><AdminDashboard /></AdminShell>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/dashboard"
                  element={
                    <PrivateRoute allowedTypes={['admin', 'super_admin']}>
                      <AdminShell><AdminDashboard /></AdminShell>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/operacoes"
                  element={
                    <PrivateRoute allowedTypes={['admin', 'super_admin']}>
                      <AdminShell><AdminLiveMonitoring /></AdminShell>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/veterinarios"
                  element={
                    <PrivateRoute allowedTypes={['admin', 'super_admin']}>
                      <AdminShell><AdminVeterinarios /></AdminShell>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/usuarios"
                  element={
                    <PrivateRoute allowedTypes={['admin', 'super_admin']}>
                      <AdminShell><AdminUsuarios /></AdminShell>
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/atendimentos"
                  element={
                    <PrivateRoute allowedTypes={['admin', 'super_admin']}>
                      <AdminShell><AdminAtendimentos /></AdminShell>
                    </PrivateRoute>
                  }
                />
                <Route path="/admin/analytics" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminAnalytics /></AdminShell></PrivateRoute>} />
                <Route path="/admin/leads" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminLeads /></AdminShell></PrivateRoute>} />
                <Route path="/admin/blog" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminBlog /></AdminShell></PrivateRoute>} />
                <Route path="/admin/blog/novo" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminBlogEditor /></AdminShell></PrivateRoute>} />
                <Route path="/admin/blog/:id/editar" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminBlogEditor /></AdminShell></PrivateRoute>} />
                <Route path="/admin/whatsapp" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminWhatsapp /></AdminShell></PrivateRoute>} />
                <Route path="/admin/parceiros" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminPartnerManagement /></AdminShell></PrivateRoute>} />
                <Route path="/admin/financeiro" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminFinanceiroAudit /></AdminShell></PrivateRoute>} />
                <Route path="/admin/pagamentos" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminPagamentos /></AdminShell></PrivateRoute>} />
                <Route path="/admin/moderacao" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminModeracao /></AdminShell></PrivateRoute>} />
                <Route path="/admin/formularios" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminFormularios /></AdminShell></PrivateRoute>} />
                <Route path="/admin/planos" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminPlanos /></AdminShell></PrivateRoute>} />
                <Route path="/admin/repasses" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminRepasses /></AdminShell></PrivateRoute>} />
                <Route path="/admin/tenants" element={<PrivateRoute allowedTypes={['super_admin']}><AdminShell><AdminTenants /></AdminShell></PrivateRoute>} />
                <Route path="/admin/sistema" element={<PrivateRoute allowedTypes={['super_admin']}><AdminShell><AdminSistema /></AdminShell></PrivateRoute>} />
                <Route path="/admin/auditoria" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminAuditoriaCentral /></AdminShell></PrivateRoute>} />
                <Route path="/admin/atendimentos/:id/auditoria" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminAtendimentoForensicTimeline /></AdminShell></PrivateRoute>} />
                <Route path="/admin/cidades" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminCidadesCobertura /></AdminShell></PrivateRoute>} />
                <Route path="/admin/banners" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminBannerManager /></AdminShell></PrivateRoute>} />
                <Route path="/admin/mercado" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><AdminMercado /></AdminShell></PrivateRoute>} />
                <Route path="/admin/notificacoes" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><NotificacoesCentral /></AdminShell></PrivateRoute>} />
                <Route path="/admin/dispositivos" element={<PrivateRoute allowedTypes={['admin', 'super_admin']}><AdminShell><MeusDispositivos /></AdminShell></PrivateRoute>} />

                {/* Saúde Pet Mercado */}
                <Route
                  path="/tutor/mercado"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorMercado />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/mercado/produto/:id"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorMercadoProduto />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/mercado/carrinho"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorMercadoCarrinho />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/mercado/pedidos"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorMercadoPedidos />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/mercado/assinaturas"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorMercadoAssinaturas />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/mercado/pedidos/:id/pagamento"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorMercadoPagamento />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/mercado/pedidos/:id"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorMercadoPedido />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/mercado/loja"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario', 'admin', 'super_admin']}>
                      <LojaCadastro />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/mercado/loja/painel"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario', 'admin', 'super_admin']}>
                      <LojaPainel />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/mercado/loja/catalogo"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario', 'admin', 'super_admin']}>
                      <LojaCatalogo />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/mercado/loja/feed"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario', 'admin', 'super_admin']}>
                      <LojaFeed />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/tutor/pagamento/:id"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario']}>
                      <TutorPaymentCheckout />
                    </PrivateRoute>
                  }
                />

                {/* Portal do Parceiro (Clínicas, Hospitais, Labs, Farmácias) */}
                <Route
                  path="/parceiro"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario', 'admin', 'super_admin']}>
                      <ParceiroPainel />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/parceiro/painel"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario', 'admin', 'super_admin']}>
                      <ParceiroPainel />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/parceiro/financeiro"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario', 'admin', 'super_admin']}>
                      <ParceiroFinanceiro />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/parceiro/perfil"
                  element={
                    <PrivateRoute allowedTypes={['tutor', 'veterinario', 'admin', 'super_admin']}>
                      <ParceiroPerfil />
                    </PrivateRoute>
                  }
                />

                {/* Entrada autenticada */}
                <Route
                  path="/app"
                  element={
                    <PrivateRoute>
                      <RedirectByUserType />
                    </PrivateRoute>
                  }
                />

                <Route path="*" element={<Navigate to="/app" replace />} />
              </Routes>
            </Suspense>
            <FaixaDeSuporte />
          </AppErrorBoundary>
        </SocketProvider>
      </AuthProvider>
    </Router>
  )
}

function RedirectByUserType() {
  const { user } = useAuth()

  if (user?.tipo_usuario === 'tutor') {
    return <Navigate to="/tutor" />
  } else if (user?.tipo_usuario === 'veterinario') {
    return <Navigate to="/veterinario" />
  } else if (user?.tipo_usuario === 'admin') {
    return <Navigate to="/admin" />
  } else if (user?.tipo_usuario === 'super_admin') {
    return <Navigate to="/dev" />
  }

  return <Navigate to="/login" />
}

export default App
