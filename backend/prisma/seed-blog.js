// Seed de conteúdo do blog público (categorias + artigos iniciais).
// Idempotente e não destrutivo: posts já existentes (mesmo slug) NÃO são
// sobrescritos, para preservar edições feitas depois pelo editor do admin.
// Uso: node prisma/seed-blog.js  (ou npm run seed:blog no backend)
const { PrismaClient } = require('@prisma/client');
const { getBlogImage } = require('../src/content/blog-images');

const prisma = new PrismaClient();

const AUTOR = 'Equipe Saúde PET';

const CATEGORIAS = [
  { slug: 'sinais-de-alerta', name: 'Sinais de alerta', description: 'Sintomas que merecem atenção e quando procurar um médico-veterinário.' },
  { slug: 'prevencao-e-vacinas', name: 'Prevenção e vacinas', description: 'Vacinação, vermifugação, antiparasitários e cuidados preventivos para cães e gatos.' },
  { slug: 'alimentacao', name: 'Alimentação', description: 'O que o pet pode comer, alimentos perigosos e nutrição no dia a dia.' },
  { slug: 'higiene-e-pele', name: 'Higiene e pele', description: 'Banho, pelagem, coceira e problemas dermatológicos em cães e gatos.' },
  { slug: 'comportamento-e-bem-estar', name: 'Comportamento e bem-estar', description: 'Ansiedade, enriquecimento ambiental e qualidade de vida do pet.' },
  { slug: 'filhotes-e-idosos', name: 'Filhotes e idosos', description: 'Cuidados específicos para cada fase da vida do cão e do gato.' },
  { slug: 'consultas-exames-e-medicamentos', name: 'Consultas, exames e medicamentos', description: 'Como funcionam atendimentos veterinários, exames e o uso seguro de medicamentos.' }
];

const POSTS = [
  {
    slug: 'cachorro-vomitando-quando-e-preocupante',
    category: 'sinais-de-alerta',
    title: 'Cachorro vomitando: quando é preocupante e quando procurar um veterinário?',
    excerpt: 'Um episódio isolado de vômito nem sempre é grave, mas alguns sinais indicam emergência. Saiba o que observar e quando buscar atendimento veterinário.',
    seo_title: 'Cachorro vomitando: quando procurar um veterinário',
    seo_description: 'Vômito em cachorro: causas comuns, sinais de emergência e o que fazer. Saiba quando um episódio isolado é aceitável e quando exige atendimento veterinário.',
    tags: ['vômito', 'cachorro', 'emergência', 'sintomas'],
    published_at: '2026-08-03T09:00:00-03:00',
    content: `**Resposta direta:** um único episódio de vômito em um cão adulto que continua ativo, comendo e bebendo água normalmente costuma poder ser observado em casa por algumas horas. Procure um médico-veterinário no mesmo dia se o vômito se repetir, se houver sangue, se o cão ficar apático ou se ele for filhote, idoso ou tiver alguma doença crônica.

## Por que cachorros vomitam?

O vômito é um sinal, não uma doença. As causas vão de situações simples a emergências:

- Mudança brusca de ração ou comida fora do habitual
- Comer rápido demais ou em excesso
- Ingestão de grama, lixo ou restos de comida
- Verminoses e infecções gastrointestinais
- Ingestão de objetos (brinquedos, ossos, tecidos)
- Intoxicação por alimentos, plantas ou produtos de limpeza
- Doenças como gastrite, pancreatite, insuficiência renal e outras

## Quando dá para observar em casa

Se o cão é adulto, saudável, vomitou uma única vez e segue alerta, com apetite e sem outros sintomas, é razoável observar por 6 a 12 horas. Ofereça água em pequenas quantidades e evite dar comida logo em seguida. Se tudo se normalizar, mantenha a rotina e observe as próximas refeições.

**Importante:** não medique por conta própria. Vários remédios humanos para enjoo e dor são tóxicos para cães.

## Sinais de que é hora de procurar atendimento

Busque avaliação veterinária, sem esperar, se houver qualquer um destes sinais:

- Vômito que se repete ao longo do dia ou dura mais de 24 horas
- Sangue no vômito (vivo ou com aspecto de borra de café)
- Apatia, fraqueza ou relutância em se levantar
- Abdômen inchado, rígido ou dolorido ao toque
- Tentativas de vomitar sem colocar nada para fora (pode indicar torção gástrica, uma emergência)
- Suspeita de ingestão de objeto, medicamento ou produto tóxico
- Diarreia junto com o vômito, principalmente com sangue
- Recusa total de água ou comida
- Gengivas pálidas, amareladas ou muito vermelhas

Em filhotes, idosos, gestantes e cães com doenças crônicas, qualquer episódio de vômito merece contato com o veterinário: a desidratação nesses grupos acontece muito rápido.

## O que informar ao veterinário

Quanto mais contexto o profissional tiver, mais rápido chega ao diagnóstico. Anote:

- Quando os vômitos começaram e quantas vezes ocorreram
- Aparência do vômito (comida, espuma, bile, sangue)
- O que o cão comeu nas últimas 24 horas
- Se há acesso a lixo, plantas, medicamentos ou produtos de limpeza
- Vacinas e vermífugos em dia ou atrasados

## Como o Saúde PET pode ajudar

Pelo Saúde PET, você solicita um atendimento veterinário em domicílio e descreve os sintomas do seu pet. O histórico clínico, as vacinas e os medicamentos ficam registrados no perfil do animal, o que facilita o diagnóstico. [Solicite um atendimento](/register) ou [fale com a nossa equipe](/contato).

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário. Em caso de emergência, procure atendimento imediatamente.`
  },
  {
    slug: 'gato-parou-de-comer-quanto-tempo-pode-esperar',
    category: 'sinais-de-alerta',
    title: 'Gato parou de comer: quanto tempo pode esperar?',
    excerpt: 'Gatos que ficam sem comer por mais de 24 horas correm risco real de complicações no fígado. Entenda por que a inapetência felina é sempre um alerta.',
    seo_title: 'Gato parou de comer: quanto tempo pode esperar?',
    seo_description: 'Gato sem comer é sinal de alerta: mais de 24 horas de jejum pode causar lipidose hepática. Veja causas, o que tentar em casa e quando procurar o veterinário.',
    tags: ['gato', 'apetite', 'sintomas', 'emergência'],
    published_at: '2026-08-04T09:00:00-03:00',
    content: `**Resposta direta:** um gato adulto que passa mais de 24 horas sem comer precisa de avaliação veterinária. Diferente dos cães, gatos em jejum prolongado podem desenvolver lipidose hepática, um acúmulo de gordura no fígado que se agrava rápido e pode ser fatal. Filhotes não devem passar mais do que 12 horas sem se alimentar.

## Por que a falta de apetite em gatos é tão séria?

O organismo do gato responde mal ao jejum. Quando ele para de comer, o corpo mobiliza gordura para gerar energia, e o fígado felino não processa bem esse volume de gordura. O resultado pode ser a lipidose hepática, que por sua vez tira ainda mais o apetite, criando um ciclo perigoso.

Por isso, a regra com gatos é diferente: **não espere "para ver se melhora" por dias**. O limite de segurança é curto.

## Causas comuns de inapetência felina

- Problemas dentários e dor na boca
- Doenças respiratórias que reduzem o olfato (gato que não sente cheiro não come)
- Estresse: mudança de casa, animal novo, visitas, obras, troca de areia
- Mudança brusca de ração
- Bolas de pelo e problemas gastrointestinais
- Doença renal, hepática ou pancreatite
- Dor de qualquer origem

## O que tentar em casa nas primeiras horas

- Ofereça alimento úmido (sachê ou patê) levemente aquecido, o cheiro estimula o apetite
- Deixe o pote em local calmo, longe da caixa de areia e de outros animais
- Experimente dar o alimento na mão, com carinho e voz calma
- Verifique se a água está limpa e fresca

Se mesmo assim o gato recusar tudo por 24 horas, ou antes disso se houver outros sintomas, procure atendimento.

## Sinais que exigem atendimento imediato

- Apatia, esconder-se mais que o normal
- Vômitos ou diarreia junto com a inapetência
- Gengivas ou olhos amarelados (sinal de problema no fígado)
- Salivação excessiva ou mau hálito forte
- Dificuldade para urinar ou idas frequentes à caixa sem produzir urina (emergência em machos)
- Respiração ofegante ou com esforço
- Perda de peso visível

## Como o Saúde PET pode ajudar

O atendimento em domicílio é especialmente vantajoso para gatos: sem caixa de transporte, sem carro e sem sala de espera com cachorros, o estresse é muito menor e a avaliação fica mais fidedigna. [Solicite um atendimento](/register) e um médico-veterinário parceiro avalia seu gato no ambiente onde ele se sente seguro.

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário. Em caso de emergência, procure atendimento imediatamente.`
  },
  {
    slug: 'cachorro-com-diarreia-causas-e-sinais-de-emergencia',
    category: 'sinais-de-alerta',
    title: 'Cachorro com diarreia: causas comuns e sinais de emergência',
    excerpt: 'Diarreia em cães vai de um desarranjo passageiro a doenças graves como parvovirose. Aprenda a diferenciar e saiba quando procurar um veterinário.',
    seo_title: 'Cachorro com diarreia: causas e sinais de emergência',
    seo_description: 'Diarreia em cachorro: causas comuns, cuidados em casa e sinais de emergência como sangue nas fezes, apatia e vômito. Saiba quando ir ao veterinário.',
    tags: ['diarreia', 'cachorro', 'sintomas', 'emergência'],
    published_at: '2026-08-05T09:00:00-03:00',
    content: `**Resposta direta:** um episódio de diarreia em cão adulto ativo, hidratado e com apetite pode ser observado por até 24 horas. Procure um médico-veterinário se houver sangue nas fezes, vômito associado, apatia ou se o cão for filhote não vacinado, pois nesse caso a diarreia pode indicar parvovirose, uma doença grave e de evolução rápida.

## Causas mais comuns

- Mudança repentina de ração
- Ingestão de lixo, restos de comida ou alimentos gordurosos
- Verminoses e protozoários (giárdia é muito frequente)
- Infecções bacterianas e virais, incluindo a parvovirose
- Intolerâncias e alergias alimentares
- Estresse e mudanças de rotina
- Efeito colateral de medicamentos

## Cuidados em casa (cão adulto, caso leve)

- Mantenha água fresca sempre disponível, o maior risco imediato é a desidratação
- Ofereça refeições pequenas e leves, sem temperos ou gordura
- Evite petiscos e alimentos novos por alguns dias
- Observe cor, frequência e presença de sangue ou muco nas fezes

**Não use remédios humanos para diarreia.** Vários deles são contraindicados ou tóxicos para cães, e podem mascarar uma doença que precisa de tratamento.

## Sinais de emergência

Procure atendimento veterinário imediato se notar:

- Sangue nas fezes (vermelho vivo ou fezes escuras como borra de café)
- Diarreia com vômitos ao mesmo tempo
- Apatia, fraqueza ou desinteresse por água e comida
- Diarreia muito líquida e frequente, com odor forte incomum
- Gengivas pálidas ou secas (sinal de desidratação)
- Febre, tremores ou dor abdominal
- Filhote sem vacinação completa com qualquer diarreia

Em filhotes, a combinação de diarreia, vômito e apatia é considerada emergência até que se prove o contrário. A parvovirose desidrata e enfraquece o animal em poucas horas.

## Por que o histórico faz diferença

Saber quando as vacinas foram aplicadas, qual vermífugo foi usado e o que o cão comeu recentemente encurta o caminho até o diagnóstico. Ao registrar essas informações no perfil do seu pet no Saúde PET, o veterinário chega ao atendimento com o contexto completo.

## Como o Saúde PET pode ajudar

Um médico-veterinário parceiro pode avaliar seu cão em casa, verificar hidratação, coletar informações e orientar o tratamento ou o encaminhamento para exames. [Solicite um atendimento](/register) ou [tire suas dúvidas com a equipe](/contato).

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário. Em caso de emergência, procure atendimento imediatamente.`
  },
  {
    slug: 'pet-com-dificuldade-para-respirar-sinais-de-emergencia',
    category: 'sinais-de-alerta',
    title: 'Pet com dificuldade para respirar: quais sinais exigem atendimento imediato?',
    excerpt: 'Esforço para respirar é uma das emergências veterinárias mais sérias. Veja como reconhecer os sinais em cães e gatos e o que fazer enquanto busca ajuda.',
    seo_title: 'Pet com dificuldade para respirar: o que fazer',
    seo_description: 'Dificuldade respiratória em cães e gatos é emergência: respiração de boca aberta em gatos, língua azulada e esforço abdominal exigem atendimento imediato.',
    tags: ['respiração', 'emergência', 'cachorro', 'gato'],
    published_at: '2026-08-06T09:00:00-03:00',
    content: `**Resposta direta:** dificuldade respiratória verdadeira é sempre emergência. Se o seu pet está com respiração ruidosa e esforçada, usando a barriga para respirar, com gengivas azuladas ou pálidas, ou se o seu gato está respirando de boca aberta, procure atendimento veterinário imediatamente, de preferência em um hospital com suporte de oxigênio.

## Como reconhecer o esforço respiratório

Alguns sinais indicam que o pet não está apenas ofegante de calor ou exercício:

- Movimento exagerado da barriga a cada respiração
- Pescoço esticado e cotovelos afastados do corpo para "abrir espaço" no tórax
- Narinas muito abertas a cada inspiração
- Ruídos ao respirar: chiado, ronco anormal ou som de esforço
- Respiração muito rápida mesmo em repouso e em ambiente fresco
- Gengivas e língua azuladas, acinzentadas ou muito pálidas
- Inquietação, recusa em deitar de lado ou em dormir

**Em gatos, respirar de boca aberta nunca é normal.** Gato ofegante como cachorro é sinal de problema sério até prova em contrário.

## Causas possíveis

A dificuldade respiratória pode vir de doenças cardíacas, pneumonia, asma felina (comum em gatos), obstrução por objetos, golpe de calor, traumas, líquido no tórax ou reações alérgicas graves. Cães de focinho curto (buldogue, pug, shih tzu) têm risco maior em dias quentes.

## O que fazer enquanto busca atendimento

- Mantenha a calma e reduza o estresse do animal, agitação piora o quadro
- Leve o pet para um local fresco e ventilado
- Não force água, comida ou medicamentos
- Evite apertar o tórax ou o pescoço, retire coleiras apertadas
- Transporte com o mínimo de manipulação possível

## Quando o atendimento domiciliar é indicado, e quando não é

Aqui é importante ser transparente: **em crise respiratória aguda, o lugar do pet é um hospital veterinário com oxigênio**. O atendimento em domicílio é indicado para avaliar quadros leves e crônicos, como tosse ocasional, ronco que piorou com o tempo ou cansaço progressivo, e para acompanhamento após a estabilização.

Se você está em dúvida sobre a gravidade, descreva os sintomas ao solicitar o atendimento: a triagem ajuda a definir se o caso é para casa ou para o hospital. Leia também [quando o atendimento domiciliar é indicado e quando é melhor ir ao hospital](/blog/atendimento-domiciliar-ou-hospital-veterinario-quando-cada-um-e-indicado).

## Como o Saúde PET pode ajudar

Para sintomas respiratórios leves ou persistentes, um médico-veterinário parceiro avalia seu pet em casa e orienta os próximos passos, incluindo exames quando necessário. [Solicite um atendimento](/register).

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário. Em caso de emergência respiratória, procure um hospital veterinário imediatamente.`
  },
  {
    slug: 'cachorro-ou-gato-intoxicado-o-que-fazer',
    category: 'sinais-de-alerta',
    title: 'Cachorro ou gato intoxicado: o que fazer e o que não fazer',
    excerpt: 'Chocolate, medicamentos humanos, plantas e produtos de limpeza estão entre os venenos mais comuns. Saiba agir rápido e evite os erros que pioram o quadro.',
    seo_title: 'Pet intoxicado: o que fazer e o que não fazer',
    seo_description: 'Intoxicação em cães e gatos: sinais, principais venenos domésticos e primeiros passos. Saiba por que não deve provocar vômito nem dar leite ao pet.',
    tags: ['intoxicação', 'envenenamento', 'emergência', 'segurança'],
    published_at: '2026-08-07T09:00:00-03:00',
    content: `**Resposta direta:** se você viu ou suspeita que seu pet ingeriu algo tóxico, entre em contato com um médico-veterinário imediatamente, mesmo que o animal pareça bem. Não provoque vômito, não dê leite e não espere os sintomas aparecerem: em muitas intoxicações, quando os sinais surgem o quadro já está avançado.

## Venenos domésticos mais comuns

- **Chocolate**, quanto mais amargo, mais tóxico para cães
- **Medicamentos humanos**: paracetamol (especialmente letal para gatos), anti-inflamatórios, antidepressivos
- **Uva e uva-passa**, podem causar insuficiência renal em cães
- **Xilitol**, adoçante presente em chicletes e produtos diet
- **Cebola e alho**, em qualquer forma
- **Plantas tóxicas**: lírio (gravíssimo para gatos), comigo-ninguém-pode, espada-de-são-jorge, azaleia
- **Produtos de limpeza**, desinfetantes e água sanitária
- **Raticidas e inseticidas**
- **Cigarro, bebidas alcoólicas e drogas recreativas**

## Sinais de intoxicação

Os sintomas variam conforme a substância, mas os mais frequentes são:

- Salivação intensa e repentina
- Vômito e diarreia, com ou sem sangue
- Tremores, andar cambaleante ou convulsões
- Apatia extrema ou agitação incomum
- Gengivas muito pálidas, azuladas ou avermelhadas
- Dificuldade respiratória
- Sangramentos sem causa aparente (comum em raticidas)

## O que fazer

- Afaste o animal da fonte do veneno
- Guarde a embalagem, o rótulo ou uma foto do produto ou planta
- Estime a quantidade ingerida e anote o horário
- Entre em contato com um veterinário imediatamente e siga as orientações
- Em caso grave (convulsão, desmaio, esforço para respirar), vá direto ao hospital veterinário

## O que NÃO fazer

- **Não provoque vômito** sem orientação profissional: substâncias corrosivas queimam o esôfago na volta, e o vômito pode causar aspiração
- **Não dê leite**, não neutraliza veneno e pode acelerar a absorção de algumas substâncias
- **Não aplique remédios caseiros** encontrados na internet
- **Não espere "para ver se passa"**: com venenos, tempo é o fator que mais define o desfecho

## Prevenção vale mais que resposta rápida

Guarde medicamentos em armários fechados, mantenha lixo inacessível, conheça as plantas da sua casa e nunca dê restos de comida temperada. Se você tem gatos, elimine lírios da casa por completo.

## Como o Saúde PET pode ajudar

Registrar no perfil do pet as intoxicações anteriores, medicamentos em uso e alergias ajuda o veterinário a agir mais rápido em uma emergência. [Crie o perfil de saúde do seu pet](/register) e tenha essas informações sempre à mão.

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário. Em caso de intoxicação, procure atendimento imediatamente.`
  },
  {
    slug: 'como-saber-se-o-pet-esta-com-dor',
    category: 'sinais-de-alerta',
    title: 'Como saber se o pet está com dor? 10 sinais que passam despercebidos',
    excerpt: 'Cães e gatos escondem dor por instinto. Conheça os sinais discretos, de lambedura excessiva a mudanças de comportamento, que indicam que algo está errado.',
    seo_title: 'Como saber se o pet está com dor: 10 sinais',
    seo_description: 'Pets escondem dor por instinto. Veja 10 sinais discretos de dor em cães e gatos: postura, apetite, lambedura, isolamento e mudanças de comportamento.',
    tags: ['dor', 'comportamento', 'cachorro', 'gato', 'sintomas'],
    published_at: '2026-08-08T09:00:00-03:00',
    content: `**Resposta direta:** a maioria dos pets não chora nem geme quando sente dor, esconder o desconforto é um instinto de sobrevivência, especialmente em gatos. Os sinais costumam ser sutis: mudanças de postura, de apetite, de rotina e de comportamento. Se dois ou mais dos sinais abaixo aparecerem juntos ou persistirem por mais de um dia, procure avaliação veterinária.

## 10 sinais de dor que passam despercebidos

### 1. Lambedura insistente em um mesmo lugar

Lamber ou mordiscar sempre a mesma pata, articulação ou região do corpo costuma indicar dor ou incômodo local, mesmo sem ferida visível.

### 2. Mudança na postura ao dormir ou descansar

O pet evita a posição de sempre, dorme encolhido quando dormia esticado, ou troca de posição sem conseguir se acomodar.

### 3. Relutância em pular, subir escadas ou entrar no carro

Especialmente em gatos, parar de pular para locais altos é um dos primeiros sinais de dor articular.

### 4. Diminuição do apetite

Dor de dente, dor abdominal e dor crônica reduzem o interesse pela comida, o pet chega a se aproximar do pote e desistir.

### 5. Isolamento ou carência fora do normal

Alguns animais se escondem, outros ficam grudados no tutor. O que importa é a mudança em relação ao comportamento habitual.

### 6. Agressividade ao ser tocado

Rosnar, bufar ou se esquivar quando você toca uma região específica é um aviso claro de dor localizada.

### 7. Respiração acelerada em repouso

Dor ativa o organismo: respiração rápida e curta, mesmo sem calor ou exercício, pode ser sinal de desconforto.

### 8. Postura arqueada ou "posição de prece"

Costas curvadas, cabeça baixa, ou a postura com o peito no chão e o traseiro levantado podem indicar dor abdominal.

### 9. Deixar de se limpar (gatos)

Pelagem opaca, embaraçada ou com caspa em um gato que sempre foi caprichoso na higiene sugere dor, principalmente em gatos idosos com artrose.

### 10. Vocalização diferente

Mais do que gemer: miar ou latir em situações incomuns, ganir ao se levantar, ou um silêncio incomum em um pet falante.

## Dor não é frescura nem "coisa da idade"

Muitos tutores atribuem esses sinais ao envelhecimento natural. Na prática, grande parte dos cães e gatos idosos tem dor articular tratável, e o manejo correto muda completamente a qualidade de vida do animal.

**Nunca dê analgésicos humanos ao seu pet.** Dipirona, paracetamol e ibuprofeno podem ser tóxicos ou fatais para cães e gatos, mesmo em doses pequenas.

## Como o Saúde PET pode ajudar

No atendimento em domicílio, o veterinário observa o pet no ambiente real dele, onde o comportamento aparece sem o estresse da clínica, o que facilita identificar dor. [Solicite uma avaliação](/register) e registre as observações no histórico do seu pet.

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário. Em caso de dor intensa ou súbita, procure atendimento imediatamente.`
  },
  {
    slug: 'calendario-de-vacinacao-para-cachorros',
    category: 'prevencao-e-vacinas',
    title: 'Calendário de vacinação para cachorros: quais vacinas são necessárias?',
    excerpt: 'Da V8 à antirrábica: veja o calendário de vacinas do cão, quando começar, os reforços anuais e por que o filhote não deve passear antes do protocolo completo.',
    seo_title: 'Calendário de vacinação para cachorros',
    seo_description: 'Vacinas para cachorro: V8/V10 a partir de 45 dias, antirrábica aos 4 meses e reforços anuais. Veja o calendário completo e por que não atrasar doses.',
    tags: ['vacinas', 'cachorro', 'filhote', 'prevenção'],
    published_at: '2026-08-09T09:00:00-03:00',
    content: `**Resposta direta:** o protocolo básico do cão começa entre 42 e 45 dias de vida com a vacina múltipla (V8 ou V10), aplicada em 3 a 4 doses com intervalos de 21 a 30 dias. A antirrábica entra a partir dos 4 meses, em dose única. Depois, ambas exigem reforço anual por toda a vida. O veterinário pode indicar também as vacinas contra gripe canina, giárdia e leishmaniose, conforme o estilo de vida e a região.

## Vacinas essenciais

### Vacina múltipla (V8 ou V10)

Protege contra cinomose, parvovirose, coronavirose, hepatite infecciosa, adenovirose, parainfluenza e leptospirose. A V10 amplia a cobertura contra sorotipos de leptospira.

- **1ª dose:** 42 a 45 dias de vida
- **Reforços:** mais 2 a 3 doses, com intervalo de 21 a 30 dias
- **Reforço anual:** dose única, todos os anos

### Antirrábica

Protege contra a raiva, doença fatal e transmissível a humanos. É exigida por lei em muitas cidades.

- **1ª dose:** a partir dos 4 meses (após o protocolo da múltipla)
- **Reforço anual:** dose única, todos os anos

## Vacinas complementares (conforme indicação)

- **Gripe canina (tosse dos canis):** indicada para cães que frequentam creches, hotéis, banho e tosa e parques
- **Giárdia:** para cães com maior exposição a ambientes coletivos ou áreas contaminadas
- **Leishmaniose:** relevante em regiões endêmicas, converse com o veterinário sobre o risco na sua cidade

## Por que o filhote não pode passear antes de completar as vacinas?

Antes do protocolo completo, o filhote não tem imunidade suficiente contra cinomose e parvovirose, doenças graves, muito contagiosas e presentes no ambiente. O vírus da parvovirose sobrevive meses no solo. Por isso, nada de calçada, parque ou contato com cães desconhecidos até a liberação do veterinário, normalmente uma semana após a última dose da múltipla.

## E se atrasar uma dose?

Atrasos curtos geralmente se resolvem retomando o esquema, mas quem define isso é o veterinário: dependendo do intervalo, pode ser necessário reiniciar o protocolo. O mais importante é não deixar o reforço anual vencer, a proteção cai com o tempo.

## Dicas para o dia da vacina

- O pet deve estar saudável, sem vômito, diarreia ou apatia
- Mantenha o vermífugo em dia, verminose atrapalha a resposta imunológica
- Guarde o comprovante e anote a data do próximo reforço

## Como o Saúde PET pode ajudar

No Saúde PET, as vacinas do seu cão ficam registradas na carteira digital do pet, com as próximas doses sempre visíveis. A vacinação pode ser feita em casa, sem estresse de deslocamento. [Cadastre seu pet e organize as próximas vacinas](/register).

> Este conteúdo é informativo e não substitui a orientação de um médico-veterinário, que pode adaptar o protocolo ao seu cão e à sua região.`
  },
  {
    slug: 'calendario-de-vacinacao-para-gatos',
    category: 'prevencao-e-vacinas',
    title: 'Calendário de vacinação para gatos: guia para o tutor',
    excerpt: 'V3, V4 ou V5? Antirrábica? Veja quais vacinas o gato precisa, quando aplicar cada dose e por que até gato que não sai de casa deve ser vacinado.',
    seo_title: 'Calendário de vacinação para gatos: guia completo',
    seo_description: 'Vacinas para gatos: múltipla felina (V3/V4/V5) a partir de 60 dias, antirrábica aos 4 meses e reforço anual. Gato de apartamento também precisa vacinar.',
    tags: ['vacinas', 'gato', 'filhote', 'prevenção'],
    published_at: '2026-08-10T09:00:00-03:00',
    content: `**Resposta direta:** o gato deve receber a vacina múltipla felina (V3, V4 ou V5) a partir dos 60 dias de vida, em 2 a 3 doses com intervalo de 21 a 30 dias, e a antirrábica a partir dos 4 meses. As duas pedem reforço anual. Sim, isso vale também para gatos que nunca saem de casa.

## Vacinas essenciais

### Múltipla felina (V3, V4 ou V5)

- **V3:** protege contra panleucopenia, rinotraqueíte e calicivirose
- **V4:** adiciona proteção contra clamidiose
- **V5:** adiciona proteção contra a FeLV (leucemia felina)

Esquema habitual:

- **1ª dose:** a partir de 60 dias de vida
- **Reforços:** 1 a 2 doses adicionais, com intervalo de 21 a 30 dias
- **Reforço anual:** dose única, todos os anos

Para a V5, o ideal é testar o gato para FeLV antes da primeira aplicação, converse com o veterinário.

### Antirrábica

- **1ª dose:** a partir dos 4 meses
- **Reforço anual:** dose única, todos os anos

A raiva é fatal e transmissível a humanos, e a vacinação é obrigatória em muitas cidades brasileiras.

## "Meu gato não sai de casa, precisa vacinar?"

Precisa. Os vírus da panleucopenia e das gripes felinas são resistentes e chegam em casa por sapatos, roupas e objetos. Além disso, basta uma fuga pela janela, uma mudança ou uma internação para o gato ter contato com outros animais. A vacinação protege justamente para o imprevisto.

## Qual múltipla escolher?

Depende do estilo de vida:

- **Gato 100% dentro de casa, sem contato com outros gatos:** V3 ou V4 costumam ser suficientes
- **Gato com acesso à rua ou que convive com gatos de fora:** a V5 (com FeLV) tende a ser recomendada

A decisão final é do veterinário, considerando idade, saúde e exposição ao risco.

## Cuidados no dia da vacinação

- O gato deve estar saudável e com vermífugo em dia
- Filhotes recém-adotados devem passar por consulta antes da primeira dose
- Após a vacina, é normal um pouco de sonolência por 24 horas, apatia intensa ou inchaço persistente merecem contato com o veterinário

## Como o Saúde PET pode ajudar

Vacinar gato em casa evita a parte mais estressante do processo: caixa de transporte, carro e sala de espera. Pelo Saúde PET, o veterinário aplica as vacinas no seu domicílio e tudo fica registrado na carteira digital do pet, com lembrete do próximo reforço. [Cadastre seu gato e organize as vacinas](/register).

> Este conteúdo é informativo e não substitui a orientação de um médico-veterinário, que pode adaptar o protocolo ao seu gato e à sua região.`
  },
  {
    slug: 'pulgas-e-carrapatos-como-identificar-prevenir-e-proteger',
    category: 'prevencao-e-vacinas',
    title: 'Pulgas e carrapatos: como identificar, prevenir e proteger sua casa',
    excerpt: 'Mais que coceira: pulgas e carrapatos transmitem doenças graves. Saiba identificar a infestação, escolher a proteção certa e limpar o ambiente de verdade.',
    seo_title: 'Pulgas e carrapatos: identificar, prevenir e eliminar',
    seo_description: 'Como identificar pulgas e carrapatos no pet, prevenir com antiparasitários e eliminar a infestação da casa. Doença do carrapato: sinais de alerta.',
    tags: ['pulgas', 'carrapatos', 'prevenção', 'antiparasitário'],
    published_at: '2026-08-11T09:00:00-03:00',
    content: `**Resposta direta:** a proteção eficaz combina antiparasitário de uso contínuo no pet (indicado pelo veterinário) com limpeza do ambiente, já que a maior parte da infestação de pulgas vive na casa, não no animal. Carrapatos merecem atenção redobrada: transmitem a chamada "doença do carrapato", que pode ser grave.

## Como identificar

### Pulgas

- Coceira intensa, principalmente na base da cauda, virilha e barriga
- Pontinhos pretos na pelagem (fezes de pulga): no papel úmido, ficam avermelhados
- Falhas de pelo e feridas de tanto coçar
- Em infestações grandes, as pulgas ficam visíveis afastando o pelo

### Carrapatos

- Pequenas "verrugas" marrons ou acinzentadas presas à pele, que crescem em dias
- Locais preferidos: orelhas, entre os dedos, axilas, pescoço e virilha
- No ambiente: carrapatos subindo por paredes e frestas em infestações avançadas

## Por que é mais que coceira

- Pulgas causam **dermatite alérgica** (uma picada basta para gatos e cães alérgicos), transmitem verminose e podem causar anemia em filhotes
- Carrapatos transmitem **erliquiose e babesiose**, a "doença do carrapato", que causa febre, apatia, anemia e queda de plaquetas, e pode ser fatal sem tratamento

Se o seu pet teve carrapatos recentemente e apresenta apatia, febre, gengivas pálidas ou sangramentos, procure um veterinário e informe o histórico.

## Prevenção no pet

As opções incluem comprimidos mastigáveis, pipetas (aplicação na nuca) e coleiras repelentes. A escolha depende da espécie, peso, idade e rotina do animal:

- **Nunca use produto de cão em gato**, alguns princípios ativos caninos são fatais para felinos
- Respeite o intervalo de reaplicação, proteção vencida é proteção zero
- Mantenha a prevenção o ano todo, no calor o ciclo da pulga acelera

## Limpeza do ambiente

Cerca de 95% da população de pulgas (ovos, larvas e casulos) está no ambiente:

- Aspire diariamente frestas, rodapés, sofás e camas dos pets, e descarte o saco do aspirador fora de casa
- Lave camas e cobertores dos animais com água quente toda semana
- Em infestações estabelecidas, pode ser necessário tratamento ambiental específico, peça orientação ao veterinário
- Trate **todos** os animais da casa ao mesmo tempo, tratar só um não resolve

## Como o Saúde PET pode ajudar

No perfil do seu pet, você registra qual antiparasitário usa e quando reaplicar, sem depender da memória. E se a coceira já virou ferida ou o pet teve carrapatos e está abatido, [solicite um atendimento em domicílio](/register) para avaliação.

> Este conteúdo é informativo e não substitui a orientação de um médico-veterinário na escolha do antiparasitário adequado ao seu pet.`
  },
  {
    slug: 'quando-levar-o-pet-ao-veterinario-mesmo-sem-sintomas',
    category: 'prevencao-e-vacinas',
    title: 'Quando levar o pet ao veterinário mesmo sem sintomas?',
    excerpt: 'Check-up anual não é luxo: cães e gatos escondem doenças até estágios avançados. Veja a frequência ideal de consultas para cada fase da vida do pet.',
    seo_title: 'Check-up veterinário: frequência ideal por idade',
    seo_description: 'Pet sem sintomas também precisa de veterinário: check-up anual para adultos, semestral para idosos. Entenda o que é avaliado e por que a prevenção compensa.',
    tags: ['check-up', 'prevenção', 'consulta', 'idoso'],
    published_at: '2026-08-12T09:00:00-03:00',
    content: `**Resposta direta:** mesmo sem nenhum sintoma, um cão ou gato adulto deve passar por consulta veterinária ao menos uma vez por ano. Filhotes precisam de acompanhamento mensal até completar o protocolo vacinal, e pets a partir de 7 anos se beneficiam de check-up a cada 6 meses. O motivo é simples: cães e gatos escondem doenças, e muitas só dão sinais em estágio avançado.

## Por que consultar um pet saudável?

Doença renal crônica, problemas cardíacos, doença periodontal, diabetes e tumores costumam evoluir em silêncio por meses ou anos. Quando os sintomas aparecem, a doença já está estabelecida, o tratamento fica mais caro, mais difícil e menos eficaz. No check-up, o veterinário pode detectar alterações antes disso: um sopro no coração, uma massa pequena, perda de peso discreta, alterações em exames de sangue.

## Frequência recomendada por fase da vida

### Filhotes (até 1 ano)

- Consultas mensais durante o protocolo de vacinação
- Orientação sobre alimentação, castração, vermifugação e comportamento
- É a fase que define hábitos para a vida toda

### Adultos (1 a 7 anos)

- **Consulta anual**, geralmente junto com o reforço das vacinas
- Avaliação de peso, dentes, pele, coração e abdômen
- Exames de sangue e urina conforme indicação

### Idosos (a partir de 7 anos)

- **Consulta a cada 6 meses**, um ano para um pet idoso equivale a vários anos humanos
- Exames de sangue e urina periódicos para monitorar rins, fígado e glicose
- Atenção especial a dor articular, nódulos e mudanças de comportamento

## O que é avaliado em um check-up

- Peso e escore corporal (obesidade é das doenças mais comuns e mais ignoradas)
- Boca e dentes, doença periodontal afeta a maioria dos cães adultos
- Ausculta de coração e pulmão
- Palpação do abdômen e de linfonodos
- Pele, pelagem, olhos e ouvidos
- Revisão de vacinas, vermífugo e antiparasitários
- Exames complementares quando indicados

## Prevenção também é economia

Tratar uma doença renal descoberta no início custa uma fração do tratamento de uma crise renal aguda com internação. O check-up anual é o melhor custo-benefício da saúde do pet.

## Como o Saúde PET pode ajudar

Com o Saúde PET, o check-up acontece na sua casa: sem estresse de deslocamento e com o veterinário vendo o pet no ambiente real dele. O histórico, o peso e os exames ficam registrados no perfil do animal, permitindo comparar a evolução ano a ano. [Cadastre seu pet e agende uma avaliação](/register).

> Este conteúdo é informativo e não substitui a orientação de um médico-veterinário sobre a frequência ideal de acompanhamento para o seu pet.`
  },
  {
    slug: 'como-funciona-uma-consulta-veterinaria-em-domicilio',
    category: 'consultas-exames-e-medicamentos',
    title: 'Como funciona uma consulta veterinária em domicílio?',
    excerpt: 'Do agendamento à receita digital: veja o passo a passo do atendimento veterinário em casa, o que o profissional consegue fazer e como se preparar.',
    seo_title: 'Consulta veterinária em domicílio: como funciona',
    seo_description: 'Consulta veterinária em casa: como agendar, o que o veterinário faz no atendimento domiciliar, vantagens para gatos e cães ansiosos e como se preparar.',
    tags: ['atendimento domiciliar', 'consulta', 'como funciona'],
    published_at: '2026-08-13T09:00:00-03:00',
    content: `**Resposta direta:** na consulta em domicílio, um médico-veterinário vai até a sua casa com os equipamentos necessários para o exame clínico completo: avalia o pet, orienta o tratamento, prescreve medicamentos e, quando preciso, coleta material para exames ou indica encaminhamento. Para o pet, a diferença é enorme: sem caixa de transporte, sem carro e sem sala de espera.

## Passo a passo do atendimento pelo Saúde PET

### 1. Solicitação

Você cria o perfil do seu pet, descreve o motivo do atendimento (consulta de rotina, sintoma específico, vacinação, retorno) e informa endereço e horários possíveis.

### 2. Confirmação

Um médico-veterinário parceiro aceita a solicitação. Você acompanha o status pelo aplicativo e recebe a confirmação do horário.

### 3. A consulta em si

O atendimento dura em média 40 a 60 minutos, geralmente mais tempo de contato com o veterinário do que em uma clínica. O profissional:

- Conversa com você sobre o histórico e a queixa
- Examina o pet: ausculta, palpação, temperatura, boca, ouvidos, pele e mucosas
- Observa o ambiente, alimentação, água e comportamento no território do animal
- Aplica vacinas ou medicamentos, quando for o caso

### 4. Registro e prescrição

Ao final, o veterinário registra o atendimento no prontuário digital do pet. Você recebe a prescrição com as orientações, e tudo fica salvo no histórico, sem papel para perder.

### 5. Acompanhamento

Retornos, próximas vacinas e lembretes de medicamento contínuo ficam organizados no perfil do pet.

## O que dá para fazer em casa?

Consultas de rotina e check-ups, vacinação, avaliação de sintomas leves e moderados, acompanhamento de doenças crônicas, coleta de sangue para exames, orientação de filhote recém-chegado e cuidados com pets idosos com dificuldade de locomoção.

**O que não é para atendimento domiciliar:** emergências graves (atropelamento, convulsão, dificuldade respiratória intensa, sangramento ativo) e procedimentos que exigem estrutura hospitalar, como cirurgias e exames de imagem. Nesses casos, o caminho é o hospital veterinário.

## Para quem o atendimento em casa faz mais diferença

- **Gatos**, que sofrem intensamente com transporte e cheiros de clínica
- **Cães ansiosos, reativos ou muito grandes**
- **Pets idosos** ou com dor, que se estressam no deslocamento
- **Tutores com mais de um animal**, avaliados na mesma visita
- **Rotinas corridas**, sem tempo para deslocamento e espera

## Quanto custa?

O valor varia conforme o tipo de atendimento e a região, e é informado antes da confirmação, sem surpresa no final.

## Prepare-se para a consulta

Leia também [quais informações contar ao veterinário durante o atendimento](/blog/quando-levar-o-pet-ao-veterinario-mesmo-sem-sintomas) e tenha em mãos a carteira de vacinação, os medicamentos em uso e suas dúvidas anotadas.

[Veja como funciona na prática e solicite um atendimento](/register), ou [fale com a nossa equipe](/contato) se ainda tiver dúvidas.

> Este conteúdo é informativo. Em caso de emergência, procure imediatamente um hospital veterinário com estrutura de urgência.`
  },
  {
    slug: 'atendimento-domiciliar-ou-hospital-veterinario-quando-cada-um-e-indicado',
    category: 'consultas-exames-e-medicamentos',
    title: 'Quando o atendimento domiciliar é indicado — e quando é melhor ir ao hospital',
    excerpt: 'Atendimento em casa e hospital veterinário não competem: se complementam. Aprenda a decidir rápido qual é o caminho certo para cada situação.',
    seo_title: 'Atendimento domiciliar ou hospital veterinário?',
    seo_description: 'Consulta em casa ou hospital veterinário? Veja quando o atendimento domiciliar é indicado e quais sinais de emergência exigem estrutura hospitalar.',
    tags: ['atendimento domiciliar', 'emergência', 'hospital', 'como funciona'],
    published_at: '2026-08-14T09:00:00-03:00',
    content: `**Resposta direta:** o atendimento domiciliar é indicado para consultas de rotina, vacinação, sintomas leves a moderados e acompanhamento de doenças crônicas. O hospital veterinário é o lugar certo para emergências e para tudo que exige estrutura: cirurgia, internação, oxigênio e exames de imagem. Na dúvida entre os dois, a descrição dos sintomas na triagem ajuda a decidir, e um bom serviço domiciliar orienta você a ir ao hospital quando é o caso.

## Situações ideais para o atendimento em casa

- **Check-up e consulta de rotina**, avaliação completa sem estresse de deslocamento
- **Vacinação e vermifugação**, protocolo em dia com registro digital
- **Sintomas leves e persistentes**: coceira, otite, pequenas alterações de apetite, tosse ocasional
- **Doenças crônicas**: acompanhamento de pets cardiopatas, renais, diabéticos ou com artrose
- **Pets idosos ou com mobilidade reduzida**
- **Gatos e cães que entram em pânico na clínica**, a avaliação em casa é mais fiel ao estado real do animal
- **Pós-operatório e retornos**, verificação de curativos e evolução
- **Orientação de filhote recém-chegado**, ambiente, alimentação e calendário de vacinas

## Vá direto ao hospital veterinário se houver

- Dificuldade respiratória intensa, língua ou gengivas azuladas
- Atropelamento, queda de altura ou trauma forte, mesmo sem ferida aparente
- Convulsão, desmaio ou perda de consciência
- Sangramento abundante que não para
- Abdômen inchado e rígido com tentativas de vômito sem sucesso (suspeita de torção gástrica)
- Macho (especialmente gato) tentando urinar sem conseguir
- Suspeita de envenenamento com sintomas graves
- Golpe de calor: ofegação extrema, temperatura alta, colapso

Nesses quadros, cada minuto conta e o pet pode precisar de oxigênio, fluidoterapia intensiva, transfusão ou cirurgia de urgência, recursos que só a estrutura hospitalar oferece.

## A zona cinzenta: e quando não é óbvio?

Muitos casos começam ambíguos: um vômito repetido, uma apatia que não passa, uma manqueira súbita. Para essas situações:

- Descreva os sintomas com detalhes ao solicitar o atendimento
- Informe início, frequência e evolução do quadro
- Sinalize qualquer sinal de alerta (sangue, dor intensa, prostração)

Com essas informações, a triagem consegue direcionar: atendimento em casa nas próximas horas ou hospital agora. **Um serviço sério nunca insiste no atendimento domiciliar quando o quadro pede hospital.**

## Casa e hospital trabalham juntos

O modelo ideal combina os dois: o veterinário em domicílio acompanha a saúde do pet no dia a dia, detecta problemas cedo e, quando algo exige estrutura, encaminha com o histórico completo em mãos, o que agiliza o atendimento hospitalar. Depois da alta, o acompanhamento volta a ser feito em casa.

## Como o Saúde PET pode ajudar

Pelo Saúde PET, você solicita consulta, retorno ou atendimento de urgência leve descrevendo os sintomas, e o histórico do seu pet fica acessível ao veterinário desde o primeiro contato. [Solicite um atendimento](/register) ou leia [como funciona uma consulta veterinária em domicílio](/blog/como-funciona-uma-consulta-veterinaria-em-domicilio).

> Este conteúdo é informativo e não substitui a avaliação de um médico-veterinário. Em caso de emergência, procure um hospital veterinário imediatamente.`
  },
  {
    slug: 'primeira-consulta-do-filhote-o-que-o-tutor-precisa-preparar',
    category: 'filhotes-e-idosos',
    title: 'Primeira consulta do filhote: o que o tutor precisa preparar',
    excerpt: 'A primeira consulta define o plano de vacinas, vermífugos e alimentação do filhote. Veja quando agendar, o que levar e quais perguntas fazer ao veterinário.',
    seo_title: 'Primeira consulta do filhote: como se preparar',
    seo_description: 'Primeira consulta do filhote de cão ou gato: quando agendar, documentos e informações para levar, o que o veterinário avalia e perguntas essenciais.',
    tags: ['filhote', 'consulta', 'vacinas', 'cachorro', 'gato'],
    scheduled_for: '2026-08-18T09:00:00-03:00',
    content: `**Resposta direta:** agende a primeira consulta na primeira semana após a chegada do filhote, idealmente antes de apresentá-lo a outros animais da casa. Leve todo documento que veio com ele (comprovantes de vacina e vermífugo, informações do criador ou da ONG) e anote marca de ração, rotina e qualquer comportamento estranho. É nessa consulta que o veterinário monta o calendário de vacinas e o plano de cuidados do primeiro ano.

## Quando deve ser a primeira consulta?

- **Filhote recém-adotado ou comprado:** nos primeiros 3 a 7 dias após a chegada
- **Ninhada nascida em casa:** primeira avaliação nas primeiras semanas de vida
- **Antes disso, em caso de alerta:** diarreia, secreção nos olhos ou nariz, apatia ou recusa de comida em filhote é motivo para antecipar, não esperar

A consulta cedo importa por dois motivos: filhotes adoecem e desidratam muito rápido, e o protocolo de vacinação tem janela certa para começar, entre 42 e 45 dias nos cães e a partir de 60 dias nos gatos.

## O que levar (ou ter à mão, no atendimento em casa)

- Comprovantes de vacinas e vermífugos já aplicados, com datas e marcas
- Informações de origem: criador, ONG, feira de adoção, resgate de rua
- Nome da ração atual e a quantidade oferecida por dia
- Lista de tudo que observou: fezes moles, espirros, coceira, soninho demais
- Suas dúvidas anotadas, na hora, todo mundo esquece

## O que o veterinário avalia

- Peso, temperatura, hidratação e escore corporal
- Boca, dentes de leite e mordedura
- Coração e pulmão (sopros congênitos são detectáveis cedo)
- Barriga, umbigo (hérnias são comuns) e genitais
- Pele e pelagem: pulgas, fungos, sarnas
- Sinais de verminose, quase todo filhote precisa de vermifugação seriada

## As perguntas que valem a pena fazer

- Qual o calendário de vacinas deste filhote? Veja o [calendário do cão](/blog/calendario-de-vacinacao-para-cachorros) e o [do gato](/blog/calendario-de-vacinacao-para-gatos)
- Quando ele pode passear e conviver com outros animais?
- Qual ração e quantas refeições por dia para a idade dele?
- Quando castrar e por quê?
- Como fazer a adaptação com os outros pets da casa?
- Qual antipulgas é seguro para a idade e o peso dele?

## Por que a primeira consulta em casa faz sentido

Filhote sem vacinação completa não deveria circular por sala de espera de clínica, justamente onde há animais doentes. No atendimento domiciliar, ele é examinado sem risco de contato e o veterinário ainda avalia o ambiente real: onde o filhote dorme, o que morde, como é o acesso a escadas e sacadas.

## Como o Saúde PET pode ajudar

Cadastre o filhote no Saúde PET antes mesmo da primeira consulta: as vacinas aplicadas, o peso e as orientações do veterinário ficam registrados desde o início, e os lembretes das próximas doses chegam sem você precisar decorar datas. [Crie o perfil do seu filhote](/register).

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário.`
  },
  {
    slug: 'como-cuidar-de-um-cachorro-ou-gato-idoso',
    category: 'filhotes-e-idosos',
    title: 'Como cuidar de um cachorro ou gato idoso',
    excerpt: 'A partir dos 7 anos, o pet entra na fase sênior e os cuidados mudam: check-up semestral, atenção à dor articular e ajustes na rotina fazem toda a diferença.',
    seo_title: 'Como cuidar de cachorro e gato idoso',
    seo_description: 'Cuidados com pets idosos: quando começa a fase sênior, sinais de artrose e doenças silenciosas, adaptações na casa e por que o check-up vira semestral.',
    tags: ['idoso', 'sênior', 'cachorro', 'gato', 'qualidade de vida'],
    scheduled_for: '2026-08-21T09:00:00-03:00',
    content: `**Resposta direta:** cães e gatos entram na fase sênior por volta dos 7 anos (antes disso em cães de porte gigante). A partir daí, o cuidado muda em três frentes: check-up veterinário a cada 6 meses com exames de sangue, atenção ativa a sinais de dor e doença que o pet esconde, e adaptações simples na casa e na rotina. Envelhecer não é doença, mas é a fase em que as doenças aparecem, e detectar cedo muda tudo.

## Quando o pet vira idoso?

- **Gatos e cães de porte pequeno e médio:** por volta dos 7 a 8 anos
- **Cães de porte grande:** 6 a 7 anos
- **Cães gigantes (dogue, são-bernardo):** a partir dos 5 anos

## As doenças silenciosas da terceira idade

As mais comuns evoluem meses sem sintomas visíveis: doença renal crônica (especialmente em gatos), doenças cardíacas, artrose, doença periodontal, hipotireoidismo em cães, hipertireoidismo em gatos, diabetes e tumores. Por isso o check-up sênior inclui exames de sangue e urina, eles enxergam o que o exame físico ainda não mostra. Entenda melhor em [quando levar o pet ao veterinário mesmo sem sintomas](/blog/quando-levar-o-pet-ao-veterinario-mesmo-sem-sintomas).

## Sinais que não são "coisa da idade"

Muitos tutores normalizam mudanças que na verdade são doença tratável:

- Parar de subir no sofá ou de pular para locais altos, geralmente é dor articular
- Beber muita água e urinar mais, pode ser rim, diabetes ou hormônio
- Emagrecer comendo normalmente
- Mau hálito forte, doença periodontal dói e infecciona
- Ficar "desligado", vagar à noite, esquecer hábitos, pode ser disfunção cognitiva
- Gato que parou de se limpar

Se reconheceu algum, leia também [como saber se o pet está com dor](/blog/como-saber-se-o-pet-esta-com-dor) e converse com um veterinário.

## Adaptações que melhoram a vida do pet idoso

- **Acesso facilitado:** rampas ou escadinhas para sofá e cama, caixa de areia de borda baixa para gatos
- **Piso antiderrapante** nos trajetos principais, tapetes resolvem
- **Cama ortopédica** em local sem corrente de ar
- **Comida e água em local de fácil acesso**, gatos idosos agradecem potes elevados
- **Passeios mais curtos e frequentes** em vez de longos e intensos
- **Ração adequada à fase sênior**, com orientação do veterinário
- **Rotina estável:** pets idosos toleram mal mudanças bruscas

## Check-up semestral: o pilar do cuidado sênior

Um ano para um pet idoso equivale a vários anos humanos. O acompanhamento semestral com exames permite tratar doença renal, cardíaca e articular no começo, quando o tratamento é mais simples, mais barato e mais eficaz.

## Como o Saúde PET pode ajudar

Para o pet idoso, o atendimento em casa evita justamente o que mais pesa: deslocamento, escada, carro e estresse. E o histórico digital permite comparar peso e exames ao longo dos anos, é assim que se percebe a perda de peso lenta que passaria despercebida. [Cadastre seu pet e monte o plano de cuidados sênior](/register).

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário.`
  },
  {
    slug: 'mau-halito-em-caes-e-gatos-e-normal',
    category: 'higiene-e-pele',
    title: 'Mau hálito em cães e gatos é normal?',
    excerpt: 'Não, "bafo de cachorro" forte não é normal: na maioria dos casos é doença periodontal, que causa dor e pode afetar coração e rins. Saiba identificar e tratar.',
    seo_title: 'Mau hálito em cães e gatos é normal?',
    seo_description: 'Mau hálito em cachorro e gato indica doença periodontal na maioria dos casos. Veja outros sinais, riscos para coração e rins, e como funciona o tratamento.',
    tags: ['mau hálito', 'dentes', 'doença periodontal', 'higiene'],
    scheduled_for: '2026-08-25T09:00:00-03:00',
    content: `**Resposta direta:** não. Hálito forte e desagradável em cães e gatos não é característica da espécie, na grande maioria das vezes é sinal de doença periodontal: placa bacteriana e tártaro inflamando gengiva e destruindo o suporte dos dentes. Além de dor crônica, as bactérias da boca podem se espalhar e afetar coração e rins. Mau hálito persistente merece avaliação veterinária.

## De onde vem o mau hálito

A causa mais comum é o acúmulo de placa bacteriana que endurece e vira tártaro. A gengiva inflama (gengivite), depois a infecção avança para as estruturas que seguram o dente (periodontite). Estima-se que a maioria dos cães e gatos adultos tenha algum grau de doença periodontal, e ela dói, mesmo que o pet continue comendo.

Outras causas possíveis: restos de alimento em dobras labiais, feridas e tumores na boca, corpos estranhos encravados e, atenção, hálito com cheiro incomum pode indicar doença sistêmica: odor de urina sugere problema renal, hálito adocicado pode aparecer no diabetes.

## Sinais de que a boca precisa de tratamento

- Hálito forte constante
- Tártaro visível: crosta amarelada ou marrom nos dentes
- Gengiva vermelha, inchada ou que sangra
- Salivação excessiva
- Dificuldade para mastigar, comer de um lado só, derrubar comida
- Passar a pata no focinho
- Gato que para de comer ração seca mas aceita sachê
- Dentes moles ou que caíram

## Como é o tratamento

Tártaro instalado não sai com escova nem com petisco: o tratamento é a limpeza dentária feita pelo veterinário, sob anestesia, com avaliação de cada dente. Casos avançados podem exigir extrações. Depois da limpeza, a prevenção diária é o que mantém o resultado.

## Prevenção em casa

- **Escovação** com pasta veterinária (nunca pasta humana, o flúor é tóxico se engolido), o padrão-ouro é diária
- Começar devagar: deixe o pet lamber a pasta, depois escove poucos dentes, aumente aos poucos
- Petiscos e brinquedos de higiene oral ajudam, mas não substituem a escova
- Avaliação da boca em todo check-up

## Como o Saúde PET pode ajudar

No atendimento em domicílio, o veterinário avalia a boca do seu pet, indica se já é caso de limpeza e ensina a rotina de escovação. O histórico dental fica registrado no perfil do animal para acompanhar a evolução. [Solicite uma avaliação](/register).

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário.`
  },
  {
    slug: 'como-saber-se-o-pet-esta-acima-do-peso',
    category: 'alimentacao',
    title: 'Como saber se o pet está acima do peso',
    excerpt: 'Obesidade é uma das doenças mais comuns e mais ignoradas em cães e gatos. Aprenda o teste das costelas, os riscos do sobrepeso e como emagrecer o pet com segurança.',
    seo_title: 'Como saber se o pet está acima do peso',
    seo_description: 'Teste simples para saber se seu cão ou gato está acima do peso, riscos da obesidade em pets e como fazer o emagrecimento com orientação veterinária.',
    tags: ['obesidade', 'peso', 'alimentação', 'cachorro', 'gato'],
    scheduled_for: '2026-08-28T09:00:00-03:00',
    content: `**Resposta direta:** faça o teste das costelas: passe as mãos pelas laterais do tórax do pet. Você deve conseguir sentir as costelas com uma leve pressão, sem precisar apertar, e, olhando de cima, deve haver uma "cintura" visível atrás das costelas. Se as costelas sumiram sob uma camada de gordura e o corpo virou um cilindro, o pet está acima do peso e vale uma avaliação veterinária.

## O teste em 3 passos

- **Toque:** costelas palpáveis com leve pressão = ok. Precisa apertar para achar = sobrepeso. Nem apertando = obesidade
- **De cima:** deve existir um afunilamento (cintura) entre o fim das costelas e o quadril
- **De lado:** a barriga deve subir em direção às patas traseiras, não ficar reta nem pendurada (em gatos, uma bolsa abdominal discreta é normal)

Na dúvida, o veterinário usa o escore de condição corporal, uma escala padronizada de 1 a 9, e define o peso ideal do seu pet.

## Por que o sobrepeso é tão sério

Gordura em excesso não é fofura, é um tecido inflamatório ativo. O sobrepeso encurta a expectativa de vida e aumenta o risco de:

- Artrose e dor articular (o peso extra castiga as articulações)
- Diabetes, especialmente em gatos
- Doenças cardíacas e respiratórias
- Intolerância ao calor, crítico em raças de focinho curto
- Lipidose hepática em gatos que emagrecem rápido demais
- Maior risco anestésico e cirúrgico

## Por que o pet engorda

Quase sempre a conta é simples: mais calorias entrando do que saindo. Os vilões habituais são ração à vontade no pote, petiscos e comida da mesa fora da conta, castração sem ajuste da dieta (a necessidade calórica cai após a castração) e pouca atividade. Mais raramente há causa hormonal, como hipotireoidismo em cães, por isso a avaliação veterinária importa antes de qualquer dieta.

## Como emagrecer o pet com segurança

- **Comece pelo veterinário:** ele define o peso-alvo, descarta causa hormonal e calcula a quantidade diária de ração
- **Meça a ração** com balança ou medidor, "olhômetro" é o maior sabotador
- **Petiscos dentro do limite:** no máximo 10% das calorias do dia, frutas liberadas (veja [o que o cachorro pode comer](/blog/cachorro-pode-comer-comida-humana-alimentos-permitidos-e-perigosos)) valem mais que biscoitos industriais
- **Atividade gradual:** passeios mais frequentes para cães, brincadeiras de caça e comedouros interativos para gatos
- **Pesagens regulares:** a meta segura é perda lenta e constante, nunca dieta radical, em gatos, emagrecimento rápido pode causar lipidose hepática

## Como o Saúde PET pode ajudar

No perfil do seu pet, o peso registrado a cada atendimento vira uma curva de evolução, dá para ver a tendência antes de virar problema. E o veterinário em domicílio monta o plano alimentar considerando a rotina real da casa. [Cadastre seu pet e acompanhe o peso dele](/register).

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário.`
  },
  {
    slug: 'queda-de-pelo-quando-e-normal-e-quando-pode-indicar-um-problema',
    category: 'higiene-e-pele',
    title: 'Queda de pelo: quando é normal e quando pode indicar um problema',
    excerpt: 'Todo pet solta pelo, mas falhas, coceira e pele avermelhada são outra história. Saiba diferenciar a troca natural de pelagem de um problema de pele ou de saúde.',
    seo_title: 'Queda de pelo em pets: normal ou problema?',
    seo_description: 'Queda de pelo em cães e gatos: quando é troca natural e quando indica alergia, fungo, parasita ou problema hormonal. Veja os sinais e quando ir ao veterinário.',
    tags: ['queda de pelo', 'pele', 'alergia', 'higiene'],
    scheduled_for: '2026-09-01T09:00:00-03:00',
    content: `**Resposta direta:** soltar pelo de forma difusa, sem falhas na pelagem e sem coceira, é normal, e aumenta nas trocas de estação e em ambientes de temperatura controlada. O alerta acende quando aparecem áreas sem pelo (falhas), coceira intensa, vermelhidão, caspa, feridas ou mudança na textura da pelagem. Nesses casos, há causa dermatológica ou sistêmica por trás, e ela é tratável.

## Queda normal: o que esperar

- Pelo caindo de maneira uniforme pelo corpo todo, sem "buracos"
- Intensificação na primavera e no outono (troca de pelagem)
- Pets que vivem dentro de casa, com luz artificial e clima estável, podem trocar pelo o ano inteiro
- Raças de subpelo denso (husky, spitz, golden) soltam volumes impressionantes, e ainda assim normais

Escovação regular resolve boa parte do incômodo: remove o pelo morto, distribui a oleosidade natural e ainda permite inspecionar a pele.

## Sinais de que não é só troca de pelagem

- **Falhas localizadas:** áreas circulares ou irregulares sem pelo
- **Coceira, lambedura ou mordiscação constante**, veja também [coceira constante no cachorro](/blog/coceira-constante-no-cachorro-alergia-pulga-ou-problema-de-pele)
- Pele avermelhada, escurecida, espessada ou com feridas
- Caspa abundante ou crostas
- Odor forte na pele
- Pelo que sai em tufos deixando pele exposta
- Queda simétrica nos dois lados do corpo sem coceira, padrão típico de causa hormonal

## Causas mais comuns de queda anormal

- **Parasitas:** pulgas, sarnas, piolhos
- **Alergias:** à picada de pulga, alimentar ou ambiental (atopia)
- **Fungos (dermatofitose):** as famosas "impingens", que podem passar para humanos
- **Infecções bacterianas** secundárias à coceira
- **Causas hormonais:** hipotireoidismo em cães, entre outras
- **Estresse:** gatos podem se lamber compulsivamente até criar falhas (alopecia psicogênica)
- **Nutrição inadequada:** ração de baixa qualidade reflete direto na pelagem

## O que o veterinário faz para descobrir a causa

O diagnóstico dermatológico é investigativo: raspado de pele, exame dos pelos, lâmpada de Wood para fungos, citologia e, quando necessário, exames de sangue para hormônios. Tratar "no chute" com banho ou remédio aleatório costuma só adiar a solução.

## Como o Saúde PET pode ajudar

Problemas de pele pedem acompanhamento: retorno, ajuste de tratamento, comparação de fotos. Pelo Saúde PET, o veterinário avalia seu pet em casa e a evolução fica registrada no histórico, incluindo qual tratamento funcionou, informação valiosa se o problema voltar. [Solicite uma avaliação](/register).

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário.`
  },
  {
    slug: 'coceira-constante-no-cachorro-alergia-pulga-ou-problema-de-pele',
    category: 'higiene-e-pele',
    title: 'Coceira constante no cachorro: alergia, pulga ou problema de pele?',
    excerpt: 'Cachorro que se coça o dia inteiro não está "de manha": coceira persistente tem causa, e as três maiores são pulga, alergia e infecção de pele. Entenda como diferenciar.',
    seo_title: 'Coceira constante no cachorro: causas e tratamento',
    seo_description: 'Cachorro se coçando muito: como diferenciar pulga, alergia alimentar, atopia e infecção de pele. Onde o cão se coça diz muito. Veja quando ir ao veterinário.',
    tags: ['coceira', 'alergia', 'pulgas', 'pele', 'cachorro'],
    scheduled_for: '2026-09-04T09:00:00-03:00',
    content: `**Resposta direta:** coceira ocasional é normal; coceira frequente, que interrompe o sono ou a brincadeira, que gera lambedura constante das patas ou feridas, não é. As três causas mais comuns são: pulgas (mesmo que você não as veja), alergias (alimentar ou ambiental) e infecções de pele por bactérias ou fungos, que costumam aparecer em cima da alergia. O local da coceira ajuda a apontar o culpado, mas o diagnóstico preciso é do veterinário.

## O mapa da coceira: onde o cão se coça diz muito

- **Base da cauda, garupa e coxas:** o padrão clássico da **alergia à picada de pulga**, a causa número um, e basta uma picada para disparar a crise em cães alérgicos
- **Patas (lambedura constante), face, axilas e virilha:** padrão típico da **atopia** (alergia a poeira, ácaros, pólen) e também da **alergia alimentar**
- **Orelhas:** otites de repetição acompanham fortemente as alergias
- **Coceira localizada em um ponto só:** pode ser ferida, corpo estranho ou dor, veja [como saber se o pet está com dor](/blog/como-saber-se-o-pet-esta-com-dor)

## "Mas ele não tem pulga, eu nunca vi nenhuma"

É a frase mais ouvida nos consultórios. Cães alérgicos engolem as pulgas ao se morder e uma única picada mantém a coceira por dias, então a ausência de pulgas visíveis não descarta nada. O primeiro passo de qualquer investigação de coceira é garantir controle antipulgas rigoroso, no pet, nos outros animais da casa e no ambiente. Veja o guia de [pulgas e carrapatos](/blog/pulgas-e-carrapatos-como-identificar-prevenir-e-proteger).

## Alergia alimentar x alergia ambiental

- **Alimentar:** coceira o ano todo, às vezes com sintomas digestivos. O diagnóstico é feito com dieta de eliminação rigorosa por 6 a 8 semanas, prescrita pelo veterinário, teste de sangue "de alergia alimentar" não é confiável
- **Atopia (ambiental):** pode piorar em certas épocas do ano, costuma começar entre 1 e 3 anos de idade e tem forte componente genético (buldogues, shih tzus, labradores e pastores estão entre os mais afetados)

## O ciclo que perpetua a coceira

Coceira fere a pele, a pele ferida infecciona com bactérias e leveduras, e a infecção coça ainda mais. Por isso o tratamento costuma atacar em duas frentes: controlar a causa de base e tratar a infecção secundária. Interromper o tratamento na primeira melhora é o motivo mais comum de recaída.

## Quando procurar o veterinário

- Coceira diária há mais de uma ou duas semanas
- Feridas, crostas, vermelhidão ou odor na pele
- Falhas de pelo aparecendo
- Otites de repetição
- Coceira que voltou depois do fim de um tratamento

## Como o Saúde PET pode ajudar

Alergia não tem cura, tem controle, e controle exige acompanhamento. Com o histórico do seu cão registrado no Saúde PET, o veterinário enxerga o padrão das crises (época do ano, tratamento que funcionou, alimento suspeito) em vez de recomeçar a investigação do zero a cada consulta. [Solicite uma avaliação em casa](/register).

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário.`
  },
  {
    slug: 'cachorro-pode-comer-comida-humana-alimentos-permitidos-e-perigosos',
    category: 'alimentacao',
    title: 'Cachorro pode comer comida humana? Alimentos permitidos e perigosos',
    excerpt: 'Cenoura sim, uva jamais. Veja a lista do que é seguro oferecer ao cachorro, o que é veneno disfarçado de petisco e as regras para não desequilibrar a dieta.',
    seo_title: 'O que cachorro pode e não pode comer',
    seo_description: 'Lista completa: frutas e alimentos que cachorro pode comer com segurança e os proibidos — uva, cebola, chocolate, xilitol. Regras para petiscos saudáveis.',
    tags: ['alimentação', 'comida humana', 'frutas', 'cachorro', 'intoxicação'],
    scheduled_for: '2026-09-08T09:00:00-03:00',
    content: `**Resposta direta:** alguns alimentos humanos são seguros como petisco ocasional, sempre puros, sem tempero, sal, açúcar, cebola ou alho, e no máximo 10% das calorias do dia. Mas a lista de proibidos é séria: uva, chocolate, cebola, alho, xilitol e ossos cozidos podem intoxicar ou matar. A base da dieta deve continuar sendo a ração de qualidade, que é balanceada para a espécie.

## Permitidos (puros e sem exagero)

- **Cenoura**, crua ou cozida, ótima como petisco de baixa caloria
- **Maçã sem sementes** (as sementes contêm compostos tóxicos em quantidade)
- **Banana**, com moderação, é calórica
- **Melancia e melão sem sementes e sem casca**
- **Abóbora e batata-doce cozidas**, sem tempero
- **Frango, carne magra e ovo, sempre cozidos e sem tempero**
- **Arroz branco cozido**, útil em dietas leves indicadas pelo veterinário
- **Morango, pera (sem sementes) e manga (sem caroço)**

## Proibidos: risco real de intoxicação

- **Uva e uva-passa:** podem causar insuficiência renal aguda, não há dose segura conhecida
- **Chocolate, café e cacau:** a teobromina é tóxica para cães, quanto mais amargo, pior
- **Cebola, alho, alho-poró e cebolinha:** em qualquer forma (crus, cozidos, em pó), destroem os glóbulos vermelhos
- **Xilitol:** adoçante de chicletes, balas e pastas de amendoim "diet", causa queda brusca de glicose e lesão hepática, é emergência
- **Abacate:** a persina pode causar problemas digestivos
- **Massa de pão crua e bebidas alcoólicas**
- **Ossos cozidos:** lascam e perfuram o trato digestivo (inclusive os de churrasco)
- **Frituras, embutidos e comida temperada:** excesso de sal e gordura, risco de pancreatite
- **Leite em excesso:** boa parte dos cães adultos tem intolerância à lactose

Se o seu cão comeu qualquer item da lista proibida, aja como intoxicação: leia [o que fazer se o pet ingeriu algo tóxico](/blog/cachorro-ou-gato-intoxicado-o-que-fazer) e contate um veterinário imediatamente, sem esperar sintomas.

## As 4 regras de ouro dos petiscos

- **Regra dos 10%:** petiscos e extras não devem passar de 10% das calorias diárias, o resto vem da ração
- **Sem tempero, sempre:** o frango da sua marmita temperada não serve
- **Novidade, uma por vez:** introduza um alimento novo em pequena quantidade e observe fezes e pele por alguns dias
- **Comida da mesa, nunca durante as refeições:** além do risco, ensina o cão a pedir e atrapalha o controle de peso, veja [como saber se o pet está acima do peso](/blog/como-saber-se-o-pet-esta-acima-do-peso)

## E dieta natural, pode?

Alimentação natural bem formulada existe e funciona, mas precisa ser balanceada por profissional (veterinário nutrólogo ou zootecnista). Comida caseira "no improviso" quase sempre resulta em deficiência de cálcio e outros nutrientes ao longo do tempo.

## Como o Saúde PET pode ajudar

Registre no perfil do seu pet as alergias e intolerâncias alimentares que ele já demonstrou, essa informação orienta qualquer veterinário que o atender. E se a dúvida é sobre dieta, peso ou petiscos, [solicite uma orientação nutricional em casa](/register).

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário.`
  },
  {
    slug: 'por-que-manter-vacinas-alergias-e-medicamentos-do-pet-registrados',
    category: 'consultas-exames-e-medicamentos',
    title: 'Por que manter vacinas, alergias e medicamentos do pet registrados?',
    excerpt: 'Na emergência, ninguém lembra a data da última vacina nem o nome do antibiótico que deu alergia. O histórico organizado muda a velocidade e a segurança do atendimento.',
    seo_title: 'Histórico de saúde do pet: por que registrar tudo',
    seo_description: 'Carteira de vacinação perdida e remédio esquecido atrasam diagnóstico e criam riscos. Veja o que registrar da saúde do pet e como o histórico digital ajuda.',
    tags: ['histórico', 'prontuário', 'vacinas', 'medicamentos', 'carteira digital'],
    scheduled_for: '2026-09-11T09:00:00-03:00',
    content: `**Resposta direta:** porque na hora que importa, a consulta, a emergência, a cirurgia, o veterinário precisa de respostas que a memória não guarda: data da última vacina, nome do vermífugo, qual antibiótico causou reação, que dose de qual remédio o pet toma. Cada informação dessas muda decisões clínicas. Sem registro, o profissional trabalha às cegas, repete exames, e o risco de erro aumenta.

## O que acontece quando não há registro

- **Vacina em atraso sem ninguém perceber:** proteção vencida contra doenças graves, e reforço "no chute" quando a carteirinha some
- **Alergia medicamentosa esquecida:** o pet pode receber de novo o mesmo princípio ativo que causou a reação
- **Interação entre remédios:** o veterinário que não sabe o que o pet já toma pode prescrever algo incompatível
- **Diagnóstico mais lento e caro:** sem histórico de peso, exames e sintomas anteriores, tudo recomeça do zero
- **Emergência com outro profissional:** o plantonista que nunca viu seu pet depende 100% do que você conseguir lembrar, sob estresse

## O que vale a pena registrar

- **Vacinas:** quais, quando, e quando vence o reforço, veja os calendários do [cão](/blog/calendario-de-vacinacao-para-cachorros) e do [gato](/blog/calendario-de-vacinacao-para-gatos)
- **Vermífugos e antipulgas:** produto e data de reaplicação
- **Medicamentos em uso:** nome, dose, horários e por que foi prescrito
- **Alergias e reações:** a alimentos, medicamentos e vacinas
- **Peso ao longo do tempo:** a curva de peso revela doenças silenciosas
- **Cirurgias, internações e exames**, com resultados
- **Doenças crônicas** e o plano de tratamento

## Papel funciona, mas trai

Carteirinha de vacinação rasga, molha e some na mudança. Receita fica na gaveta da outra casa. E a memória, sob o estresse de uma emergência às 2h da manhã, falha exatamente quando não pode falhar. O registro digital resolve os três problemas: não se perde, está sempre no celular e pode ser mostrado a qualquer veterinário em segundos.

## O histórico é a base do cuidado contínuo

Saúde de pet não é uma sequência de consultas isoladas, é uma linha do tempo. O veterinário que enxerga essa linha (peso caindo há 6 meses, terceira otite no ano, reforço vencendo mês que vem) pratica medicina preventiva de verdade, em vez de só apagar incêndios.

## Como o Saúde PET pode ajudar

É exatamente para isso que o Saúde PET existe: o perfil do seu pet reúne carteira de vacinação digital com lembretes de reforço, medicamentos em uso, alergias, histórico de atendimentos e evolução de peso, tudo registrado pelo veterinário a cada atendimento em domicílio e acessível no seu celular. [Crie o perfil de saúde do seu pet](/register), leva poucos minutos.

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário.`
  },
  {
    slug: 'plantas-toxicas-para-caes-e-gatos',
    category: 'prevencao-e-vacinas',
    title: 'Plantas tóxicas para cães e gatos: quais tirar de casa hoje',
    excerpt: 'Lírio pode matar um gato até pela água do vaso. Conheça as plantas mais perigosas para pets, os sintomas de intoxicação e alternativas seguras para decorar.',
    seo_title: 'Plantas tóxicas para cães e gatos',
    seo_description: 'Lírio, comigo-ninguém-pode, espada-de-são-jorge, azaleia: veja as plantas tóxicas para cães e gatos, sintomas de intoxicação e plantas seguras para ter em casa.',
    tags: ['plantas tóxicas', 'intoxicação', 'prevenção', 'gato', 'cachorro'],
    scheduled_for: '2026-09-15T09:00:00-03:00',
    content: `**Resposta direta:** se você tem gato, a regra mais importante é uma só: **lírio não entra em casa**, nem em buquê. Todas as partes da planta, incluindo o pólen e a água do vaso, podem causar insuficiência renal fatal em felinos. Para cães e gatos, a lista de plantas comuns e perigosas inclui comigo-ninguém-pode, espada-de-são-jorge, azaleia, copo-de-leite e antúrio. Na dúvida sobre uma planta, mantenha fora do alcance até confirmar.

## As mais perigosas que costumam estar dentro de casa

- **Lírio:** gravíssimo para gatos, qualquer parte da planta. Poucas horas fazem diferença no atendimento
- **Comigo-ninguém-pode:** cristais que queimam boca e garganta, causando dor intensa, salivação e inchaço
- **Copo-de-leite e antúrio:** mesmo mecanismo irritante
- **Espada-de-são-jorge:** vômito, diarreia e salivação
- **Azaleia:** vômito, fraqueza e alterações cardíacas, pequenas quantidades já são perigosas
- **Cica (palmeira-sagu):** extremamente tóxica para o fígado de cães, as sementes são a parte pior
- **Dedaleira, espirradeira e outras ornamentais de jardim:** afetam o coração
- **Costela-de-adão e jiboia:** irritantes orais, muito comuns em apartamentos
- **Cebolinha e alho plantados em horta acessível**

## Sinais de que o pet mexeu em planta tóxica

- Salivação intensa e repentina
- Pata no focinho, boca aberta, dificuldade de engolir
- Vômito e diarreia
- Inchaço de boca ou língua
- Apatia, tremores ou andar cambaleante
- No caso do lírio em gatos: vômito e apatia nas primeiras horas, depois sinais renais

Encontrou a planta mordida ou folhas no vômito? Leve uma foto ou um pedaço da planta e procure atendimento. O passo a passo completo está em [o que fazer se o pet se intoxicou](/blog/cachorro-ou-gato-intoxicado-o-que-fazer).

## Plantas seguras para quem tem pet

Dá para ter verde em casa sem risco:

- **Erva-de-gato (catnip)** e **capim-gato**, os gatos agradecem
- **Lavanda em pequena escala decorativa, orquídeas e violetas**
- **Samambaia verdadeira (não a asparagus, que é tóxica)**
- **Peperômia, calatéia e maranta**
- **Manjericão, alecrim e hortelã** na horta

Mesmo com plantas seguras, vale desencorajar o hábito de mastigar: ofereça capim próprio para o pet como alternativa.

## Prevenção prática

- Faça um inventário das plantas da casa e pesquise cada uma pelo nome
- Suspenda ou elimine as tóxicas, gato alcança quase qualquer lugar, "no alto" raramente resolve
- Atenção redobrada com buquês de presente: lírios são frequentes em arranjos
- Filhotes exploram com a boca: redobre o cuidado no primeiro ano

## Como o Saúde PET pode ajudar

Registre no perfil do seu pet qualquer episódio de intoxicação, a informação orienta atendimentos futuros. E em caso de suspeita, [solicite orientação veterinária](/register) imediatamente.

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário. Em caso de intoxicação, procure atendimento imediatamente.`
  },
  {
    slug: 'chocolate-faz-mal-para-cachorro-entenda-o-risco',
    category: 'alimentacao',
    title: 'Chocolate faz mal para cachorro? Entenda o risco',
    excerpt: 'Sim, e não é mito: a teobromina do chocolate pode causar de vômitos a convulsões. Veja por que quanto mais amargo pior, e o que fazer se o cão comeu chocolate.',
    seo_title: 'Chocolate faz mal para cachorro? Entenda o risco',
    seo_description: 'Chocolate é tóxico para cães: a teobromina causa agitação, vômito, arritmia e convulsões. Quanto mais amargo, pior. Saiba o que fazer se o cão comeu.',
    tags: ['chocolate', 'intoxicação', 'alimentação', 'cachorro'],
    scheduled_for: '2026-09-18T09:00:00-03:00',
    content: `**Resposta direta:** sim, chocolate é tóxico para cães. O culpado é a teobromina (junto com a cafeína), que o organismo canino metaboliza muito devagar. A regra prática: **quanto mais amargo o chocolate, mais perigoso**, chocolate 70% cacau e chocolate de cobertura concentram muito mais toxina que o ao leite. Se o seu cão comeu chocolate, anote o tipo e a quantidade e contate um veterinário antes de aparecerem sintomas.

## Por que o chocolate envenena cães

Humanos eliminam a teobromina em poucas horas; cães levam mais de um dia. A substância se acumula e superestimula o sistema nervoso e o coração. A gravidade depende de três fatores:

- **Tipo do chocolate:** cacau em pó e chocolate amargo são os piores; o ao leite tem menos teobromina; o branco tem quantidade desprezível (mas a gordura e o açúcar ainda podem causar problemas digestivos e até pancreatite)
- **Quantidade ingerida**
- **Peso do cão:** a mesma barra é muito mais perigosa para um shih tzu do que para um labrador

## Sintomas de intoxicação por chocolate

Costumam aparecer entre 2 e 12 horas após a ingestão:

- Agitação e inquietação incomuns
- Sede intensa e xixi em excesso
- Vômito e diarreia
- Respiração e batimentos acelerados
- Tremores musculares
- Em casos graves: arritmia, convulsões e risco de morte

## O que fazer se o cão comeu chocolate

- Recolha a embalagem: tipo de chocolate e quantidade que sobrou são as duas informações mais importantes
- Anote o horário aproximado da ingestão
- **Contate um veterinário imediatamente**, mesmo sem sintomas: se a ingestão foi recente, o profissional pode induzir o vômito com segurança e reduzir a absorção
- **Não provoque vômito por conta própria** nem use receitas caseiras, veja [o que fazer e o que não fazer em intoxicações](/blog/cachorro-ou-gato-intoxicado-o-que-fazer)
- Com sintomas neurológicos (tremores, convulsão), vá direto ao hospital veterinário

## E gato, pode chocolate?

Também não, a teobromina é tóxica para felinos igualmente. Na prática, casos são raros porque gatos não sentem sabor doce, mas a regra vale: chocolate não é petisco para nenhum pet.

## Datas de risco: Páscoa, festas e estoque acessível

A maioria das intoxicações acontece quando o chocolate está ao alcance: ovos de Páscoa no chão, caixa de bombom na mesa baixa, mochila com barra esquecida. Cães têm faro excelente e abrem embalagens com facilidade, armário fechado é o único lugar seguro. Quer agradar o cão? Frutas seguras cumprem o papel: veja [o que cachorro pode comer](/blog/cachorro-pode-comer-comida-humana-alimentos-permitidos-e-perigosos).

## Como o Saúde PET pode ajudar

Em caso de ingestão, cada minuto conta, e ter o peso e o histórico do seu cão registrados no Saúde PET agiliza a orientação do veterinário. [Cadastre seu pet](/register) e tenha os dados dele sempre à mão.

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário. Em caso de intoxicação, procure atendimento imediatamente.`
  },
  {
    slug: 'como-proteger-caes-e-gatos-do-calor-excessivo',
    category: 'comportamento-e-bem-estar',
    title: 'Como proteger cães e gatos do calor excessivo',
    excerpt: 'Golpe de calor mata em minutos e começa com sinais fáceis de ignorar. Veja como proteger seu pet no verão, os horários seguros de passeio e o que nunca fazer.',
    seo_title: 'Como proteger o pet do calor e do golpe de calor',
    seo_description: 'Calor excessivo é risco real para cães e gatos: horários de passeio, hidratação, sinais de golpe de calor e primeiros socorros. Nunca deixe o pet no carro.',
    tags: ['calor', 'verão', 'golpe de calor', 'bem-estar', 'segurança'],
    scheduled_for: '2026-10-15T09:00:00-03:00',
    content: `**Resposta direta:** cães e gatos não suam como nós, eles dissipam calor principalmente pela respiração ofegante, um sistema pouco eficiente. Por isso, no calor forte: passeios só no início da manhã e à noite, água fresca em vários pontos da casa, sombra sempre disponível e **nunca, em hipótese alguma, pet dentro de carro estacionado**, nem "só cinco minutinhos" com vidro aberto. Golpe de calor é emergência que mata.

## Regras de ouro nos dias quentes

- **Passeie antes das 9h e depois das 18h**, e faça o teste do asfalto: encoste as costas da mão no chão por 5 segundos, se queimar sua mão, queima a pata do cão
- **Água fresca em abundância:** espalhe potes pela casa, acrescente cubos de gelo, gatos bebem mais em fontes de água corrente
- **Sombra de verdade:** casinha de cachorro no sol vira forno, o pet precisa de área ventilada e sombreada o dia todo
- **Exercício reduzido:** dias de calor extremo não são dias de bola nem corrida
- **Tapetes gelados, ventilador e piso frio** ajudam, deixe o pet escolher onde ficar
- **Tosa: converse antes com o veterinário**, em algumas raças o pelo também protege do sol; tosar rente pode expor a pele a queimaduras

## Pets de altíssimo risco

- **Raças de focinho curto (braquicefálicas):** buldogue, pug, shih tzu, boxer e gatos persas têm a refrigeração natural comprometida, para eles, calor moderado já é perigoso
- **Obesos**, veja [como saber se o pet está acima do peso](/blog/como-saber-se-o-pet-esta-acima-do-peso)
- **Idosos, filhotes e cardiopatas**
- **Pelagem escura**, absorve mais calor

## Sinais de golpe de calor: aja imediatamente

- Ofegação extrema e desesperada, salivação espessa
- Língua e gengivas muito vermelhas (depois podem ficar azuladas)
- Fraqueza, andar cambaleante, colapso
- Vômito ou diarreia
- Temperatura corporal muito alta ao toque
- Convulsões

## Primeiros socorros no golpe de calor

- Leve o pet imediatamente para sombra ou ambiente fresco
- Molhe o corpo com **água fria, mas não gelada**, água gelada e gelo contraem os vasos e atrapalham a perda de calor
- Ventile (ventilador, ar do carro ligado)
- Ofereça água em pequenos goles, sem forçar
- **Vá para o hospital veterinário mesmo que ele pareça melhorar:** o golpe de calor causa danos internos que aparecem horas depois

## O carro estacionado: o erro que mais mata

Com o carro ao sol, a temperatura interna passa de 50°C em poucos minutos, mesmo com vidro entreaberto. Não existe "rapidinho". Se a rotina inclui levar o pet de carro, planeje para nunca precisar deixá-lo sozinho dentro dele.

## Como o Saúde PET pode ajudar

No verão, o atendimento em domicílio poupa o pet do deslocamento no calor. E se ficou preocupado com a tolerância do seu cão braquicefálico ou idoso ao verão, [solicite uma avaliação em casa](/register).

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário. Golpe de calor é emergência: procure atendimento imediatamente.`
  },
  {
    slug: 'fogos-de-artificio-como-reduzir-o-medo-e-a-ansiedade-do-pet',
    category: 'comportamento-e-bem-estar',
    title: 'Fogos de artifício: como reduzir o medo e a ansiedade do pet',
    excerpt: 'Réveillon é a época em que mais pets fogem de casa. Aprenda a montar um refúgio seguro, o que fazer durante a queima e por que a acalmar não é "reforçar o medo".',
    seo_title: 'Fogos de artifício: como acalmar o pet',
    seo_description: 'Medo de fogos em cães e gatos: refúgio acústico, identificação contra fugas, o que fazer durante a queima e quando o veterinário pode ajudar com medicação.',
    tags: ['fogos de artifício', 'ansiedade', 'medo', 'comportamento', 'réveillon'],
    scheduled_for: '2026-12-01T09:00:00-03:00',
    content: `**Resposta direta:** prepare-se antes: monte um refúgio acústico no cômodo mais silencioso da casa, garanta identificação no pet (plaqueta e, idealmente, microchip), e na noite da queima mantenha portas, janelas e portões fechados, som ambiente ligado e você por perto agindo com naturalidade. Consolar o pet **não** reforça o medo, isso é mito. Em casos graves, o veterinário pode prescrever medicação segura, o que deve ser combinado com antecedência.

## Por que os fogos apavoram

A audição de cães e gatos é muito mais sensível que a nossa: o estouro é fisicamente doloroso, imprevisível e sem origem visível. O resultado é pânico, e é por isso que o réveillon e festas juninas são as épocas de maior número de fugas e atropelamentos. Prevenção contra fuga é a prioridade número um.

## Antes do dia: a preparação

- **Identificação em dia:** coleira com plaqueta legível (nome e telefone) e microchip se possível, é o que traz o pet de volta se ele fugir
- **Monte o refúgio:** o cômodo mais interno e silencioso da casa, com a cama do pet, água, brinquedos e um item com seu cheiro. Deixe disponível dias antes para ele se acostumar
- **Janelas e cortinas fechadas** abafam som e clarões
- **Teste o som ambiente:** música calma ou TV em volume moderado ajudam a mascarar os estouros
- **Caso o medo seja intenso (fuga, destruição, salivação, tremores):** converse com o veterinário **com antecedência**, existem medicações modernas e seguras para eventos previsíveis, e a pior escolha é dar calmante humano por conta própria
- **Antecipe passeio e refeição:** cão passeado e alimentado antes do anoitecer não precisará sair na hora crítica

## Durante a queima

- **Fique em casa, se puder**, sua presença calma é o maior apoio
- **Aja com naturalidade:** tom de voz normal, rotina normal. Pode acariciar e acolher se o pet procurar você, conforto não "treina" o medo
- **Não force:** se ele quiser ficar embaixo da cama, deixe, o esconderijo é a estratégia dele
- **Tudo fechado:** portas, janelas, portões e pet longe de sacadas, cães em pânico pulam muros e janelas
- **Nunca leve o pet para ver os fogos** nem o deixe preso em quintal, corrente ou sacada

## Depois

- Confira o estado do pet e da casa com calma
- Se ele fugiu: comece a busca imediatamente pela vizinhança, avise vizinhos e grupos locais, animais assustados costumam se esconder num raio próximo

## Quando procurar ajuda profissional

Se o medo piora a cada ano, se aparece também com trovões e barulhos do dia a dia, ou se o pet se machuca tentando fugir, vale tratamento comportamental estruturado (dessensibilização) com acompanhamento veterinário, começando meses antes da próxima temporada.

## Como o Saúde PET pode ajudar

Um veterinário parceiro pode avaliar seu pet em casa, orientar o plano para as festas e, se indicado, prescrever a medicação certa com antecedência, tudo registrado no histórico dele. [Solicite uma avaliação](/register) antes da chegada de dezembro.

> Este conteúdo é informativo e não substitui a consulta com um médico-veterinário. Nunca medique seu pet por conta própria.`
  }
];

async function main() {
  const slug = process.env.PUBLIC_TENANT_SLUG || 'saudepet';
  console.log('🌱 Seed do blog — tenant:', slug);

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: {
      nome: 'Saúde PET',
      slug,
      email: 'contato@saudepet.app.br',
      telefone: '+5511999999999',
      cidade: 'São Paulo',
      estado: 'SP',
      status: 'ativo'
    }
  });

  const categorias = {};
  for (const categoria of CATEGORIAS) {
    const registro = await prisma.blogCategory.upsert({
      where: { tenant_id_slug: { tenant_id: tenant.id, slug: categoria.slug } },
      update: { name: categoria.name, description: categoria.description },
      create: { tenant_id: tenant.id, ...categoria }
    });
    categorias[categoria.slug] = registro.id;
    console.log('✅ Categoria:', registro.name);
  }

  let criados = 0;
  let mantidos = 0;
  for (const post of POSTS) {
    const existente = await prisma.blogPost.findUnique({
      where: { tenant_id_slug: { tenant_id: tenant.id, slug: post.slug } },
      select: { id: true }
    });
    if (existente) {
      // Não sobrescreve: o conteúdo pode ter sido editado no admin.
      mantidos += 1;
      continue;
    }
    const agendado = Boolean(post.scheduled_for);
    await prisma.blogPost.create({
      data: {
        tenant_id: tenant.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        content_format: 'markdown',
        author_name: AUTOR,
        category_id: categorias[post.category],
        tags: post.tags,
        status: agendado ? 'agendado' : 'publicado',
        seo_title: post.seo_title,
        seo_description: post.seo_description,
        ...getBlogImage(post.slug),
        published_at: post.published_at ? new Date(post.published_at) : null,
        scheduled_for: post.scheduled_for ? new Date(post.scheduled_for) : null
      }
    });
    criados += 1;
    console.log(agendado ? `🗓️ Artigo agendado (${post.scheduled_for.slice(0, 10)}):` : '✅ Artigo publicado:', post.title);
  }

  console.log(`\n🎉 Seed do blog concluído: ${criados} artigo(s) criado(s), ${mantidos} já existiam e foram mantidos.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (erro) => {
    console.error('❌ Erro durante o seed do blog:', erro);
    await prisma.$disconnect();
    process.exit(1);
  });
