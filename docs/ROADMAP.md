# Roadmap: Saúde Pet

**Reescrito em 24/08/2026.** Este documento é a única régua do projeto. Nada entra em código
sem estar aqui; nada aqui fica sem dono, critério de pronto e motivo. O histórico do que já
foi feito está no `CHANGELOG.md`; o mapa tela a tela está no `TELAS.md`; a jornada que o dono
do produto especificou está em `automations/orquestrador-jornada-usuario.n8n-agent.json`
(daqui em diante, **o briefing**).

**Última verificação contra produção ao vivo:** 26/08/2026, endpoints, containers, workers,
service worker, SMTP e banco no servidor. Backend com 82 suítes e **700 testes** verdes.

**Onde o plano está:** as Fases 0, 2 e 3 estão fechadas, o que restou nelas não é código, é
credencial, conteúdo ou decisão de painel externo. A Fase 1 (TypeScript) está em três das seis
camadas. A Fase 4 foi revisada contra o código e encolheu: **seis dos itens já não existiam**,
tinham sido resolvidos e a lista, herdada de auditorias antigas, não sabia.

---

## Como ler e como usar

Cada item tem quatro linhas fixas:

- **O quê**, a mudança, em uma frase.
- **Por quê**, o problema real que ela resolve. Item sem esta linha não deveria existir.
- **Onde**, arquivos, rotas, tabelas. É o mapa para quem for executar.
- **Pronto quando**, a condição objetiva de encerramento. Sem isso, "feito" vira opinião.

As fases estão em ordem de execução recomendada, e a ordem tem lógica: primeiro para de
prometer o que não existe (risco), depois arruma a fundação (TypeScript), depois fecha a
jornada, depois pole. Dentro de uma fase, a ordem é livre.

Marcadores: **[TS]** implementação nova, já em TypeScript. **[DECISÃO]** depende de escolha
comercial do Nicolas, não de engenharia. **[MIGRAÇÃO]** mexe em código que já existe.

---

## Regras permanentes

Valem para tudo que entrar daqui para frente. Não são tarefas; são o contrato.

1. **TypeScript em toda implementação nova.** Arquivo novo nasce `.ts`/`.tsx`. Sem exceção,
   inclusive em teste, script e worker. É o padrão de todos os projetos da Avila Ops.
2. **Arquivo tocado é arquivo migrado.** Ao mexer num `.js` legado por outro motivo, ele vai
   junto para TypeScript no mesmo commit, desde que caiba. Se não couber (arquivo gigante,
   mudança urgente), abre-se item na Fase 1 e o commit diz por quê.
3. **Serviço sem tela não é entrega.** Toda funcionalidade precisa do fluxo completo na
   interface: cadastro, edição, erro e estado vazio. API sozinha é metade do trabalho.
4. **Nada de promessa sem lastro na tela.** Se o app oferece, o app faz. Texto de vitrine que
   descreve recurso inexistente é dívida com o cliente, não com o código. **Desde 31/08/2026
   isto é verificado por máquina:** `npm run verificar:dados-falsos` (roda sozinho no
   `prebuild` do frontend e do backend) reprova a entrega quando uma tela desenha uma lista de
   registros escritos à mão — id, conteúdo e estado, tudo literal — como se viesse do banco.
   Foi assim que a central de notificações passou meses mostrando quatro avisos de mentira,
   com "Há 15 minutos" congelado no código, sem que revisão, build ou deploy notassem.
   Constante de domínio continua passando (lista de bancos, unidades, espécies): o que a regra
   procura é registro fingindo ser real. Caso legítimo se declara na linha de cima, com
   motivo escrito: `// dados-de-exemplo-proposital: <por quê>`.
5. **Mudança de `schema.prisma` exige `docker compose up -d --build`.** `restart` não regenera
   o Prisma Client dentro da imagem, e o container recriado perde o que foi gerado à mão
   foi assim que a produção respondeu 401 em tudo no dia 23/08.
6. **Migration aditiva por padrão.** Coluna nova nasce opcional ou com default; remoção de
   coluna só depois que ninguém lê mais.
7. **Toda escrita sensível é auditada.** `AuditService.logForensicEvent` com estado anterior e
   posterior, dentro da mesma transação.
8. **Português no produto e no código.** O site é em português; nomes de domínio, comentários
   e mensagens de erro acompanham.

---

## FASE 0: Parar de prometer o que não existe

Bloqueante. Cada item aqui é uma promessa no ar que a plataforma não cumpre. Enquanto isso
existir, divulgar é vender algo que não entregamos.

### 0.1 ~~Teleorientação vendida como videochamada, sem videochamada~~: **feito em 25/08**

Decisão do Nicolas, 25/08: *"teleorientação sem vídeo não existe isso"*. Então o vídeo foi
construído, e não a vitrine reescrita.

**WebRTC entre os dois aparelhos, direto.** O servidor só apresenta um lado ao outro, repassa os
pacotes de negociação pelo Socket.IO que já existe, com a mesma autorização das outras salas do
atendimento. A consulta não passa pelo servidor nem fica gravada nele: numa conversa clínica isso
é o comportamento certo, não uma economia.

Duas armadilhas clássicas do WebRTC ficaram resolvidas na biblioteca, para a tela não precisar
saber delas: **quem já estava na sala faz a oferta** (se os dois oferecem ao mesmo tempo, a
chamada trava em "conectando" para sempre), e **candidatos de rede que chegam antes da descrição
remota entram numa fila** em vez de serem recusados.

A chamada só abre quando a pessoa toca, nunca sozinha, câmera que liga sem pedir faz desinstalar
aplicativo. Sair da tela desliga a câmera. E a chamada só é oferecida em teleorientação com o
atendimento de pé.

**A retransmissão existe desde 27/08/2026.** Em redes muito fechadas (Wi-Fi corporativo, NAT
simétrico, parte das operadoras móveis) os dois aparelhos não se enxergam e a chamada precisa de
um relay. Havia `TURN_URL`/`TURN_USERNAME`/`TURN_PASSWORD` vazios e o app avisava antes em vez de
mostrar tela preta, honesto, mas a chamada não acontecia.

Agora há um **coturn no próprio servidor**: porta 3478 UDP/TCP, relay em 49160-49200, config em
`/etc/turnserver.conf`, credencial de longa duração gerada no servidor.

Provado de fora com `scripts/prova-turn.ts`, que fala STUN/TURN cru: **401 sem credencial** e
**relay alocado com credencial**. As duas metades importam, um TURN que aloca sem credencial é
proxy aberto para o mundo usar de graça, e é assim que servidor de vídeo vira custo de banda de
outra pessoa. A config também recusa relay para as faixas privadas (`denied-peer-ip`), senão um
cliente autenticado pediria retransmissão para 127.0.0.1 e falaria com o Postgres por dentro.

`turnutils_uclient` rodando na própria máquina do coturn NÃO prova isso: ele nunca sai para a
internet e seus peers caem justamente nas faixas bloqueadas. A prova tem que vir de fora.

`videochamada.service.ts`, `videochamada.controller.ts`, `lib/videochamada.ts`,
`Videochamada.tsx`, 10 testes.

### 0.2 ~~Plano VIP promete o que a comissão não paga~~: **feito em 25/08**

O plano está aprovado com esse texto, então **o benefício virou real e o custo é assumido pela
operação**. O que não podia continuar era a vitrine prometer e o sistema não entregar.

- **Teleorientação ilimitada**, cobre a consulta inteira, sempre, e **não consome o limite mensal
  do desconto**: contar as duas juntas faria o assinante VIP perder o desconto das consultas por
  ter conversado com o veterinário.
- **Vacina anual inclusa**, a primeira vacinação de cada doze meses sai por zero; a segunda volta
  ao desconto percentual normal.

Os dois são lidos de `PlanoAssinatura.beneficios`, que é JSON: mudar o corte comercial continua
sendo pelo banco, sem deploy. Benefício mal escrito ali não derruba a cobrança, sem o especial, o
desconto percentual continua valendo.

**O custo, registrado para quem for olhar a margem:** a comissão sobre uma teleorientação de R$ 80
é de R$ 16, e o plano cobre R$ 80. Cada teleorientação de assinante VIP custa R$ 64 à operação. É
decisão comercial tomada, não um efeito colateral. 8 testes.

### 0.3 LGPD art. 18: **já existia; revisado em 25/08**

*A entrada anterior estava errada.* Acesso, portabilidade e exclusão **estão implementados**:
`dados-pessoais.service.js`, as rotas `GET /users/meus-dados`,
`GET /users/minha-conta/pendencias` e `POST /users/minha-conta/encerrar`, e a tela
`/tutor/privacidade` com o download do pacote e o encerramento da conta. A exportação é
auditada, e o encerramento roda em transação com registro em `audit_logs`.

O equilíbrio jurídico já está resolvido no código, e é a parte que importa: encerrar a conta
**anonimiza o titular e preserva o registro clínico do animal**. Prontuário veterinário tem
retenção obrigatória, e apagar histórico de vacina e alergia de um pet pode custar a vida dele
num atendimento futuro, é o que a própria LGPD prevê entre o art. 18 e o art. 16, I.

**O que falta é fora do código:** revisar o texto da Política de Privacidade com responsável
jurídico (Fase 5), porque o multi-tenant ampliou a superfície de dados tratados desde a última
redação.

### 0.4 ~~Rotacionar a credencial que vazou no repositório~~: **encerrado em 26/08**

Decisão do Nicolas: a chave não representa risco. Item fechado sem ação.

### 0.5 QA administrativo com conta real

- **O quê**, Publicar artigo no blog, mover um lead, aplicar filtros e exportar CSV com uma
  conta de admin de verdade, não sintética.
- **Por quê**, A Fase 1 do multi-tenant pode ter fechado caminho que o admin do próprio
  tenant precisa. Teste sintético não pega isso.
- **Pronto quando**, as quatro operações concluídas em produção, sem 403 indevido.

### 0.6 Canal oficial de WhatsApp vazio: **sem efeito desde 11/09**

- **O quê**, `VITE_WHATSAPP_URL` está vazio; o botão de contato não leva a lugar nenhum.
- **Estado real (auditoria de 11/09)**, nenhum arquivo do frontend lê mais a variável: o
  contato público é o formulário, e o WhatsApp que aparece é o de cada loja do Mercado.
  Reabrir só se voltar a existir botão de WhatsApp da plataforma.

### 0.7 Blog publicado e vazio

- **O quê**, Estrutura pronta (`BlogPost`, `BlogCategory`, editor no admin), zero conteúdo.
- **Por quê**, O tutor tem "Dicas de Saúde Pet" no dashboard prometido pelo briefing, e a
  seção existe sem nada dentro.
- **Pronto quando**, ao menos cinco artigos reais publicados.

### 0.8 ~~Ninguém encerra a busca quando não existe veterinário~~: **feito em 24/08**

O estado `sem_veterinario` estava na máquina desde sempre, era terminal, tinha a mensagem de
push escrita, e nada transicionava para ele: sem plantonista, a solicitação ficava em
`procurando_veterinario` indefinidamente.

Agora uma varredura de dois em dois minutos encerra as buscas vencidas (20 min para
emergência, 40 para teleorientação, 60 para consulta domiciliar, o dobro do prazo em que a
equipe é alertada pelo SLA, porque desistir enquanto alguém ainda tenta resolver na mão seria
precipitado), e a transição dispara o push que já existia. `sem_veterinario` deixou de ser
terminal: `POST /solicitacoes/:id/retomar-busca` devolve o mesmo chamado à fila com pet,
sintomas e endereço preservados, respeitando a regra de um atendimento ativo por tutor. A tela
diz o que aconteceu e, antes dos botões, orienta procurar pronto-socorro se o caso for grave.

`busca-sem-resposta.service.ts`, `busca.controller.ts`, 9 testes em
`busca-sem-resposta.service.test.ts`, `BuscaEncerrada.tsx`. Tudo em TypeScript.

---

## FASE 1: ~~Migração para TypeScript~~ **[MIGRAÇÃO]** — **FECHADA em 08/09/2026**

**Feito:** fundação (1.1), `schemas`, `utils`, `config`, `middleware`, `services` e
`controllers`. **Falta:** `routes` e o frontend.

Cada camada migrada até aqui cobrou uma dívida que o JavaScript escondia, as mensagens do Zod
que nunca apareciam, o `ioredis` que nunca esteve instalado, o `startsWith(undefined)`. Vale
registrar a expectativa daqui em diante: **a camada que concentrava as armadilhas já saiu.** O
resto tende a ser conversão com ganho de manutenção, não de descoberta.

O backend tem 321 arquivos `.js` e o frontend 110 `.jsx`. Nada disso vira TypeScript num
commit, e tentar seria irresponsável, a plataforma está no ar com clientes. A migração é por
camadas, cada uma com a suíte de testes verde antes de seguir.

O esqueleto NestJS/TypeScript que dormia em `backend/src` desde abril **foi apagado em
24/08/2026** (commit `6758a14`, 79 arquivos): nunca teve dependência instalada, nunca foi
importado, nunca rodou. Não confundir aquilo com esta migração, aquilo era código morto, isto
é a base viva mudando de linguagem.

### 1.1 ~~Fundação do backend~~: **feito em 24/08**

`tsconfig.json` com `strict`, `allowJs` e `outDir: dist`; o compilador atravessa `src` inteiro
e o container passa a executar `dist`. Os 321 arquivos JavaScript compilaram **sem um único
erro**, só os dez `*.old.js` de julho não passaram, e foram apagados, porque ninguém os
importava. `ts-jest` montado; os testes continuam lendo `src`, nunca `dist`, que seria artefato
velho na metade das rodadas.

Duas armadilhas desarmadas: `useDefineForClassFields` desligado (o padrão em ES2022 troca a
semântica de campo de classe e os controllers da casa são `metodo = asyncHandler(...)` - a
herança quebraria em silêncio, sem erro de compilação), e o volume `./backend/src` removido do
compose, porque o container roda `dist` e manter o código-fonte montado por cima daria a
impressão de que editar no servidor aplica alguma coisa.

**Mudou a rotina de deploy: backend agora exige `docker compose up -d --build`.**

Primeiro módulo migrado: `config/database.ts`, o singleton do Prisma, é o mais importado da
casa, então tipá-lo entrega o modelo do banco inteiro a todo arquivo que nascer `.ts`.

### 1.2 Ordem das camadas do backend

Da borda de dentro para fora, porque cada camada tipada dá tipo à seguinte:

1. ~~**`src/schemas/`**~~ - **feito em 25/08.** Os 17 arquivos migrados, e a primeira compilação
   cobrou uma dívida que o JavaScript escondia: **`errorMap`, `invalid_type_error` e
   `required_error` são opções do Zod 3, e a casa está no Zod 4, que as ignora.** Nove arquivos
   usavam alguma delas: ou seja, todas aquelas mensagens de erro caprichadas nunca chegaram a
   ninguém: quem errava o campo recebia o texto genérico da biblioteca. Corrigidas para `error`.
   Junto, um `z.record(z.any())` que no Zod 4 exige o tipo da chave e validava menos do que
   parecia.
2. ~~**`src/utils/` e `src/config/`**~~ - **feito em 26/08.** E a conversão, que devia ser
   mecânica, achou uma armadilha: **`config/redis` importava `ioredis`, que nunca esteve nas
   dependências do projeto.** O único arquivo que o usava (`cache.middleware`) não era importado
   por rota nenhuma, bastava alguém pendurar o middleware numa rota para o servidor não subir,
   com `Cannot find module 'ioredis'` no boot. Os dois foram removidos, junto das variáveis
   `REDIS_*` do `.env.example` e do mock no `tests/setup`.

   No `config/r2`, o compilador cobrou `keyFromUrl` chamando `startsWith(undefined)` quando
   `R2_PUBLIC_URL` não está configurada.
3. **`src/services/`**, o coração. **Núcleo migrado em 26/08**: `atendimento-state`,
   `despacho-solicitacao`, `geo`, `geocoding` e `rota`. **Mais oito no mesmo dia**: `crypto`,
   `token`, `socket-security`, `public-tenant`, `analytics-retention`, `push`, `indexnow` e
   `notificacao-admin`. **Mais oito em 29/08**: `meta-graph`, `meta-conversions`, `meta-leads`,
   `threads`, `banner-image`, `banner-copy`, `pdf-reemissao.worker` e
   `agendamento-atendimento.worker`. **Os 21 restantes em 29/08** (`payment/*`, `gateways/*`,
   agendamento e workers, e-mail/PDF/WhatsApp/blog, CRM/retenção/analytics do vet,
   `scripts/seed-planos`): **camada fechada, 42/42.** O compilador cobrou `uf_crmv`, campo que
   não existe (a coluna é `crmv_uf`): toda receita reemitida, retificada ou emitida no fechamento
   imprimia UF `SP`. Dívidas registradas: `Usuario` sem `asaasCustomerId` (Asaas sempre cria
   customer), `refundPayment` sem checar `external_payment_id`, `method` do Mercado sem validar
   contra `PaymentMethod`, `@types/pdfkit` e `@types/nodemailer` ausentes.

   A previsão acima, de que "a camada das armadilhas já saiu", estava errada. Os serviços de
   segurança cobraram mais três dívidas:

   - `validatePasswordResetToken` e `validateEmailVerificationToken` prometiam
     `tenant_id: string`, mas a coluna é `String?`. Com token órfão, o controller cai numa busca
     só por e-mail, e num produto multi-tenant isso alcança o primeiro usuário com aquele
     e-mail em QUALQUER organização. Latente enquanto houver um tenant só; o tipo agora avisa.
   - `CryptoService.constructor.generateKey()` era como o único chamador alcançava um `static`,
     porque o módulo exporta uma INSTÂNCIA. Funcionava por acidente do JavaScript.
   - `generateNumericToken` fazia `randomBytes[i] % 10`, com viés: 256 não é múltiplo de 10.

   E a leitura (não o compilador) achou o socket aceitando `solicitacao:nova` VINDO DO CLIENTE,
   retransmitindo o chamado para todos os veterinários do tenant, um caminho autenticado para
   furar o raio que a busca por proximidade tinha acabado de estabelecer. Removido.

   **Lição para as camadas seguintes:** não é o volume de código que esconde dívida, é o quanto
   dele nunca foi lido de novo depois de escrito.

   `transicionar` agora tem tipo, e é o que mais rende de tudo: ele é o funil único por onde
   toda mudança de atendimento passa, e até agora quem o chamava não tinha como saber se estava
   passando o parâmetro certo. Foi o que me obrigou a espalhar `as StatusAtendimento[]` nos
   serviços que o consomem; o primeiro deles já foi limpo.

   Dois contratos ficaram honestos no caminho: `paraCoordenada` estava anotado como
   `number | null` e **nunca devolve null**, devolve `NaN` para coordenada ausente, que é
   justamente o comportamento que evita a Ilha Nula; e `podeTransicionar` aceita texto solto de
   propósito, porque quem pergunta costuma vir de uma request e status inventado precisa devolver
   `false` em vez de estourar.
4. ~~**`src/middleware/`**~~ - **feito em 29/08.** Os seis middlewares em `.ts` e
   `src/types/express.d.ts` declarando o que a casa pendura em `req` (`userId`, `userType`,
   `user`, `impersonadoPor`, `tenantId`, `isSuperAdmin`, `tenant`, `recursosDoVet`). Sem isso a
   camada de controllers migraria espalhando `as any`. Achado no caminho: `multer` 2 não traz
   tipos e `@types/multer` nunca esteve instalado. `test:unit` e `test:e2e` (94/94) verdes.
5. ~~**`src/controllers/`**~~ - **feito em 31/08.** Os 41 controllers em `.ts`, com
   `test:unit` (967), `test:integration` (6) e `test:e2e` (107) verdes e `tsc --noEmit` limpo.
   A camada que devia ser "conversão sem descoberta" foi a que mais cobrou, e três dos achados
   estavam **quebrando função em produção**:

   - `mensagemDe` em `solicitacao.controller` devolvia `mensagemDe(erro)` em vez de
     `erro.message`: recursão infinita. **Finalizar atendimento respondia 500**, e como o
     prontuário e a mudança de status vinham depois, o atendimento ficava preso em
     `atendimento_em_andamento` e o tutor não conseguia avaliar.
   - O dossiê de auditoria pedia `include: { anexos: true }` em `Solicitacao`, relação que só
     existe em `Mensagem`. O Prisma recusa include desconhecido, então **o dossiê inteiro
     respondia erro**. Estava assim no `.js` desde sempre.
   - Ainda no dossiê, a seção de chat lia `texto`, `emissor_id`, `imagem_url` e `emissor_tipo`,
     **nenhum dos quatro existe em `Mensagem`** (são `conteudo` e `remetente_id`; mídia mora em
     `mensagens_anexos`). Toda mensagem saía como "[Anexo de Mídia]", sem autor e sem anexo.
   - `solicitacao.controller` lia `.default` de um `require` do `email.service`, que exporta por
     `module.exports`: `.default` é `undefined`. **O e-mail com receita e prontuário nunca saía
     no fechamento do atendimento.**

   Duas dívidas de tipo resolvidas na origem, em vez de remendadas no uso: `addTenantFilter`
   devolvia `tenant_id` como `unknown` (agora `string` opcional, e sem tenant o filtro não
   entra), e `documento_analise`, coluna `Json?`, precisa de `Prisma.DbNull` ao ser copiada, ou
   o Prisma grava o literal JSON `null`.

   E o mock de e-mail dos testes tinha 10 dos 25 métodos do serviço. Quem chamava um dos 15 que
   faltavam caía no `catch` de best-effort: **a suíte passava verde sem nunca exercitar o
   envio**. O mock virou um só, em `tests/mocks/email-service.mock.ts`, com a lista completa.
6. ~~**`src/routes/`**~~ - **feito em 01/09.** As 44 rotas em `.ts`, com `tsc --noEmit`
   limpo e 985 testes verdes. A conversão é mecânica de propósito: a rota monta um Router,
   pendura middleware e handler, e exporta. **`export =` e não `export default`**, porque
   compila para `module.exports = router` exato, e o `server.js` faz `require()` entregando o
   valor direto ao Express; com `export default` o Express receberia um objeto sem `handle`.
   Os três webhooks ficaram com o import completo do express, e não só do Router, porque
   montam o parser de corpo por rota (a assinatura do provedor é conferida sobre o corpo cru).

   Provado no runtime, não só na compilação: os 49 arquivos de `dist/routes` carregam e são
   Router de verdade. Compilar não bastava, já que o risco todo estava na forma exportada.

   O compilador achou uma: `isSuperAdmin`, em `tenant.routes`, lia `req.user.tipo_usuario`
   direto. O `authMiddleware` roda antes e sempre preenche, mas o tipo não garante, e uma
   ordem de middleware trocada derrubaria a rota com "cannot read tipo_usuario" em vez de
   responder o 403 que já estava escrito na linha seguinte.

   **Falta só o `src/server.js`**, mais os 23 templates de e-mail e um arquivo de conteúdo:
   25 `.js` no total, contra 321 no começo da migração.
7. **`src/workers/` e `src/scripts/`**, junto do serviço que cada um consome.

- ~~**Pronto quando**, `allowJs: false` compila.~~ **Compila, em 08/09/2026.** De 321
  arquivos JavaScript no começo para **zero** em `backend/src`.

  A última leva foi `server.js`, os 21 templates de e-mail, o layout, o índice e o arquivo de
  conteúdo do blog. Os templates são mecânicos e o HTML ficou intacto; dois deles têm mapa de
  eventos com funções e precisaram de tipo no índice, porque `evento` chega como texto livre
  de quem envia.

  **O `server.ts` era o que estava em risco**, e preservou tudo: ordem dos middlewares,
  socket.io, os 12 workers, o desligamento no SIGTERM e o carregamento das variáveis. O
  Dockerfile não mudou, porque o `tsc` continua emitindo em `dist/server.js`.

  O compilador achou um bug de verdade no bootstrap: `res.getHeader('RateLimit-Reset')`
  devolve texto, número ou lista conforme quem escreveu o cabeçalho, e o código passava direto
  para `Math.ceil`. Com texto isso vira `NaN`, e quem estourasse o limite leria "Tente de novo
  em NaN minutos".

  **Provado em produção, não só na compilação:** 251 arquivos `.ts` compilados no contêiner,
  os 10 workers anunciando no boot, servidor na porta 3000, e as rotas respondendo pelo nginx.
  Os 21 templates geram HTML válido a partir do `dist`, e 996 testes unitários passam.

  Sobrou um `.js` só no servidor, `offer-expiry.worker.js`, que nunca esteve no git e agora
  nem é compilado: código morto a remover.

### 1.3 Frontend

*A fundação saiu em 24/08:* `frontend/tsconfig.json` com `strict`, `allowJs` e `noEmit`, mais
`@types/react`. `npx tsc --noEmit` passa limpo, e o primeiro componente `.tsx`
(`BuscaEncerrada`) já está em produção.

- **O quê**, Vite já entende TypeScript sem configuração. A migração é renomear `.jsx` →
  `.tsx` por tela, com `allowJs: true` durante a travessia.
- **Primeiro os tipos compartilhados**, `src/types/api.ts` com as respostas reais da API
  (atendimento, pet, prontuário, solicitação, veterinário). Sem isso, migrar tela é só trocar
  extensão sem ganhar nada: o valor está em o componente saber o que chega de `api.get`.
- **Ordem**, `services/api`, depois `lib/`, depois os design systems (`AppKit`, `VetUI`,
  `AdminUI`), depois as telas, começando pelas do fluxo crítico do tutor.
- **Pronto quando**, nenhum `.jsx` restante e `strict` ligado.

### 1.4 ~~Higiene que a migração deve corrigir no caminho~~: **feito/revisado em 25/08**

- ~~`tests/unit/controllers/solicitacao.controller.test.ts` não testa o controller~~ - **a
  entrada estava errada.** O arquivo foi reescrito em algum momento e hoje exercita o controller
  de verdade, com mock do Prisma: prontuário, encaminhamento, histórico paginado e recusa. A
  anotação vinha de uma auditoria anterior à reescrita.
- ~~Campos `oferta_enviada` e `oferta_vence_em` órfãos~~ - **`oferta_vence_em` removida.** Ela
  nasceu para o fluxo de oferta com prazo, descartado em 19/08 quando a fila aberta virou o modelo
  oficial, e desde então ninguém escrevia valor nela, só a limpava ao aceitar. Coluna que ninguém
  preenche e ninguém lê convida alguém a supor que significa alguma coisa.

  **O valor `oferta_enviada` do enum permanece**, por decisão: a máquina de estados ainda o aceita
  como origem, e remover valor de enum no Postgres exige recriar o tipo inteiro, risco
  desproporcional para apagar um nome que não atrapalha.
- **`backend/coverage/`** é relatório gerado do Jest e já está no `.gitignore` - não confundir com
  código.

## FASE 2: Fechar a jornada do briefing

Cruzamento do briefing com o código, feito em 24/08/2026: dos 23 passos do tutor e 12 do
veterinário, **30 já são produzíveis de ponta a ponta**. O que falta está aqui, separado entre
o que não existe e o que diverge por decisão.

## 2.A: O que não existe

### 2.A.1 ~~Onboarding do tutor~~: **feito em 25/08**

Três telas em `/comecar`: veterinário onde o pet estiver, profissionais verificados, tudo fica
registrado. Aparecem uma vez, **só no app instalado**, no navegador a pessoa veio do site, que já
explica -, e o "pular" fica à vista desde a primeira: onboarding é cortesia, não pedágio. Quem
está com o animal passando mal não pode ser obrigado a ler propaganda antes de pedir socorro.

Armazenamento bloqueado mostra de novo em vez de quebrar a abertura do app.

`OnboardingTutor.tsx`.

### 2.A.2 ~~Anexos na descrição do problema~~: **feito em 24/08**

Foto, vídeo curto e áudio no passo dos sintomas, e miniatura na fila de chamados ao lado do
botão Aceitar: **dá para ver a ferida antes de dizer sim.** Antes, o único caminho para arquivo
era o chat, que só abre depois do aceite.

`midias_atendimento` recebe as duas origens. O papel de quem envia sai do token, nunca do corpo
- quem manda o arquivo não escolhe se ele conta como registro clínico -, e a leitura distingue:
o do tutor é relato, o do veterinário é registro, e o PDF diz qual é qual. Quem enxerga
acompanha o momento: participantes e admin sempre; enquanto ninguém aceitou, qualquer
veterinário aprovado do tenant; depois do aceite, os outros deixam de ver.

Os arquivos sobem depois da criação do chamado (só então existe atendimento a que prendê-los) e
falha de upload não derruba o pedido. Tudo sob `clinico/`, fora do worker de retenção.

`midia-atendimento.service.ts`, `midia-atendimento.controller.ts`, `MidiasDoAtendimento.tsx`,
19 testes. Migration `20260824180000_add_midias_do_atendimento`.

### 2.A.3 ~~Avaliação do tutor pelo veterinário~~: **feito em 24/08**

`autor_papel` diz quem escreveu, a unicidade virou `[atendimento_id, autor_papel]` e cada
atendimento comporta as duas avaliações. Toda linha existente já é `tutor`, que é o padrão da
coluna nova.

O que o profissional avalia é a experiência de atender ali, endereço certo, alguém para
receber, pet contido, informações batendo com o que encontrou. A reputação do tutor aparece na
**fila de chamados**, ao lado da distância, e fica gravada em `usuarios` em vez de calculada na
leitura: calcular por card seria uma consulta a mais na tela que mais precisa ser rápida.

O trabalho de verdade foi outro: **seis leituras passaram a declarar a direção**, perfil do
profissional, distribuição de estrelas, métrica do admin, histórico do tutor, listas do
veterinário e CRM. Sem isso a média do veterinário passaria a incluir as notas que ele deu, e a
reputação dele dependeria de quanto ele gosta dos clientes. As telas continuam recebendo
`avaliacao` no singular, normalizado no servidor.

`avaliacao-do-tutor.service.ts`, `avaliacao-do-tutor.controller.ts`, `utils/avaliacao.ts`,
`AvaliarTutor.tsx`, 10 testes. Migration `20260824200000_avaliacao_nos_dois_sentidos`.

### 2.A.4 ~~Encaminhamento clínico: parte estruturada~~ - **feito em 24/08**

Três colunas próprias em `solicitacoes` (`encaminhamento_motivo`, `encaminhamento_orientacao`,
`encaminhado_em`): motivo e orientação deixaram de ser enfiados em `diagnostico`/`receita` com o
prefixo `[EMERGÊNCIA]`.

**O achado do caminho:** a tela do tutor lia `solicitacao.orientacao_encaminhamento`, um campo
que nunca existiu. O veterinário escrevia "leve ao hospital 24h da avenida" e o tutor recebia
"veja as orientações no chat", no momento em que ele mais precisava de instrução direta. Agora
a tela mostra "Motivo" e "O que fazer agora" em blocos separados, e o encaminhamento entra no
histórico do pet: quem atender depois precisa saber que o caso já excedeu o atendimento
domiciliar uma vez.

O passo 1 da solicitação passou a dizer o que não se faz em casa, cirurgia complexa,
internação e exame de imagem -, cumprindo a regra `service_limits` do briefing e preparando o
encaminhamento como desfecho legítimo.

`FINALIZANDO` continua fora do enum, por decisão: o fechamento aqui é atômico, então o estado só
faria sentido se o preenchimento virasse etapa longa com o tutor esperando.

Migration `20260824220000_encaminhamento_estruturado`, 4 testes.

### 2.A.5 Login com Apple: **fora de escopo, decidido em 24/08**

A Avila Ops não tem conta de desenvolvedor Apple, e sem ela não existe Sign in with Apple. E-mail
e Google cobrem o login hoje (`GOOGLE_CLIENT_ID` está configurado em produção).

Fica registrado o que reabre o assunto: **Sign in with Apple é obrigatório para publicar na App
Store** qualquer aplicativo que ofereça outro login social. No dia em que o app nativo entrar no
roadmap, isto vira bloqueador, e a conta de desenvolvedor, pré-requisito.

### 2.A.6 ~~Cartão salvo~~: **feito em 25/08**

Guardado o cartão, o checkout pede só o código de segurança. Guardamos **referência, nunca
cartão**: o identificador que o gateway devolve, mais bandeira, quatro últimos dígitos e
validade. Número e CVV continuam indo do navegador direto ao Mercado Pago, e o que chega ao
servidor é um token de uso único, há um teste que trava isso, verificando que o objeto gravado
não contém o token nem qualquer campo de cartão.

A conveniência não custa segurança: o gateway exige token novo a cada cobrança, e com cartão
guardado ele sai do identificador mais o CVV digitado na hora, que é também o que impede alguém
com o celular na mão de cobrar.

Três decisões visíveis na tela: o primeiro cartão vira principal sozinho; remover o principal
promove outro (carteira sem principal faria o checkout deixar de pré-escolher); salvar o mesmo
cartão duas vezes atualiza em vez de recusar. Na remoção o gateway vem primeiro, sumir da tela
um cartão que continua cobrável é pior que um erro visível. E guardar nunca derruba o pagamento.

`cartao-salvo.service.ts`, `cartao-salvo.controller.ts`, 11 testes. Migration
`20260825010000_cartoes_salvos`.

### 2.A.7 ~~O veterinário fica online sem a configuração obrigatória~~: **feito em 25/08**

Entrar de plantão passou a exigir aprovação **e** configuração, como o plano manda. Faltando algo,
a resposta traz **a lista do que falta com o caminho de cada item**, dizer "não pode" sem dizer o
que fazer é meio aviso -, e a tela do plantão mostra os links. Sair de plantão nunca é bloqueado:
seria prender alguém disponível. A exigência hoje é conta bancária cadastrada e especialidade
preenchida, além da aprovação. 5 testes.

### 2.A.8 ~~Cancelamento e reembolso não têm regra~~: **feito em 25/08**

O tutor cancelava e **nada acontecia com o dinheiro**: o pagamento ficava parado esperando alguém
lembrar de estornar pelo painel. Com volume, isso vira reclamação e depois contestação no cartão,
que custa mais caro que o próprio atendimento.

A regra, escrita para quem vai cancelar e não para quem escreveu o código:

- **Antes de alguém aceitar**, devolve tudo. Ninguém saiu de casa.
- **Com o profissional na rua** (`a_caminho`, `chegou`), retém 20% de taxa de deslocamento. Ele
  interrompeu o que estava fazendo e pegou a estrada; cobrar zero transferiria esse custo inteiro
  para ele.
- **Depois de o atendimento começar**, sem devolução automática, mas a porta não fecha:
  contestação é caminho de gente.
- **Se quem desiste é o veterinário ou a equipe**, devolve tudo, em qualquer etapa. O tutor não
  paga por decisão que não é dele.

A tela pergunta a política **antes** de mostrar o "confirma?": ninguém descobre a taxa depois de
cancelar. E o aviso de saída diz o valor que está voltando.

Falha de gateway **não desfaz o cancelamento**, prender o tutor num atendimento morto por causa
do provedor seria pior; o que não saiu fica registrado. 10 testes.

### 2.A.9 ~~Miudezas de cadastro e de painel~~: **feito em 24/08**

Era maior do que parecia: o cadastro do pet **perguntava e não gravava**, o controller lia cinco
campos e descartava o resto, mesmo com as colunas existindo. O porte chegava vazio até na tag
pública do QR da coleira. Entraram junto cor, pedigree e condições preexistentes, a data de
nascimento do tutor e as Dicas de Saúde Pet na home (que só aparecem quando há artigo publicado).
6 testes.

### 2.A.10 ~~Foto clínica no prontuário~~: **feito em 24/08**

Entregue primeiro como `fotos_clinicas` e, no mesmo dia, generalizado para `midias_atendimento`
(ver 2.A.2), mesma mecânica, duas origens, com vídeo e áudio além da foto. O ponto que motivou o
item: a foto do atendimento deixou de expirar em 90 dias junto com a conversa do chat.

## 2.B: Divergências do briefing (decisões, não bugs)

### 2.B.1 ~~O tutor não escolhe o veterinário~~: **feito em 25/08**

Os dois modelos convivem, porque cada um está certo para um caso:

- **Emergência, consulta domiciliar e teleorientação** continuam na fila aberta. Quem tem o animal
  passando mal na frente não quer comparar currículos; quer alguém a caminho.
- **Vacinação, avaliação e consulta de rotina** ganharam a vitrine: foto, CRMV, especialidade,
  avaliação, número de atendimentos, distância e área de atuação. Não há pressa, e aí escolher faz
  sentido, ninguém escolhe motorista de ambulância, mas escolhe dentista.

Três decisões que a implementação tomou:

**Escolher não é atribuir à força.** O chamado nasce dirigido, só o escolhido é avisado, por
socket e por push, e ele aceita ou recusa como sempre. Recusando, cai na fila aberta: o tutor não
fica sem atendimento por ter escolhido alguém ocupado.

**A vitrine não exige plantão.** Pedido marcado com lista vazia às três da tarde de terça seria
uma vitrine inútil. O que ela exige é aprovação e conta bancária, os mesmos requisitos de quem
entra de plantão, porque aceitar sem conta criaria repasse sem destino.

**"Qualquer profissional" vem marcado por padrão** e diz que costuma ser mais rápido. Quem não
quer escolher não deve ter que escolher. E quem nunca foi avaliado aparece como "ainda sem
avaliações", não como zero, profissional novo precisa receber o primeiro pedido.

`escolha-de-veterinario.service.ts`, `escolha-de-veterinario.controller.ts`,
`EscolherProfissional.tsx`, 13 testes.

### 2.B.2 ~~Tipos de atendimento: temos 3 dos 6~~: **feito em 25/08**

Vacinação, avaliação clínica e consulta de rotina entraram no enum, na vitrine, na tabela de
preços por cidade e nos rótulos das duas telas do veterinário.

Os dois vigias aprenderam a diferença entre socorro e prevenção: quem marca vacinação não está
com o animal passando mal, então o alerta de SLA para a equipe demora mais (120 min contra 10 da
emergência) e a busca desiste mais tarde (180 min contra 20). Alertar a equipe em vinte minutos
por uma vacina marcada é o tipo de ruído que faz o alerta de emergência perder valor. Um teste
trava que todo tipo do enum tenha prazo nos dois.

### 2.B.3 ~~Repasse: briefing diz 20%, código cobra 15%~~: **feito em 25/08**

O plano do produto vale: **20% da plataforma, 80% do veterinário**. E o número saiu do código
era uma constante em `billing.controller.js`, ou seja, cinco pontos sobre todo o faturamento
decididos por uma linha, que só mudariam com deploy. Agora é `percentual_plataforma` na cidade,
editável em `/admin/cidades`, com 20 como padrão.

### 2.B.4 `limite_atendimentos`: implementado, registrar a regra

- Já resolvido em 23/08: o campo significa **quantos atendimentos do mês recebem o desconto do
  plano**, e o desconto sai da comissão da plataforma, quem vende o plano banca o benefício, e
  o veterinário recebe o mesmo que receberia sem plano. Não é teto de atendimento (bloquear
  quem tem pet doente seria inaceitável) nem franquia de consulta grátis. Mantido aqui como
  decisão registrada, não como pendência.

### 2.B.5 ~~Configuração profissional é por cidade, não por veterinário~~: **feito em 25/08**

**Raio e área de atuação passaram a ser do profissional**, com o valor da cidade como padrão
deixar em branco continua valendo o da cidade, que é a escolha certa para quem roda a cidade
inteira. Antes o raio era igual para todos: quem só atende a zona sul recebia chamado do outro
lado, recusava, e o tutor esperava mais por um "não" previsível.

O despacho respeita os dois sem abrir mão do índice espacial: a caixa do GiST usa o raio da
cidade, que é o maior possível, e a distância exata refina com
`COALESCE(raio_do_vet, raio_da_cidade)`. O caminho em memória, que é a reserva para quando o
Postgres está sem as extensões, faz a mesma conta.

**Preço continua da cidade**, por decisão: é o que sustenta uma tabela previsível e o desconto dos
planos, que sai da comissão da plataforma.

Migration `20260825140000_raio_por_veterinario`.

---

## FASE 3: ~~Notificações~~ - **feito em 25/08**

Quem é avisado, de quê e por qual canal virou **tabela** (`notificacao-atendimento.service.ts`),
consumida pela máquina de estados, que já era o funil único por onde toda mudança passa. Antes o
aviso era escrito dentro de cada endpoint, e por isso alguns simplesmente não aconteciam: quem
estava com o app fechado não recebia nada.

Duas consequências práticas. Mudar o texto de um aviso deixou de exigir caçar o endpoint que o
disparava. E **um status novo não entra em produção mudo**: um teste percorre o mapa de
transições e falha se algum destino não estiver nem na matriz nem na lista de silenciosos, e
silêncio, ali, exige o motivo escrito ao lado.

O e-mail entrou onde a pessoa precisa do registro depois: "a caminho" (é onde fica a hora de
saída), finalização, encaminhamento, cancelamentos e falha de pagamento. Push em tudo. Cada canal
falha sozinho, e nenhum derruba a transição.

Três decisões que a tabela expõe: o encaminhamento sai pelos dois canais sem hesitar, porque é o
aviso mais grave que o produto emite; o cancelamento pelo tutor avisa o **veterinário**, que pode
estar dirigindo para lá, e não o tutor, que sabe o que fez; e `aceito` é silencioso porque
`veterinario_encontrado` já dá a mesma notícia.

10 testes.

**Continua aberto:** o lembrete de vacina e retorno (`lembrete.worker`) sai só por e-mail e marca
`notificado` mesmo sem SMTP configurado. Deve passar por esta mesma matriz.

## FASE 4: Dívidas conhecidas, por área

*Revisada em 25/08 contra o código: três dos itens já não existiam, tinham sido resolvidos e a
lista, escrita a partir de uma auditoria mais antiga, não sabia.*

### Acervo de artes do blog [TS]

- **Entregue localmente em 12/09/2026:** 54 artes finais em duas coleções, incluindo as 52 âncoras do calendário, em sete proporções. PNGs, títulos, hashes e descrições conferidos; galeria com busca e filtros verificada em desktop e celular, sem imagens quebradas ou overflow. Evidências em `docs/blog-artes/2026-09-12-ancoras/verificacao.json`. Associação e publicação nos posts continuam pendentes.
- **Lote seguinte em 13/09/2026:** quatro capas PER-001 a PER-004 foram geradas, revisadas e registradas, elevando o acervo local para 58 artes em três coleções. Associação e publicação nos posts continuam pendentes.
- **Lote adicional em 13/09/2026:** quatro capas PER-005 a PER-008 foram geradas, revisadas e registradas, elevando o acervo local para 62 artes em quatro coleções. Associação e publicação nos posts continuam pendentes.
- **Agenda conferida em 12/09/2026:** `docs/BLOG_AGENDA_PUBLICACAO.md` registra quatro agendamentos futuros reais, 14 rascunhos sem data e a conciliação das 52 âncoras com suas artes. ANC-022 já está pública e não deve gerar postagem duplicada. O ciclo anual depende da data de início; nenhuma programação de produção foi alterada. Atualização local pelo `scripts/conferir-agenda-blog.ts --snapshot <arquivo>`.
- **Calendário real 2027 fechado localmente:** `docs/blog-agenda/CALENDARIO_REAL_2027.md` e `calendario-2027.json` contêm 365 datas, horários e ordem, com 52 âncoras, 104 perguntas, 104 verbetes, 52 aulas, 52 mitos e a retrospectiva de 31/12. Doze pautas foram marcadas como sazonais; Dia dos Animais foi antecipado para 04/10; a programação de produção ainda não foi alterada.
- **O quê**, registrar as artes finais produzidas no gerador integrado e reuni-las por coleção numa galeria editorial local com busca e filtros. **Dono: Codex**.
- **Por quê**, encontrar a imagem certa por tema, linguagem e formato sem repetir arquivos ou perder a diversidade aprovada pelo Nicolas.
- **Onde**, `scripts/registrar-arte-blog.ts`, `scripts/gerar-galeria-blog-artes.ts` e `docs/blog-artes/`; os manifestos `entregas.json` são a fonte dos itens.
- **Pronto quando**, após revisão visual manual, o registro copia o PNG original de forma idempotente com hash e dimensões reais; novas coleções entram ao regenerar a galeria, apenas finais existentes são contadas, IDs duplicados são recusados e cada imagem mantém sua proporção com texto alternativo e acesso ao original. A publicação dos posts continua uma etapa própria.

### Chat

- ~~Sem paginação~~ - **já existe.** `GET /mensagens/conversa/:id` trabalha com cursor e limite
  (`paginacaoDaConversa`). A entrada anterior estava errada.

### Prontuário

- ~~O tutor não tem leitura estruturada~~ - **já existe.** `/tutor/atendimento/:id/prontuario` lê
  o prontuário e o histórico do pet e renderiza queixa, diagnóstico, orientações, prescrições e
  exames, não só o link do PDF.

### Ficha clínica

- ~~Não há desfazer~~ - **feito em 25/08.** `POST /pets/:petId/{alergias|vacinas|medicamentos}/:id/restaurar`
  e `GET /pets/:petId/removidos`. A marca da remoção sai junto (removido e ativo ao mesmo tempo
  seria mentira), quem trouxe de volta fica registrado, e a volta também vira trilha pericial
  ninguém desfaz nada em silêncio numa ficha clínica. Uma alergia removida por engano é uma
  alergia que não aparece na hora de medicar. 6 testes.

  **A tela saiu em 25/08**, no mesmo dia: `RegistrosRemovidos.tsx`, dentro da ficha do pet, fechada
  por padrão, quem abre a ficha quer ver o que vale hoje, e o removido é consulta. Restaurar exige
  motivo escrito, pela mesma razão que remover exige.
- ~~O admin tem permissão na API e não tem tela~~ - **feito em 08/10.** `/admin/atendimentos/:id/ficha-do-pet`,
  aberta pelo botão "Ficha do pet" de cada atendimento: o mesmo componente da tela do veterinário,
  com as mesmas regras (motivo para corrigir, remover e restaurar).

### CRM do veterinário

- **Sem grade cadastrada, qualquer horário é aceito.** Comportamento intencional e avisado na
  própria tela; revisar quando houver volume.

### Rastreio do veterinário

- **A posição só é transmitida com o app aberto na tela do atendimento.** Limitação de PWA (não há
  rastreio em segundo plano no iOS). O tutor vê "última posição conhecida" quando o vet troca de
  app. Resolver de verdade só com app nativo.

### Falha de rede

- ~~Solicitação enviada sem sinal se perde~~ - **feito em 25/08.** O envio tenta de novo até três
  vezes, com espera crescente, e o botão passa a dizer **"Sem sinal, tentando de novo…"** em vez
  de ficar travado em "Solicitando…": a pessoa precisa saber que o problema é a rede dela e que
  ainda estamos tentando.

  Só falha de REDE ganha nova tentativa, o servidor recusar o pedido é resposta, e insistir nela
  repetiria o mesmo erro. E o prazo é curto de propósito: **descartei o Background Sync**, que
  reenviaria o chamado quando a conexão voltasse, porque pedido de socorro não pode sair
  silenciosamente meia hora depois, quando a pessoa já resolveu de outro jeito.

### Endereço

- **A precisão do Nominatim é fraca em interior e condomínio.** O campo de complemento compensa.
  Google Places resolveria e é pago.

### Mapa

- **As imagens vêm do servidor público do OpenStreetMap**, cuja política desencoraja tráfego de
  aplicativo. `VITE_MAPA_TILES` e `VITE_MAPA_ATRIBUICAO` trocam o provedor sem tocar em componente.

### Infraestrutura

- **Retenção do analytics próprio**, `ANALYTICS_RETENTION_DAYS` já limpa eventos; decidir se 180
  dias é o desejado.
- ~~**nginx perdia o backend ao recriar o container**~~: **feito em 11/09**. `resolver
  127.0.0.11` com o upstream em variável; o deploy não precisa mais de `restart web`.
- ~~**Lixo na árvore do servidor**~~: **limpo em 09/10.** Os `frontend/dist.bak.*` já não
  existiam e o `offer-expiry.worker.js` órfão foi removido; `backups/` fica.

### Varredura de placeholder e retorno inventado: **feita em 26/08**

Uma passagem pelo projeto inteiro procurando código que diz fazer uma coisa e faz
outra. Sete achados, todos corrigidos no commit `varredura`. Fica registrado
porque o padrão se repete e vale reconhecer da próxima vez.

| O que era | Por que passou despercebido |
|---|---|
| Gateway do Asaas devolvia cobrança, PIX e estorno inventados sem `ASAAS_API_KEY` | O desvio se chamava "modo de simulação" e logava `console.warn`. Como a produção nunca teve a chave, o modo padrão era o de mentira. |
| Webhook `/api/webhooks/asaas` aceitava qualquer POST | A checagem do token era `if (segredo && token !== segredo)` - sem segredo configurado, não checava nada. |
| 27 arquivos `.test.js` não aplicavam os próprios mocks | Declarar `transform` no jest.config substitui o babel-jest padrão, e sem transform o Jest não iça `jest.mock`. Os testes passavam; o espião é que nunca era chamado. |
| `getStats` de usuários com `inactive = 0` fixo | Tinha um `// TODO` ao lado desde sempre, e ninguém olha o painel de usuários com frequência. |
| Stack de observabilidade inteira (compose + 2 middlewares) apontando para arquivos que nunca existiram | Nada a importava, então nada quebrava. Mesma armadilha do ioredis. |
| `.env.example` sem 30 variáveis lidas e com 5 que ninguém lê | Ambiente novo subia "funcionando" e sem push, sem login social e sem TURN. |
| `test-email.ts`, `test-reset.js`, `list-users.ts` dentro de `src/` | Compilavam para `dist` e viajavam na imagem de produção. |

O fio comum: **o caminho de falha era silencioso e o de sucesso era falso**. Onde
faltava credencial, o código inventava uma resposta plausível em vez de reclamar.
Regra que fica: sem credencial, exceção, nunca um retorno que pareça sucesso.

---

## FASE 5: Antes da divulgação ampla

- Confirmar informações comerciais reais: regiões atendidas, prazos, política de emergência,
  formas de pagamento, cancelamento e **critério de seleção de veterinário** (que muda conforme
  2.B.1).
- Teste completo em celular real: tutor pede → vet aceita → desloca → atende → prontuário →
  avaliação. De ponta a ponta, com dinheiro de verdade em ambiente de teste. **Roteiro e
  divisão de prova em `docs/FASE5_ROTEIRO_PONTA_A_PONTA.md` (11/09)**: a automação cobre a
  jornada pela API; tela, toque, PWA, push e pagamento real só o aparelho prova.
- Revisar a Política de Privacidade com responsável jurídico/LGPD, o multi-tenant aumenta a
  superfície de dados pessoais tratados, e a Fase 0.3 depende do texto final.
- Publicar o WhatsApp oficial e os artigos do blog (0.6 e 0.7).

**Já resolvidos e verificados**, mantidos aqui só para não serem reabertos: SMTP real
(Porkbun, 20/08), backup do banco e dos uploads com retenção e restauração validada (20/08),
monitoramento com alerta por e-mail na virada de estado (20/08), `npm audit` zerado (19/08),
Multer 2.x (19/08), e os cinco riscos de segurança do `TELAS.md` (20/08).

---

## FASE 6: Integração Meta

**Status: código pronto e em produção, inerte até as credenciais existirem.** Webhook único
(Lead Ads + WhatsApp), envio e recebimento de WhatsApp, Facebook Login, Conversions API e
publicação no Threads estão implementados e deployados. Cada rota checa se está configurada e
responde 503 em vez de quebrar.

App no Meta for Developers: **"Saúde Pet Brasil"**, App ID `452763450848980` (+ app Threads
`1581219363700979`). Credenciais em `.env.production` local, fora do git.

### Bloqueadores que só o Nicolas resolve no painel da Meta

- Preencher **Domínios do aplicativo** (vazio), sem isso o Facebook Login não funciona.
- Preencher **URL da Política de Privacidade**: `https://saudepet.app.br/privacidade`.
- **Publicar o app** (hoje "Não publicado") e passar por **App Review** para as permissões
  restritas (`leads_retrieval`, mensagens do WhatsApp além do teste).
- Conectar a Página do Facebook/Instagram ao Business Manager.
- Gerar e colocar direto no `.env` (nunca no chat): Page Access Token de longa duração,
  `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`.

### Não construído, por prioridade de negócio

WhatsApp Flows (solicitar atendimento sem sair do WhatsApp, precisa de chave RSA; o
`wabusiness` de outro projeto no mesmo servidor serve de referência), Instagram e Messenger
como caixa unificada, Marketing API. Catálogo/Commerce está fora de escopo enquanto o Saúde Pet
vender serviço e não produto.

**Nunca virá para o nosso painel**, porque não existe API de delegação: verificação de empresa,
faturamento de anúncios, gestão de pessoas no Business Manager, App Review, criação de conta de
anúncio e Meta Verified.

---

## FASE 7: Evolução pós-lançamento

- ~~**Agendamento futuro de verdade**~~ - **feito em 25/08.** O tutor marca em
  `/tutor/marcar-consulta`: escolhe tipo, pet, profissional, dia e um horário livre da grade dele.
  O compromisso nasce **pendente**, quem escolhe o horário é o tutor, quem confirma que vai é o
  profissional; o contrário criaria compromisso na agenda de alguém que nem viu o pedido.

  Só os tipos sem pressa aceitam marcação, os mesmos da vitrine de escolha: agendar emergência
  para quinta-feira não é recurso, é mal-entendido, e a tela diz onde pedir atendimento imediato.
  O pet é conferido contra quem marca, senão um id adivinhado marcaria consulta para o animal de
  outra pessoa. 9 testes.
- ~~Logo do veterinário nos documentos~~ - **feito em 08/10** (`Veterinario.logo_documentos_url`, envio em
  `/veterinario/perfil`, cabeçalho da receita e do prontuário; recurso de plano `documentos_logo`, hoje
  aberto a todos como os demais). O rodapé "Documento assinado digitalmente através da plataforma Saúde
  PET" foi mantido: a marca do veterinário entra ao lado, não no lugar. Texto original do item:
  em stand-by desde 15/08. Receita e prontuário
  continuam com a marca Saúde Pet; a personalização fica como diferencial dos planos seniores.
  Quando priorizado: campo `Veterinario.logo_url`, upload pelo perfil reaproveitando o caminho
  do R2, e `doc.image()` no cabeçalho dos dois PDFs (`pdf.service.js` hoje não desenha imagem
  nenhuma). Rever junto o rodapé "Documento assinado digitalmente através da plataforma
  Saúde PET" nos planos em que a marca do vet aparecer.
- ~~**Gestão de cidades e regras comerciais pelo painel**~~ - **já existia; revisado em 09/10.**
  `/admin/cidades` grava cidade, raio, os seis preços e o percentual da plataforma
  (`CidadeCobertura`), e as regras comerciais da organização. Na revisão a gravação ganhou
  conferência de organização, faixas válidas e trilha com antes e depois. Do `.env` resta só
  `CIDADE_INICIAL`, usada como último recurso no cadastro.
- ~~**Funil de conversão visível no dashboard admin**~~ - **já existia; revisado em 25/08.** Cinco
  etapas (sessões → leads → cadastros → solicitações → finalizados) em `/admin/analytics`, com
  backend e tela prontos. Mais uma entrada herdada de auditoria antiga.
- ~~**Automação de contato para novos leads**~~ - **feito em 25/08.** Quem preenchia o formulário
  do site recebia **silêncio**: o e-mail de "novo contato" ia para a equipe, e a pessoa que digitou
  nome, telefone e o nome do pet não recebia nada, enquanto lia na tela que "a equipe entrará em
  contato".

  Agora recebe uma confirmação que faz três coisas: diz que chegou, diz o que acontece a seguir e
  o que mais importa, **oferece o caminho imediato**, porque alguém com um animal passando mal não
  deveria estar esperando alguém ligar. É resposta automática, não campanha. 7 testes.
- **App nativo (React Native)**, só ele resolve rastreio em segundo plano e notificação
  confiável no iOS. Hoje sem dono nem prazo.

### Orquestrador n8n

O arquivo `automations/orquestrador-jornada-usuario.n8n-agent.json` **não é um fluxo**, não
tem um único nó. É a especificação da jornada, com uma seção `expected_n8n_output` descrevendo
o contrato JSON que deveria ser gerado (actor, current_state, next_state, notification_target,
payment_action, database_action, timestamp). Confirmado em 24/08: existem 12 fluxos no n8n da
Avila Ops e **nenhum do Saúde Pet**.

Se for priorizado, o escopo já está definido pelo próprio briefing: **14 gatilhos** (novo
cadastro, veterinário cadastrado, veterinário aprovado, nova solicitação, pagamento aprovado,
pagamento recusado, veterinário aceitou, veterinário chegou, atendimento iniciado, atendimento
finalizado, nova mensagem, nova avaliação, retorno agendado, vacina próxima do vencimento) e
**12 ações** (push, e-mail, WhatsApp, atualizar banco, atualizar status, registrar histórico,
acionar pagamento, acionar repasse, criar lembrete, enviar avaliação, notificar administrador,
acionar fluxo de suporte).

**Observação importante de arquitetura:** quase tudo isso a plataforma já faz por dentro, e
melhor, dentro da transação, com auditoria. O n8n não deveria assumir o que é regra de
negócio; o lugar dele é a integração externa (WhatsApp, CRM, planilha, aviso ao administrador)
pendurada nos eventos que a Fase 3 vai centralizar. Fazer o n8n mandar no status do atendimento
seria mover a regra para fora do sistema que a garante. Portanto: **primeiro a Fase 3, depois o
n8n consome o que ela emitir.**

**Feito em 09/10/2026, a ação "notificar administrador":** o fluxo "Saúde Pet - Alerta de
operação" lê `GET /api/v1/automation/operacao/saude` de hora em hora e avisa por e-mail quando
há chamado, documento, pagamento, agendamento ou credenciamento parado. Não muda status de
nada, só lê, dentro da observação acima.

---

## Fora de escopo

Ideias que apareceram e não têm dono nem prazo. Não tratar como pendência até alguém
priorizar: sistema de cupons e promoções, integração com laboratório de exames.

**Os três módulos futuros do briefing**, para que ninguém os dê por esquecidos:

- **Saúde Pet Plus** (assinatura premium do tutor), **já existe em forma**: planos, benefícios
  em JSON, desconto saindo da comissão e tela `/tutor/planos`. O que falta dele é comercial, não
  técnico, e está em 0.2.
- **Clube Vet** (relacionamento e benefícios do veterinário), **já existe em forma**: planos
  do vet com os benefícios `crm_*`, portão por plano e convite de upgrade no lugar de parede.
- ~~**Saúde Pet Mercado**~~ - **saiu desta lista em 26/08.** Virou a próxima aposta e a primeira
  fatia está entregue: loja com cadastro pela tela e conferência da equipe, catálogo, carrinho por
  loja, fechamento com reserva de estoque, pagamento por Pix e cartão com comissão separada do
  repasse, fila de separação para o lojista e painel de aprovação e financeiro para a plataforma.
  Três públicos, doze telas, 59 testes. O detalhe está em `marketplace/README.md`.

  **Terceira fatia, 29/08:** assinatura de ração com entrega programada — o tutor
  programa a cada quantos dias recebe, a loja define desconto e frete grátis de
  assinante, e no dia nasce um pedido comum com o Pix pronto (sem cobrança
  automática, de propósito: ver `marketplace/README.md`). 17 testes.

  **A entrega por entregador NÃO está nesta fatia**, é a outra metade do módulo, com outra
  operação logística (aceite, coleta, rastreio). O valor `entregador` está reservado no enum e o
  fechamento o recusa: prometer em tela uma entrega que não sai seria pior do que não oferecer.
  Nesta fatia o pedido sai por retirada no balcão ou entrega combinada direto com a loja.

*(Saiu desta lista em 24/08: "geolocalização em tempo real com mapa", está implementada e em
produção, com rota por rua, tempo estimado e pinos da marca. E em 26/08: o Saúde Pet Mercado, que
deixou de ser ideia sem dono e virou módulo com código, telas e testes.)*

---

## Anexo A: O que já está pronto

Resumo do que não precisa ser reconstruído. O detalhe de cada um está no `CHANGELOG.md`.

**Fluxo do atendimento**, máquina de estados centralizada (`atendimento-state.service`), com
transição única validada, linha do tempo com ator e origem, tudo na mesma transação sob guarda
otimista. Fechamento clínico grava prontuário, prescrição estruturada e exames na mesma
transação da mudança de status. Retificação de receita reemite documento marcado como
retificada, guarda a versão anterior e avisa o tutor. Fila de reemissão de PDF quando o R2 falha
no instante do fechamento.

**Localização**, endereço escolhido no mapa com pino arrastável, GPS pedido sozinho ao abrir a
tela, endereços salvos, busca por endereço como alternativa, complemento em campo à parte.
Acompanhamento ao vivo com mapa, rota por rua (OSRM), tempo estimado e pinos da marca. Mapa de
destino do veterinário com atalho para Google Maps e Waze. Despacho por proximidade com índice
espacial (`cube` + `earthdistance`).

**Clínico**, prontuário eletrônico, prescrição em itens, exames solicitados, histórico
acumulado por pet com paginação, ficha clínica (alergias, vacinas, medicamentos) corrigível e
auditável, carteira de vacinação digital, tag pública do QR da coleira com o mínimo necessário
para socorrer e devolver o animal.

**Chat**, texto, foto, PDF, vídeo curto de até 25 MB, localização, edição com histórico,
exclusão lógica com retenção de 90 dias e limpeza do binário no R2.

**CRM do veterinário**, clientela com notas privadas por profissional, agenda com grade
semanal e máquina de status, retenção com convocação em lote, relatórios com faturamento real
vindo do `PaymentSplit`, tudo com portão por plano.

**Pagamento**, Mercado Pago com Pix e cartão (tokenização no navegador, PCI), credenciais por
tenant, webhook, split 85/15 interno, repasse por Pix.

**Segurança**, sessões revogáveis de verdade (`sessoes_revogadas_em` lido no middleware),
punição com efeito, visita de suporte a conta real com trilha pericial e ações destrutivas
bloqueadas durante a visita, auditoria travada por teste em onze ações irreversíveis, isolamento
por tenant no financeiro.

**Regras do briefing verificadas e cumpridas** (conferidas contra o código em 24/08), o
histórico é imutável depois da finalização: o prontuário só tem leitura, a receita só muda por
retificação que registra motivo, versiona e avisa o tutor, e a ficha clínica só por correção
auditada com estado anterior e posterior. O cancelamento pelo veterinário devolve a solicitação
para a fila e avisa os demais de plantão na mesma hora. Os seis estados de pagamento do
briefing estão cobertos por um enum mais rico (inclui contestação e chargeback). Toda mudança
de status tem data, hora e autor.

**Operação**, backup do banco e dos uploads com retenção e restauração validada, monitor a
cada 5 minutos com alerta na virada de estado, push via PWA, atualização do app que chega ao
celular sozinha sem atropelar formulário em andamento.

---

## Anexo B: Decisões tomadas

| Data | Decisão | Motivo |
| --- | --- | --- |
| 26/08 | **Mercado: estoque opcional por produto (`controla_estoque`)** | O levantamento de campo voltou com 175 itens fotografados na prateleira e ZERO contagens. Exigir `estoque > 0` marcaria a loja inteira como esgotada; petshop de bairro vende enquanto tem e confere na separação |
| 26/08 | **Mercado: um carrinho por loja** | Cada loja separa e entrega o que é dela; um carrinho único viraria três pedidos e três prazos escondidos atrás de um botão só |
| 26/08 | **Mercado: estoque baixa no fechamento, não no pagamento** | Entre o Pix e o dinheiro passam minutos; dois tutores pagariam pelo mesmo último saco de ração. `expira_em` de 60 min devolve o que não for pago |
| 26/08 | **Mercado: espécie não é categoria** | "Ração cão" e "Ração gato" como prateleiras separadas fariam quem tem os dois animais procurar a mesma ração duas vezes |
| 27/08 | **Mercado: a loja entrega, a plataforma só faz a conta** | Raio, frete e piso do frete grátis são da loja; a distância é medida da coordenada da loja ao endereço do tutor e fora do raio é recusa. Comissão sobre produtos, frete inteiro para a loja |
| 11/09 | **Mercado: loja de demonstração nunca é pública** | `LojaMercado.demonstracao` é lido por `LOJA_PUBLICA`, a única definição de loja pública, usada por toda leitura externa; a aprovação recusa loja marcada. A BioVet do seed foi aprovada no painel em 01/09 e entrou no Google; o portão é estrutural para não depender de quem clica |
| 27/08 | **Mercado: margem por categoria, 40% só como último recurso** | Ração premium suporta 18–30%; acessório e cosmético, bem mais. O número mora na categoria, editável no painel |
| 27/08 | **Mercado: um feed, três lugares** | WhatsApp Business, Google Merchant e Google Shopping leem o mesmo feed do Google por URL programada. Item sem foto fica de fora e é contado |
| 28/08 | **Mercado: frete nacional pela CepCerto** | PAC, SEDEX, Jadlog e Loggi são cotados no carrinho; o servidor recota no fechamento e a etiqueta só é emitida após pagamento, com idempotência por pedido |
| 27/08 | **Mercado: vitrine pública sem login** | "Ração perto de mim" no Google e o link do catálogo do WhatsApp precisam abrir sem sessão; o tenant é o público, como no blog. Comprar continua exigindo conta |
| 26/08 | **Mercado: sem entregador nesta fatia** | O enum reserva o valor (mudar enum em Postgres exige transação própria), mas o fechamento o recusa, prometer entrega sem ter quem entregue é vender o que não se tem |
| 19/08 | **Pagamentos: só Mercado Pago** | Migrado do Asaas; split real exige onboarding de marketplace, então o split é interno e o repasse sai por Pix |
| 19/08 | **Despacho: fila aberta** | "Primeiro que aceitar leva"; o worker de oferta dirigida foi removido |
| 15/08 | **Logo do vet nos documentos: stand-by** | Vira diferencial de plano sênior, não item base |
| 16/08 | **Histórico clínico compartilhado no tenant, leitura comercial privada por vet** | Continuidade do tratamento x concorrência interna |
| 20/08 | **`SolicitacaoAnexo` removida** | Nasceu para ser o acervo do atendimento e nunca recebeu uma linha; os arquivos vivem presos à mensagem, que é onde estão URL assinada, retenção e auditoria |
| 20/08 | **Vídeo no chat sem transcodificação** | ffmpeg não cabe em servidor de 3 GB; arquivo guardado como veio, player nativo |
| 23/08 | **`limite_atendimentos` = quantos atendimentos do mês recebem desconto** | Os planos dizem o que vendem; teto de atendimento seria inaceitável |
| 24/08 | **Esqueleto NestJS apagado** | 79 arquivos, nunca instalados, nunca importados, nunca executados |
| 24/08 | **TypeScript é o padrão** | Toda implementação nova nasce em TS; o legado migra por camadas (Fase 1) |
| 24/08 | **Mapa: OpenStreetMap gratuito, com saída pronta** | Servidor próprio não cabe nesta máquina; `VITE_MAPA_TILES` troca o provedor sem tocar em código |

---

## Anexo C: Retratos das telas

`scripts/snapshots.ts` fotografa o aplicativo inteiro sem depender de alguém abrir no celular e
mandar print. Sobe o Chrome já instalado na máquina (`channel: 'chrome'` - nenhum navegador
baixado), entra como tutor e como veterinário, e salva um PNG por tela em `snapshots/`.

Roda contra um banco descartável (`saudepet_snap`), semeado por `scripts/seed-snapshots.ts` com
uma tutora, um veterinário, um pet e três atendimentos parados de propósito nos estados que
custam a reproduzir à mão: a busca que não achou ninguém, o encaminhamento de emergência e um
atendimento fechado. **Nunca contra produção**, fotografar cliente real seria exportar dado de
saúde de terceiro para dentro de um PNG.

```bash
createdb saudepet_snap                                   # + extensões cube e earthdistance
DATABASE_URL=…/saudepet_snap npx prisma migrate deploy    # em backend/
DATABASE_URL=…/saudepet_snap npx tsx scripts/seed-snapshots.ts
# backend em :3001 (é o que VITE_API_URL aponta) e vite em :5173
npx tsx scripts/snapshots.ts
```

As imagens não são versionadas (`snapshots/` está no `.gitignore`): o que vale é o roteiro, e
retrato de tela envelhece a cada deploy.
