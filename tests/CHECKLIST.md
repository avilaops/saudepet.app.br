# ✅ Checklist de Testes - Saúde Pet

Data: _____/_____/_____
Responsável: __________________________

## 📋 Testes Funcionais

### Autenticação
- [ ] Login de tutor funciona
- [ ] Login de veterinário funciona
- [ ] Login de admin funciona
- [ ] Logout funciona corretamente
- [ ] Registro de novo tutor funciona
- [ ] Registro de novo veterinário funciona
- [ ] Validação de email duplicado
- [ ] Validação de senha (mínimo 8 caracteres)
- [ ] Validação de senhas diferentes
- [ ] Redirecionamento após login correto

### Tutor
- [ ] Visualizar lista de pets
- [ ] Cadastrar novo pet
- [ ] Editar dados do pet
- [ ] Excluir pet
- [ ] Solicitar atendimento
- [ ] Visualizar histórico de atendimentos
- [ ] Avaliar atendimento finalizado
- [ ] Ver perfil do tutor
- [ ] Editar perfil do tutor
- [ ] Navegação bottom funciona
- [ ] Layout responsivo (mobile)

### Veterinário
- [ ] Visualizar agendamentos
- [ ] Aprovar/recusar solicitação
- [ ] Ver detalhes do atendimento
- [ ] Alternar status online/offline
- [ ] Ver estatísticas
- [ ] Ver perfil do veterinário
- [ ] Editar perfil
- [ ] Upload de foto de perfil
- [ ] Upload de foto de capa
- [ ] Visualizar histórico
- [ ] Anexar prescrição médica
- [ ] Chat com tutor
- [ ] Navegação bottom funciona

### Administrador
- [ ] Visualizar dashboard
- [ ] Ver estatísticas gerais
- [ ] Listar veterinários pendentes
- [ ] Aprovar veterinário
- [ ] Rejeitar veterinário
- [ ] Listar todos os usuários
- [ ] Filtrar usuários por tipo
- [ ] Remover usuário
- [ ] Listar atendimentos
- [ ] Filtrar atendimentos por status
- [ ] Ver avaliações

## 🔒 Testes de Segurança

### Proteção de Rotas
- [ ] Rotas protegidas exigem autenticação
- [ ] Tutor não acessa rotas de vet
- [ ] Veterinário não acessa rotas de admin
- [ ] Logout invalida o token

### Validação de Dados
- [ ] SQL Injection bloqueado no login
- [ ] SQL Injection bloqueado no registro
- [ ] XSS bloqueado em inputs de texto
- [ ] NoSQL Injection bloqueado
- [ ] Token JWT inválido é rejeitado
- [ ] Token JWT expirado é rejeitado

### Upload de Arquivos
- [ ] Arquivos > 5MB são rejeitados
- [ ] Tipos de arquivo inválidos são rejeitados
- [ ] Upload funciona com imagens válidas

### Headers e CORS
- [ ] Headers de segurança configurados
- [ ] CORS configurado corretamente
- [ ] Content-Type correto nas respostas

## 🔌 Testes de API

### Autenticação
- [ ] POST /auth/login retorna token
- [ ] POST /auth/login rejeita credenciais inválidas
- [ ] POST /auth/register cria novo usuário
- [ ] POST /auth/register valida campos obrigatórios
- [ ] POST /auth/register valida email duplicado

### Veterinários
- [ ] GET /veterinarios/meus-dados retorna dados do vet
- [ ] PUT /veterinarios/status-online atualiza status
- [ ] GET /veterinarios/estatisticas retorna estatísticas
- [ ] Endpoints exigem autenticação

### Admin
- [ ] GET /admin/dashboard retorna estatísticas
- [ ] GET /admin/veterinarios/pendentes retorna lista
- [ ] PUT /admin/veterinarios/:id/aprovar funciona
- [ ] PUT /admin/veterinarios/:id/rejeitar funciona
- [ ] GET /admin/usuarios retorna todos usuários
- [ ] GET /admin/atendimentos retorna atendimentos
- [ ] Endpoints exigem role de admin

### Tutores
- [ ] GET /pets retorna pets do tutor
- [ ] POST /pets cria novo pet
- [ ] PUT /pets/:id atualiza pet
- [ ] DELETE /pets/:id remove pet
- [ ] GET /solicitacoes/tutor/lista retorna solicitações

### Health Check
- [ ] GET /health retorna status OK

## 🐳 Testes Docker

### Ambiente de Teste
- [ ] Containers sobem corretamente
- [ ] Banco de dados está acessível
- [ ] Backend responde
- [ ] Frontend carrega
- [ ] MailHog está funcionando
- [ ] Testes passam no Docker
- [ ] Cleanup funciona corretamente

## 📱 Testes Mobile

### Responsividade
- [ ] Layout em iPhone 12
- [ ] Layout em Pixel 5
- [ ] Navegação bottom visível
- [ ] Botões clicáveis
- [ ] Formulários usáveis
- [ ] Imagens carregam corretamente

## ⚡ Testes de Performance

### Tempos de Carregamento
- [ ] Login < 2 segundos
- [ ] Dashboard tutor < 3 segundos
- [ ] Dashboard vet < 3 segundos
- [ ] Dashboard admin < 3 segundos
- [ ] Lista de pets < 2 segundos
- [ ] Histórico < 3 segundos

### Estados de Loading
- [ ] Spinner durante carregamento
- [ ] Mensagens de erro claras
- [ ] Estados vazios informativos

## 🌐 Testes Cross-Browser

### Chromium
- [ ] Todos os testes E2E passam
- [ ] Layout correto
- [ ] Funcionalidades funcionam

### Firefox
- [ ] Todos os testes E2E passam
- [ ] Layout correto
- [ ] Funcionalidades funcionam

### WebKit (Safari)
- [ ] Todos os testes E2E passam
- [ ] Layout correto
- [ ] Funcionalidades funcionam

## 📧 Testes de Email

### Envio de Emails
- [ ] Email de boas-vindas ao tutor
- [ ] Email de pendência ao veterinário
- [ ] Email de aprovação ao veterinário
- [ ] Email de rejeição ao veterinário
- [ ] Emails chegam no MailHog
- [ ] Links nos emails funcionam

## 📊 Relatórios

### Documentação
- [ ] Relatório HTML gerado
- [ ] Screenshots de falhas capturados
- [ ] Vídeos de execução salvos
- [ ] Traces disponíveis

### Métricas
- Taxa de Sucesso: _____% ( _____ / _____ )
- Tempo Total: _____ minutos
- Falhas Críticas: _____
- Falhas Menores: _____

## 🚀 Pronto para Deploy?

- [ ] Todos os testes críticos passaram
- [ ] Falhas menores documentadas
- [ ] Ambiente de produção configurado
- [ ] Backups realizados
- [ ] Equipe notificada

---

**Aprovado por:** __________________________

**Data:** _____/_____/_____

**Observações:**
________________________________________________________________
________________________________________________________________
________________________________________________________________
________________________________________________________________
