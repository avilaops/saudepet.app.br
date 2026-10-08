# Mapa funcional das telas: Saúde Pet

O que este documento é: **cada tela, cada ação, e se aquilo funciona de ponta
a ponta.** Não é lista de rotas nem inventário visual, é o rastro completo de
cada botão até o banco.

Existe porque as auditorias anteriores (19–20/08/2026) mostraram que "ter tela"
e "funcionar" são coisas diferentes: o botão principal do tutor abria uma tela
que quebrava, o chat abria em branco, o pagamento com cartão nunca funcionou,
uma aba do admin não tinha corpo nenhum e várias telas exibiam número
inventado. Nada disso aparece num inventário de rotas.

## Como ler

Cada ação recebe um destes rótulos:

| Rótulo | Significa |
| --- | --- |
| **OK** | Funciona de ponta a ponta: tela → API → controller → banco |
| **PARCIAL** | Funciona, mas com lacuna concreta (descrita ao lado) |
| **QUEBRADO** | Chama rota inexistente, handler ausente, erro garantido |
| **FACHADA** | Elemento visível sem efeito, ou que coleta dado nunca enviado |
| **NAVEGA** | Só troca de rota (a rota de destino é verificada) |

Regra da casa: **um item só é OK depois de alguém seguir a cadeia inteira no
código.** Nome de função não é prova.

Levantamento consolidado em **20/08/2026**, varrendo as três áreas (tutor,
veterinário, admin/público) tela a tela, botão a botão, com leitura do
controller e do schema em cada ponta.

Números do levantamento: **19 telas de admin, 8 públicas/auth, 14 do tutor,
16 do veterinário**. Encontrados **9 itens QUEBRADOS**, **21 FACHADAS**,
**5 riscos de segurança** e **24 rotas de backend sem nenhuma tela**.

---

# 1. Tutor

### `/tutor` · `/tutor/home`: TutorHome
| Ação | Promete | Cadeia | Status |
| --- | --- | --- | --- |
| "Chamar veterinário" | Abre a solicitação | `/tutor/solicitar`; sem pet, desvia para o cadastro com aviso | **OK** |
| Faixa "Atendimento em curso" | Acompanhar | `GET /solicitacoes/tutor/ativa` → `/tutor/acompanhar/:id` | **OK** |
| Meus pets / Consultas / Histórico / Lembretes | Contadores reais | `/pets`, `/v1/agenda/meus-agendamentos`, `/lembretes` | **OK** |
| Rota `/tutor/home` | Destino de 8 telas e da barra inferior | não existia, dois redirects por toque, item nunca acendia | **CORRIGIDO** (`d839138`) |

### `/tutor/solicitar`: SolicitarAtendimento
| Ação | Promete | Cadeia | Status |
| --- | --- | --- | --- |
| Escolher pet, tipo, endereço, sintomas | Chamado despachado por proximidade | `POST /solicitacoes` → `despacho-solicitacao.service` (earth_box + índice GiST) | **OK** |
| **Passo 3, local** | Onde o veterinário deve chegar | **CORRIGIDO**, era campo de texto livre com o GPS lido em silêncio no fundo: permissão negada = chamado sem coordenada e despacho cego. Agora tem mapa, pino arrastável, endereço escrito a partir da coordenada, busca por endereço para quem nega o GPS, campo de complemento, e o servidor recusa chamado sem coordenada | **OK** |
| Preço mostrado | Valor da cidade | tabela de `CidadeCobertura`, com padrão por tipo | **OK** |

### `/tutor/acompanhar/:id`: AcompanharAtendimento
| Ação | Promete | Cadeia | Status |
| --- | --- | --- | --- |
| Linha do tempo ao vivo | Socket + polling | sala `atendimento:{id}` | **OK** |
| **"Cancelar atendimento"** | Cancela e libera o tutor | `PUT /solicitacoes/:id/cancelar` **não existia**: 404, e o tutor ficava travado sem poder abrir outro chamado | **CORRIGIDO** (`d839138`) |
| Mapa "veterinário a caminho" | Posição do vet | **CORRIGIDO**, a tela do vet transmite a posição, e o tutor vê os dois pontos no mapa (antes era só um link que jogava para fora do app, com um pino sem destino) | **OK** |

### `/tutor/mensagens` e `/tutor/chat/:id`
| Ação | Promete | Cadeia | Status |
| --- | --- | --- | --- |
| Lista de conversas | Últimas mensagens | consumia contrato antigo e renderizava objeto no JSX → a tela caía inteira | **CORRIGIDO** (`d839138`) |
| Chat, anexos, leitura | Socket + R2 | `GET/POST /mensagens`, `GET /solicitacoes/:id/anexos` | **OK** |

### `/tutor/pagamento/:id`: Checkout
| Ação | Promete | Cadeia | Status |
| --- | --- | --- | --- |
| PIX e cartão | Cobrança no gateway | um `select` de `cidade` em `Solicitacao` (campo inexistente) derrubava **todo** o checkout com 500 | **CORRIGIDO** (`d839138`) |
| Cartão | Tokenização no navegador | SDK do MP + `cardToken`; sem chave pública a opção some | **OK** |
| Tela alcançável? | - | **CORRIGIDO**, o histórico mostra "Pagar atendimento" quando existe cobrança aberta | **OK** |

### Demais telas do tutor
| Tela | Lacuna aberta |
| --- | --- |
| `/tutor/historico` | **CORRIGIDO**, traz a avaliação e leva ao checkout quando há cobrança aberta |
| `/tutor/avaliar/:id` | **CORRIGIDO**, a avaliação não conta mais como atendimento; nota 1 ou 2 dispara alerta de qualidade para a equipe |
| `/tutor/planos` | **CORRIGIDO**, a assinatura nasce pendente e só o webhook do gateway a ativa |
| `/tutor/parceiros`, `/tutor/planos`, `/tutor/pagamento/:id` | **CORRIGIDO**, alcançáveis pelo perfil e pelo histórico |
| `/tutor/indicar` | **CORRIGIDO**, o parceiro (e a unidade) recebem e-mail com o código da indicação |
| `/tutor/pets` | raças e idade por seleção, **OK** |

---

# 2. Veterinário

| # | Tela / ação | Diagnóstico | Status |
| --- | --- | --- | --- |
| 1 | `VetProfile` - campo CRMV | **CORRIGIDO**, gravado, com unicidade, e travado depois do credenciamento | **OK** |
| 2 | `VetHome` - "Agora não" | **CORRIGIDO**, recusa de verdade quando o chamado é dele; dispensa persistida quando ainda está na fila | **OK** |
| 3 | `VetConfiguracoes` - modo escuro | **CORRIGIDO**, tema do app inteiro, aplicado no arranque | **OK** |
| 4 | `VetConfiguracoes` - "Documentação (CRMV e comprovantes)" | **CORRIGIDO**, nova tela `/veterinario/documentacao` com upload, situação do credenciamento e a triagem por IA | **OK** |
| 5 | `VetCobrancas` - "Cancelar cobrança" | **CORRIGIDO**, o botão só aparece no que o backend aceita; nos outros estados a tela explica por quê | **OK** |
| 6 | `VetRepasses` - "Solicitar transferência" | **CORRIGIDO**, débito condicional numa transação, um pedido por vez, e fila em `/admin/repasses` onde alguém confirma ou devolve o saldo | **OK** |
| 7 | `VetRepasses` - dados bancários | **CORRIGIDO**, criptografados com o mesmo AES do resto do projeto | **OK** |
| 8 | `VetClube` - assinatura | **CORRIGIDO**, cobrança PIX real; o CRM só libera quando o pagamento é confirmado | **OK** |
| 9 | `VetOnboarding` | **CORRIGIDO**, virou lista de primeiros passos com o estado real de cada item (perfil, documento, conta bancária, online) e botão que leva ao lugar; as duas promessas inexistentes ("dica do dia", "avalie o tutor") saíram | **OK** |
| 10 | Atendimento, encerrar por desistência | **CORRIGIDO**, "Não vou conseguir atender" em `PUT /solicitacoes/:id/desistir`, com motivo obrigatório e aviso ao tutor | **OK** |
| 11 | Atendimento, "a caminho" | **CORRIGIDO**, `watchPosition` enquanto o status é `a_caminho`, com envio a cada 15 s | **OK** |
| 12 | Agenda, remarcar | rota existe, sem botão | **ROTA SEM TELA** |

---

# 3. Admin

### `/admin`: Dashboard
| Ação | Cadeia | Status |
| --- | --- | --- |
| 11 contadores | `GET /admin/dashboard`, agregados reais por tenant | **OK** |
| "N veterinários aguardando" | conta `aprovado_admin:false`, o que inclui rejeitados e suspensos, número inflado | **PARCIAL** |

### `/admin/veterinarios`: Credenciamento
| Ação | Cadeia | Status |
| --- | --- | --- |
| Fila, busca, análise com documentos assinados (R2, 15 min) | `admin-veterinario.controller` | **OK** |
| Aprovar | transação + `VeterinarioSubmissao` + `AuditLog` + e-mail | **OK** |
| Rejeitar | o e-mail imprime o **slug** do motivo (`documento_invalido`), não o rótulo | **PARCIAL** |
| Pedir reenvio | a tela diz "pedido enviado a X" e **nenhum e-mail sai** | **PARCIAL** |
| Suspender / Rejeitar | **CORRIGIDO**, derrubam a sessão aberta junto com a mudança de status | **OK** |
| Checklist da triagem por IA | sem `ANTHROPIC_API_KEY` mostra 4 linhas cinzas "não foi possível verificar" | **PARCIAL** |

### `/admin/operacoes`: Torre de controle
| Ação | Cadeia | Status |
| --- | --- | --- |
| Lista de chamados ao vivo (polling 10 s) | **CORRIGIDO**, `listar` ganhou o ramo do admin, com os chamados em curso do tenant | **OK** |
| Cancelar / reatribuir chamado travado | **NOVO**, cancelamento com motivo (o tutor lê e é liberado para abrir outro) e reatribuição, devolvendo à fila ou entregando a um veterinário credenciado; ambos com trilha forense e aviso às partes | **OK** |
| Tempo de espera | **NOVO**, a coluna destaca em vermelho o chamado aberto há 30 min ou mais sem aceite | **OK** |

### `/admin/whatsapp`
| Ação | Cadeia | Status |
| --- | --- | --- |
| Mensagens, status da integração, envio manual | **CORRIGIDO**, as três chamadas passaram a usar `/v1` | **OK** (falta envio de template para fora da janela de 24 h da Meta) |

### `/admin/moderacao`
| Ação | Cadeia | Status |
| --- | --- | --- |
| Fila, análise, trilha forense | `moderacao.controller` | **OK** |
| **"Punir"** (advertência / suspensão temporária / permanente) | **CORRIGIDO**, o bloqueio é espelhado no usuário e lido no authMiddleware; suspensão temporária expira sozinha e revogar devolve o acesso | **OK** |
| "restricao_funcao" | não há campo de qual função nem consumidor | **FACHADA** |

### `/admin/formularios`
| Ação | Cadeia | Status |
| --- | --- | --- |
| Construtor, ativar/inativar, responder | - | **OK** |
| **"Excluir formulário"** | **CORRIGIDO**, recusa excluir formulário com resposta e orienta a inativar | **OK** |
| Campo do tipo "Arquivo" | **CORRIGIDO**, envia para o R2 e guarda link e nome original na resposta | **OK** |
| Lista | sem `limit`, o default é 20 e não há paginação: do 21º em diante somem | **PARCIAL** |

### `/admin/financeiro`
| Ação | Cadeia | Status |
| --- | --- | --- |
| Estorno no gateway | `POST /v1/payments/:id/refunds` real + `Refund` + `AuditLog` | **OK** |
| "Buscar por ID do pagamento" | **CORRIGIDO**, busca por `id` e `external_payment_id` | **OK** |
| "Faturamento Total Bruto" | **CORRIGIDO**, lista e agregado filtrados por tenant. Os logs de webhook seguem globais **de propósito**: `PaymentEvent` não tem tenant, porque o evento do gateway chega antes de sabermos a que organização pertence | **OK** |
| Estorno parcial / reprocessar webhook | **CORRIGIDO**, campo de valor no estorno (com teto do que resta devolver) e botão de reprocessar no log de webhooks |

### `/admin/auditoria`
| Ação | Cadeia | Status |
| --- | --- | --- |
| Filtros, busca, paginação, log da própria consulta | - | **OK** |
| Select "Tipo de Entidade" | **CORRIGIDO**, as opções vêm do próprio log, com contagem; não há como voltar a mentir | **OK** |
| "Exportar Relatório Pericial" | **CORRIGIDO**, exporta o recorte filtrado, em JSON ou CSV, e o arquivo diz quando o teto cortou registros | **OK** |

### `/admin/atendimentos`
| Ação | Cadeia | Status |
| --- | --- | --- |
| Filtro "Finalizados" | **CORRIGIDO**, abrange `finalizado` e `concluido` | **OK** |
| Bloco de avaliação (estrelas) | **CORRIGIDO**, o `include` traz a avaliação | **OK** |

### `/admin/usuarios`
| Ação | Cadeia | Status |
| --- | --- | --- |
| Trocar privilégios | bloqueia auto-promoção, exige motivo, `AuditLog`; efeito imediato | **OK** |
| **"Revogar Sessões"** | **CORRIGIDO**, grava o corte de sessão que o authMiddleware respeita | **OK** |

### Demais telas de admin
| Tela | Situação |
| --- | --- |
| `/admin/banners` | **OK**, a publicação sem senha pela rota de status foi fechada; desde 07/10 o botão "Desfazer" chama `POST /:id/restore` quando há versão anterior na auditoria |
| `/admin/blog` | **CORRIGIDO**, a capa pode ser enviada como arquivo (o editor só aceitava URL de texto) |
| `/admin/leads` | **OK**, com export CSV; **nada notifica a equipe** quando um lead entra |
| `/admin/analytics` | **OK**, só leitura; `comparison` vem do backend e não é usado |
| `/admin/pagamentos` | **OK**; a URL do webhook cai sempre no literal `saudepet` |
| `/admin/planos` | **CORRIGIDO**, a contagem de assinantes consultava um modelo inexistente e caía sempre em zero; agora abre a lista de quem assina, com cancelamento e link para a cobrança. `limite_atendimentos` segue gravado e **nunca aplicado** |
| `/admin/tenants` | mudar plano **não muda nada funcional**, nada lê `tenant.plano` |
| `/admin/cidades` | **OK**, os preços e a comissão são realmente lidos no despacho e no split |
| `/admin/parceiros` | **CORRIGIDO**, cadastro de parceiro, unidades e serviços na tela, e geração de fechamento por período com quitação e cancelamento (que devolve os atendimentos à fila) |
| `/admin/repasses` | **NOVO**, fila de transferências dos veterinários: dados bancários decifrados, confirmar repasse (com comprovante) ou recusar devolvendo o saldo, tudo com trilha forense |
| `/admin/sistema` | **CORRIGIDO**, os interruptores passam a valer no aviso de novo veterinário (e-mail + popup); os de SMS saíram, porque não existe uma linha de envio de SMS no produto |
| `/admin/atendimentos/:id/auditoria` | **OK**, o "solicitou undefined" foi corrigido |

---

# 4. Público e autenticação

| Tela | Situação |
| --- | --- |
| `/` PublicHome | **CORRIGIDO**, seção "Fale com a nossa equipe" com o formulário de fato renderizado |
| `/contato`, `/faq`, `/blog` | **CORRIGIDO**, novo lead dispara e-mail para os admins do tenant e evento `lead:novo` para quem está com o painel aberto |
| `/pet-tag/:id` | **CORRIGIDO**, cada leitura vira registro (com localização, se a pessoa autorizar) e o tutor recebe alerta; o tutor vê o histórico em `GET /pets/:id/leituras-da-tag` |
| `/privacidade` | **CORRIGIDO**, `/tutor/privacidade` traz baixar meus dados, trocar senha e encerrar conta (anonimizando, com o prontuário do pet preservado por guarda obrigatória) |
| `/login` | **CORRIGIDO**, a sessão renova sozinha via `POST /auth/refresh` (o token era emitido a cada login e descartado; a sessão morria em 7 dias) e o "Sair" invalida o token |
| `/register` | **CORRIGIDO** em 07/10, a resposta traz `email_verificacao_enviado` e a tela diz quando o e-mail não saiu, com o botão de pedir novo link em destaque. `tenant_slug` segue fixo no front: o produto tem um tenant só |
| `/verify-email` | **CORRIGIDO**, a tela de link inválido tem o formulário de pedir novo link (`POST /auth/resend-verification`) |
| `/forgot-password` | **CORRIGIDO**, 4xx continua neutro por segurança; falha de rede e 5xx viram aviso honesto |
| `/reset-password` | **CORRIGIDO**, a troca de senha derruba toda sessão emitida antes dela |

---

# 5. Riscos de segurança

Todos os cinco encontrados foram fechados em 20/08/2026:

1. **`POST /api/v1/pdf/receita` e `/pdf/prontuario` sem autenticação**, qualquer pessoa na internet gerava um PDF com conteúdo arbitrário em papel de receita veterinária e recebia uma URL do nosso CDN. Agora exigem veterinário autenticado. **FECHADO**
2. **Publicação de banner sem senha**, `validStatuses` da rota de status aceitava `'PUBLISHED'`, contornando o portão de senha do `/publish`. **FECHADO**
3. **Access token nunca invalidado**, logout, revogar sessão, suspender veterinário e trocar senha eram anúncios; o JWT de 7 dias seguia aceito. `usuarios.sessoes_revogadas_em` é lido no authMiddleware. **FECHADO**
4. **Punição sem enforcement**, a moderação registrava e nada aplicava. **FECHADO**
5. **Vazamento entre tenants** no financeiro. **FECHADO**

Pendente de outra natureza (não é falha, é ausência): a Política de Privacidade promete acesso, portabilidade e exclusão de dados (LGPD art. 18) e **não existe endpoint nem tela** para nada disso.

---

# 6. O que falta

**`limite_atendimentos` - resolvido pela economia dos próprios planos.** O campo
estava gravado e nunca aplicado, e sozinho era ambíguo. Mas os planos cadastrados
dizem o que vendem: o "Saúde PET Básico" custa R$ 29,90, promete *"10% de
desconto em todas as consultas"* e tem `limite_atendimentos = 2` - e a consulta
domiciliar custa R$ 150, cujos 10% são R$ 15, dois por mês R$ 30, praticamente a
mensalidade. O número é **quantos atendimentos do mês recebem o desconto**. Não é
teto de atendimento (bloquear alguém de chamar veterinário para um pet doente
seria inaceitável) nem franquia de consulta grátis (nenhum plano promete isso no
próprio texto). Implementado assim, com o desconto saindo da comissão da
plataforma, quem vende o plano é quem banca o benefício; o veterinário recebe o
mesmo que receberia sem plano nenhum.

**Ainda pendente de decisão comercial:** o texto do plano VIP promete
*"Teleorientação Veterinária Ilimitada"* e *"Vacina anual preventiva inclusa sem
custo adicional"*. Essas duas custam mais do que a comissão da plataforma cobre -
uma teleorientação de R$ 80 rende R$ 12 de comissão, então não são financiáveis
pela mecânica do desconto. Ou viram um custo assumido pela operação, ou o texto
da vitrine precisa mudar.


Fora isso, a lista fechou: os itens QUEBRADO, FACHADA e as ausências mapeadas em
19–23/08/2026 foram todos corrigidos e estão em produção. O documento continua
sendo a régua, item novo entra aqui antes de virar código.
