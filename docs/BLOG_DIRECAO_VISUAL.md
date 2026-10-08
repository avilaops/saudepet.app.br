# Saúde Pet: direção visual por tema do calendário

**Direção proposta em 12/09/2026.** Este documento descreve ideias para produção. As linhas
abaixo não comprovam imagens geradas, animações prontas, arquivos salvos ou publicação.
O registro de um arquivo efetivamente produzido deve ficar no manifesto do respectivo lote.

**Acervo atualizado em 13/09/2026:** [galeria unificada de 62 artes](blog-artes/index.html),
com as **52 âncoras do calendário concluídas**. A [segunda coleção](blog-artes/2026-09-12-ancoras/README.md)
acrescentou 42 artes às 12 iniciais. Os arquivos foram gerados e revisados localmente;
associação aos artigos e publicação continuam pendentes.

**Lote complementar produzido em 13/09/2026:** [PER-001 a PER-004](blog-artes/2026-09-13-perguntas/README.md),
com quatro linguagens distintas e registro de dimensões reais no manifesto. Associação aos
artigos e publicação continuam pendentes.

**Segundo lote complementar:** [PER-005 a PER-008](blog-artes/2026-09-13-perguntas-2/README.md),
também com quatro linguagens distintas e dimensões reais registradas.

**Primeira coleção produzida:** [galeria de 12 artes](blog-artes/2026-09-12/index.html),
[arquivos e dimensões reais](blog-artes/2026-09-12/entregas.json) e
[instruções de geração](blog-artes/2026-09-12/prompts.json). As composições podem evoluir
durante a produção; o manifesto e a arte final registram a versão entregue. As tabelas
abaixo continuam sendo propostas, não um inventário de imagens prontas.

Fonte editorial: [BLOG_CALENDARIO_ANUAL.md](BLOG_CALENDARIO_ANUAL.md). A ideia é reconhecer
o assunto antes mesmo de ler o título: um gato amassando pão pede uma linguagem diferente
de uma conversa sobre fim de vida. A identidade Saúde Pet acompanha essas escolhas sem
transformar todas as imagens em versões do mesmo cartaz.

## Cobertura real, sem completar listas por suposição

| Família | Entradas explicitamente nomeadas | Identificadores | Cobertura desta direção |
|---|---:|---|---|
| Âncoras mensais | 52 | ANC-001 a ANC-052 | Uma ideia por título |
| Perguntas | 104 | PER-001 a PER-104 | Uma ideia por pergunta |
| Glossário | 114 | GLO-001 a GLO-114 | Uma ideia por verbete |
| Trilha | 12 módulos | TRI-M01 a TRI-M12 | Uma abertura por módulo, sem inventar as 52 aulas |
| Mitos | 12 frases | MIT-001 a MIT-012 | Uma ideia por frase listada |
| **Total** | **294 entradas** | | **282 títulos, perguntas, verbetes ou mitos e 12 módulos** |

O calendário anuncia 104 verbetes, mas lista **114**: 14 + 12 + 12 + 16 + 10 + 10 + 8 +
12 + 8 + 12. Os 40 mitos restantes e os títulos das 52 aulas ainda não estão explicitados.
A retrospectiva de 31 de dezembro também não possui um título adicional desenvolvido;
ANC-052 já cobre a revisão anual, e uma eventual segunda publicação precisa ser diferenciada
editorialmente antes de receber outra arte. Portanto, esta cobertura não equivale a 365 posts
prontos. Os identificadores são permanentes e não devem mudar quando a ordem de publicação mudar.

## Identidade que permite variedade

Paleta conferida em `frontend/src/index.css` e `frontend/tailwind.config.ts`:

| Referência | Cor real | Uso criativo |
|---|---|---|
| Verde Saúde Pet | `#159fa3` | Objetos, cenários, traços, detalhes de luz ou superfícies |
| Laranja Saúde Pet | `#f58235` | Ponto de atenção, acessório, detalhe de composição |
| Tinta | `#15343a` | Texto legível, desenho de contorno, fundo escuro |
| Claro suave | `#eff9f8` | Respiro e fundos leves |
| Azul de apoio | `#2fc1c9` | Detalhes já presentes na configuração visual do produto |

Os termos **verde**, **laranja**, **tinta** e **claro** nas tabelas remetem a essas cores,
sem obrigar toda cena a ser uma monocromia. Madeira, céu, rosa de campanha, tons de pele,
pelagem e cores sazonais continuam livres. A marca pode aparecer pelo uso dessas cores,
pelo nome Saúde Pet ou pelo logotipo original.

O logotipo foi conferido em `frontend/public/brand/logo-completa.png`: casa/abrigo,
escudo, pata e cruz, com o nome Saúde PET. Usar os arquivos oficiais
`logo-completa.png`, `logo-completa-clara.png` ou `logo-symbol.png` na finalização quando a
linha pedir logotipo. Não pedir ao gerador para redesenhar, inventar ou deformar a marca.
Nome e eventuais frases entram com acento correto e contraste, preferencialmente como
texto editável na composição final. A assinatura não precisa ocupar sempre o mesmo canto.

## Tamanho, movimento e responsabilidade editorial

As proporções das tabelas descrevem a **composição autoral**, não uma promessa sobre o
formato que a página atualmente aceita. Para cada publicação, verificar o componente e
produzir a versão adequada: preservar a peça original e criar uma composição própria para
o artigo ou rede social quando um simples corte eliminar informação.

| Proporção proposta | Tamanho de referência | Intenção |
|---|---|---|
| 16:9 | 1600 × 900 | Cenário amplo, sequência ou abertura cinematográfica |
| 3:2 | 1536 × 1024 | Fotografia e ilustração horizontal de leitura confortável |
| 4:3 | 1440 × 1080 | Diagrama ou cena com mais altura |
| 1:1 | 1200 × 1200 | Humor visual, objeto único, comparação compacta |
| 4:5 | 1200 × 1500 | Cartaz, retrato e composição vertical curta |
| 2:3 | 1200 × 1800 | Ilustração editorial vertical e materiais para salvar |
| 9:16 | 1080 × 1920 | História vertical ou sequência pensada para celular |

Dimensões finais podem ser ajustadas à resolução disponível sem distorcer a arte.
Não ampliar uma imagem pequena para aparentar alta definição. Não cortar olhos, focinhos,
mãos, marca nem o elemento que explica o assunto. Texto essencial também existe no artigo,
e a descrição alternativa descreve a cena, sem prometer diagnóstico.

**Animação é uma possibilidade de produção**, indicada como “movimento proposto” em algumas
linhas. Uma imagem que pareça um desenho animado continua sendo estática. Só registrar GIF,
WebP animado ou vídeo como entregue depois de criar e verificar o arquivo correspondente.
Movimentos curtos, sem flashes e sem depender de áudio devem ter alternativa estática;
a implementação precisa respeitar a preferência de movimento reduzido do usuário.

Humor cabe na convivência e nos equívocos cotidianos, sem ridicularizar tutores ou raças.
Emergências, sofrimento, maus-tratos, câncer, luto e eutanásia pedem acolhimento e clareza.
Não transformar convulsão, falta de ar, intoxicação ou dor em piada. Não mostrar sangue,
ferimentos gráficos, instrumentos em uso indevido, pets ingerindo substâncias tóxicas,
animais em posição perigosa nem uma imagem que ensine uma conduta clínica sem revisão.
Diagramas anatômicos e qualquer instrução incorporada à arte precisam de revisão veterinária.
As propostas abaixo não corrigem nem validam alegações médicas dos títulos do calendário.

## Âncoras mensais: 52 direções propostas

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| ANC-001 | Quanto custa ter um cachorro por mês, a conta real | Cachorro observa uma pequena cidade de objetos: saco de ração, passeio, consulta e caminha; moedas sem valores inventados | Diorama de papel recortado | 4:3 | Telhados laranja e nome Saúde Pet na base |
| ANC-002 | Calor forte: como saber se o seu pet está sofrendo com a temperatura | Quintal dividido pela sombra de uma árvore, cão descansando na parte fresca, água próxima | Fotografia editorial de verão | 16:9 | Tigela verde e toalha laranja |
| ANC-003 | Passeio no asfalto quente: o teste dos sete segundos | Mão adulta próxima ao piso e guia aguardando na sombra; relógio ilustrado enfatiza atenção sem demonstrar exposição dolorosa | Fotografia com anotação desenhada | 4:5 | Traço verde e assinatura Saúde Pet |
| ANC-004 | O enxoval do pet: o que ter em casa antes de ele chegar | Mala aberta com o enxoval organizado por função e um filhote espiando ao lado | Composição de objetos vista de cima | 1:1 | Mala verde, detalhe laranja e símbolo original |
| ANC-005 | Carnaval: como preparar o pet para barulho, gente e viagem | Rua festiva vista pela janela e refúgio tranquilo dentro de casa; pet sem fantasia restritiva | Cenário ilustrado em duas profundidades | 16:9 | Almofadas verdes e confetes laranja |
| ANC-006 | Pet sozinho em casa: quanto tempo é tempo demais | Luz atravessa diferentes posições no mesmo cômodo enquanto o cão espera junto à cama | Pintura digital contemplativa | 3:2 | Manta verde e pequeno nome Saúde Pet |
| ANC-007 | Quanta água o seu cão e o seu gato precisam beber por dia | Duas estações de água em uma cozinha real; gato prefere a fonte e cão sua tigela, sem escala universal | Fotografia de cotidiano | 4:3 | Cerâmica verde e base laranja |
| ANC-008 | Como ler o rótulo da ração e entender o que você está comprando | Saco fictício neutro abre como um mapa, com áreas de informação apontadas por lupa | Colagem editorial com tipografia editável | 4:5 | Linhas verdes, marcador laranja, nome Saúde Pet |
| ANC-009 | Ração seca, úmida ou natural: o que muda na prática | Três preparações em pequenas mesas distintas; foco em textura, armazenamento e rotina, sem declarar equivalência nutricional | Natureza-morta gastronômica | 16:9 | Mesas em verde, claro e laranja |
| ANC-010 | Quanto de ração dar por dia, por porte e por idade | Cão pequeno e cão grande ladeiam uma balança com recipiente vazio e pacote neutro | Ilustração editorial geométrica | 3:2 | Balança verde, acentos laranja |
| ANC-011 | Petisco: quanto cabe sem desequilibrar a dieta | Petisco retratado como pequeno ingresso de cinema e cão ansioso pela sessão de treino | Humor de objeto em miniatura | 1:1 | Ingresso laranja com Saúde Pet |
| ANC-012 | Alimentos da nossa casa que fazem mal ao pet | Armário fechado com alimentos comuns separados da área acessível ao animal; risco comunicado pela organização | Gravura contemporânea de cozinha | 4:5 | Prateleira verde, marca original no rodapé |
| ANC-013 | Como trocar a ração sem causar diarreia: o passo a passo de sete dias | Caminho de sete pedras entre dois pacotes neutros; recipientes representam progressão a revisar no texto | Ilustração em aquarela com sequência | 16:9 | Caminho verde e etapas em laranja |
| ANC-014 | Vermifugação: com que frequência e por quê | Agenda de cuidados e cão em passeio aparecem conectados, sem comprimido ou dose em destaque | Ilustração editorial de caderno | 4:3 | Agenda verde e marcador laranja |
| ANC-015 | Abril Laranja: como reconhecer e como denunciar maus tratos | Animal protegido por um círculo de mãos adultas, com espaço limpo para orientação de denúncia verificada | Cartaz de campanha em papel texturizado | 4:5 | Laranja dominante e logotipo original |
| ANC-016 | Castração: o que ela previne e o que ela não previne | Tutor e veterinária conversam sobre duas folhas de perguntas, com pet tranquilo entre eles | Cena documental ilustrada | 3:2 | Prancheta verde e nome Saúde Pet |
| ANC-017 | Microchip e identificação: o que fazer hoje para não perder o seu pet | Coleira identificada em primeiro plano, reencontro em segundo; microchip aparece como elemento distinto, sem rastreamento fictício | Fotografia com detalhe ampliado | 16:9 | Plaquinha laranja e símbolo oficial |
| ANC-018 | Escovar os dentes do pet: como começar sem virar briga | Quadrinho de negociação gentil: pet olha a escova, cheira o material e recebe atenção; sem contenção forçada | História em quadrinhos leve | 4:5 | Escova verde e balões laranja |
| ANC-019 | Banho e tosa: frequência certa por tipo de pelagem | Três retratos com texturas de pelo diferentes e materiais de cuidado ao redor, sem “antes e depois” de saúde | Colagem fotográfica de texturas | 3:2 | Pequenos recortes verdes e assinatura Saúde Pet |
| ANC-020 | Unhas, ouvidos e almofadinhas: a rotina de dez minutos | Pequena bancada de observação com três janelas de detalhes saudáveis, sem instrumento dentro do ouvido | Ilustração de guia de campo | 4:3 | Molduras tinta, divisores laranja, símbolo original |
| ANC-021 | O cuidado semanal do pet em quinze minutos: o checklist | Lista editável junto de objetos reais de cuidado; pet deitado “supervisionando” a organização | Folha para salvar com fotografia | 2:3 | Cabeçalho Saúde Pet e caixas verdes |
| ANC-022 | Frio em Curitiba: quais pets sofrem mais e como proteger | Rua curitibana fria vista de uma casa aquecida, cão idoso e gato com camas afastadas da janela | Pintura de cenário urbano acolhedor | 16:9 | Luz laranja e cobertor verde |
| ANC-023 | Tosse no inverno: tosse dos canis, gripe felina e o que é urgência | Tutor observa o pet enquanto prepara contato com veterinária; janela embaçada situa o inverno | Fotografia documental serena | 3:2 | Casaco verde e assinatura laranja |
| ANC-024 | Festa junina e fogos: o plano para atravessar a noite | Miniatura de casa com quarto seguro; bandeirinhas ficam do lado de fora, som indicado discretamente | Maquete de feltro | 4:3 | Refúgio verde e bandeirinhas laranja |
| ANC-025 | Cama, casinha e roupinha: o que aquece de verdade e o que é enfeite | Corte lateral de uma cama protegida da corrente de ar, tecido e piso separados em camadas visuais | Desenho de produto com textura | 4:5 | Camadas verdes e etiquetas Saúde Pet |
| ANC-026 | Ansiedade de separação: como identificar e o que realmente ajuda | Porta entreaberta e cão acompanhado pelo tutor no treino de uma saída breve, sem cena de abandono | Ilustração narrativa delicada | 3:2 | Porta verde e guia laranja |
| ANC-027 | Por que o cachorro late demais, e o que fazer sem gritar | Cão retratado como um locutor com vários balões de contexto: campainha, tédio, rua; expressão simpática | Cartum de observação | 1:1 | Balões verdes e nome Saúde Pet |
| ANC-028 | Gato fazendo xixi fora da caixa quase nunca é birra | Gato diante de uma caixa de areia acessível e tutor atento; pequeno balão de pergunta, sem culpa | Ilustração editorial felina | 4:5 | Caixa verde e detalhe laranja |
| ANC-029 | Enriquecimento ambiental em apartamento: brincar não é luxo | Apartamento vira parque vertical seguro com prateleiras, esconderijos e brincadeira supervisionada | Perspectiva isométrica lúdica | 4:3 | Percurso verde e nichos laranja |
| ANC-030 | O que todo tutor de gato faz errado sem perceber | Gato “arquiteto” corrige a planta da casa: água, descanso e caixa têm lugares próprios | Humor editorial com desenho à mão | 1:1 | Lápis laranja e planta verde |
| ANC-031 | Raiva: por que a vacina continua obrigatória todo ano | Carteira vacinal em mãos adultas, cão e gato tranquilos ao fundo; nenhum calendário legal inventado na arte | Fotografia de prevenção | 3:2 | Capa verde e símbolo original |
| ANC-032 | Gato de apartamento: telamento, janela e plantas tóxicas | Janela inteiramente telada vista do interior, gato em apoio seguro, plantas de risco fora de alcance | Aquarela arquitetônica | 4:5 | Tela desenhada em tinta e vaso laranja |
| ANC-033 | FIV e FeLV: o exame que todo gato deveria fazer uma vez | Dois cartões com as siglas corretas acompanham uma conversa cuidadosa entre tutor e veterinária | Retrato ilustrado com informação mínima | 4:3 | Cartões verde e laranja, nome Saúde Pet |
| ANC-034 | Leptospirose: o risco que aparece junto com a chuva | Passeio interrompido diante de área alagada; tutor e cão ficam em piso seco | Fotografia cinematográfica de chuva | 16:9 | Capa verde e guia laranja |
| ANC-035 | Pele do pet: coceira, queda de pelo e o que cada uma indica | Texturas de pelagem ampliadas ao redor de retrato sereno; lupa indica observação, sem lesões explícitas | Colagem de fotografia e desenho científico | 4:5 | Círculos verdes e assinatura Saúde Pet |
| ANC-036 | Como medir em casa a respiração e os batimentos do seu pet | Pet descansando, tutor observa e registra o tempo; traço discreto acompanha o movimento torácico | Ilustração instrutiva a revisar | 3:2 | Cronômetro laranja e caderno verde |
| ANC-037 | Olhos: secreção, olho vermelho e o que não pode esperar | Retrato em proximidade com olho natural e tutor buscando ajuda ao fundo, sem retoque de lesão dramática | Fotografia editorial de detalhe | 1:1 | Reflexo verde suave e nome Saúde Pet |
| ANC-038 | Dia do Veterinário: como escolher um profissional de confiança | Veterinária explica um registro ao tutor no nível do pet; conversa e escuta dominam a cena | Retrato documental humanizado | 4:5 | Prancheta verde e logotipo oficial discreto |
| ANC-039 | Outubro Rosa pet: nódulo na mama da cadela, o que fazer | Cadela adulta acolhida no colo; fita rosa aparece sobre o caderno de consulta, sem tumor aparente | Fotografia de campanha sensível | 4:5 | Rosa temático com pequeno verde e logo original |
| ANC-040 | Doença renal crônica em gatos: o inimigo silencioso | Gato idoso à luz da manhã com água e caderno de acompanhamento; a rotina traduz atenção | Pintura digital de interior | 3:2 | Caneca do tutor verde e marcador laranja |
| ANC-041 | Diabetes em cães e gatos: os sinais que vêm antes do diagnóstico | Um diário visual reúne água, refeições e passeios ao redor de cão e gato, sem diagnóstico automático | Colagem de registro cotidiano | 4:3 | Anotações verdes e nome Saúde Pet |
| ANC-042 | Tosse à noite não é normal: quando o coração é a causa | Quarto noturno com tutor desperto atento ao cão; um abajur ilumina o contato de ajuda | Cena cinematográfica noturna | 16:9 | Abajur laranja, tecidos verdes |
| ANC-043 | Dia dos Animais: o que avaliar antes de adotar | Pessoa e animal se conhecem em ambiente tranquilo; ao lado, casa, agenda e orçamento como pequenas perguntas | Ilustração de encontro com colagem | 4:5 | Perguntas em verde e assinatura Saúde Pet |
| ANC-044 | Exames de rotina depois dos sete anos: quais e de quanto em quanto tempo | Retrato digno de um cão grisalho sobreposto a um calendário sem periodicidade pré-preenchida | Fotografia com desenho editorial | 4:5 | Calendário verde e marca oficial |
| ANC-045 | Novembro Azul pet: próstata em cães machos | Cão adulto e tutor em consulta; elemento azul de campanha no caderno, sem estereótipos de masculinidade | Ilustração de campanha | 3:2 | Azul temático, verde Saúde Pet e logo |
| ANC-046 | Ele parou de subir no sofá: artrose e dor crônica | Rampa bem apoiada conduz a um sofá baixo, pet idoso acompanhado pelo tutor | Fotografia doméstica acolhedora | 16:9 | Manta verde e almofada laranja |
| ANC-047 | Rotina de um pet com doença crônica sem virar um segundo emprego | Mesa organizada com agenda, embalagens neutras fechadas e passeio reservado na semana | Natureza-morta de rotina possível | 4:3 | Agenda verde com Saúde Pet |
| ANC-048 | Ceia de Natal: os alimentos que mandam pet para a emergência | Mesa natalina inacessível ao pet, que desfruta seu próprio espaço seguro ao lado do tutor | Ilustração de cenário festivo | 16:9 | Laços laranja, detalhes verdes e marca |
| ANC-049 | Réveillon e fogos: o plano completo, hora a hora | Casa em corte com sequência do entardecer à madrugada; pet protegido em espaço interno | História visual panorâmica | 16:9 | Faixas de horário verdes e pequenos pontos laranja |
| ANC-050 | Viajar com o pet: transporte, documento e o que levar | Mala e caixa de transporte aberta em preparação, documentos fictícios sem dados pessoais | Cartaz de viagem retrô | 2:3 | Etiqueta Saúde Pet laranja e mala verde |
| ANC-051 | Qualidade de vida: como conversar sobre eutanásia com o veterinário | Mãos do tutor pousadas ao lado do pet idoso em descanso, com espaço e luz suaves; sem instrumentos | Aquarela silenciosa e acolhedora | 3:2 | Verde muito suave e nome Saúde Pet discreto |
| ANC-052 | A revisão anual do seu pet: o retrospecto de doze meses | Álbum aberto reúne momentos comuns de cuidado, não resultados médicos inventados | Colagem de lembranças em papel | 4:3 | Fita laranja, capa verde e símbolo oficial |

## Perguntas: 104 direções propostas

### Conceitos: PER-001 a PER-028

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| PER-001 | O que é vermifugação e para que serve | Tutor leva sua lista de dúvidas à consulta, enquanto um desenho abstrato de proteção acompanha o pet | Desenho editorial em lápis colorido | 1:1 | Caderno verde e título Saúde Pet |
| PER-002 | O que é castração e o que muda no animal | Dois momentos do mesmo cotidiano, conversa antes da decisão e retorno ao descanso, sem operação mostrada | Díptico ilustrado | 3:2 | Faixa de passagem laranja e assinatura verde |
| PER-003 | O que é vacina polivalente (V8, V10) e o que ela protege | Letras V8 e V10 em fichas de consulta cercadas por perguntas; números não viram níveis de qualidade | Colagem tipográfica editável | 4:5 | Fichas verdes, logotipo original |
| PER-004 | O que é reforço de vacina e por que precisa repetir | Duas marcações relacionadas numa agenda, tutor levando o pet novamente à consulta | Pequena narrativa em papel recortado | 3:2 | Agenda laranja com detalhes verdes |
| PER-005 | O que é microchip e para que serve | Leitor próximo de cão tranquilo e identificação em ficha neutra, sem mapa de localização | Desenho técnico amigável | 4:3 | Leitor verde e Saúde Pet na ficha |
| PER-006 | O que é carrapaticida e como ele age | Embalagem neutra fechada junto de consulta orientativa e silhueta ampliada do carrapato separada da cena | Ilustração de objetos | 1:1 | Base verde e detalhe laranja |
| PER-007 | O que é zoonose, em palavras simples | Pessoa e animal conectados por ambiente comum, mãos limpas e cuidado, sem sugerir que todo contato infecta | Diagrama ilustrado de convivência | 4:3 | Conexões verdes e nome Saúde Pet |
| PER-008 | O que significam as categorias escritas no saco de ração | Tipos de letra do rótulo viram etiquetas destacáveis sobre saco sem marca comercial | Colagem de embalagem | 4:5 | Etiquetas laranja e tinta, pequeno logo |
| PER-009 | O que é alimento úmido (sachê e lata) e quando ele ajuda | Sachê neutro e lata abertos ao lado de porção, com textura em destaque e gato curioso ao fundo | Fotografia de produto editorial | 1:1 | Prato verde e fundo claro |
| PER-010 | O que é ração terapêutica e por que só sai com indicação | Veterinária aponta uma anotação individual, enquanto um pacote sem marca permanece fechado | Desenho em guache | 3:2 | Pacote com detalhe laranja e pasta verde |
| PER-011 | O que é escore de condição corporal | Silhuetas de cão vistas de cima e de lado, linhas neutras de observação sem nota inferida pela imagem | Ilustração anatômica a revisar | 4:3 | Contornos tinta e realces verdes |
| PER-012 | O que é anamnese e por que o veterinário faz tanta pergunta | Perguntas viram fios que conectam sono, comida e passeio à conversa com o tutor | Colagem narrativa de caderno | 4:5 | Fios laranja e nome Saúde Pet |
| PER-013 | O que é hemograma e o que ele mostra | Folha de exame sem valores e pequena lente com células estilizadas, sem resultado clínico fictício | Gravura científica contemporânea | 1:1 | Lente verde e assinatura oficial |
| PER-014 | O que é ultrassom e quando ele é necessário | Veterinária conversa ao lado do aparelho desligado ou com esquema claramente ilustrativo | Fotografia de ambiente clínico | 3:2 | Carrinho verde e nome Saúde Pet |
| PER-015 | O que é jejum antes do exame e por quanto tempo | Tigela guardada e bilhete “confirme a orientação” junto à agenda de exame, sem horas universais | Natureza-morta com texto editável | 4:5 | Bilhete laranja, agenda verde |
| PER-016 | O que é fluidoterapia, o famoso soro | Tutor acompanha a explicação de um suporte de soro em consultório, sem montagem caseira | Ilustração documental | 3:2 | Prancheta verde e símbolo Saúde Pet |
| PER-017 | O que é anestesia e qual o risco real | Veterinária explica a avaliação ao tutor, equipamentos apenas ao fundo e animal acordado em primeiro plano | Retrato editorial sereno | 4:3 | Pasta laranja e cadeira verde |
| PER-018 | O que é atendimento domiciliar e o que ele resolve | Bolsa de atendimento na entrada de uma sala real; profissional e tutor cumprimentam-se perto do pet | Fotografia narrativa de chegada | 16:9 | Bolsa verde com logo oficial |
| PER-019 | O que é teleorientação e o que ela não pode fazer | Tela de conversa conceitual entre tutor e profissional, acompanhada de caderno; sem interface fictícia do app | Ilustração de cena doméstica | 4:3 | Moldura verde e nome Saúde Pet fora da tela |
| PER-020 | O que é prontuário e por que o tutor tem direito a ele | Pasta de histórico aberta como uma linha do tempo, páginas neutras e nenhum dado pessoal | Livro de papel em relevo | 4:5 | Lombada verde e selo Saúde Pet |
| PER-021 | O que é receita veterinária e quando ela é obrigatória | Mãos adultas recebem uma folha com campos ilustrativos sem medicamento, dose ou assinatura inventados | Fotografia com papel desenhado | 3:2 | Pasta laranja e marca original |
| PER-022 | O que é o CRMV e como conferir se o profissional está regular | Lupa sobre as letras CRMV em credencial conceitual, claramente sem número de registro real | Cartaz tipográfico de confiança | 1:1 | Letras tinta, lupa verde e assinatura Saúde Pet |
| PER-023 | O que é castração química e por que quase nunca é indicada | Mesa de conversa com duas opções representadas por cartões de perguntas, sem produto ou recomendação visual | Ilustração editorial sóbria | 4:3 | Cartões verdes e marcador laranja |
| PER-024 | O que é cio e quanto tempo dura | Cadela em passeio acompanhada de calendário sem datas e guia segura | Aquarela de observação cotidiana | 4:5 | Guia laranja e moldura verde |
| PER-025 | O que é falsa gravidez em cadela | Cadela acomodada perto de brinquedo, tutor observando com acolhimento, sem fantasia de bebê | Pintura digital intimista | 3:2 | Cama verde e brinquedo laranja |
| PER-026 | O que é glândula anal e por que ela incomoda tanto | Silhueta lateral do cão com lupa abstrata sobre a região e um ponto de interrogação | Desenho editorial respeitoso | 1:1 | Lupa verde e assinatura laranja |
| PER-027 | O que é displasia e por que atinge tanto raça grande | Cão grande parado confortavelmente ao lado de esquema separado da articulação, a revisar | Ilustração científica de guia | 4:3 | Linhas tinta e foco verde |
| PER-028 | O que é braquicefálico e por que esses cães sofrem mais | Perfis respeitosos de cães com focinhos diferentes, sem caricaturar dificuldade respiratória | Estudo ilustrado de perfis | 3:2 | Fundo claro e traço laranja Saúde Pet |

### Alimentação: PER-029 a PER-044

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| PER-029 | Cachorro pode comer ovo | Ovo cozido separado da tigela, cão observa como um pequeno crítico gastronômico; veredito fica no texto | Fotografia lúdica de mesa | 1:1 | Guardanapo verde e nome Saúde Pet |
| PER-030 | Cachorro pode comer banana | Banana como telefone de desenho e cão inclina a cabeça para a “ligação” do tutor, sem ingestão | Cartum original | 4:5 | Balão verde, detalhe laranja e assinatura |
| PER-031 | Cachorro pode comer arroz e feijão | Prato do tutor e tigela do cão separados numa mesa vista de cima; ingredientes não se confundem com dieta completa | Colagem gastronômica | 4:3 | Jogo americano verde e marca |
| PER-032 | Cachorro pode comer osso, e qual osso mata | Osso isolado sob redoma ilustrada e brinquedo próprio fora dela; sem cão roendo | Cartaz de alerta em recorte de papel | 4:5 | Base verde e ponto de atenção laranja |
| PER-033 | Cachorro pode tomar leite | Garrafa de leite fechada no alto da bancada; cão e tigela de água em plano inferior | Ilustração de cozinha retrô | 3:2 | Armário verde e etiqueta Saúde Pet |
| PER-034 | Cachorro pode comer pão | Pão aparece como nuvem de pensamento do cão ao lado do café da manhã do tutor | Desenho a lápis com humor leve | 1:1 | Xícara laranja e assinatura verde |
| PER-035 | Cachorro pode comer melancia e outras frutas | Natureza-morta tropical com frutas inteiras e fatias separadas do pet; preparo não é ensinado sem revisão | Pintura em guache vibrante | 4:5 | Bandeja verde e nome Saúde Pet |
| PER-036 | Cachorro pode comer cenoura e legumes | Cão observa uma “feira” de miniaturas de vegetais sobre caixotes, sem ingestão em cena | Diorama de massinha | 1:1 | Caixotes verdes e placa Saúde Pet |
| PER-037 | Cachorro pode comer batata doce | Batata-doce aberta em estudo de cor e textura, com patinha desenhada e dúvida em texto | Gravura botânica contemporânea | 2:3 | Legenda tinta e fio laranja |
| PER-038 | Cachorro pode comer ração de gato | Cão tenta entender a etiqueta “gato” em tigela separada, com expressão de curioso | Quadrinho de confusão de identidade | 1:1 | Tigela verde e nome Saúde Pet |
| PER-039 | Gato pode comer ração de cachorro | Gato posa como fiscal diante do pacote do cão; dois potes distintos explicam a troca indevida sem ingestão | Fotomontagem editorial bem-humorada | 4:5 | Prancheta laranja e fundo verde |
| PER-040 | Gato pode beber leite | Gato diante de cartaz antigo de leite rasgado, com água limpa em primeiro plano; questionar o clichê | Colagem de anúncio retrô | 4:5 | Papel verde e assinatura Saúde Pet |
| PER-041 | Gato pode comer atum de lata | Lata neutra fechada ao lado de peixe desenhado e lista de perguntas sobre composição | Desenho de embalagem e objeto | 1:1 | Rótulo verde e abridor laranja |
| PER-042 | Gato pode comer ovo | Gato espiando atrás de um ovo grande em primeiro plano, como mistério de cozinha | Fotografia com escala divertida | 3:2 | Fundo verde e nome Saúde Pet |
| PER-043 | Pode misturar ração seca com úmida | Texturas seca e úmida ocupam duas metades de uma composição, ponto de encontro com interrogação | Fotografia macro gastronômica | 1:1 | Divisor laranja e símbolo original |
| PER-044 | Pode dar comida de casa junto com a ração | Duas estradas de papel, panela e pacote, chegam à mesa de orientação veterinária | Ilustração metafórica em recortes | 4:3 | Estradas verdes e sinal Saúde Pet |

### Comportamento: PER-045 a PER-058

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| PER-045 | Por que cachorro come grama | Cão olha o gramado como um cardápio e tutor se pergunta o motivo; sem diagnóstico na expressão | Tira cômica de observação | 3:2 | Guia laranja e balão verde |
| PER-046 | Por que cachorro arrasta o bumbum no chão | Tutor nota marca de percurso no tapete e observa o cão, sem ridicularizar o desconforto | Ilustração simples de interior | 4:3 | Tapete verde e nome Saúde Pet |
| PER-047 | Por que cachorro lambe a pata sem parar | Plano próximo do cão interrompendo a lambedura ao receber atenção; lupa de observação ao lado | Fotografia de comportamento | 1:1 | Cobertor laranja e pequeno símbolo |
| PER-048 | Por que cachorro treme | Cão em abrigo confortável, tutor atento, três contextos desenhados à parte sem apontar uma causa | Aquarela com pequenas vinhetas | 4:5 | Vinhetas verdes e assinatura Saúde Pet |
| PER-049 | Por que cachorro uiva | Cão “cantor” com onda de som desenhada que vira lua, sem roupa ou microfone encostado no animal | Cartum musical | 1:1 | Onda verde e lua laranja |
| PER-050 | Por que cachorro dorme tanto | Cão espalhado numa cama com pequeno aviso editável “em reunião com os sonhos” | Meme autoral de cotidiano | 4:5 | Manta verde e assinatura Saúde Pet |
| PER-051 | Por que cachorro come as próprias fezes | Passeio supervisionado, tutor recolhe resíduos com saco opaco; a dúvida aparece no caderno | Ilustração urbana discreta | 3:2 | Dispensador laranja e guia verde |
| PER-052 | Por que gato ronrona | Gato relaxado com linhas sonoras que lembram pequenos anéis; movimento proposto de vibração suave | Desenho animado em aparência, movimento opcional | 1:1 | Anéis verdes e coração laranja discreto |
| PER-053 | Por que gato amassa pãozinho | Gato “padeiro” amassa uma manta, e a sombra da manta lembra massa de pão, sem alimento sendo manipulado | Ilustração cômica de ateliê | 4:5 | Manta verde e plaquinha Saúde Pet |
| PER-054 | Por que gato morde no meio do carinho | Três quadros verticais mostram aproximação, sinal corporal e tutor respeitando espaço, sem mordida gráfica | História em quadrinhos observacional | 9:16 | Balões laranja e linhas verdes |
| PER-055 | Por que gato vomita bola de pelo | Escova com pelos e gato ao lado, imagem trata a origem sem mostrar vômito | Natureza-morta ilustrada | 1:1 | Escova verde e fundo claro |
| PER-056 | Por que gato arranha o sofá | Gato posa como artista ao lado do sofá e de um arranhador disponível, humor sobre a convivência | Cartaz de exposição fictícia | 4:5 | Título editável tinta e selo Saúde Pet |
| PER-057 | Por que gato dorme o dia inteiro | Gato dorme em diferentes manchas de sol num único ambiente; movimento proposto só na passagem da luz | Pintura de cenário com movimento opcional | 16:9 | Almofada verde e pequeno vaso laranja |
| PER-058 | Por que gato foge de casa | Gato observa o exterior por janela telada, tutor prepara brincadeira dentro de casa | Ilustração narrativa de janela | 4:5 | Moldura verde e brinquedo laranja |

### Rotina, custo e tempo: PER-059 a PER-076

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| PER-059 | Quanto custa uma consulta veterinária | Consulta representada como tempo, escuta, exame e registro em objetos de mesa; nenhum preço inventado | Composição editorial de objetos | 4:3 | Caderno verde com Saúde Pet |
| PER-060 | Quanto custa castrar cachorro e gato | Orçamento conceitual sem valores ladeado por perguntas sobre avaliação e acompanhamento | Cartaz tipográfico ilustrado | 4:5 | Marcador laranja e linhas verdes |
| PER-061 | Quanto custa manter um gato por mês | Gato deitado sobre uma calculadora gigante de papel, cercado de itens de cuidado | Diorama de orçamento com humor | 1:1 | Calculadora verde e etiqueta Saúde Pet |
| PER-062 | Quantas vezes por dia dar comida ao cachorro | Momentos do dia como janelas de uma cozinha, recipientes sem número universal de refeições | Ilustração panorâmica de rotina | 16:9 | Janelas verdes e sol laranja |
| PER-063 | Quanto de ração dar por dia | Mão pesa alimento numa balança, rótulo consultado ao lado, sem quantidade fixa inscrita | Fotografia instrutiva de mesa | 3:2 | Balança verde e nome Saúde Pet |
| PER-064 | Quantos quilos de ração um cão come por mês | Pacote neutro acompanhado por calendário e recipiente graduado sem valores | Gravura editorial de despensa | 4:5 | Calendário laranja e detalhe verde |
| PER-065 | De quanto em quanto tempo dar vermífugo | Tutor deixa uma pergunta marcada para a consulta num calendário individual ainda em branco | Fotografia de agenda | 1:1 | Marcador verde e Saúde Pet na capa |
| PER-066 | De quanto em quanto tempo aplicar antipulgas | Etiqueta neutra de produto e lembrete vinculado ao pet, com espaço de orientação individual | Colagem de papel e embalagem | 4:5 | Etiqueta laranja, traços verdes |
| PER-067 | Quanto tempo dura o cio da cadela | Calendário circular incompleto acompanha a cadela em caminhada, sem duração fechada na arte | Ilustração de ciclo cotidiano | 1:1 | Arco verde e guia laranja |
| PER-068 | Quanto tempo dura a gestação da cadela | Cadela confortável ao lado de caderno de acompanhamento e pequenos marcos sem datas fixas | Aquarela suave | 4:3 | Caderno verde e assinatura Saúde Pet |
| PER-069 | Quanto tempo um cachorro vive | Três retratos do mesmo cão em fases distintas, com a mesma expressão reconhecível | Tríptico de retrato ilustrado | 16:9 | Fio laranja conecta as fases |
| PER-070 | Quanto tempo um gato vive | Gato jovem e idoso aparecem em reflexos de um álbum, evitando régua de longevidade universal | Colagem fotográfica afetiva | 4:5 | Capa verde e nome Saúde Pet |
| PER-071 | Com quantos meses o cachorro para de crescer | Filhote diante de parede com marcas de altura feitas a lápis, sem idade universal | Ilustração de memória doméstica | 2:3 | Régua desenhada em verde e detalhe laranja |
| PER-072 | Com quantos meses castrar | Calendário sem data circulada fica na mesa da conversa entre tutor e veterinária | Desenho documental em nanquim | 3:2 | Papel verde suave e marcador laranja |
| PER-073 | Quantas horas um cachorro pode ficar sozinho | Relógio sem hora destacada e cão acompanhado no treino de independência; ambiente enriquecido | Cena de interior em guache | 4:3 | Relógio verde e manta laranja |
| PER-074 | Quantos dias um gato pode ficar sozinho | Chave entregue a pessoa de confiança enquanto gato observa de lugar confortável | Fotografia narrativa de planejamento | 3:2 | Chaveiro Saúde Pet laranja |
| PER-075 | Quantos dias depois da vacina o filhote pode passear | Guia espera no gancho, carteira vacinal aberta junto às perguntas para o veterinário | Fotografia de expectativa | 4:5 | Guia verde e nome Saúde Pet |
| PER-076 | Quanto tempo esperar para dar banho depois da vacina | Toalha dobrada e carteira de vacina num banco, sem contagem fixa ou banho em andamento | Ilustração de objetos em pastel | 1:1 | Toalha laranja e capa verde |

### Cuidados em casa: PER-077 a PER-090

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| PER-077 | Como dar comprimido para gato sem apanhar | Gato e tutor sentados como “negociadores”, medicamento fechado fora de alcance; manejo só após revisão | Cartum original de convivência | 4:5 | Mesa verde e nome Saúde Pet |
| PER-078 | Como dar remédio líquido para cachorro | Tutor prepara material prescrito sobre a mesa, pet tranquilo ao lado; sem posição de aplicação sugerida | Ilustração instrutiva preparatória | 4:3 | Bandeja verde e pano laranja |
| PER-079 | Como cortar a unha sem machucar | Cortador em repouso, pata apoiada e lupa separada com esquema a revisar | Desenho de oficina de cuidado | 4:5 | Lupa laranja e legenda Saúde Pet |
| PER-080 | Como escovar os dentes do pet | Escova adequada e tutor oferecendo aproximação gradual, foco no vínculo e não em boca forçada | Fotografia de rotina gentil | 3:2 | Escova verde e detalhe laranja |
| PER-081 | Como tirar carrapato do jeito certo | Ferramenta apropriada em repouso e desenho ampliado do parasita, sem ensinar um gesto incorreto | Ilustração de guia prático a revisar | 1:1 | Fundo claro e traços verdes |
| PER-082 | Como medir a temperatura do pet em casa | Termômetro guardado no estojo e tutor consultando orientação; sem procedimento invasivo ilustrado | Natureza-morta editorial | 4:3 | Estojo verde e nome Saúde Pet |
| PER-083 | Como saber se o pet está desidratado | Tutor registra mudanças de água e comportamento e prepara contato veterinário, sem “teste infalível” | Diário visual ilustrado | 4:5 | Caneta laranja e caderno verde |
| PER-084 | Como saber a idade de um animal sem histórico | Animal recém-acolhido perto de álbum com página em branco e lupa de investigação | Colagem de descoberta | 1:1 | Álbum verde e assinatura laranja |
| PER-085 | Como ensinar o filhote a fazer xixi no lugar certo | Pequeno mapa do cômodo mostra local de higiene distante de descanso e comida; tutor recompensa atenção | Ilustração de planta doméstica | 4:3 | Percurso verde e ponto de referência laranja |
| PER-086 | Como acostumar o gato com a caixa de transporte | Caixa aberta vira uma cabana tranquila com manta conhecida, gato explora por vontade própria | Cenário de feltro | 4:5 | Caixa verde e manta laranja |
| PER-087 | Como apresentar um gato novo ao gato que já mora na casa | Porta separa dois espaços confortáveis; troca de odores sugerida por mantas distintas, sem confronto | Ilustração em corte de apartamento | 16:9 | Uma manta verde e outra laranja |
| PER-088 | Como fazer o gato usar o arranhador | Arranhador ocupa lugar convidativo perto da área de convivência; gato estica o corpo com naturalidade | Pôster ilustrado de movimento | 2:3 | Base verde com Saúde Pet |
| PER-089 | Como fazer o cachorro parar de puxar a guia | Tutor e cão caminham com guia frouxa, rua com espaço suficiente, sem enforcador ou tranco | Desenho urbano em movimento | 16:9 | Guia laranja e traço verde |
| PER-090 | Como pesar o pet em casa sem balança de animal | Balança doméstica ao lado de tutor e pet, duas anotações vazias sugerem comparação sem conta inventada | Quadrinho instrutivo a revisar | 4:5 | Balança verde e assinatura Saúde Pet |

### Aconteceu agora: PER-091 a PER-104

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| PER-091 | Meu cachorro comeu chocolate, o que fazer | Embalagem de chocolate fora de alcance e tutor contata ajuda junto ao cão, sem ingestão ou receita caseira | Fotografia editorial de ação imediata | 3:2 | Telefone com capa verde e nome Saúde Pet |
| PER-092 | Meu cachorro comeu osso de frango | Prato recolhido, embalagem de refeição e tutor atento ao pet; nenhum osso na boca | Ilustração narrativa sóbria | 4:3 | Pano laranja e pequeno logo original |
| PER-093 | Meu cachorro comeu uva ou passa | Uvas e passas isoladas sobre bancada alta, tutor registra o ocorrido enquanto busca orientação | Natureza-morta com contexto humano | 4:5 | Caderno verde e assinatura Saúde Pet |
| PER-094 | Meu cachorro comeu cebola ou alho | Tábua de cozinha fora do alcance, telefone e tutor em primeiro plano; pet acompanhado | Fotografia doméstica cuidadosa | 3:2 | Avental verde e detalhe laranja |
| PER-095 | Meu cachorro engoliu um objeto | Brinquedo com peça ausente e tutor mostra o objeto de referência ao profissional, sem raio X inventado | Ilustração editorial de investigação | 4:3 | Brinquedo laranja e caderno verde |
| PER-096 | Meu cachorro tomou veneno | Recipiente fechado afastado do animal, tutor busca ajuda e guarda a referência da embalagem | Cartaz sóbrio com objetos | 4:5 | Verde Saúde Pet e marca legível, sem caveira cômica |
| PER-097 | Meu cachorro teve uma convulsão | Cômodo com espaço livre e tutor ao telefone; animal em repouso, sem simular convulsão ou contenção | Ilustração acolhedora de emergência | 3:2 | Manta verde e detalhe laranja |
| PER-098 | Meu cachorro foi picado por abelha | Abelha pequena em vinheta separada, tutor acompanha o cão e procura orientação; sem rosto inchado caricatural | Aquarela editorial | 1:1 | Vinheta verde e assinatura Saúde Pet |
| PER-099 | Meu cachorro está com sangue nas fezes | Tutor leva registro anotado à consulta, cão ao lado; nenhum excremento ou sangue explícito | Desenho documental contido | 4:3 | Pasta laranja e marca original |
| PER-100 | Meu cachorro está com a barriga inchada e dura | Tutor atento ao cão parado junto à saída, chave e telefone indicam busca de atendimento | Cena ilustrada de decisão urgente | 3:2 | Guia verde e chaveiro Saúde Pet |
| PER-101 | Meu gato está tentando urinar e não sai nada | Caixa de areia em primeiro plano, gato acompanhado pelo tutor que prepara transporte e contato | Fotografia editorial sem sofrimento encenado | 4:5 | Caixa verde e manta laranja |
| PER-102 | Meu pet caiu da janela ou da altura | Janela e caixa de transporte em planos distintos, tutor procura ajuda; nenhuma queda ou movimentação insegura | Ilustração de ambiente após incidente | 3:2 | Caixa verde com símbolo oficial |
| PER-103 | Meu pet foi atropelado, o que fazer até chegar ajuda | Rua interrompida ao fundo e pessoa ao telefone em local protegido; não mostrar impacto nem ensinar remoção | Ilustração documental de acolhimento | 16:9 | Roupa verde e nome Saúde Pet |
| PER-104 | Meu pet está com o olho fechado e lacrimejando | Pet acompanhado e anotação do tutor ao lado, sem colírio ou manipulação do olho | Retrato ilustrado sensível | 1:1 | Fundo claro e assinatura verde |

## Glossário: 114 direções propostas

### Consulta e exames: 14 verbetes

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| GLO-001 | Anamnese | Uma conversa vira mapa de lembranças do tutor, com comida, sono e passeio em pequenos recortes | Colagem de memórias | 4:5 | Fio verde e título Saúde Pet |
| GLO-002 | Ausculta | Estetoscópio em repouso forma curva junto ao retrato do pet, destacando escuta sem posição clínica inventada | Fotografia de objeto e retrato | 1:1 | Tubo verde e detalhe laranja |
| GLO-003 | Palpação | Mãos adultas em gesto de cuidado próximas ao pet, lupa editorial representa a avaliação profissional | Desenho em grafite e cor | 3:2 | Lupa laranja e assinatura verde |
| GLO-004 | Hemograma | Pequenas formas celulares sobre papel de exame neutro, como uma página de atlas sem valores | Gravura científica a revisar | 4:3 | Contornos tinta e etiquetas verdes |
| GLO-005 | Bioquímico | Tubo de amostra ilustrativo e série de campos vazios sugerem informações diferentes de um mesmo exame | Natureza-morta de laboratório desenhada | 4:5 | Suporte verde e nome Saúde Pet |
| GLO-006 | Urinálise | Frasco opaco de coleta e ficha de laboratório sem resultado, cena limpa e sem aparência de diagnóstico | Fotografia editorial de bancada | 1:1 | Bandeja laranja e pequeno logo |
| GLO-007 | Raio X | Silhueta de cão ao lado de radiografia claramente esquemática separada, anatomia submetida à revisão | Desenho luminoso sobre fundo escuro | 3:2 | Fundo tinta e filete verde |
| GLO-008 | Ultrassom | Ondas abstratas encontram uma tela de desenho, mostrando princípio sem reproduzir exame real | Ilustração de ciência em papel | 4:3 | Ondas verdes e base laranja |
| GLO-009 | Jejum pré-exame | Um lembrete sai de dentro de uma agenda e aponta à tigela guardada, sem número de horas | Recorte de papel tridimensional | 4:5 | Agenda verde e lembrete laranja |
| GLO-010 | Prontuário | Livro se abre em várias camadas de acompanhamento, sem registros de pacientes fictícios | Livro escultórico em miniatura | 2:3 | Capa verde com nome Saúde Pet |
| GLO-011 | Receita veterinária | Folha sem prescrição recebe uma dobra elegante junto a uma caneta, com campos claramente ilustrativos | Fotografia minimalista de papel | 1:1 | Caneta laranja e assinatura Saúde Pet |
| GLO-012 | Encaminhamento | Duas portas de atendimento conectadas por um caminho acompanhado por tutor e pet | Ilustração arquitetônica em miniatura | 16:9 | Caminho verde e portas laranja |
| GLO-013 | Segunda opinião | Dois pares de mãos profissionais organizam perguntas ao redor do mesmo histórico, sem disputa visual | Ilustração editorial de colaboração | 4:3 | Pasta verde e detalhes laranja |
| GLO-014 | Sinais vitais | Respiração, pulso e temperatura como três objetos de observação em torno de um animal em repouso | Diagrama ilustrado a revisar | 1:1 | Traços verdes e nome Saúde Pet |

### Vacinas e prevenção: 12 verbetes

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| GLO-015 | Vacina polivalente (V8 e V10) | Cartões V8 e V10 saem de uma carteira vacinal com perguntas, sem associar número a superioridade | Colagem de tipografia e papel | 4:5 | Carteira verde e abas laranja |
| GLO-016 | Antirrábica | Tutor segura carteira de vacinação diante de cão e gato, prevenção como ato cotidiano | Retrato documental ilustrado | 3:2 | Capa laranja e logo original |
| GLO-017 | Reforço vacinal | Marcador atravessa duas páginas de agenda relacionadas, sem periodicidade preenchida | Fotografia de agenda em detalhe | 1:1 | Fita verde e nome Saúde Pet |
| GLO-018 | Imunidade materna | Mãe e filhote em descanso, uma camada translúcida sugere proteção sem torná-la absoluta | Aquarela com veladura | 3:2 | Veladura verde suave e detalhe laranja |
| GLO-019 | Janela imunológica | Janela de papel entre duas páginas de calendário, com pet fora da metáfora para evitar falsa barreira física | Metáfora editorial em recorte | 4:5 | Moldura verde e assinatura Saúde Pet |
| GLO-020 | Vermifugação | Caminho de acompanhamento liga casa e consulta, um caderno reúne dúvidas de prevenção | Desenho de mapa de rotina | 4:3 | Rota laranja e casa verde |
| GLO-021 | Endoparasita (verme interno) | Silhueta de animal e lupa separada com verme esquemático, sem escala enganosa ou invasão gráfica | Atlas didático a revisar | 1:1 | Contornos tinta e lupa verde |
| GLO-022 | Ectoparasita (parasita de pele) | Pelagem desenhada como paisagem ampliada com parasita em vinheta, claramente mudança de escala | Gravura de textura a revisar | 4:3 | Vinheta laranja e nome Saúde Pet |
| GLO-023 | Antipulgas | Pet descansando perto da agenda e embalagem neutra fechada, foco no acompanhamento individual | Ilustração doméstica em guache | 3:2 | Agenda verde e caixa laranja |
| GLO-024 | Carrapaticida | Carrapato ilustrado ao lado de rótulo sem substância, associado à leitura orientada do produto | Cartaz de objeto ampliado | 4:5 | Etiquetas verdes e assinatura Saúde Pet |
| GLO-025 | Profilaxia (prevenção) | Pequenos cuidados cotidianos compõem degraus confortáveis rumo ao passeio do pet | Diorama de escada de papel | 4:3 | Degraus verdes e patamar laranja |
| GLO-026 | Titulação de anticorpos | Lente sobre amostra ilustrativa e laudo sem número, enfatizando medição profissional | Desenho científico elegante | 1:1 | Lente verde e título Saúde Pet |

### Alimentação: 12 verbetes

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| GLO-027 | Categorias da ração impressas no saco (econômica, comum, premium e super premium) | Palavras recortadas de uma embalagem fictícia se organizam para leitura, sem pódio de marcas | Tipografia editorial de rótulo | 2:3 | Papel verde, grifos laranja e nome Saúde Pet |
| GLO-028 | Alimento úmido | Textura de alimento em colher própria para servir, recipiente ao lado, nenhum ingrediente terapêutico inventado | Fotografia macro | 1:1 | Recipiente verde e base clara |
| GLO-029 | Alimento coadjuvante | Alimento e plano de acompanhamento em duas páginas complementares, sem confundir com cura | Colagem de caderno | 4:3 | Divisória verde e marcador laranja |
| GLO-030 | Ração terapêutica | Pacote neutro e pergunta individual escrita pelo tutor sobre uma mesa de consulta | Desenho editorial de natureza-morta | 4:5 | Pasta verde com Saúde Pet |
| GLO-031 | Palatabilidade (o quanto o animal aceita) | Gato cheira a tigela com expressão de avaliador, sem legenda que confunda preferência e qualidade | Cartum de degustação | 1:1 | Tigela laranja e assinatura verde |
| GLO-032 | Escore de condição corporal | Visões superior e lateral em folha de observação, esquema a revisar em vez de “corpo ideal” genérico | Prancha ilustrada | 4:3 | Linhas tinta e focos verdes |
| GLO-033 | Necessidade energética diária | Passeio, descanso e idade surgem como peças ao redor da tigela, sem cálculo ou fórmula inventados | Colagem geométrica | 1:1 | Peças verdes e laranja, símbolo oficial |
| GLO-034 | Transição alimentar | Duas texturas de ração conectadas por caminho gradual de recipientes neutros | Fotografia de sequência a revisar | 16:9 | Caminho laranja e fundo verde suave |
| GLO-035 | Suplemento | Frasco fechado cercado de perguntas, longe da tigela; o foco é necessidade, não consumo automático | Cartaz editorial tipográfico | 4:5 | Interrogações verdes e nome Saúde Pet |
| GLO-036 | Probiótico | Jardim microscópico abstrato dentro de lupa separada do animal, sem prometer regeneração do intestino | Ilustração científica poética a revisar | 1:1 | Lupa verde e pequenos pontos laranja |
| GLO-037 | Alimentação natural | Ingredientes e ficha de formulação profissional separados, evitando receita improvisada visual | Natureza-morta culinária | 3:2 | Toalha verde e assinatura Saúde Pet |
| GLO-038 | Petisco funcional | Pequeno petisco com lupa sobre o rótulo, destacando a pergunta “qual função?” em texto editável | Fotografia de produto com desenho | 1:1 | Lupa laranja e nome verde |

### Sinais e sintomas: 16 verbetes

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| GLO-039 | Letargia (apatia) | Brinquedo que normalmente atrai atenção permanece no chão enquanto tutor observa o pet quieto | Pintura narrativa de interior | 3:2 | Brinquedo laranja e manta verde |
| GLO-040 | Prostração | Pet em repouso com tutor próximo buscando ajuda, cena contida sem dramatização corporal | Ilustração acolhedora em pastel | 4:5 | Manta verde e nome Saúde Pet |
| GLO-041 | Prurido (coceira) | Traços repetidos junto à pelagem sugerem incômodo e observação, sem feridas ou coceira cômica | Desenho de textura em lápis | 1:1 | Traços verdes e ponto laranja |
| GLO-042 | Êmese (vômito) | Tutor anota um episódio no diário ao lado do pet, sem vômito exposto nem medicamento | Colagem de registro cotidiano | 4:3 | Caderno verde e assinatura Saúde Pet |
| GLO-043 | Regurgitação | Duas setas de observação em esquema digestivo separado, revisão veterinária antes da imagem instrutiva | Prancha didática sóbria | 4:5 | Setas laranja e contornos tinta |
| GLO-044 | Disenteria | Pasta de consulta e registro do tutor com pet acompanhado, sem imagens de excreções | Fotografia editorial de acompanhamento | 3:2 | Pasta verde e nome Saúde Pet |
| GLO-045 | Poliúria (urinar demais) | Diário com múltiplos registros simbólicos de ida ao local de higiene, sem volume universal | Ilustração de agenda de observação | 4:5 | Marcações verdes e detalhes laranja |
| GLO-046 | Polidipsia (beber demais) | Tigela e jarra de reposição ao lado do caderno onde tutor observa mudanças, sem escala normal fixa | Natureza-morta com luz natural | 1:1 | Tigela verde e assinatura laranja |
| GLO-047 | Anorexia (parar de comer) | Tigela disponível, gato afastado e tutor atento; tratamento visual sério e sem “gato exigente” | Ilustração narrativa sensível | 3:2 | Tigela verde e nome Saúde Pet |
| GLO-048 | Dispneia (falta de ar) | Silhueta em repouso e espaço de ar visual amplo, tutor buscando atendimento; sem simular crise | Cartaz sóbrio de reconhecimento | 4:5 | Fundo claro, linha verde, marca legível |
| GLO-049 | Cianose (mucosa azulada) | Amostra de cor ilustrativa em folha de consulta, afastada do retrato; cor clínica exige revisão | Prancha de referência a revisar | 1:1 | Moldura verde e assinatura Saúde Pet |
| GLO-050 | Icterícia (amarelado) | Lupa sobre ficha de observação com referência amarela revisável, sem tingir artificialmente todo o pet | Ilustração clínica contida | 4:3 | Lupa tinta e marca verde |
| GLO-051 | Ascite (barriga com líquido) | Silhueta anatômica em papel translúcido separada do tutor e do animal real | Desenho científico a revisar | 4:5 | Papel claro e contornos verdes |
| GLO-052 | Claudicação (mancar) | Sequência de pegadas com uma pausa e tutor acompanhando o cão em piso estável | Ilustração de movimento respeitosa | 16:9 | Pegadas laranja e guia verde |
| GLO-053 | Tenesmo (força para evacuar) | Local de higiene e caderno de observação, pet acompanhado; sem cena de esforço exposta | Desenho de ambiente em guache | 4:3 | Caixa verde e nome Saúde Pet |
| GLO-054 | Mucosa pálida | Ficha de avaliação com área de comparação claramente ilustrativa, sem instruir exame oral pela capa | Ilustração de consulta a revisar | 1:1 | Faixa verde e detalhe laranja |

### Pele, ouvido e boca: 10 verbetes

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| GLO-055 | Dermatite | Retrato de cão com textura de pelo ampliada em desenho ao lado, sem lesão sensacionalista | Colagem de retrato e atlas | 4:5 | Janela verde e assinatura Saúde Pet |
| GLO-056 | Piodermite | Folha de consulta com lupa de pele esquemática, revisão antes de representar alterações | Desenho clínico em aquarela | 4:3 | Lupa laranja e linhas tinta |
| GLO-057 | Micose | Pelagem, ambiente e lupa microscópica como três pistas separadas, sem associar qualquer círculo à doença | Gravura editorial a revisar | 1:1 | Molduras verdes e nome Saúde Pet |
| GLO-058 | Sarna sarcóptica | Ácaro esquemático ampliado numa página de atlas e animal em retrato digno | Prancha científica a revisar | 4:5 | Etiqueta verde e filete laranja |
| GLO-059 | Sarna demodécica | Estudo de folículo e ácaro em folha distinta, sem imagem intercambiável com sarna sarcóptica | Desenho técnico a revisar | 4:3 | Contornos tinta e foco verde |
| GLO-060 | Atopia (alergia ambiental) | Poeira, pólen e ambiente como recortes em torno do pet, sem concluir causa só pela imagem | Colagem de ambiente | 3:2 | Recortes verdes e pequenos pontos laranja |
| GLO-061 | Otite | Orelha natural em detalhe, com veterinária observando ao fundo; nenhum cotonete introduzido | Fotografia documental de detalhe | 1:1 | Fundo verde suave e nome Saúde Pet |
| GLO-062 | Tártaro | Escova em repouso ao lado de esquema de dente isolado, cálculo representado só após revisão | Desenho de guia de cuidado | 4:5 | Escova verde e legenda tinta |
| GLO-063 | Doença periodontal | Camadas de dente e gengiva em papel recortado, estrutura anatômica a revisar | Diorama didático | 4:3 | Base verde e marcadores laranja |
| GLO-064 | Halitose (mau hálito) | Tutor percebe mudança durante contato com o pet e anota a dúvida, sem nuvem verde de mau cheiro | Ilustração de convivência respeitosa | 3:2 | Caderno laranja e nome Saúde Pet |

### Aparelho digestivo e urinário: 10 verbetes

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| GLO-065 | Gastrite | Estômago esquemático em uma página de caderno, tutor e pet fora da sobreposição anatômica | Ilustração científica em lápis | 4:5 | Papel claro e contorno verde |
| GLO-066 | Enterite | Percurso intestinal desenhado como fita de papel, sem representar sintomas gráficos | Escultura didática de papel a revisar | 1:1 | Fita verde com pontos laranja |
| GLO-067 | Pancreatite | Pequeno mapa anatômico destaca localização do pâncreas após revisão, sem prato gorduroso como causa única | Atlas ilustrado | 4:3 | Realce laranja, contornos tinta e marca |
| GLO-068 | Obstrução intestinal | Caminho de papel interrompido por objeto abstrato, acompanhado de chamado à orientação no artigo | Metáfora editorial sóbria | 4:5 | Caminho verde e bloqueio laranja |
| GLO-069 | Torção gástrica | Página de emergência com esquema profissional a revisar; sem humor de “nó” ou pet brincando | Desenho clínico de alerta | 4:3 | Contorno tinta e marca verde |
| GLO-070 | Cistite | Caixa de areia e ficha de observação, detalhe da bexiga em vinheta anatômica revisável | Ilustração contextual felina | 1:1 | Caixa verde e vinheta laranja |
| GLO-071 | Urolitíase (cálculo urinário) | Cristais desenhados como amostras científicas dentro de lupa, sem aparência de pedras gigantes no pet | Gravura científica a revisar | 4:5 | Lupa verde e assinatura Saúde Pet |
| GLO-072 | Obstrução uretral | Tutor prepara busca imediata de atendimento ao lado da caixa de areia e do gato acompanhado | Ilustração narrativa séria | 3:2 | Transporte verde e manta laranja |
| GLO-073 | Insuficiência renal | Dois rins em estudo anatômico separado de cena de rotina acompanhada, sem prometer reversão | Díptico científico e cotidiano | 16:9 | Linha de união verde e nome Saúde Pet |
| GLO-074 | Uremia | Laudo sem valores e conversa veterinária, com pequenas referências abstratas ao acompanhamento renal | Colagem editorial de consulta | 4:3 | Pasta verde e clipe laranja |

### Coração e respiração: 8 verbetes

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| GLO-075 | Sopro cardíaco | Estetoscópio e onda sonora desenhada, sem simular eletrocardiograma diagnóstico | Fotografia com desenho sonoro | 1:1 | Onda verde e fundo tinta |
| GLO-076 | Insuficiência cardíaca | Coração anatômico em papel translúcido acompanhado do caderno de acompanhamento do tutor | Ilustração científica acolhedora | 4:5 | Caderno verde e símbolo original |
| GLO-077 | Taquicardia | Traços curtos sugerem ritmo ao redor de relógio sem frequência clínica prescrita | Cartaz de ritmo visual | 1:1 | Traços laranja sobre tinta e nome Saúde Pet |
| GLO-078 | Traqueia colapsada | Traqueia desenhada em esquema lateral distinto do retrato do cão, revisão anatômica obrigatória | Prancha explicativa a revisar | 4:3 | Destaque verde e linhas tinta |
| GLO-079 | Tosse dos canis | Cães separados por espaço confortável num passeio, tutor registra tosse sem diagnosticar pelo cenário | Aquarela documental | 3:2 | Guias verdes e cachecol laranja |
| GLO-080 | Rinotraqueíte felina | Gato em ambiente confortável durante acompanhamento, papel de orientação sem prescrição aparente | Retrato ilustrado em pastel | 4:5 | Cama verde e nome Saúde Pet |
| GLO-081 | Edema pulmonar | Pulmões esquemáticos em folha de avaliação de emergência, sem cena de asfixia | Ilustração clínica sóbria a revisar | 4:3 | Fundo claro e contornos verdes |
| GLO-082 | Nebulização | Equipamento em repouso sobre mesa da consulta, sem improvisar máscara ou tenda de aplicação | Fotografia de equipamento editorial | 1:1 | Toalha verde e etiqueta Saúde Pet |

### Doenças com nome próprio: 12 verbetes

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| GLO-083 | Parvovirose | Filhote protegido em local tranquilo com tutor buscando avaliação, vacinação em caderno ao lado | Ilustração de cuidado sem dramatização | 4:5 | Caderno verde e manta laranja |
| GLO-084 | Cinomose | Tutor e veterinária observam histórico do cão, três perguntas visuais sem sintetizar sintomas em diagnóstico | Colagem documental | 4:3 | Pasta verde e nome Saúde Pet |
| GLO-085 | Leptospirose | Marca da água na rua e passeio em trajeto seco, ambiente explica exposição sem animal em enchente | Gravura urbana de chuva | 16:9 | Capa laranja e rota verde |
| GLO-086 | Raiva | Carteira de prevenção guardada junto à guia, cuidado responsável sem imagem de animal agressivo | Natureza-morta documental | 1:1 | Capa verde com logo oficial |
| GLO-087 | Leishmaniose | Inseto em ilustração ampliada separada da paisagem e do pet, espécie e escala a revisar | Prancha de campo ilustrada | 4:5 | Legenda verde e detalhe laranja |
| GLO-088 | Giárdia | Gota d'água ampliada como lente com organismo esquemático, sem sugerir que toda água está contaminada | Ilustração científica de lupa | 1:1 | Borda verde e nome Saúde Pet |
| GLO-089 | Erliquiose | Carrapato em vinheta separada de exame e acompanhamento, sem vincular qualquer picada a diagnóstico | Colagem de atlas e consulta | 4:3 | Vinheta laranja e pasta verde |
| GLO-090 | Vírus da imunodeficiência felina (FIV) | Gato adulto em retrato afetuoso junto da sigla explicada em texto editável, sem estigma visual | Retrato pintado com tipografia | 4:5 | Nome Saúde Pet verde e detalhe laranja |
| GLO-091 | Vírus da leucemia felina (FeLV) | Tutor acolhe gato em casa e segura informação de acompanhamento, sem “gato condenado” | Fotografia editorial sensível | 3:2 | Manta verde e assinatura Saúde Pet |
| GLO-092 | Diabetes | Diário de água, alimentação e acompanhamento ao lado do pet, sem insulina ou dose sendo aplicada | Desenho de rotina organizada | 4:3 | Agenda verde e caneta laranja |
| GLO-093 | Hiperadrenocorticismo (doença de Cushing) | Nome extenso se abre em pequenas perguntas de consulta e silhueta endócrina a revisar | Tipografia ilustrada explicativa | 2:3 | Título tinta, abas verdes e marca |
| GLO-094 | Hipotireoidismo | Pequena glândula em lupa científica separada de retrato do cão, sem equiparar preguiça à doença | Atlas editorial a revisar | 1:1 | Lupa verde e assinatura laranja |

### Reprodução e castração: 8 verbetes

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| GLO-095 | Cio | Cadela em rotina de passeio supervisionado, agenda sem data ao lado | Ilustração em guache | 3:2 | Guia verde e caderno laranja |
| GLO-096 | Gestação | Cadela em ambiente confortável com acompanhamento anotado, sem ninhada numerosa idealizada | Retrato editorial em aquarela | 4:5 | Cama verde e nome Saúde Pet |
| GLO-097 | Distocia (parto difícil) | Tutor ao telefone e bolsa de atendimento preparada, sem mostrar parto ou ensinar manobra | Cena ilustrada de busca de ajuda | 4:3 | Bolsa verde e detalhe laranja |
| GLO-098 | Falsa gravidez | Cadela e objeto de apego num canto acolhedor, tutor observando sem humanização cômica | Pintura de interior em pastel | 1:1 | Manta verde e nome Saúde Pet |
| GLO-099 | Piometra (infecção no útero) | Esquema uterino revisável em página de consulta, animal apenas em retrato separado | Ilustração clínica sóbria | 4:5 | Traço tinta e marcador verde |
| GLO-100 | Criptorquidismo (testículo que não desceu) | Diagrama anatômico minimalista em folha explicativa, revisão profissional antes de qualquer setagem | Desenho técnico a revisar | 4:3 | Setas verdes e assinatura Saúde Pet |
| GLO-101 | Ovariohisterectomia (castração da fêmea) | Termo se conecta a perguntas pré-operatórias num caderno, sem cena cirúrgica | Colagem de consulta informada | 4:5 | Caderno verde e grifo laranja |
| GLO-102 | Orquiectomia (castração do macho) | Palavra em texto editável acompanha tutor e cão na conversa de avaliação, sem instrumento invasivo | Ilustração editorial de consulta | 3:2 | Prancheta laranja e nome Saúde Pet |

### Cirurgia, dor e fim de vida: 12 verbetes

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| GLO-103 | Anestesia | Equipe explica o planejamento com pet acordado e equipamentos ao fundo, sem sugerir ausência de risco | Ilustração documental serena | 3:2 | Pasta verde e símbolo oficial |
| GLO-104 | Analgesia (controle da dor) | Pet descansando confortavelmente após orientação e tutor junto, sem promessa de cura visível | Pintura digital acolhedora | 4:5 | Manta verde e pequeno detalhe laranja |
| GLO-105 | Anti-inflamatório | Embalagem neutra fechada junto de pergunta escrita para o veterinário, sem dose nem remédio humano | Fotografia de papel e objeto | 1:1 | Caderno laranja e assinatura verde |
| GLO-106 | Corticoide | Lupa sobre orientações fictícias sem prescrição, destacando acompanhamento individual | Colagem editorial de consulta | 4:3 | Lupa verde e nome Saúde Pet |
| GLO-107 | Antibiótico | Calendário de acompanhamento em branco e embalagem neutra, sem cápsulas formando brinquedo | Natureza-morta sóbria | 4:5 | Capa verde e clipe laranja |
| GLO-108 | Neoplasia (tumor) | Mãos apoiadas durante conversa veterinária e folha com pergunta, sem massa corporal visível | Fotografia de escuta e acolhimento | 3:2 | Manga verde e nome Saúde Pet discreto |
| GLO-109 | Lipoma | Pequeno esquema sob a pele em folha separada, evitando “caroço é benigno” como mensagem visual | Desenho anatômico a revisar | 1:1 | Linhas tinta, realce verde e marca |
| GLO-110 | Metástase | Mapa anatômico sóbrio revisável com pontos e conexões discretos, sem metáfora de explosão | Ilustração científica contida | 4:3 | Conexões verdes e assinatura Saúde Pet |
| GLO-111 | Quimioterapia | Tutor e pet acompanhados por profissional em conversa, sem sofrimento encenado nem tratamento como batalha | Retrato documental sensível | 4:5 | Poltrona verde e detalhe laranja suave |
| GLO-112 | Cuidado paliativo | Casa adaptada com cama acessível, água e companhia próxima, dignidade no cotidiano | Aquarela de interior | 16:9 | Manta verde e assinatura discreta |
| GLO-113 | Qualidade de vida | Três pequenos momentos possíveis: comer com apoio, descansar e receber carinho, sem nota automática | Tríptico ilustrado afetuoso | 16:9 | Fio verde entre cenas e nome Saúde Pet |
| GLO-114 | Eutanásia | Mão do tutor junto ao pet em descanso, muito espaço e luz natural, sem seringa ou símbolo de culpa | Fotografia editorial contemplativa | 3:2 | Tecido verde suave e assinatura discreta |

## Trilha: 12 aberturas de módulo propostas

Estas artes apresentam **módulos**. A coluna de aulas registra o intervalo do calendário,
não representa 52 títulos já definidos. Cada aula receberá sua própria direção quando
pergunta, objetivo e conteúdo estiverem disponíveis; não repetir a abertura em todas as aulas.

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| TRI-M01 | Antes de ter um pet, aulas 1 a 4 | Pessoa imagina sua semana numa planta de casa com espaços para espécie, porte e orçamento; animal ainda como possibilidade | Ilustração editorial de planejamento | 16:9 | Planta verde e perguntas laranja |
| TRI-M02 | Os primeiros trinta dias, aulas 5 a 8 | Porta se abre para um novo animal, caixa de transporte e cantinho preparados; descoberta com calma | Livro ilustrado de chegada | 4:5 | Porta laranja e cantinho verde |
| TRI-M03 | Alimentação, aulas 9 a 13 | Bancada de cozinha-laboratório doméstico com rótulo, balança e diferentes texturas, sem receita nutricional implícita | Diorama de estudo culinário | 4:3 | Bancada verde com nome Saúde Pet |
| TRI-M04 | Prevenção, aulas 14 a 18 | Calendário vazio se desdobra em caminho entre casa, passeio e consulta, sem periodicidades inventadas | Escultura em papel | 2:3 | Caminho verde e abas laranja |
| TRI-M05 | Higiene e rotina, aulas 19 a 22 | Pequeno armário de cuidado abre como uma caixa de ferramentas gentil, pet observa ao lado | Ilustração de inventário doméstico | 1:1 | Armário verde e assinatura Saúde Pet |
| TRI-M06 | Comportamento, aulas 23 a 27 | Uma casa com cômodos revela descanso, brincadeira e comunicação entre tutor e animal | História em quadrinhos de ambiente | 16:9 | Balões laranja e objetos verdes |
| TRI-M07 | Emergências, aulas 28 a 32 | Tutor organiza contato, transporte e informações com calma, nenhuma emergência encenada | Fotografia narrativa de preparação | 3:2 | Transporte verde e caderno Saúde Pet |
| TRI-M08 | O corpo por sistemas, aulas 33 a 38 | Atlas se abre em folhas translúcidas de sistemas, cada anatomia precisa de revisão profissional | Ilustração científica em camadas | 4:5 | Índice verde, abas laranja e logo |
| TRI-M09 | Doenças crônicas, aulas 39 a 43 | Rotina acompanhada cabe numa mesa e numa caminhada, com espaço para vida além da agenda clínica | Colagem de cotidiano possível | 4:3 | Agenda verde e guia laranja |
| TRI-M10 | O pet idoso, aulas 44 a 47 | Casa vista ao nível do pet: rampa, piso firme, cama e companhia, com luz de fim de tarde | Cenário pintado acolhedor | 16:9 | Almofada verde e luz laranja |
| TRI-M11 | Reprodução e castração, aulas 48 a 50 | Tutor chega à conversa com perguntas e sai com entendimento registrado, sem decisão forçada na imagem | Díptico de ilustração documental | 3:2 | Prancheta verde e nome Saúde Pet |
| TRI-M12 | Fim de vida, aulas 51 a 52 | Álbum e espaço de companhia em luz suave; uma mão preserva a lembrança sem antecipar perda | Aquarela e colagem de memória | 4:5 | Fita verde suave e assinatura discreta |

## Mitos: 12 direções propostas

O humor questiona a frase popular. A imagem não pode fazer a alegação falsa parecer uma
recomendação: o veredito vem do texto revisado, em elemento editável, nunca presumido pelo gerador.

| ID | Tema do calendário | Ideia visual específica | Linguagem | Proporção | Referência de marca |
|---|---|---|---|---|---|
| MIT-001 | Focinho quente é febre | Cão observa um termômetro desenhado como detetive de uma pista insuficiente; sem temperatura inferida do focinho | Cartum de investigação | 1:1 | Lupa verde e nome Saúde Pet |
| MIT-002 | Cachorro enxerga em preto e branco | Cão diante de duas janelas de cor, uma caricaturalmente monocromática e outra revisada para a explicação | Colagem óptica educativa | 16:9 | Moldura Saúde Pet fora da simulação de visão |
| MIT-003 | Gato tem sete vidas | Gato com sete cartões de “vida” de jogo fictício, seis claramente de papel; brincadeira não mostra perigo | Arte de jogo em pixels autoral | 1:1 | Interface decorativa verde e laranja, nome Saúde Pet |
| MIT-004 | Um ano de cachorro é sete de gente | Régua com multiplicação desenhada de forma torta e cães em fases distintas, questionando equivalência linear | Cartaz escolar com humor | 4:5 | Giz verde, números laranja e assinatura |
| MIT-005 | Cachorro come grama porque está doente | Cão “botânico” olha grama pela lupa, tutor segura uma lista de possíveis perguntas, sem causa única | Ilustração de expedição de jardim | 3:2 | Lupa laranja e caderno Saúde Pet verde |
| MIT-006 | Gato sempre cai de pé | Gato sentado em chão firme diante de um cartaz de acrobacia riscado; nenhuma queda ou teste | Colagem de cartaz de circo crítico | 4:5 | Faixa verde e assinatura laranja |
| MIT-007 | Castração deixa o animal gordo e preguiçoso | Cão ao lado de agenda de passeio e tigela medida, enquanto frase popular aparece como balão a questionar | Quadrinho de rotina | 4:3 | Balão verde e guia laranja |
| MIT-008 | Leite é bom para gato | Gato rejeita o papel de mascote de uma caixa de leite fictícia e escolhe descansar junto da água | Meme ilustrado autoral | 1:1 | Caixa com detalhe laranja e tigela verde |
| MIT-009 | Osso é a melhor brincadeira | Vitrine de brinquedos adequados e osso isolado como peça de museu do clichê, sem mastigação | Diorama de museu bem-humorado | 4:3 | Placa Saúde Pet verde e pedestal laranja |
| MIT-010 | Vermífugo é só para filhote | Cão adulto tenta caber numa foto antiga de filhote enquanto tutor abre calendário de acompanhamento | Colagem de álbum com humor gentil | 4:5 | Álbum verde e fita laranja |
| MIT-011 | Animal de dentro de casa não precisa de antipulgas | Casa desenhada como castelo de almofadas e lupa mostra que rotina de prevenção também merece conversa | Cartum de fortaleza doméstica | 1:1 | Almofadas verdes e bandeira Saúde Pet |
| MIT-012 | Quem tem pet não pode ter bebê | Adultos organizam convivência com pet e berço separado; bebê nunca sozinho junto do animal | Ilustração familiar afetuosa | 3:2 | Manta verde, detalhe laranja e nome Saúde Pet |

## Critério para transformar direção em arquivo

1. Ler o post completo e ajustar a ideia ao conteúdo final; título sozinho não autoriza uma afirmação clínica.
2. Comparar com as artes vizinhas: se cenário, enquadramento e linguagem se repetirem sem motivo, refazer a ideia.
3. Gerar a composição individual do ID, com variação de animais, pessoas e ambientes coerente com o assunto.
4. Aplicar a marca oficial quando prevista, conferir anatomia, texto, mãos, objetos e contexto de cuidado.
5. Exportar o original e as versões de uso sem cortes destrutivos; registrar dimensões reais e descrição alternativa.
6. Registrar caminho, ID editorial e estado real: produzido, revisado, associado ou publicado são etapas diferentes.
7. Verificar a imagem no componente que a exibe. Cartaz vertical não pode virar capa horizontal cortada ao acaso.

Não existe obrigação de alternar fotografia, desenho e meme por ordem numérica. A linguagem
é escolhida pelo assunto e pela emoção adequada; repetição de um estilo só faz sentido quando
a nova composição tem algo próprio a dizer.
