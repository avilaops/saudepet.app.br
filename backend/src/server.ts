const dotenv = require('dotenv');
const path = require('path');
const os = require('os');

dotenv.config();
// Desenvolvimento local compartilha a conta operacional da Ávila sem copiar
// segredo para o repositório. Em produção a variável vem do backend/.env
// protegido, como as demais credenciais do container.
if (!process.env.CEP_CERTO_POSTAGEM_API_KEY) {
  dotenv.config({
    path: process.env.CEP_CERTO_ENV_FILE || path.join(os.homedir(), '.avilaops', 'cepcerto.env'),
    override: false
  });
}
const express = require('express');
import type { NextFunction, Request, Response } from 'express';
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('./config/database');
const TokenService = require('./services/token.service');
const { registerSocketSecurity } = require('./services/socket-security.service');

// Importar middlewares
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

// Importar rotas
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const petRoutes = require('./routes/pet.routes');
const fichaClinicaRoutes = require('./routes/ficha-clinica.routes');
const lembreteRoutes = require('./routes/lembrete.routes');
const solicitacaoRoutes = require('./routes/solicitacao.routes');
const veterinarioRoutes = require('./routes/veterinario.routes');
const tutorRoutes = require('./routes/tutor.routes');
const adminRoutes = require('./routes/admin.routes');
const avaliacaoRoutes = require('./routes/avaliacao.routes');
const mensagemRoutes = require('./routes/mensagem.routes');
const configRoutes = require('./routes/config.routes');
const notificacaoRoutes = require('./routes/notificacao.routes');
const pushRoutes = require('./routes/push.routes');
const minhasNotificacoesRoutes = require('./routes/minhas-notificacoes.routes');
const tenantRoutes = require('./routes/tenant.routes');
const formularioRoutes = require('./routes/formulario.routes');
const moderacaoRoutes = require('./routes/moderacao.routes');
const billingRoutes = require('./routes/billing.routes');
const gatewayRoutes = require('./routes/gateway.routes');
const webhookRoutes = require('./routes/webhook.routes');
const publicContentRoutes = require('./routes/public-content.routes');
const contentAdminRoutes = require('./routes/content-admin.routes');
const metaRoutes = require('./routes/meta.routes');
const metaAdminRoutes = require('./routes/meta-admin.routes');
const pdfRoutes = require('./routes/pdf.routes');
const bannerRoutes = require('./routes/banner.routes');
const partnerRoutes = require('./routes/partner.routes');
const referralRoutes = require('./routes/referral.routes');
const commissionRoutes = require('./routes/commission.routes');
const automationRoutes = require('./routes/automation.routes');
const bannerController = require('./controllers/banner.controller');

// Inicializar app
const app = express();
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
app.set('trust proxy', Number.isInteger(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 0);
const server = http.createServer(app);

// Configuração do Socket.IO com CORS seguro
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ═══════════════════════════════════════════════════════
// SEGURANÇA
// ═══════════════════════════════════════════════════════

// Helmet - Headers de segurança HTTP
app.use(helmet({
  contentSecurityPolicy: false, // Desabilitar apenas se necessário para uploads
  crossOriginEmbedderPolicy: false
}));

// CORS configurado de forma segura
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  ...(process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  'http://localhost:5174',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin: string | undefined, callback: (erro: Error | null, permitido?: boolean) => void) => {
    // Permitir requisições sem origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origem não permitida pelo CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ═══════════════════════════════════════════════════════
// Rate limiting
//
// O teto era 100 requisições por IP a cada 15 minutos, para a API inteira —
// e isso não é limite de abuso, é limite de uso. Medido no log de 26/08/2026:
// um único aparelho em uso normal fez 37 requisições EM UM MINUTO. O orçamento
// de 15 minutos acabava em menos de três, e a partir dali toda tela do
// aplicativo falhava com uma mensagem genérica: o super_admin viu "Não foi
// possível carregar os usuários" na visita de suporte, mas o mesmo 429 atingia
// tutor, veterinário e admin em qualquer lugar.
//
// Três correções, e nenhuma delas é "desligar o limite":
//
// 1. QUEM É CONTADO. O IP era a chave única, então uma casa com duas pessoas,
//    uma clínica com dez ou uma operadora móvel com NAT dividiam o mesmo balde.
//    Agora quem tem sessão válida é contado por USUÁRIO; o IP continua valendo
//    para quem não se identificou, que é justamente de onde vem abuso.
//
// 2. QUANTO CABE. 600 por janela para sessão autenticada (~40/min, o dobro do
//    pico observado) e 150 para anônimo. Continua barrando raspagem e força
//    bruta, sem barrar quem está usando o produto.
//
// 3. O QUE A PESSOA VÊ. O corpo era texto puro, então o front caía na mensagem
//    genérica de erro e ninguém descobria que tinha sido limitado. Agora é JSON
//    com `error`, que é o campo que as telas leem, dizendo o que aconteceu e
//    em quanto tempo passa.
// ═══════════════════════════════════════════════════════

/** Id do usuário quando o token confere; senão, null. Só para agrupar. */
function usuarioDoToken(req: Request) {
  const [scheme, token] = String(req.headers.authorization || '').trim().split(/\s+/);
  if (scheme !== 'Bearer' || !token) return null;
  try {
    return require('jsonwebtoken').verify(token, process.env.JWT_SECRET)?.id || null;
  } catch {
    // Token expirado ou adulterado não vira chave: senão bastaria forjar um
    // token novo a cada requisição para trocar de balde à vontade.
    return null;
  }
}

const RESPOSTA_429 = (req: Request, res: Response) => {
  // `getHeader` devolve texto, número ou lista, conforme quem escreveu o
  // cabeçalho. Sem a conversão, `Math.ceil` de um texto vira NaN e o tutor
  // leria "Tente de novo em NaN minutos".
  const reset = Number(res.getHeader('RateLimit-Reset'));
  const segundos = Math.max(1, Math.ceil(Number.isFinite(reset) ? reset : 900));
  const minutos = Math.ceil(segundos / 60);
  return res.status(429).json({
    error: `Muitas requisições em pouco tempo. Tente de novo em ${minutos} minuto${minutos > 1 ? 's' : ''}.`,
    retryAfterSegundos: segundos
  });
};

/**
 * Páginas públicas em HTML e os arquivos que os buscadores leem (sitemap, RSS,
 * llms.txt, artigo em Markdown). O nginx manda `/`, `/blog/...` e
 * `/mercado/...` para `/api/public/render/...`, então cada página aberta
 * passava pelo limite geral de 150 requisições por 15 minutos — e o site tem
 * 142 páginas no sitemap. Um buscador que lesse o site inteiro, ou um
 * escritório atrás do mesmo IP, recebia 429 em JSON no lugar da página
 * (08/10/2026). Elas têm um limite próprio, folgado, e não gastam o da API.
 */
const PAGINA_PUBLICA = /^\/(v1\/)?public\/(render\/|markdown\/|sitemap\.xml$|rss\.xml$|llms(-full)?\.txt$)/;
const ehPaginaPublica = (req: Request): boolean => req.method === 'GET' && PAGINA_PUBLICA.test(req.path);

const limiterDePaginas = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  keyGenerator: (req: Request) => `pagina:${ipKeyGenerator(req.ip)}`,
  skip: (req: Request) => !ehPaginaPublica(req),
  handler: RESPOSTA_429,
  standardHeaders: true,
  legacyHeaders: false,
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req: Request) => (usuarioDoToken(req) ? 600 : 150),
  keyGenerator: (req: Request) => {
    const usuarioId = usuarioDoToken(req);
    // `ipKeyGenerator` normaliza IPv6 para o bloco /64. Usar o endereço cru
    // daria a quem tem IPv6 um balde novo a cada requisição — são 2^64
    // endereços na mesma casa, e o limite viraria decoração.
    return usuarioId ? `u:${usuarioId}` : `ip:${ipKeyGenerator(req.ip)}`;
  },
  // O monitor do servidor bate no health a cada 5 minutos e não é tráfego de
  // ninguém — contá-lo só serve para gastar o orçamento de quem compartilha IP.
  skip: (req: Request) => req.path === '/health' || req.path === '/v1/health' || ehPaginaPublica(req),
  handler: RESPOSTA_429,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Continua apertado de propósito: aqui o alvo é força bruta de senha.
  handler: (req: Request, res: Response) => res.status(429).json({
    error: 'Muitas tentativas de login. Aguarde 15 minutos e tente de novo.'
  }),
  skipSuccessfulRequests: true
});

// Aplicar rate limiting global
app.use('/api/', limiter);
app.use('/api/', limiterDePaginas);

// ═══════════════════════════════════════════════════════
// WEBHOOKS: cada gateway aplica o parser exigido pela sua assinatura.
// ═══════════════════════════════════════════════════════

app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/webhooks/meta', metaRoutes);
app.use('/api/v1/automation', automationRoutes);

// ═══════════════════════════════════════════════════════
// MIDDLEWARE BÁSICO
// ═══════════════════════════════════════════════════════

app.use(express.json({ limit: '5mb' })); // Reduzido de 50mb para 5mb
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());
app.use('/uploads', express.static('uploads'));

// Disponibilizar io para todas as rotas
app.set('io', io);

// Middleware de logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`📨 [HTTP] ${req.method} ${req.path}`);
  next();
});

// ═══════════════════════════════════════════════════════
// ROTAS API V1
// ═══════════════════════════════════════════════════════

// Rate limiting específico para autenticação
app.use('/api/v1/auth', authLimiter);

// Rotas versionadas
const adminVeterinarioRoutes = require('./routes/admin-veterinario.routes');
const paymentRoutes = require('./routes/payment.routes');
const webhookPaymentRoutes = require('./routes/webhook-payment.routes');
const vetFinanceiroRoutes = require('./routes/vet-financeiro.routes');
const adminFinanceiroRoutes = require('./routes/admin-financeiro.routes');
const adminAuditRoutes = require('./routes/admin-audit.routes');
const adminUserRoutes = require('./routes/admin-user.routes');
const agendaRoutes = require('./routes/agenda.routes');
const catalogoVeterinarioRoutes = require('./routes/catalogo-veterinario.routes');
const adminCidadeRoutes = require('./routes/admin-cidade.routes');

const googleAuthRoutes = require('./routes/google-auth.routes');

app.use('/api/v1/public', publicContentRoutes);
app.use('/api/v1/landing-banners', bannerRoutes);
app.use('/api/v1/admin/landing-banners', bannerRoutes);
app.use('/api/v1/admin/content', contentAdminRoutes);
app.use('/api/v1/admin/meta', metaAdminRoutes);
app.use('/api/v1/admin/veterinarios', adminVeterinarioRoutes);
app.use('/api/v1/admin/auditoria', adminAuditRoutes);
app.use('/api/v1/admin/usuarios-gestao', adminUserRoutes);
app.use('/api/v1/admin/cidades', adminCidadeRoutes);
app.use('/api/v1/agenda', agendaRoutes);
app.use('/api/v1/veterinario/catalogo', catalogoVeterinarioRoutes);
app.use('/api/v1/webhooks/payments', webhookPaymentRoutes);

// Gravação de chamada: só escrita, e só de quem participa. A leitura vive em
// /api/v1/admin, atrás de isAdmin.
app.use('/api/v1/chamada/gravacao', require('./routes/gravacao-chamada.routes'));
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/veterinario/financeiro', vetFinanceiroRoutes);
app.use('/api/v1/veterinario/crm', require('./routes/crm-veterinario.routes'));
app.use('/api/v1/admin/financeiro', adminFinanceiroRoutes);
app.use('/api/v1/auth', googleAuthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tenants', tenantRoutes);
app.use('/api/v1/users', userRoutes);
// Correção/remoção auditada da ficha clínica vem antes das rotas do tutor:
// `pet.routes.js` aplica `isTutor` ao router inteiro e devolveria 403 ao
// veterinário. O que não casa aqui segue para o router do tutor.
app.use('/api/v1/pets', fichaClinicaRoutes);
app.use('/api/v1/pets', petRoutes);
app.use('/api/v1/lembretes', lembreteRoutes);
app.use('/api/v1/solicitacoes', solicitacaoRoutes);
app.use('/api/v1/veterinarios', veterinarioRoutes);
app.use('/api/v1/tutores', tutorRoutes);
// Endereço <-> coordenada. O passo de endereço era texto livre e a coordenada
// do GPS entrava em silêncio: sem permissão, o chamado nascia sem ponto de
// partida e o despacho por proximidade ficava cego.
app.use('/api/v1/geo', require('./routes/geo.routes'));
// Endereços salvos do tutor: "Casa" em um toque, com a coordenada já
// confirmada uma vez.
app.use('/api/v1/enderecos', require('./routes/endereco.routes'));
// Visita de suporte: ver o produto pelos olhos de uma pessoa real, com prazo e
// registro. Substitui o "ver como tutor/veterinário", que era um interruptor de
// papel guardado no navegador, sem nada por trás.
app.use('/api/v1/admin/impersonar', require('./routes/impersonacao.routes'));

app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/avaliacoes', avaliacaoRoutes);
app.use('/api/v1/mensagens', mensagemRoutes);
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/notificacoes', notificacaoRoutes);
app.use('/api/v1/push', pushRoutes);
// Caminho próprio porque `/api/v1/notificacoes` já é a CONFIGURAÇÃO de
// notificação do tenant, e ela é só de super admin: montar a central de
// quem está logado no mesmo prefixo faria todo tutor levar 403.
app.use('/api/v1/minhas-notificacoes', minhasNotificacoesRoutes);
app.use('/api/v1/formularios', formularioRoutes);
app.use('/api/v1/moderacao', moderacaoRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/gateways', gatewayRoutes);
app.use('/api/v1/pdf', pdfRoutes);
app.use('/api/v1/partners', partnerRoutes);
app.use('/api/v1/referrals', referralRoutes);
app.use('/api/v1/commissions', commissionRoutes);

// Saúde Pet Mercado. Três portas para o mesmo módulo, porque são três papéis
// diferentes no mesmo balcão: quem compra, quem vende e quem responde pela
// plataforma. A ordem importa — `/mercado/loja` precisa vir antes de
// `/mercado`, senão o router do tutor engoliria a rota do lojista.
app.use('/api/v1/mercado/loja', require('./routes/mercado-loja.routes'));
app.use('/api/v1/mercado', require('./routes/mercado.routes'));
app.use('/api/v1/admin/mercado', require('./routes/mercado-admin.routes'));

// Retrocompatibilidade - Redirecionar rotas antigas para v1
// As rotas do Google faltavam aqui: existiam só em /api/v1/auth, e qualquer
// versão do app que montasse o link sem o `/v1` batia em 404. O callback segue
// sendo o de /v1 nos dois casos, porque o controller o constrói fixo.
app.use('/api/auth', googleAuthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/public', publicContentRoutes);
app.use('/api/admin/content', contentAdminRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/users', userRoutes);
app.use('/api/pets', fichaClinicaRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/lembretes', lembreteRoutes);
app.use('/api/solicitacoes', solicitacaoRoutes);
app.use('/api/veterinarios', veterinarioRoutes);
app.use('/api/tutores', tutorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/avaliacoes', avaliacaoRoutes);
app.use('/api/mensagens', mensagemRoutes);
app.use('/api/config', configRoutes);
app.use('/api/notificacoes', notificacaoRoutes);
app.use('/api/formularios', formularioRoutes);
app.use('/api/moderacao', moderacaoRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/gateways', gatewayRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/landing-banners', bannerRoutes);

// Rota de health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Saúde Pet API está funcionando!',
    version: 'v1',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Saúde Pet API V1 está funcionando!',
    version: 'v1',
    timestamp: new Date().toISOString()
  });
});

const { startLembreteWorker } = require('./services/lembrete.worker');
const { startAgendamentoLembreteWorker } = require('./services/agendamento-lembrete.worker');
const { startAgendamentoAtendimentoWorker } = require('./services/agendamento-atendimento.worker');
const { startAnexoRetencaoWorker } = require('./services/anexo-retencao.worker');
const { startPdfReemissaoWorker } = require('./services/pdf-reemissao.worker');
// O e-mail de SLA existia pronto e nenhum arquivo o chamava: chamado de
// emergência sem aceite só era descoberto por reclamação do tutor.
const { iniciarWorkerSla } = require('./services/sla-atendimento.worker');
// O SLA avisa a EQUIPE. Este avisa o TUTOR: sem plantonista, a busca ficava
// girando para sempre e ninguém dizia a ele que não viria veterinário.
const { iniciarWorkerDeBusca } = require('./services/busca-sem-resposta.service');
// Dois templates que existiam prontos e ninguém chamava: o pedido de avaliação
// e o extrato mensal do profissional.
const { iniciarWorkerDeAvaliacao } = require('./services/pedido-de-avaliacao.worker');
const { iniciarWorkerDeExtrato } = require('./services/extrato-mensal.worker');
// Devolve à prateleira o estoque de pedido do mercado que venceu esperando
// pagamento. Sem ele, um Pix gerado e esquecido prenderia o último item da loja
// para sempre.
const { iniciarWorkerDoMercado } = require('./services/mercado/mercado-pedido.worker');
// Gera, na data, o pedido de cada assinatura de ração — e avisa o tutor com o
// Pix pronto. Sem cobrança automática: ver assinatura.service.
const { iniciarWorkerDeAssinaturas } = require('./services/mercado/assinatura.worker');
// Confere no gateway o que o webhook não avisou. Em 27/08/2026 um pagamento
// aprovado de verdade ficou `PENDING` no nosso banco porque a assinatura do
// webhook estava sendo recusada — de fora, isso é idêntico a "não pagou".
const { iniciarWorkerDeReconciliacao } = require('./services/payment/reconciliacao.worker');

registerSocketSecurity(io, { prisma, jwt, TokenService });
startLembreteWorker();
startAgendamentoLembreteWorker();
startAgendamentoAtendimentoWorker();
startAnexoRetencaoWorker();
startPdfReemissaoWorker();
iniciarWorkerSla();
iniciarWorkerDeBusca();
iniciarWorkerDeAvaliacao();
iniciarWorkerDeExtrato();
iniciarWorkerDoMercado();
iniciarWorkerDeAssinaturas();
iniciarWorkerDeReconciliacao();

// ═══════════════════════════════════════════════════════
// TRATAMENTO DE ERROS
// ═══════════════════════════════════════════════════════

// Middleware para rotas não encontradas (deve vir DEPOIS de todas as rotas)
app.use(notFoundHandler);

// Middleware global de erro (deve ser o ÚLTIMO)
app.use(errorHandler);

// ═══════════════════════════════════════════════════════
// INICIALIZAÇÃO DO SERVIDOR
// ═══════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 Servidor rodando na porta', PORT);
  console.log('📍 API V1: http://localhost:' + PORT + '/api/v1');
  console.log('📍 API (legacy): http://localhost:' + PORT + '/api');
  console.log('🔌 Socket.IO: Pronto para conexões em tempo real');
  console.log('💾 Database:', process.env.DATABASE_URL ? 'Configurado ✅' : 'NÃO CONFIGURADO ❌');
  console.log('🔑 JWT Secret:', process.env.JWT_SECRET ? 'Configurado ✅' : 'NÃO CONFIGURADO ❌');
  console.log('🛡️  Helmet: Ativo');
  console.log('⏱️  Rate Limit: 100 req/15min (geral) | 5 req/15min (auth)');
  console.log('🌐 CORS:', process.env.FRONTEND_URL || 'http://localhost:5173');
  console.log('═══════════════════════════════════════════════════════');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM recebido. Encerrando servidor gracefully...');
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});

module.exports = { app, io };
