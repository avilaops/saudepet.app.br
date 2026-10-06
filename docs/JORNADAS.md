# Jornadas de Usuário: Saúde Pet

Mapeamento das jornadas dos três perfis de usuário do sistema, com base no schema
Prisma, rotas de backend e páginas de frontend. Serve como referência rápida para
onboarding e para decisões de produto.

## Contato / SAC

- 📱 Telefone/WhatsApp: (41) 98775-2756
- 📧 Email: sac@saudepet.app.br

## Papéis (roles)

Enum `TipoUsuario` (`backend/prisma/schema.prisma`):

- **tutor**, dono do pet
- **veterinario**, presta atendimento
- **admin**, administra um tenant (clínica/organização)
- **super_admin**, admin global multi-tenant (`tenant_id` pode ser `NULL`)

Arquitetura multi-tenant: tudo pertence a um `Tenant`. Hoje o registro público do
frontend sempre usa `tenant_slug: 'saudepet'` fixo (`frontend/src/pages/Register.jsx`),
ou seja, o produto opera com um tenant principal mesmo com a infra multi-tenant
pronta no backend.

## Cadastro e login

**Tutor**: formulário único de registro → escolhe "Tutor" → informa
nome/email/telefone/senha/cidade. Se `REQUIRE_EMAIL_VERIFICATION=true`, precisa
confirmar o email antes de logar; senão, recebe token e vai direto para `/tutor`.

**Veterinário**: mesmo formulário, com `crmv`/`especialidade` extras.
1. Cria `Usuario` + `Veterinario` com `aprovado_admin: false`.
2. Admins são notificados em tempo real via Socket.IO.
3. Upload de documento do CRMV (foto/PDF), que passa por análise automática (IA)
   - checagem de nome/CRMV consistentes.
4. **Login bloqueado** até um admin aprovar (`requer_aprovacao_vet` no tenant).
5. Admin aprova/rejeita em `/admin/veterinarios`.
6. Primeiro login pós-aprovação → onboarding guiado (`/veterinario/onboarding`,
   carrossel de 6 telas: perfil, documentos, pagamentos, dicas, avaliação de tutor).

**Login com Facebook**: cria conta sempre como **tutor** (regra explícita no
controller), vincula por `facebook_id` ou email já existente.

**Admin**: sem autocadastro público, criado via seed/banco ou por outro
admin/super_admin.

## Jornada do Tutor

Páginas (`allowedTypes=['tutor']` em `frontend/src/App.jsx`):

1. `/tutor` - home
2. `/tutor/pets` - cadastro/gestão dos pets
3. `/tutor/solicitar` - pede atendimento (emergência / consulta domiciliar /
   teleorientação)
4. `/tutor/acompanhar/:id` - acompanha o atendimento em tempo real (Socket.IO)
5. `/tutor/historico` - histórico de atendimentos
6. `/tutor/atendimento/:id/prontuario` - leitura estruturada do prontuário
7. `/tutor/avaliar/:id` - avalia o veterinário ao final (nota 1-5 + comentário)
8. `/tutor/mensagens` e `/tutor/chat/:veterinarioId` - chat com o vet
9. `/tutor/agenda` - consultas marcadas (confirmar presença, cancelar)
10. `/tutor/lembretes` - lembretes de retorno, vacina e medicação
11. `/tutor/pet/:id/carteira` - carteira digital de vacinação
12. `/tutor/pagamento/:id` e `/tutor/planos` - checkout e planos de assinatura
13. `/tutor/parceiros` - diretório de parceiros e indicações
14. `/tutor/perfil` - dados da conta, preferências de notificação e push

Fluxo central: cria solicitação → status `procurando_veterinario` → um vet
online aceita → acompanha em tempo real as mudanças de status
(`a_caminho → chegou → atendimento_em_andamento → finalizado`) → avalia.

## Jornada do Veterinário

Páginas (`allowedTypes=['veterinario']`):

1. `/veterinario/onboarding` - só no primeiro acesso pós-aprovação
2. `/veterinario` / `/veterinario/home` - home, recebe novas solicitações em
   tempo real (sala `tenant:{id}:veterinarios`)
3. `/veterinario/atendimentos`, `/veterinario/agendamentos` - fila e agenda
4. `/veterinario/atendimento/:id` - atendimento ativo; `/prontuario` (fechamento
   estruturado com alergias/vacinas/medicação) e `/historico-do-pet`
5. `/veterinario/agenda` - grade semanal de disponibilidade (alimenta os
   horários livres da agenda de consultas)
6. `/veterinario/clientes`, `/veterinario/crm/agenda|retencao|painel` - CRM
   (clientela, consultas marcadas, retenção, relatórios; gate por plano)
7. `/veterinario/historico`, `/veterinario/estatisticas`, `/veterinario/financeiro`
8. `/veterinario/mensagens`, `/veterinario/chat/:tutorId` - chat com tutor
9. `/veterinario/repasses`, `/veterinario/cobrancas`, `/veterinario/conta-bancaria`
10. `/veterinario/configuracoes`, `/veterinario/perfil`, `/veterinario/clube`

Fluxo central: aceita solicitação → status muda para `veterinario_encontrado`
(tutor é notificado, outros vets veem a vaga sumir) → conduz o atendimento até
`finalizado` → recebe avaliação e repasse financeiro.

## Jornada do Admin

Páginas (`allowedTypes=['admin']` ou `['admin','super_admin']`):

Todas as 23 rotas usam o `AdminShell` (navegação única, padrão "torre de
controle"):

1. `/admin` - dashboard (métricas, funil de conversão)
2. `/admin/veterinarios` - fila de aprovação (revisa CRMV com apoio de análise IA)
3. `/admin/usuarios` - gestão de usuários
4. `/admin/atendimentos` - visão geral; `/admin/atendimentos/:id/auditoria`
   (linha do tempo forense) e `/admin/operacoes` (monitoramento ao vivo)
5. `/admin/moderacao` - denúncias, violações e punições
6. `/admin/formularios` - formulários dinâmicos (anamnese, termos)
7. `/admin/pagamentos` - credenciais do gateway (Mercado Pago), teste e webhook
8. `/admin/planos`, `/admin/financeiro`, `/admin/parceiros` - assinaturas,
   auditoria financeira e comissões de parceiros
9. `/admin/cidades` - cobertura e regras comerciais (comissão, cidade padrão)
10. `/admin/analytics` - métricas do site público (sessões, page views)
11. `/admin/leads` - CRM simples de leads captados no site (export CSV)
12. `/admin/blog`, `/admin/banners` - CMS (posts, categorias, Threads, banners)
13. `/admin/whatsapp` - integração Meta Cloud API
14. `/admin/auditoria` - trilha central de ações administrativas

Exclusivo **super_admin**: `/admin/tenants` e `/admin/sistema` (SMTP,
notificações, chave de criptografia de gateway), e `/dev` - troca a "lente" de
visualização para qualquer outro perfil sem logout (útil para testar as 3
jornadas rapidamente).

## Pagamento

- Gateway: **somente Mercado Pago** (decisão de 2026-08-19, Stripe e PayPal
  foram removidos do código). Credenciais por tenant, cadastradas em
  `/admin/pagamentos` e criptografadas no banco.
- Split automático por transação: valor tutor / valor veterinário / comissão da
  plataforma (padrão 15%, ajustável em `/admin/cidades`). O split é interno,
  com repasse via PIX, o MP não divide sem onboarding de marketplace.
- Webhook assíncrono (`/webhooks/payments/mercadopago`), sem auth, validado por
  assinatura do gateway.
- Vet solicita transferência do saldo disponível (carteira) em
  `/veterinario/repasses`; admin também pode aprovar/confirmar pagamentos
  manualmente.

## Chat em tempo real

Socket.IO com handshake autenticado por JWT. Mensagens são persistidas via REST
(`POST /mensagens`) e depois retransmitidas em tempo real, com checagem de que
ambos os participantes pertencem ao mesmo atendimento.
