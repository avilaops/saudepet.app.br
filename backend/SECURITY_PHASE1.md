# Saúde PET: Fase 1 de correção crítica

Data da validação local: 4 de agosto de 2026.

## Conclusão executiva

A base ativa (Express/JavaScript, Prisma e frontend React em `App.jsx`) recebeu as correções críticas descritas neste documento. A publicação em produção permanece bloqueada: os testes de segurança direcionados passam, mas seis suítes legadas de integração/E2E ainda dependem de um mock global de Prisma incompatível com os novos controles de identidade e tenant. Uma segunda auditoria deve revisar as correções antes do deploy.

Nenhuma funcionalidade de FAQ, blog, leads, analytics ou identidade visual foi criada nesta fase. Nenhuma migration desta fase foi gerada ou aplicada.

## Correções implementadas

### Cadastro, autenticação e estado da conta

- O cadastro público aceita somente `tutor` e `veterinario`; `role`, `perfil` ou `tipo_usuario` administrativo não produz conta nem token privilegiado.
- A criação de `admin` e `super_admin` ocorre somente pela rota administrativa autenticada e exige `super_admin`.
- A autenticação recarrega usuário, tenant, verificação de e-mail e aprovação veterinária no banco. Claims antigos do JWT não são fonte de autoridade para função ou tenant.
- `REQUIRE_EMAIL_VERIFICATION=true` bloqueia login, refresh, API autenticada e Socket.IO antes da verificação.
- Registro sujeito a verificação não emite access token nem refresh token.
- Tenant suspenso, cancelado ou expirado bloqueia autenticação e refresh. Refresh tokens são revogados em alterações críticas já cobertas pelo fluxo.
- Veterinário não aprovado não entra no Socket.IO nem executa rotas operacionais de atendimento e transferência.
- Logs de autenticação e mensagem não imprimem nome, e-mail, cidade, IDs pessoais, tokens ou conteúdo clínico.

### Middlewares reutilizáveis

- `authMiddleware`: valida Bearer token, blacklist, identidade atual no banco, tenant e verificação.
- `requireRoles`: autorização explícita por função.
- `requireApprovedVeterinarian`: aprovação administrativa do profissional.
- `tenantContext`: deriva o tenant exclusivamente da identidade autenticada.
- `requireActiveTenant`: valida o estado atual da organização.
- `addTenantFilter`: aplica escopo de tenant às consultas administrativas.
- `requireSameTenant`: oculta recursos de outro tenant com `404`.

### Matriz de permissões aplicada

| Ator | Permitido | Bloqueado |
| --- | --- | --- |
| Público | cadastrar tutor/veterinário no tenant informado; login e verificação | cadastrar admin/super_admin; acessar estatísticas |
| Tutor | própria conta, próprios pets, próprias solicitações e mensagens de atendimentos em que participa | outro tutor, pet ou atendimento; escolher destinatário arbitrário |
| Veterinário aprovado | própria conta, solicitações do tenant compatíveis com seu papel, atendimento atribuído e mensagens como participante | atuar antes da aprovação; alterar atendimento de outro profissional/tenant |
| Admin de clínica | usuários, veterinários, métricas, pagamentos e configurações do próprio tenant | criar admin/super_admin; consultar ou alterar outro tenant |
| Super admin | operações globais explicitamente protegidas e criação de administradores | uso de rota pública para obter privilégio |

### Isolamento multi-tenant e IDOR

Filtros de `tenant_id` derivados do token foram aplicados nas rotas e consultas ativas de usuários, veterinários, tutores, pets, solicitações/atendimentos, avaliações, mensagens, formulários, moderação, notificações, dashboard administrativo e faturamento. Criações associam o tenant autorizado no servidor; body e query não são usados como autoridade para usuários comuns.

Em solicitações e atendimentos, o backend confirma tenant e participante (tutor proprietário, veterinário atribuído ou admin autorizado), usa `404` em acesso cruzado e valida transições de status. A aceitação do atendimento usa uma atualização condicional para evitar que dois profissionais reivindiquem a mesma solicitação.

Mensagens agora exigem `solicitacao_id` ou `atendimentoId`. O remetente vem do token e o destinatário é derivado dos participantes persistidos; `destinatarioId` enviado pelo cliente é ignorado. Não há mais conversa direta arbitrária entre usuários ou tenants.

### Socket.IO

- Token obrigatório no handshake, com verificação de assinatura, expiração, blacklist e estado atual da conta.
- Identidade, função, tenant e veterinário são carregados pelo servidor; IDs enviados pelo cliente não definem identidade.
- Rooms `user`, `tenant`, `admins`, `veterinarios` e `atendimento` são controladas pelo servidor.
- Entrada em room de atendimento exige tenant e participação válidos.
- Eventos de solicitação, status e chat consultam novamente o banco antes de retransmitir.
- O chat aceita apenas `mensagemId` já persistido pelo endpoint protegido.
- Limite básico por conexão, configurável por `SOCKET_EVENTS_PER_MINUTE` (padrão 60 eventos/minuto).
- Rejeições são registradas sem token ou conteúdo clínico.
- O frontend ativo foi atualizado para não declarar sua identidade, emitir somente IDs mínimos e solicitar a entrada na room de atendimento.

### Pagamentos e webhooks

- O status inexistente `aguardando_confirmacao` foi substituído pelo status Prisma existente `processando`; nenhum enum ou migration foi alterado.
- As operações administrativas de pagamento e carteira têm filtro de tenant.
- A carteira veterinária resolve corretamente `Veterinario.id`, em vez de confundir com `Usuario.id`.
- Aprovação, confirmação e webhooks usam reivindicação condicional/idempotente antes de movimentar saldos.
- O Mercado Pago, único gateway do Saúde Pet, recebe JSON e valida `x-signature` por HMAC-SHA256 com comparação constante antes de consultar o pagamento na API.
- Nenhum teste realizou chamada real, captura, estorno ou movimentação financeira.

## Impactos de contrato

- `POST /auth/register`: perfis administrativos são rejeitados; com verificação obrigatória, a resposta não contém sessão utilizável.
- `POST /mensagens`: exige contexto de atendimento. O destinatário enviado pelo cliente não é autoridade.
- Socket `chat:mensagem`/`enviar:mensagem`: recebe `{ mensagemId }`, não um objeto de mensagem criado no cliente.
- Socket `solicitacao:*` e `atendimento:status`: IDs de tutor, veterinário, tenant e status enviados pelo cliente são ignorados; o estado canônico vem do banco.
- Endpoints administrativos e de estatísticas agora exigem autenticação e autorização no servidor.

## Evidência automatizada

Suítes críticas direcionadas (após a implementação):

```text
Test Suites: 6 passed, 6 total
Tests:       30 passed, 30 total
Snapshots:   0 total
```

Os testes cobrem cadastro público como admin/super_admin sem token, verificação e refresh, autorização administrativa, tenant A contra tenant B, IDOR de solicitação, mensagem com destinatário derivado, handshake/rooms/eventos Socket.IO, status de pagamento, isolamento financeiro, parsers, assinaturas e idempotência.

Prova de dois tenants:

- usuário do tenant A recebe `404` ao consultar solicitação do tenant B, e a consulta Prisma contém `tenant_id: tenant-a`;
- mensagem do tenant A para atendimento do tenant B não é persistida;
- participante válido do tenant A consegue enviar mensagem, com destinatário derivado no servidor;
- socket autenticado do tenant A é rejeitado ao tentar entrar na room de atendimento do tenant B.

Suíte completa legada, executada após o fechamento das correções:

```text
Test Suites: 19 passed, 6 failed, 25 total
Tests:       116 passed, 75 failed, 191 total
```

Falhas concentradas em:

- `tests/e2e/flows/complete-user-journey.test.ts`
- `tests/e2e/group/group_saudepet_complete_flow.test.ts`
- `tests/e2e/flows/atendimento.flow.test.js`
- `tests/routes/billing.test.ts`
- `tests/integration/routes/moderacao.test.ts`
- `tests/routes/formulario.test.ts`

O fluxo `complete-user-journey` tenta conectar ao PostgreSQL local `saudepet_test`, que não existe. Outras suítes misturam o mock global de Prisma de `tests/setup.ts` com expectativas de persistência ou emitem JWTs sem criar o usuário/tenant vivo agora exigido pelo middleware, causando 401 em cascata. A correção recomendada é provisionar PostgreSQL de teste isolado com transações por teste ou usar um repositório fake realista; os controles de produção não foram enfraquecidos para acomodar o harness antigo.

## Outras validações

| Verificação | Resultado |
| --- | --- |
| Frontend `npm run build` | passou; 158 módulos e PWA gerada; somente avisos de depreciação do Vite |
| `npx prisma validate` | passou |
| `npm run security:secrets` | passou; nenhum padrão de credencial nos arquivos rastreados |
| `git diff --check` | passou; somente avisos de conversão LF/CRLF |
| Lint/typecheck | não existem scripts configurados nos pacotes atuais |
| `npm audit --omit=dev` | 12 achados: 5 altos, 5 moderados e 2 baixos; nenhum crítico |

O banco local possui 15 migrations e há uma migration pendente de trabalho anterior (`20260803150000_add_content_leads_analytics`). Ela não pertence a esta fase, não foi aplicada e deve permanecer bloqueada enquanto FAQ/blog/leads/analytics estiverem fora do escopo.

## Variáveis e passos manuais

Novas variáveis documentadas em `.env.example`:

```dotenv
REQUIRE_EMAIL_VERIFICATION=true
SOCKET_EVENTS_PER_MINUTE=60
```

Passos obrigatórios antes de qualquer publicação:

1. Rotacionar manualmente a credencial que estava em `frontend/src/pages/API.tsx`. Ela tinha aparência de chave real; o valor foi removido e não foi usado, validado nem reproduzido neste relatório.
2. Confirmar no servidor o segredo de assinatura do Mercado Pago, especialmente `webhook_secret`.
3. Corrigir/modernizar as seis suítes de integração com banco isolado e fazê-las passar.
4. Tratar ou atualizar de forma controlada as 12 dependências reportadas pelo audit, sem `npm audit fix --force` automático.
5. Executar segunda auditoria focada em autorização, tenant, IDOR, Socket.IO e pagamentos.
6. Somente então revisar migrations pendentes, criar backup do banco do servidor, aplicar migrations aprovadas e fazer deploy com plano de rollback.

## Riscos e decisões ainda pendentes

- `Usuario` não possui hoje um campo genérico de conta ativa/revogada. Tenant, e-mail e aprovação veterinária são validados; adicionar um estado de usuário exige decisão de produto e migration própria.
- A configuração global de notificações não possui `tenant_id`; nesta fase ela foi restrita a `super_admin`. Torná-la por clínica exige modelagem/migration.
- Refresh tokens continuam armazenados de acordo com o modelo existente; o hash de tokens em repouso é uma melhoria recomendada.
- Arquivos `*.old.js` existentes não são importados pela aplicação nem pelo Jest, mas contêm implementações históricas inseguras. Não foram excluídos para preservar arquivos do usuário; devem ser removidos ou arquivados em limpeza autorizada.
- A cobertura direcionada comprova os controles críticos implementados, mas não substitui a segunda auditoria nem testes de penetração no ambiente real.

## Comandos de reprodução

```powershell
cd 'D:\Projetos\Saude Pet\backend'
npm test -- --runInBand tests/routes/auth.test.ts tests/security/auth-state.test.ts tests/security/authorization.test.ts tests/security/tenant-isolation.test.ts tests/security/socket-security.test.ts tests/security/payment-security.test.ts
npx prisma validate
npm run security:secrets
npm audit --omit=dev

cd 'D:\Projetos\Saude Pet\frontend'
npm run build
```

Não há comando de migration ou deploy autorizado para esta fase.
