# 🐾 Saúde Pet - Plataforma PWA Multi-Clínica

**Conectando donos de pets com veterinários disponíveis para atendimento rápido e domiciliar**

## 📋 Sobre o Projeto

Saúde Pet é um Progressive Web App (PWA) que funciona como um "Uber para veterinários", conectando tutores de pets com veterinários disponíveis na mesma cidade para atendimentos emergenciais, consultas domiciliares ou teleorientação.

O projeto evoluiu de um MVP single-tenant para uma **plataforma multi-tenant**: cada instância (`Tenant`) tem sua própria configuração, marca, veterinários, planos e conteúdo (blog, FAQ, leads), isolados uns dos outros a nível de banco e de autenticação.

> Para o que já está pronto vs. o que falta antes do lançamento amplo, veja o [ROADMAP.md](./ROADMAP.md), é a fonte de verdade sobre prioridades, não este README.

O blog segue o [calendário editorial](BLOG_CALENDARIO_ANUAL.md) e a
[direção visual por tema](BLOG_DIRECAO_VISUAL.md). A [galeria com busca reúne 62 artes](blog-artes/index.html),
incluindo as 52 pautas principais do calendário. As duas coleções estão salvas localmente,
com [inventário e verificação](blog-artes/2026-09-12-ancoras/README.md); associação e publicação nos posts seguem pendentes.
As [datas existentes e a conferência das 52 pautas](BLOG_AGENDA_PUBLICACAO.md) distinguem
os agendamentos reais da agenda anual ainda sem data de início.
>
> Autenticação, cadastro dos três perfis, pets e controle de acesso da **v1.0** — com o roteiro para rodar e testar localmente — estão em [AUTENTICACAO_V1.md](./AUTENTICACAO_V1.md).

### Características Principais

- 🚀 **Progressive Web App** - Funciona offline e pode ser instalado no celular
- 📱 **Mobile-First** - Interface otimizada para dispositivos móveis
- ⚡ **Real-time** - Notificações e chat com Socket.IO (handshake autenticado por token)
- 🏢 **Multi-tenant** - Isolamento de dados por clínica/organização, aplicado no backend a partir do token, nunca do payload do cliente
- 🔒 **Seguro** - JWT + refresh token, RBAC por middleware, rate limiting, audit log
- 💳 **Pagamentos** - Gateways integrados (Stripe, com suporte a Mercado Pago/PayPal) e carteira/repasses para veterinários
- 📰 **Conteúdo** - Blog, FAQ e captura de leads administráveis pelo painel
- 🎨 **Design Moderno** - Interface com TailwindCSS

## 🏗️ Arquitetura

### Tecnologias Utilizadas

**Backend:**
- Node.js + Express
- PostgreSQL com Prisma ORM
- Socket.IO (com middleware de autenticação no handshake)
- JWT (access + refresh token) para autenticação
- Zod para validação de schemas
- Bcrypt para criptografia de senhas
- Helmet + express-rate-limit para hardening HTTP
- Multer + AWS SDK (S3-compatible, usado com Cloudflare R2) para upload de arquivos
- Stripe para cobrança
- Nodemailer para e-mail transacional

**Frontend:**
- React 18 com Vite
- TailwindCSS para estilização
- React Router para navegação
- Axios para requisições HTTP
- Socket.IO Client para WebSockets
- vite-plugin-pwa para instalação/offline

## 📦 Estrutura do Projeto

```
saude-pet/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma         # Modelos do banco de dados (multi-tenant)
│   ├── src/
│   │   ├── controllers/          # Lógica de negócio
│   │   ├── middleware/           # Auth, tenant, autorização por role
│   │   ├── services/             # Regras de domínio (ex: socket-security)
│   │   ├── schemas/              # Validação de entrada (Zod)
│   │   ├── routes/               # Rotas da API (auth, pet, solicitacao,
│   │   │                         #   veterinario, avaliacao, mensagem,
│   │   │                         #   billing, gateway, tenant, admin,
│   │   │                         #   formulario, moderacao, content, webhook)
│   │   └── server.js             # Servidor principal
│   ├── tests/
│   │   ├── security/              # Suítes dedicadas: tenant isolation,
│   │   │                          #   autorização, auth state, socket, pagamento
│   │   ├── unit/                  # Controllers, schemas, services, middleware
│   │   └── e2e/ + integration/    # Fluxos completos (parte ainda desatualizada
│   │                               #   em relação ao middleware novo — ver ROADMAP)
│   └── package.json
│
├── frontend/
│   ├── public/                   # Ícones, manifest, favicon, robots/sitemap
│   ├── src/
│   │   ├── components/           # Componentes React (public/, admin/, veterinario/, brand/)
│   │   ├── contexts/             # Context API (Auth, Socket)
│   │   ├── pages/
│   │   │   ├── tutor/             # Páginas do tutor
│   │   │   ├── veterinario/       # Home, agenda, histórico, chat, config, repasses
│   │   │   ├── admin/             # Dashboard, usuários, vets, blog, leads, analytics
│   │   │   └── public/            # Landing, blog público, FAQ, privacidade
│   │   ├── services/              # Serviços (API)
│   │   └── App.jsx                # Componente principal / rotas
│   └── package.json
└── README.md
```

## 🚀 Instalação e Configuração

### Pré-requisitos

- Node.js 18+
- PostgreSQL 14+
- npm

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env.development
```

Preencha o `.env.development` com pelo menos:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/saude_pet"
JWT_SECRET="gere-um-segredo-longo-e-aleatorio"
ENCRYPTION_KEY="gere-uma-chave-de-32-bytes-em-hexadecimal"
PORT=3000
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
PUBLIC_TENANT_SLUG="saudepet"
CORS_ORIGINS="http://localhost:5173"
ANALYTICS_HASH_SALT="gere-um-salt-longo-e-aleatorio"
```

Veja `backend/.env.example` para a lista completa (SMTP, R2/S3, Redis, Anthropic etc. - todos opcionais em dev).

### 2. Banco de Dados

```bash
npx prisma migrate dev
npx prisma generate
```

### 3. Primeiro Administrador

```bash
npx tsx scripts/create-admin.ts
```

### 4. Frontend

```bash
cd ../frontend
npm install
cp .env.example .env.development
# Ajuste VITE_API_URL / VITE_SOCKET_URL / VITE_PUBLIC_SITE_URL se necessário
```

### 5. Rodar em desenvolvimento

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

Acesse `http://localhost:5173`.

### 6. Build para Produção

```bash
cd backend && npm start
cd frontend && npm run build   # saída em frontend/dist
```

Em produção, o serviço roda atrás do **Caddy** (TLS automático) e cada app/domínio é um container Docker isolado, ver `docker-compose` do servidor de deploy.

## 👥 Tipos de Usuários

### 1. Tutor (Cliente)

- Cadastrar e gerenciar pets
- Solicitar atendimento veterinário
- Acompanhar status em tempo real e conversar por chat com o vet
- Avaliar veterinários após atendimento
- Ver histórico de atendimentos

### 2. Veterinário

- Criar conta e aguardar aprovação do admin (com verificação de documento por upload + análise)
- Ficar online/offline para receber solicitações
- Aceitar ou recusar atendimentos; atualizar status (a caminho, chegou, em atendimento, finalizado)
- Prescrição persistida no histórico do atendimento
- Ver agenda por status, estatísticas, repasses/carteira e configurações da conta

### 3. Administrador (por tenant)

- Aprovar ou rejeitar cadastros de veterinários
- Gerenciar usuários e atendimentos do próprio tenant
- Publicar blog, gerenciar leads e ver analytics
- Dashboard com estatísticas gerais

### 4. Super Admin

- Acesso global entre tenants apenas nas operações explicitamente permitidas (não é um "admin com mais poder" por padrão, precisa ser concedido)

## 🔄 Fluxo de Atendimento

1. **Tutor** solicita atendimento selecionando o pet e tipo
2. Sistema envia notificação em tempo real para **veterinários online** do mesmo tenant/cidade
3. **Primeiro veterinário** que aceitar fica com o atendimento
4. Veterinário atualiza status: **a caminho** → **chegou** → **em atendimento** → **finalizado**
5. Tutor recebe atualizações em tempo real e pode conversar por chat
6. Após finalizar, **tutor avalia** o atendimento; se aplicável, cobrança é processada via gateway

## 🔐 Segurança

- ✅ JWT (access + refresh token) com blacklist de tokens revogados
- ✅ Senhas com bcrypt
- ✅ RBAC centralizado por middleware, autorização nunca depende só do frontend
- ✅ **Isolamento multi-tenant obrigatório**: o `tenantId` vem sempre da identidade autenticada, nunca de body/query do cliente
- ✅ Cadastro público restrito a `tutor`/`veterinario` - não é possível se registrar como admin pela rota pública
- ✅ Socket.IO com autenticação no handshake e rooms controladas pelo servidor (sem IDs declarados pelo cliente)
- ✅ Rate limiting (express-rate-limit) e headers de segurança (Helmet)
- ✅ Audit log de ações administrativas
- ✅ Validação de entrada com Zod em todas as rotas
- ✅ Proteção contra SQL injection via Prisma ORM
- ⚠️ Existem dependências com vulnerabilidades conhecidas (`socket.io`/`ws`) e o Multer ainda está na v1, ver [ROADMAP.md](./ROADMAP.md)

## 📱 PWA Features

- ✅ Manifest configurado para instalação
- ✅ Service Worker com cache de assets
- ✅ Funciona offline (páginas em cache)
- ✅ Ícones em múltiplos tamanhos (incluindo favicons e ícones de marca)
- ✅ Tema mobile otimizado

## 📊 Banco de Dados

Modelos principais (ver `backend/prisma/schema.prisma` para a lista completa e relações):

- **Tenant / ConfiguracaoTenant** - organização/clínica e suas configurações
- **Usuario / Pet / Veterinario** - identidade e dados profissionais (CRMV, especialidade, aprovação)
- **Solicitacao / Avaliacao / Mensagem** - ciclo de atendimento e chat
- **Formulario / RespostaFormulario** - formulários dinâmicos
- **Violacao / Punicao / HistoricoModeracaoUsuario** - moderação de usuários
- **Transacao / CarteiraTutor / CarteiraVeterinario / PlanoAssinatura / AssinaturaUsuario / Fatura / GatewayConfig / HistoricoFinanceiroTenant** - billing e financeiro
- **VisitSession / PageView / Lead** - analytics próprio e captação de leads
- **BlogCategory / BlogPost** - conteúdo do blog
- **RefreshToken / PasswordResetToken / EmailVerificationToken / TokenBlacklist / AuditLog** - segurança e trilha de auditoria

## 🔌 API

A API é organizada por módulo em `backend/src/routes/`: `auth`, `pet`, `solicitacao`, `veterinario`, `avaliacao`, `mensagem`, `billing`, `gateway`, `tenant`, `admin`, `formulario`, `moderacao`, `content-admin` / `public-content`, `webhook`. Consulte cada arquivo de rotas para o contrato exato, o volume de endpoints cresceu demais para listar aqui sem o risco de ficar desatualizado (é exatamente esse tipo de doc-drift que motivou reescrever este README).

## 🌐 Socket.IO

O handshake exige um token válido; `userId`, role e `tenantId` vêm do token, não de dados enviados pelo cliente. Eventos são roteados por rooms controladas pelo servidor (por usuário, tenant e atendimento), ver `backend/src/services/socket-security.service.js`.

## 🎨 Design

**Paleta de Cores:**
- **Primary (Verde):** `#10b981` - Saúde, confiança
- **Secondary (Azul):** `#3b82f6` - Profissionalismo
- **Accent (Azul Claro):** `#06b6d4` - Detalhes

**Princípios:** mobile-first, cards grandes e fáceis de tocar, feedback visual em todas as ações.

## 🐛 Troubleshooting

### Erro de conexão com PostgreSQL
```bash
sudo service postgresql status
sudo service postgresql start
```

### Erro "Module not found"
```bash
rm -rf node_modules package-lock.json
npm install
```

### Socket.IO não conecta

- Verificar se o backend está rodando e se o token de auth está sendo enviado no handshake
- Verificar CORS no backend (`CORS_ORIGINS`)
- Verificar `VITE_SOCKET_URL` no frontend

## 📄 Licença

**Licença Proprietária - Copyright © 2026 AvilaOps. Todos os direitos reservados.**

Este é um software proprietário desenvolvido pela AvilaOps. O uso, cópia, modificação ou distribuição deste software é estritamente controlado pelos termos da licença proprietária.

Para informações sobre licenciamento comercial, entre em contato:
- 📧 Email: licensing@avilaops.com
- 🌐 Website: https://avilaops.com

Consulte o arquivo [LICENSE](./LICENSE) para os termos completos.

## 👨‍💻 Desenvolvedor

**AvilaOps** - Soluções Veterinárias Digitais

## 📞 Suporte

Para dúvidas ou problemas técnicos no desenvolvimento, abra uma issue no repositório.

**SAC Saúde Pet** (suporte ao usuário final, tutores e veterinários):
- 📱 Telefone/WhatsApp: (41) 98775-2756
- 📧 Email: sac@saudepet.app.br

---

**Feito com ❤️ para os pets! 🐾**
