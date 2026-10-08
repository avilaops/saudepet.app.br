# Saúde Pet v1.0 — Autenticação, cadastro e controle de acesso

Este documento descreve o que a v1.0 entrega em autenticação, cadastro dos três
perfis (tutor, veterinário, administrador), cadastro de pets e controle de
acesso por função — e como executar e testar tudo localmente.

A base já existia (multi-tenant, JWT + refresh token, auditoria, Google OAuth).
A v1.0 fechou as lacunas listadas em [O que mudou na v1.0](#o-que-mudou-na-v10).

---

## 1. Perfis e o que cada um pode fazer

| Perfil | Como nasce | Entra quando | Vê |
| --- | --- | --- | --- |
| **Tutor** | `POST /api/v1/auth/register` (`tipo_usuario: tutor`) ou Google | Conta criada (e-mail confirmado se `REQUIRE_EMAIL_VERIFICATION=true`) | Só os próprios pets, ficha de saúde e atendimentos |
| **Veterinário** | `POST /api/v1/auth/register` (`tipo_usuario: veterinario`, com CRMV + UF + especialidade + telefone) ou pedido de credenciamento de dentro de uma conta de tutor (`POST /api/v1/veterinarios/credenciamento`) | **E-mail confirmado E aprovação do administrador** — sempre, em qualquer porta (senha, refresh, Google) | Só pets/atendimentos atribuídos a ele (solicitação ou agendamento) |
| **Administrador** | Seed (`prisma/seed.ts`) ou promoção por outro admin (`POST /api/v1/admin/usuarios-gestao/:id/role`) | Login normal | Acesso operacional completo do tenant |

O **pet não tem login**: é um registro (`pets`) ligado a `tutor_id` e ao `tenant_id` do tutor.

### Status da conta do veterinário

O banco guarda um status granular (`veterinarios.status_credenciamento`). Para a v1.0 ele é lido assim
(`politica-acesso.service.js → STATUS_CONTA_VET`):

| Status no banco | Status v1.0 | Entra? |
| --- | --- | --- |
| `DRAFT`, `PENDING_DOCUMENTS`, `PENDING_REVIEW`, `UNDER_REVIEW`, `REQUIRES_RESUBMISSION` | **pendente** | Não |
| `APPROVED` | **aprovada** | Sim (com e-mail confirmado) |
| `REJECTED` | **recusada** | Não |
| `SUSPENDED`, `EXPIRED` | **bloqueada** | Não |

---

## 2. Endpoints (API versionada em `/api/v1`)

### Autenticação — `/api/v1/auth`

| Método | Rota | Quem | O que faz |
| --- | --- | --- | --- |
| POST | `/register` | público | Cadastro de tutor ou veterinário. Veterinário **não recebe sessão** na resposta (`access_token: null`). |
| POST | `/login` | público | Login por e-mail/senha. Limite: 5 falhas por IP e 10 falhas por conta a cada 15 min. |
| POST | `/refresh` | público | Renova sessão. Reaplica a política de acesso (vet suspenso perde os refresh tokens). |
| POST | `/logout` | autenticado | Revoga a sessão. |
| POST | `/forgot-password` / `/reset-password` | público | Recuperação de senha (resposta neutra, não revela se o e-mail existe). |
| POST | `/verify-email` / `/resend-verification` | público | Verificação de e-mail. |
| POST | `/change-password` | autenticado | Troca de senha; derruba as outras sessões. |
| GET | `/me` | autenticado | Perfil da sessão. |
| GET | `/google`, `/google/callback`, POST `/google/exchange`, POST `/google/verify` | público | Login com Google (requer `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). |

### Tutor

| Método | Rota | O que faz |
| --- | --- | --- |
| PUT | `/api/v1/users/profile` | Edita o próprio perfil |
| GET/POST | `/api/v1/pets` | Lista / cria pets (só os próprios) |
| GET/PUT/DELETE | `/api/v1/pets/:id` | Detalhe / edição / exclusão (404 para pet de outro tutor) |
| POST | `/api/v1/pets/:id/foto` | Foto (multipart, campo `foto`) |
| GET | `/api/v1/pets/:id/ficha` | Alergias, medicamentos e vacinas ativos |
| POST | `/api/v1/pets/:id/ficha/alergias` | `{ alergia, gravidade: leve\|moderada\|grave, observacoes? }` |
| POST | `/api/v1/pets/:id/ficha/medicamentos` | `{ nome_medicamento, dosagem, frequencia_horas, uso_continuo?, data_inicio?, data_fim?, observacoes? }` |
| POST | `/api/v1/pets/:id/ficha/vacinas` | `{ nome_vacina, data_aplicacao, proxima_dose?, laboratorio?, lote?, veterinario_nome? }` |
| DELETE | `/api/v1/pets/:id/ficha/{alergias\|medicamentos\|vacinas}/:registroId` | Remoção lógica (`ativo=false`, com quem/quando) |

Campos do pet: `nome, tipo, especie, raca, sexo, data_nascimento, idade, peso, porte, cor, castrado, microchip, pedigree, condicoes_preexistentes, observacoes, foto` — validados por Zod em `schemas/pet.schema.ts`.

### Veterinário

| Método | Rota | O que faz |
| --- | --- | --- |
| GET | `/api/v1/veterinarios/meus-dados` | Perfil profissional (inclui `crmv_uf`, `status_credenciamento`) |
| PUT | `/api/v1/veterinarios/perfil` | Edita `especialidade, sobre, crmv, crmv_uf, raio_atendimento_km, area_atuacao` (CRMV/UF travam depois de aprovado) |
| POST | `/api/v1/veterinarios/documento` | Envio de documento (carteira do CRMV / diploma) |
| POST | `/api/v1/veterinarios/credenciamento` | Tutor pede credenciamento: `{ crmv, crmv_uf, especialidade }` |
| GET | `/api/v1/veterinarios/estatisticas` | Dashboard (só aprovado) |

### Administrador — `/api/v1/admin`

| Método | Rota | O que faz |
| --- | --- | --- |
| GET | `/usuarios`, `/usuarios-gestao` | Lista tutores e veterinários (filtro por tipo) |
| GET | `/veterinarios?status=` | Fila de credenciamento |
| GET | `/veterinarios/:id` | Detalhe com documentos |
| POST | `/veterinarios/:id/aprovar` | Aprova (promove o usuário a `veterinario`) |
| POST | `/veterinarios/:id/rejeitar` | Recusa (derruba sessões) |
| POST | `/veterinarios/:id/suspender` | Bloqueia (derruba sessões, tira do plantão) |
| POST | `/veterinarios/:id/reativar` | **Novo na v1.0** — reativa suspenso/recusado/expirado |
| POST | `/usuarios-gestao/:id/role` | Controle de permissões (troca de papel) |
| POST | `/usuarios-gestao/:id/revoke-sessions` | Revoga sessões de um usuário |
| GET | `/auditoria` | Registro de auditoria (`audit_logs`) |

Todas as ações acima geram `audit_logs` com ator, IP, user-agent, estado anterior/posterior e motivo.

---

## 3. Segurança implementada

- **Senhas**: bcrypt (custo 10). Nunca aparecem em log, resposta ou auditoria (teste `politica-acesso-v1.test.ts` confere).
- **Sessões**: access token JWT (7 dias) + refresh token rotativo guardado no banco; blacklist de tokens; `sessoes_revogadas_em` invalida tokens antigos ao trocar senha, suspender ou revogar.
- **Força bruta**: 5 falhas/IP/15 min (`server.js`) **e** 10 falhas/conta/15 min (`auth.routes.js`). Sucesso não conta.
- **Rate limit geral**: 600 req/15 min por usuário autenticado, 150 por IP anônimo.
- **Helmet, CORS restrito, cookies `httpOnly`** já configurados em `server.js`.
- **Isolamento**: toda consulta é recortada por `tenant_id` da identidade autenticada, nunca do payload. Pet de outro tutor → 404 (não confirma existência).
- **Escopo do veterinário**: `veterinarioAtendeuOPet()` exige solicitação ou agendamento com o pet antes de editar a ficha clínica; admin não precisa.
- **Validação dupla**: Zod no backend (`src/schemas/*`) e HTML5/estado no frontend.

---

## 4. Executar localmente

Pré-requisitos: Node 20+, Docker (para o Postgres).

```bash
# 1. Dependências
npm run install:all

# 2. Banco local (porta 5445, para não disputar a 5432)
docker compose -f docker-compose.dev-db.yml up -d

# 3. Variáveis de ambiente
cp backend/.env.example backend/.env
# edite backend/.env — mínimo:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5445/saudepet?schema=public
#   JWT_SECRET=<string longa aleatória>
#   ENCRYPTION_KEY=<64 caracteres hexadecimais>
#   FRONTEND_URL=http://localhost:5173
#   REQUIRE_EMAIL_VERIFICATION=false   # true exige e-mail confirmado também para tutor
#   SMTP_* (opcional; sem SMTP os links de verificação/reset aparecem no log do backend)
#   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (opcional; sem eles o botão do Google devolve "config_invalida")
cp frontend/.env.example frontend/.env   # VITE_API_URL=http://localhost:3000/api

# 4. Migrations + client Prisma
cd backend
npx prisma migrate deploy     # inclui 20260828150000_v1_crmv_uf
npx prisma generate

# 5. Seed (tenant "saudepet" + admin + tutor + vet aprovado)
npx tsx prisma/seed-v1.ts     # admin@saudepet.com / admin123 — só desenvolvimento
# (prisma/seed.ts é anterior ao multi-tenant e não roda mais)

# 6. Subir tudo (backend :3000 + frontend :5173)
cd .. && npm run dev
```

### Smoke automatizado (depois do deploy, antes da tag)

[`scripts/smoke-auth.mts`](../scripts/smoke-auth.mts) percorre o ciclo inteiro por HTTP contra o ambiente publicado —
cadastro → 403 sem e-mail → 403 sem aprovação → aprovar → 200 → suspender → refresh/login 403 e token antigo 401 →
reativar → 200 — e apaga a conta de teste no final (19 verificações):

```bash
API_URL=https://api.saudepet.app.br/api/v1 ADMIN_EMAIL=... ADMIN_SENHA=... SMOKE_DOMINIO=seu-dominio-que-recebe-email.com npx tsx scripts/smoke-auth.mts
# o passo 3 pede o token do e-mail de verificação; ou passe VERIFY_TOKEN=... / VERIFY_TOKEN_CMD="psql ..."
```

O login pelo Google com veterinário pendente/suspenso é o único passo manual (OAuth interativo).

### Roteiro manual de teste

1. **Tutor**: `/cadastrar` → "Sou tutor(a)" → nome, e-mail, telefone (opcional), senha → entra direto (ou confirma o e-mail se a flag estiver ligada) → `/tutor/pets` → "Novo pet" → salvar → editar → seção **Ficha de saúde** (alergias, medicamentos, vacinas).
2. **Veterinário**: `/cadastrar` → "Sou veterinário(a)" → CRMV, UF, especialidade, telefone → tela "Confirme seu e-mail" (sem sessão) → clique no link (log do backend se não houver SMTP) → tentar `/login` → **403 "não foi aprovada"**.
3. **Admin**: `/login` com `admin@saudepet.com` → `/admin/veterinarios` → abrir o pendente → **Aprovar** → veterinário faz login → `/veterinario` (dashboard).
4. **Bloqueio/ativação**: admin → **Suspender** → veterinário perde a sessão na próxima requisição e não consegue novo login → **Reativar** → volta a entrar.
5. **Isolamento**: com o token do tutor A, `GET /api/v1/pets/<id do pet do tutor B>` → 404. Com token de veterinário, `GET /api/v1/pets` → 200 apenas com os pets do próprio vet como tutor (nunca de terceiros); `PUT /api/v1/pets/<pet que não atendeu>/alergias/<id>` → 403.
6. **Auditoria**: `/admin/auditoria` mostra `veterinario_aprovado`, `veterinario_suspenso`, `veterinario_reativado`, `LOGIN_FAILED` etc.

---

## 5. Testes automatizados

Dois jobs oficiais — o esperado é **verde + verde**:

```bash
cd backend
npm run test:unit    # unit + security + routes (Prisma mockado, sem banco)
npm run test:e2e     # tests/e2e contra Postgres real em localhost:5445, --runInBand
npm test             # os dois, em sequência
```

As E2E rodam **separadas e em série** de propósito: dentro da rodada unitária elas
disputam CPU com dezenas de suítes, o Prisma real perde a conexão e o resultado
fica instável. Isoladas, passam 94/94.

Testes da v1.0:

| Arquivo | Cobre |
| --- | --- |
| `tests/security/politica-acesso-v1.test.ts` | Política de acesso por perfil; login/refresh/registro de veterinário; senha ausente (Google) → 401; limite por conta → 429; senha fora da auditoria |
| `tests/security/ficha-clinica-escopo-vet.test.ts` | Veterinário só altera ficha de pet que atendeu; admin passa |
| `tests/unit/controllers/pet-ficha-tutor.test.ts` | Ficha do pet pelo tutor: isolamento (404), validação, remoção lógica |
| `tests/unit/controllers/admin-veterinario-reativar.test.ts` | Reativação com auditoria; recusa estados inválidos; outro tenant → 404 |
| `tests/security/auth-state.test.ts`, `authorization.test.ts`, `tenant-isolation.test.ts`, `tests/routes/auth.test.ts` | Já existentes — continuam passando |

A suíte usa um mock do Prisma (`tests/mocks/prisma.mock.ts`); só as E2E em `tests/e2e` precisam do banco em `localhost:5445/saudepet_test`.

---

## 6. O que mudou na v1.0

| Área | Antes | Agora |
| --- | --- | --- |
| Cadastro de veterinário | Só CRMV (sem UF); tela pública só cadastrava tutor | `crmv_uf` obrigatório (validado contra as 27 UFs); tela `/cadastrar` com "Sou veterinário(a)", telefone, CRMV, UF e especialidade |
| Login de veterinário | Aprovação exigida só por senha/refresh, e-mail confirmado só com a flag global; Google não checava nada | `politica-acesso.service.js`: e-mail confirmado **e** aprovação, em senha, refresh e Google; recusado/suspenso com mensagem própria |
| Sessão no cadastro | Vet recebia access token com a flag desligada | Vet nunca recebe sessão no cadastro |
| Força bruta | Só por IP | IP **e** conta |
| Conta Google sem senha | `bcrypt.compare` com hash nulo → 500 | 401 |
| Ativação de veterinário | Só suspender | `POST /admin/veterinarios/:id/reativar` + botão "Reativar" |
| Escopo do vet na ficha | Qualquer vet aprovado do tenant editava qualquer pet | Só pets atendidos (solicitação/agendamento) |
| Ficha do pet pelo tutor | Alergias/medicamentos/vacinas só o vet gravava (via prontuário) | Tutor declara e remove pela edição do pet (`/pets/:id/ficha/*`) |
| Perfil profissional | `PUT /veterinarios/perfil` sem validação | Zod (`updateVeterinarioSchema`) com UF |

Migration: `backend/prisma/migrations/20260828150000_v1_crmv_uf/migration.sql`.

---

## 7. Pronto para o que vem depois

Os modelos que os próximos módulos usam já existem e estão ligados aos perfis desta versão:
`Solicitacao`/`Agendamento` (agendamentos e rastreamento), `ProntuarioEletronico`/`PrescricaoItem` (prontuários e prescrições),
`Payment`/`Transacao`/`PlanoAssinatura` (pagamentos). O escopo do veterinário (`veterinarioAtendeuOPet`) é o ponto único a
estender quando um novo tipo de vínculo (ex.: prescrição) passar a dar acesso ao pet.
