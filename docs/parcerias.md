Isso pode entrar no Saúde Pet como um módulo chamado **Rede de Parceiros**, criando uma nova fonte de receita para a plataforma.

### Rede de clínicas e hospitais parceiros

O Saúde Pet poderá firmar parcerias com:

* Clínicas veterinárias;
* Hospitais veterinários;
* Laboratórios de exames;
* Farmácias e distribuidores de medicamentos;
* Centros de diagnóstico por imagem;
* Pet shops e outros serviços especializados.

### Como funcionará

1. O tutor recebe uma indicação pelo aplicativo.
2. Escolhe o estabelecimento parceiro e o serviço necessário.
3. A solicitação gera um código, link ou QR Code de indicação.
4. A clínica confirma o atendimento e informa o valor realizado.
5. O sistema calcula automaticamente a comissão do Saúde Pet.
6. O parceiro recebe o valor correspondente, descontada a comissão, ou realiza o repasse posteriormente, conforme o modelo comercial.

### Serviços que podem ser indicados

* Consultas presenciais;
* Exames laboratoriais;
* Ultrassom, raio-X e outros exames de imagem;
* Cirurgias e internações;
* Vacinas;
* Medicamentos;
* Tratamentos especializados;
* Serviços de emergência.

### Funcionalidades necessárias

**Para o tutor**

* Visualizar parceiros próximos;
* Consultar serviços, preços ou condições;
* Solicitar atendimento;
* Receber o código da indicação;
* Acompanhar o status;
* Avaliar o parceiro após o atendimento.

**Para clínicas e hospitais**

* Cadastro e validação do estabelecimento;
* Gestão de unidades, profissionais e serviços;
* Recebimento das indicações;
* Confirmação do atendimento;
* Registro do valor cobrado;
* Relatório de comissões e repasses.

**Para o administrador do Saúde Pet**

* Aprovar parceiros;
* Definir comissão geral ou individual;
* Acompanhar indicações e conversões;
* Auditar atendimentos;
* Controlar pagamentos e repasses;
* Visualizar faturamento por parceiro, serviço e período;
* Suspender parceiros ou resolver divergências.

É importante que cada indicação tenha rastreamento completo: tutor, pet, parceiro, serviço, data, valor, comissão, comprovante e status. Assim, a plataforma consegue provar a origem da indicação e evita que atendimentos sejam realizados sem o devido registro.

O percentual também pode variar por categoria. Por exemplo: uma comissão para consultas, outra para exames e outra para medicamentos. Isso precisa ficar configurável no painel, sem valores fixos no código.


# Blueprint para o Copilot: Rede de Parceiros do Saúde Pet

````markdown
# Feature: Rede de Parceiros, Indicações e Comissões

## Contexto

O Saúde Pet possui áreas para tutores, veterinários e administradores. Precisamos criar um módulo completo para conectar tutores a clínicas, hospitais veterinários, laboratórios, centros de diagnóstico, farmácias e outros estabelecimentos parceiros.

A plataforma deverá registrar as indicações, acompanhar a realização do serviço e calcular a comissão do Saúde Pet sobre cada conversão confirmada.

Não implementar valores, percentuais, estabelecimentos ou regras comerciais diretamente no código. Todas as configurações devem ser administráveis e persistidas no banco de dados.

---

## 1. Regra obrigatória antes da implementação

Antes de alterar qualquer arquivo:

1. Audite a arquitetura atual do projeto.
2. Identifique:
   - Stack do frontend e backend;
   - ORM e banco de dados;
   - Estrutura de autenticação;
   - Perfis e permissões existentes;
   - Estrutura multi-tenant;
   - Padrão de rotas, controllers, services e repositories;
   - Sistema financeiro existente;
   - Sistema de notificações;
   - Storage utilizado para documentos;
   - Componentes de interface reutilizáveis.
3. Liste os arquivos que serão criados ou modificados.
4. Apresente o plano de implementação.
5. Não duplique módulos, entidades ou funcionalidades existentes.
6. Preserve os padrões arquiteturais do projeto.
7. Não reescreva partes não relacionadas à feature.

Se houver vulnerabilidades de autorização ou ausência de isolamento entre tenants, interrompa a implementação e apresente os riscos primeiro.

---

# 2. Objetivo da feature

Permitir que o Saúde Pet:

- Cadastre clínicas e estabelecimentos parceiros;
- Cadastre unidades, serviços, exames e condições comerciais;
- Indique parceiros adequados aos tutores;
- Gere uma indicação rastreável;
- Confirme se o atendimento foi realizado;
- Registre o valor da transação;
- Calcule a comissão da plataforma;
- Controle repasses, cancelamentos e divergências;
- Gere relatórios financeiros e operacionais;
- Notifique tutor, parceiro e administração durante a jornada.

---

# 3. Tipos de parceiros

Criar estrutura configurável, inicialmente compatível com:

- Clínica veterinária;
- Hospital veterinário;
- Laboratório;
- Centro de diagnóstico por imagem;
- Farmácia veterinária;
- Distribuidora de medicamentos;
- Pet shop;
- Centro de reabilitação;
- Serviço especializado;
- Outros.

Não utilizar enumeração rígida se o sistema já possuir uma estrutura dinâmica de categorias.

---

# 4. Perfis e permissões

## 4.1 Tutor

Pode:

- Visualizar parceiros publicados;
- Filtrar parceiros por localização e categoria;
- Consultar informações públicas;
- Solicitar uma indicação;
- Consultar suas próprias indicações;
- Informar que compareceu ao atendimento;
- Enviar comprovante quando solicitado;
- Avaliar o estabelecimento após a conclusão.

Não pode:

- Visualizar comissões;
- Consultar indicações de outros tutores;
- Alterar valores informados pelo parceiro;
- Confirmar pagamento ou repasse financeiro.

## 4.2 Usuário do parceiro

Pode:

- Acessar somente o parceiro e as unidades às quais está vinculado;
- Atualizar dados permitidos;
- Gerenciar serviços, conforme sua permissão;
- Visualizar indicações recebidas;
- Aceitar ou recusar indicações;
- Confirmar atendimento;
- Registrar o valor efetivamente cobrado;
- Anexar comprovantes;
- Consultar comissões e repasses relacionados ao próprio estabelecimento;
- Abrir uma contestação.

Não pode:

- Visualizar dados de outros parceiros;
- Alterar percentuais de comissão;
- Confirmar o próprio repasse;
- Alterar uma indicação concluída sem autorização administrativa.

## 4.3 Administrador do Saúde Pet

Pode:

- Criar, revisar, aprovar, suspender e arquivar parceiros;
- Gerenciar categorias e serviços;
- Definir comissões;
- Criar indicações manualmente;
- Auditar atendimentos;
- Confirmar ou cancelar conversões;
- Gerenciar pagamentos e repasses;
- Resolver contestações;
- Consultar relatórios completos;
- Visualizar logs e histórico de alterações.

## 4.4 Superadministrador

Pode:

- Gerenciar configurações globais;
- Definir regras padrão;
- Gerenciar administradores;
- Acessar auditoria global;
- Alterar configurações sensíveis.

Toda autorização deve ser validada no backend. Ocultar botões no frontend não é controle de segurança.

---

# 5. Entidades de dados

Adaptar os nomes ao padrão atual do projeto.

## Partner

Representa a empresa parceira.

Campos sugeridos:

- id;
- tenantId;
- legalName;
- tradeName;
- documentType;
- documentNumber;
- partnerTypeId;
- description;
- email;
- phone;
- whatsapp;
- website;
- logoUrl;
- status;
- approvalStatus;
- approvedAt;
- approvedBy;
- suspendedAt;
- suspensionReason;
- defaultCommissionRuleId;
- createdAt;
- updatedAt;
- archivedAt.

Status sugeridos:

- DRAFT;
- PENDING_REVIEW;
- ACTIVE;
- SUSPENDED;
- REJECTED;
- ARCHIVED.

O documento deve ser normalizado e possuir restrição de unicidade dentro do escopo correto.

## PartnerUnit

Representa uma unidade física.

Campos:

- id;
- partnerId;
- name;
- documentNumber, se aplicável;
- email;
- phone;
- whatsapp;
- addressLine;
- addressNumber;
- complement;
- district;
- city;
- state;
- postalCode;
- latitude;
- longitude;
- openingHours;
- emergencyService;
- active;
- createdAt;
- updatedAt.

## PartnerUser

Relaciona um usuário às empresas e unidades que pode administrar.

Campos:

- id;
- userId;
- partnerId;
- partnerUnitId, opcional;
- role;
- active;
- invitedAt;
- acceptedAt;
- createdAt;
- updatedAt.

## PartnerCategory

Campos:

- id;
- name;
- slug;
- description;
- icon;
- active;
- displayOrder.

## PartnerService

Representa um serviço oferecido pelo parceiro.

Campos:

- id;
- partnerId;
- partnerUnitId, opcional;
- categoryId;
- name;
- description;
- serviceType;
- publicPrice;
- priceType;
- requiresScheduling;
- estimatedDuration;
- active;
- createdAt;
- updatedAt.

Tipos iniciais:

- CONSULTATION;
- LAB_EXAM;
- IMAGE_EXAM;
- VACCINE;
- SURGERY;
- HOSPITALIZATION;
- MEDICATION;
- REHABILITATION;
- EMERGENCY;
- OTHER.

O sistema não deve prescrever medicamentos. O módulo apenas registra indicações comerciais ou encaminhamentos autorizados.

## CommissionRule

Campos:

- id;
- tenantId;
- partnerId, opcional;
- partnerUnitId, opcional;
- partnerServiceId, opcional;
- name;
- calculationType;
- percentage;
- fixedAmount;
- minimumCommission;
- maximumCommission;
- validFrom;
- validUntil;
- priority;
- active;
- createdBy;
- createdAt;
- updatedAt.

Tipos de cálculo:

- PERCENTAGE;
- FIXED;
- PERCENTAGE_PLUS_FIXED.

A regra aplicada deverá ser copiada para a indicação no momento da confirmação da conversão. Alterações futuras na regra não podem mudar comissões históricas.

## Referral

Representa a indicação.

Campos:

- id;
- tenantId;
- referralCode;
- tutorId;
- petId;
- partnerId;
- partnerUnitId;
- partnerServiceId, opcional;
- referredByUserId;
- source;
- reason;
- clinicalNotes, somente quando legalmente permitido;
- scheduledAt;
- expiresAt;
- status;
- acceptedAt;
- attendedAt;
- completedAt;
- cancelledAt;
- cancellationReason;
- qrCodePayload;
- createdAt;
- updatedAt.

Status:

- CREATED;
- SENT;
- VIEWED;
- ACCEPTED;
- SCHEDULED;
- ATTENDED;
- PENDING_CONFIRMATION;
- CONVERTED;
- CANCELLED;
- EXPIRED;
- DISPUTED;
- REJECTED.

Não permitir saltos arbitrários de status. Implementar uma máquina de estados ou validações explícitas de transição.

## ReferralConversion

Registra o resultado financeiro da indicação.

Campos:

- id;
- referralId;
- grossAmount;
- eligibleAmount;
- discountAmount;
- commissionTypeSnapshot;
- commissionPercentageSnapshot;
- commissionFixedSnapshot;
- commissionAmount;
- partnerNetAmount;
- currency;
- confirmedBy;
- confirmedAt;
- status;
- cancelledAt;
- cancellationReason;
- createdAt;
- updatedAt.

Status:

- PENDING;
- CONFIRMED;
- CANCELLED;
- REFUNDED;
- PARTIALLY_REFUNDED;
- DISPUTED.

## CommissionSettlement

Agrupa comissões para cobrança ou repasse.

Campos:

- id;
- partnerId;
- periodStart;
- periodEnd;
- grossAmount;
- commissionAmount;
- netAmount;
- settlementModel;
- status;
- dueDate;
- paidAt;
- paymentReference;
- createdAt;
- updatedAt.

Modelos financeiros:

- COMMISSION_RECEIVABLE: o parceiro recebe do cliente e deve pagar a comissão ao Saúde Pet;
- SPLIT_PAYMENT: o pagamento é dividido automaticamente;
- PARTNER_PAYOUT: a plataforma recebe e repassa o líquido ao parceiro.

Status:

- OPEN;
- PENDING_REVIEW;
- APPROVED;
- DUE;
- PAID;
- OVERDUE;
- CANCELLED;
- DISPUTED.

## ReferralDocument

Campos:

- id;
- referralId;
- documentType;
- fileUrl;
- originalName;
- mimeType;
- fileSize;
- uploadedBy;
- createdAt.

Usar URLs assinadas, validação de MIME type, tamanho máximo e controle de autorização.

## PartnerReview

Campos:

- id;
- referralId;
- tutorId;
- partnerId;
- rating;
- comment;
- status;
- createdAt;
- updatedAt.

Permitir avaliação somente quando a indicação estiver concluída.

## AuditLog

Registrar pelo menos:

- Entidade;
- ID da entidade;
- Ação;
- Usuário responsável;
- Tenant;
- Estado anterior;
- Estado posterior;
- Data;
- IP e user-agent, quando disponíveis.

---

# 6. Hierarquia das regras de comissão

Determinar a comissão nesta ordem:

1. Regra específica do serviço;
2. Regra específica da unidade;
3. Regra específica do parceiro;
4. Regra padrão do tenant;
5. Regra padrão global, se permitida.

Se nenhuma regra válida for encontrada, a conversão deve ficar como `PENDING_REVIEW`. Nunca assumir silenciosamente um percentual.

Exemplo:

```text
Valor do atendimento: R$ 500,00
Comissão configurada: 10%
Comissão Saúde Pet: R$ 50,00
Valor líquido do parceiro: R$ 450,00
````

Utilizar tipo decimal apropriado no banco. Não usar números de ponto flutuante para valores monetários.

---

# 7. Jornada principal

## 7.1 Descoberta

1. Tutor acessa “Rede de Parceiros”.
2. Informa localização ou autoriza geolocalização.
3. Filtra por categoria, serviço, distância, atendimento emergencial e disponibilidade.
4. Abre a página do parceiro.
5. Visualiza unidades, serviços, contatos e avaliações.

## 7.2 Criação da indicação

1. Tutor seleciona o pet.
2. Seleciona o parceiro e o serviço.
3. Informa o motivo.
4. Confirma o envio.
5. Backend gera:

   * Código único;
   * QR Code;
   * Data de validade;
   * Registro de origem;
   * Evento de auditoria.
6. Parceiro recebe uma notificação.
7. Tutor acompanha o status.

## 7.3 Atendimento

1. Parceiro abre a indicação.
2. Confirma a identidade do tutor e do pet.
3. Aceita, agenda ou recusa.
4. Após o atendimento, registra:

   * Data;
   * Serviço realizado;
   * Valor bruto;
   * Desconto;
   * Valor elegível para comissão;
   * Comprovante, quando necessário.
5. Conversão fica aguardando confirmação, conforme a regra administrativa.

## 7.4 Comissão

1. Sistema localiza a regra de comissão válida.
2. Salva um snapshot da regra.
3. Calcula comissão e valor líquido.
4. Registra a conversão de forma transacional.
5. Impede criação duplicada da comissão.
6. Atualiza relatórios.
7. Envia notificações aos envolvidos.

## 7.5 Liquidação

1. Conversões confirmadas entram em um fechamento.
2. Administrador revisa os valores.
3. Sistema gera demonstrativo por período.
4. Pagamento ou cobrança é registrado.
5. Parceiro acompanha o status.
6. Correções posteriores devem ocorrer por lançamento de ajuste, sem apagar o histórico original.

---

# 8. Telas necessárias

## Área pública ou do tutor

### Lista de parceiros

Exibir:

* Pesquisa por nome;
* Categorias;
* Localização;
* Distância;
* Parceiros com atendimento emergencial;
* Cards com logo, nome, categoria, cidade e avaliação;
* Estado vazio;
* Carregamento;
* Paginação ou carregamento progressivo.

### Detalhes do parceiro

Exibir:

* Logo e descrição;
* Unidades;
* Horários;
* Serviços;
* Endereço e mapa;
* Telefones;
* Avaliações;
* Botão “Solicitar indicação”.

### Nova indicação

Fluxo em etapas:

1. Selecionar pet;
2. Selecionar unidade e serviço;
3. Informar necessidade;
4. Revisar dados;
5. Confirmar.

### Minhas indicações

Exibir:

* Código;
* Pet;
* Parceiro;
* Serviço;
* Data;
* Status;
* Linha do tempo;
* QR Code;
* Ações disponíveis;
* Avaliação após conclusão.

## Portal do parceiro

Criar:

* Dashboard;
* Indicações recebidas;
* Agenda;
* Detalhes da indicação;
* Registro do atendimento;
* Serviços;
* Unidades;
* Usuários e permissões;
* Comissões;
* Fechamentos;
* Contestações;
* Configurações do perfil.

Indicadores principais:

* Indicações recebidas;
* Taxa de aceite;
* Conversões;
* Ticket médio;
* Comissão acumulada;
* Valores pendentes;
* Tempo médio de atendimento.

## Painel administrativo

Criar:

* Dashboard da rede;
* Parceiros pendentes;
* Cadastro e aprovação;
* Categorias;
* Serviços;
* Regras de comissão;
* Indicações;
* Conversões;
* Fechamentos;
* Contestações;
* Relatórios;
* Auditoria;
* Configurações.

---

# 9. Endpoints sugeridos

Adaptar ao padrão existente e versionar a API.

## Parceiros

```text
GET    /api/v1/partners
GET    /api/v1/partners/:id
POST   /api/v1/admin/partners
PATCH  /api/v1/admin/partners/:id
POST   /api/v1/admin/partners/:id/approve
POST   /api/v1/admin/partners/:id/suspend
POST   /api/v1/admin/partners/:id/archive
```

## Unidades e serviços

```text
GET    /api/v1/partners/:partnerId/units
POST   /api/v1/partner/units
PATCH  /api/v1/partner/units/:id

GET    /api/v1/partners/:partnerId/services
POST   /api/v1/partner/services
PATCH  /api/v1/partner/services/:id
```

## Indicações

```text
POST   /api/v1/referrals
GET    /api/v1/referrals/my
GET    /api/v1/referrals/:id
POST   /api/v1/referrals/:id/cancel

GET    /api/v1/partner/referrals
POST   /api/v1/partner/referrals/:id/accept
POST   /api/v1/partner/referrals/:id/reject
POST   /api/v1/partner/referrals/:id/schedule
POST   /api/v1/partner/referrals/:id/confirm-attendance
POST   /api/v1/partner/referrals/:id/register-conversion
```

## Administração e financeiro

```text
GET    /api/v1/admin/referrals
POST   /api/v1/admin/referrals/:id/confirm-conversion
POST   /api/v1/admin/referrals/:id/cancel-conversion

GET    /api/v1/admin/commission-rules
POST   /api/v1/admin/commission-rules
PATCH  /api/v1/admin/commission-rules/:id

GET    /api/v1/admin/settlements
POST   /api/v1/admin/settlements/generate
POST   /api/v1/admin/settlements/:id/approve
POST   /api/v1/admin/settlements/:id/mark-paid
```

---

# 10. Segurança e privacidade

Implementar obrigatoriamente:

* Autorização por perfil, tenant, parceiro e unidade;
* Validação de propriedade de cada recurso;
* Proteção contra IDOR;
* Rate limiting;
* Validação de payload;
* Sanitização de entradas;
* Idempotência na criação de conversões e fechamentos;
* Transações para operações financeiras;
* Logs de auditoria;
* Expiração dos códigos de indicação;
* QR Code contendo token aleatório, sem dados pessoais;
* Criptografia ou proteção adequada para dados sensíveis;
* URLs assinadas para documentos;
* Política de retenção de documentos;
* Consentimento e base legal para compartilhar dados;
* Minimização dos dados clínicos;
* Exclusão lógica para registros financeiros e auditáveis.

Nunca colocar CPF, nome, diagnóstico, telefone ou informações do pet diretamente no QR Code.

---

# 11. Regras antifraude

Implementar controles para evitar:

* Duas conversões para a mesma indicação;
* Atendimento registrado após expiração sem autorização;
* Alteração do valor após confirmação;
* Comissão calculada duas vezes;
* Usuário do parceiro confirmando repasse financeiro;
* Tutor avaliando atendimento não concluído;
* Parceiro acessando indicação de outra empresa;
* Upload de comprovante malicioso;
* Reutilização do mesmo comprovante;
* Manipulação do percentual pelo frontend.

Criar alertas para:

* Valor muito acima da média do serviço;
* Grande quantidade de conversões em pouco tempo;
* Alterações recorrentes após confirmação;
* Cancelamentos ou estornos excessivos;
* Conversões confirmadas pelo mesmo usuário que as criou, quando houver conflito de função.

---

# 12. Notificações

Criar eventos internos desacoplados do canal de envio.

Eventos:

* `referral.created`;
* `referral.accepted`;
* `referral.rejected`;
* `referral.scheduled`;
* `referral.expiring`;
* `referral.attended`;
* `referral.converted`;
* `referral.cancelled`;
* `referral.disputed`;
* `settlement.generated`;
* `settlement.due`;
* `settlement.paid`.

Canais possíveis:

* Notificação interna;
* Push;
* E-mail;
* WhatsApp, quando houver consentimento e integração disponível.

Falhas de notificação não podem desfazer uma indicação ou transação financeira. Utilizar fila, retentativas e registro do status de entrega.

---

# 13. Relatórios

Criar filtros por:

* Período;
* Parceiro;
* Unidade;
* Categoria;
* Serviço;
* Cidade;
* Status;
* Origem da indicação.

Indicadores:

* Total de indicações;
* Indicações aceitas;
* Conversões;
* Taxa de conversão;
* Ticket médio;
* Receita bruta movimentada;
* Comissão gerada;
* Comissão recebida;
* Valores pendentes;
* Parceiros com melhor desempenho;
* Serviços mais procurados;
* Tempo médio entre indicação e atendimento;
* Cancelamentos e contestações.

Permitir exportação em CSV e, se o projeto já tiver infraestrutura adequada, PDF.

---

# 14. Testes obrigatórios

## Testes unitários

Cobrir:

* Hierarquia das regras de comissão;
* Cálculo percentual;
* Cálculo fixo;
* Percentual mais valor fixo;
* Limites mínimo e máximo;
* Arredondamento monetário;
* Regra expirada;
* Ausência de regra;
* Máquina de estados;
* Permissões;
* Expiração da indicação.

## Testes de integração

Cobrir:

* Criação da indicação;
* Aceite pelo parceiro correto;
* Bloqueio de acesso por outro parceiro;
* Registro transacional da conversão;
* Idempotência;
* Cancelamento;
* Estorno;
* Geração de fechamento;
* Isolamento entre tenants;
* Upload e acesso de comprovantes.

## Testes ponta a ponta

Fluxos:

1. Tutor cria indicação;
2. Parceiro aceita;
3. Parceiro confirma atendimento;
4. Conversão é registrada;
5. Administrador confirma;
6. Comissão entra no fechamento;
7. Tutor avalia o parceiro.

Testar também os estados de erro, vazio, carregamento, expiração e acesso negado.

---

# 15. Critérios de aceite

A feature somente será considerada concluída quando:

* Parceiros puderem ser cadastrados e aprovados;
* Cada parceiro acessar apenas seus próprios dados;
* Tutor puder gerar e acompanhar uma indicação;
* A indicação possuir código rastreável e seguro;
* Parceiro puder registrar o atendimento;
* Comissão for calculada no backend;
* A regra aplicada ficar registrada como snapshot;
* Não for possível gerar comissão duplicada;
* Administrador puder auditar e confirmar a conversão;
* Fechamentos financeiros puderem ser gerados;
* Logs de auditoria estiverem disponíveis;
* Testes de autorização, multi-tenant e cálculos estiverem passando;
* Frontend estiver responsivo;
* Typecheck, lint, testes e build estiverem sem erros.

---

# 16. Cuidados comerciais e regulatórios

Antes de ativar a operação real:

* Manter a comissão transparente nos contratos;
* Validar o modelo com assessoria jurídica e contábil;
* Verificar as regras aplicáveis do sistema CFMV/CRMVs;
* Separar indicação comercial de decisão clínica;
* Não incentivar prescrição ou procedimento por causa da comissão;
* Exigir consentimento antes de compartilhar dados do tutor ou do pet;
* Manter medicamentos sujeitos a prescrição dentro das exigências aplicáveis;
* Formalizar estornos, cancelamentos, impostos e responsabilidade pelo atendimento.

Esses pontos não devem ficar apenas no código: registrar como pendências obrigatórias para homologação comercial.

---

# 17. Ordem recomendada de implementação

## Fase 1: Fundação

* Modelagem do banco;
* Migration;
* Perfis e permissões;
* Cadastro de parceiros;
* Unidades e serviços;
* Auditoria.

## Fase 2: Indicações

* Busca de parceiros;
* Criação da indicação;
* Código e QR Code;
* Máquina de estados;
* Portal do parceiro;
* Notificações.

## Fase 3: Comissões

* Regras configuráveis;
* Conversões;
* Snapshots;
* Contestações;
* Fechamentos;
* Relatórios.

## Fase 4: Evoluções

* Geolocalização;
* Agendamento integrado;
* Pagamento com split;
* Cupons e campanhas;
* Aplicativo mobile;
* Integrações com clínicas, laboratórios e farmácias.

---

# Entrega esperada do Copilot

Ao terminar cada fase, apresentar:

1. Resumo do que foi implementado;
2. Arquivos criados e alterados;
3. Migration criada;
4. Novas variáveis de ambiente;
5. Endpoints adicionados;
6. Permissões implementadas;
7. Testes executados e resultados;
8. Pendências ou riscos;
9. Instruções para validar manualmente;
10. Confirmação de que não houve regressão nas funcionalidades existentes.

Não declarar a implementação como concluída sem executar typecheck, lint, testes e build.

```
```
Perfeito. Então o blueprint deve orientar o Copilot a **reaproveitar obrigatoriamente a infraestrutura existente**, sem criar serviços paralelos.

Acrescente este bloco ao blueprint:

````markdown
# Infraestrutura existente: uso obrigatório

O projeto já possui:

- PostgreSQL como banco de dados principal;
- Cloudflare R2 para armazenamento de arquivos;
- Cloudflare Images para processamento e entrega de imagens;
- Resend para envio de e-mails.

Antes de implementar, localizar as configurações, clientes, variáveis de ambiente, services e padrões já existentes para esses serviços.

Não instalar ou integrar serviços equivalentes sem necessidade. Não criar uma segunda configuração para PostgreSQL, R2, Cloudflare Images ou Resend.

---

## PostgreSQL

Utilizar o PostgreSQL existente para armazenar:

- Parceiros;
- Unidades;
- Usuários e permissões;
- Serviços;
- Indicações;
- Conversões;
- Regras de comissão;
- Fechamentos;
- Avaliações;
- Metadados dos arquivos;
- Eventos de notificação;
- Logs de auditoria.

Requisitos:

- Criar migrations aditivas;
- Não alterar ou excluir tabelas existentes sem justificativa;
- Utilizar `UUID` ou o padrão de identificador atual;
- Utilizar `NUMERIC/DECIMAL` para valores financeiros;
- Adicionar índices para pesquisas frequentes;
- Adicionar chaves estrangeiras e restrições de unicidade;
- Incluir `tenantId` nas entidades que exigem isolamento;
- Utilizar transações para conversões, comissões e fechamentos;
- Implementar exclusão lógica quando houver obrigação de manter histórico.

Índices recomendados:

- `Partner(tenantId, status)`;
- `Partner(documentNumber)`;
- `PartnerUnit(partnerId, active)`;
- `PartnerService(partnerId, active)`;
- `Referral(tenantId, tutorId, status)`;
- `Referral(partnerId, status, createdAt)`;
- `Referral(referralCode)`, com valor único;
- `ReferralConversion(referralId)`, com restrição adequada para evitar duplicidade;
- `CommissionRule(tenantId, partnerId, active)`;
- `CommissionSettlement(partnerId, periodStart, periodEnd)`.

Não armazenar arquivos binários ou imagens diretamente no PostgreSQL. Salvar apenas metadados e referências seguras.

---

## Cloudflare R2

Utilizar o Cloudflare R2 para arquivos privados ou documentos que não precisam de transformação visual, como:

- Comprovantes de atendimento;
- Notas fiscais;
- Contratos;
- Documentos do estabelecimento;
- Comprovantes de pagamento;
- Relatórios exportados;
- Arquivos relacionados a contestações.

Organização sugerida:

```text
tenants/{tenantId}/partners/{partnerId}/documents/{documentId}/{filename}
tenants/{tenantId}/referrals/{referralId}/documents/{documentId}/{filename}
tenants/{tenantId}/settlements/{settlementId}/documents/{documentId}/{filename}
````

Requisitos:

* O bucket deve permanecer privado;
* Não salvar URLs públicas permanentes;
* Gerar URLs assinadas e temporárias para upload e download;
* Validar autorização antes de gerar qualquer URL;
* Validar MIME type, extensão e tamanho;
* Utilizar nomes de objetos gerados pelo backend;
* Nunca confiar no nome enviado pelo usuário;
* Não permitir que um tenant acesse arquivos de outro;
* Registrar no PostgreSQL:

  * `bucket`;
  * `objectKey`;
  * `originalName`;
  * `mimeType`;
  * `fileSize`;
  * `checksum`, quando disponível;
  * `uploadedBy`;
  * `createdAt`.
* Implementar política de retenção e exclusão lógica;
* Remover ou arquivar objetos órfãos por tarefa controlada;
* Não expor credenciais do R2 no frontend.

O backend deverá emitir URLs assinadas com tempo curto de expiração.

---

## Cloudflare Images

Utilizar Cloudflare Images para conteúdo visual que precise de otimização, transformação e entrega pública ou controlada, como:

* Logo do parceiro;
* Capa da clínica ou hospital;
* Imagens das unidades;
* Fotos dos serviços;
* Imagens públicas do perfil do estabelecimento.

Não utilizar Cloudflare Images para notas fiscais, contratos, laudos ou documentos privados.

Fluxo recomendado:

1. Frontend solicita autorização de upload ao backend;
2. Backend valida usuário, tenant, parceiro e tipo de imagem;
3. Backend gera um upload direto seguro;
4. Frontend envia a imagem;
5. Backend recebe ou confirma o identificador;
6. PostgreSQL salva apenas o `imageId` e os metadados;
7. Interface utiliza variantes predefinidas.

Variantes sugeridas:

* `partner-logo`;
* `partner-card`;
* `partner-cover`;
* `partner-gallery`;
* `thumbnail`.

Requisitos:

* Validar formato e tamanho;
* Remover metadados sensíveis quando aplicável;
* Configurar dimensões e recortes consistentes;
* Utilizar IDs internos, não URLs hardcoded;
* Permitir substituição sem quebrar registros históricos;
* Implementar imagem padrão quando não houver upload;
* Excluir imagens somente após verificar que não existem outras referências.

---

## Resend

Utilizar a integração já existente do Resend para os e-mails transacionais da Rede de Parceiros.

Não criar um cliente Resend separado caso o projeto já possua um serviço centralizado de e-mails.

Criar templates compatíveis com a identidade do Saúde Pet para:

* Convite de usuário do parceiro;
* Cadastro recebido;
* Parceiro aprovado;
* Parceiro rejeitado;
* Parceiro suspenso;
* Nova indicação;
* Indicação aceita;
* Indicação recusada;
* Atendimento agendado;
* Lembrete de atendimento;
* Indicação próxima do vencimento;
* Atendimento registrado;
* Conversão confirmada;
* Contestação aberta;
* Contestação respondida;
* Fechamento gerado;
* Comissão próxima do vencimento;
* Pagamento confirmado.

Requisitos:

* Templates centralizados;
* Assuntos e remetentes configuráveis;
* Nenhum endereço hardcoded;
* Uso da configuração de marca existente;
* Links construídos a partir das URLs configuradas por ambiente;
* Não incluir informações clínicas sensíveis no assunto;
* Evitar dados excessivos no corpo do e-mail;
* Adicionar identificador interno para rastreamento;
* Registrar status de envio no PostgreSQL;
* Implementar retentativas;
* Processar envio de forma assíncrona;
* Falhas no Resend não podem desfazer uma indicação ou conversão.

Estrutura sugerida para eventos de e-mail:

```text
PENDING
PROCESSING
SENT
FAILED
RETRYING
CANCELLED
```

Armazenar:

* Tipo do evento;
* Destinatário;
* Template;
* Entidade relacionada;
* ID externo do Resend;
* Quantidade de tentativas;
* Último erro;
* Data do envio;
* Data da próxima tentativa.

---

## Matriz de armazenamento

| Conteúdo                        | Serviço           |
| ------------------------------- | ----------------- |
| Dados de parceiros e indicações | PostgreSQL        |
| Comissões e fechamentos         | PostgreSQL        |
| Metadados de arquivos           | PostgreSQL        |
| Logo e capa do parceiro         | Cloudflare Images |
| Galeria pública da clínica      | Cloudflare Images |
| Comprovante de atendimento      | Cloudflare R2     |
| Nota fiscal e contrato          | Cloudflare R2     |
| Relatório exportado             | Cloudflare R2     |
| E-mails transacionais           | Resend            |
| Histórico dos envios            | PostgreSQL        |

---

## Variáveis de ambiente

Primeiro localizar e reutilizar os nomes existentes. Somente criar novas variáveis quando não houver configuração equivalente.

Exemplos conceituais:

```env
DATABASE_URL=

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=
CLOUDFLARE_R2_ENDPOINT=

CLOUDFLARE_IMAGES_ACCOUNT_HASH=
CLOUDFLARE_IMAGES_TOKEN=
CLOUDFLARE_IMAGES_DELIVERY_URL=

RESEND_API_KEY=
EMAIL_FROM=
PARTNER_PORTAL_URL=
APP_PUBLIC_URL=
```

Nunca:

* Expor secrets em variáveis públicas do frontend;
* Registrar secrets nos logs;
* Commitar arquivos `.env`;
* Retornar credenciais por endpoints;
* Duplicar configurações de ambientes;
* Utilizar credenciais de produção em desenvolvimento ou testes.

---

## Critérios adicionais de aceite

A implementação somente estará concluída quando:

* PostgreSQL for utilizado como fonte de verdade;
* Migrations forem aplicadas e testadas;
* R2 armazenar documentos privados com acesso temporário;
* Cloudflare Images processar as imagens públicas;
* Resend utilizar a estrutura centralizada de e-mails;
* Nenhuma credencial estiver exposta no frontend;
* Não existirem buckets, bancos ou clientes duplicados;
* O isolamento entre tenants tiver testes automatizados;
* Uploads inválidos forem rejeitados;
* Falhas de e-mail não afetarem transações;
* Conversões e comissões forem transacionais e idempotentes;
* Typecheck, lint, testes e build estiverem aprovados.

```

A separação ideal fica bem definida: **PostgreSQL é a fonte de verdade, R2 guarda documentos privados, Cloudflare Images cuida das imagens do catálogo de parceiros e o Resend executa a comunicação transacional.**
```
