# Fase 5: roteiro do teste ponta a ponta no celular real

O Roadmap (Fase 5) e o Todoist ("Portal do parceiro: comprovar no celular") pedem a mesma coisa:
uma pessoa, num aparelho de verdade, em produção, percorrendo a jornada inteira e guardando a
prova de cada passo. Este documento separa o que a automação já prova do que só o aparelho
prova, e dá o roteiro para quem for fazer.

## O que a automação prova (roda em toda entrega)

Suítes em `backend/tests/e2e`, contra o Postgres real, pelos mesmos endpoints que as telas usam:

| Suíte | Cobre | Casos |
| --- | --- | --- |
| `flows/complete-user-journey` | tutor cadastra, cria pet, abre chamado; vet aceita, desloca, atende, prontuário; avaliação; pagamento e repasse | 62 |
| `group/group_saudepet_complete_flow` | o mesmo fluxo com mais de um vet e disputa de chamado | (ver arquivo) |
| `notificacoes/notificacoes` | sino, lista, marcar lida, dono não lê a do outro | 13 |
| `mercado/assinatura` | loja, aprovação, assinatura de ração, ciclos, pausa, retomada | 13 |
| `mercado/loja-demonstracao` | loja de demonstração nunca é pública | 9 |

O que a automação **não** prova: tela no tamanho do celular, toque, PWA instalada, câmera para
foto e ditado, notificação push chegando com o app fechado, e o pagamento passando pelo Mercado
Pago de verdade.

## O que só o aparelho prova (Nicolas)

Pré-requisitos:

- Dois celulares (ou um celular e um navegador em modo celular): um logado como tutor, outro
  como veterinário. Contas reais, criadas pela tela de cadastro.
- Veterinário com configuração profissional completa e **online** em Curitiba. Os três chamados
  `sem_veterinario` no banco são tutores pedindo com ninguém online.
- Cartão de teste do Mercado Pago (o `GatewayConfig` de produção está em modo produção; para
  não cobrar de verdade, usar cartão de teste da conta ou valor mínimo e reembolsar depois).

Roteiro, com a prova esperada em cada passo:

| # | Quem | Faz | Prova |
| --- | --- | --- | --- |
| 1 | Tutor | Abre `saudepet.app.br`, toca "Entrar", escolhe "Tutor", cadastra-se, instala a PWA | print da tela inicial instalada, ícone do tutor |
| 2 | Tutor | Cadastra o pet com foto | print da ficha do pet |
| 3 | Vet | "Entrar" → "Veterinário", login, fica online | print do painel com "online" |
| 4 | Tutor | Abre chamado: tipo, descrição, foto, endereço | print da tela "procurando veterinário" |
| 5 | Vet | Recebe a notificação (sino e push), aceita | print da notificação no aparelho e do chamado aceito |
| 6 | Tutor | Vê o vet aceito e o deslocamento no mapa | print do mapa com o vet |
| 7 | Vet | Chega, inicia atendimento, dita o prontuário pelo microfone | print do prontuário preenchido pelo ditado |
| 8 | Vet | Encerra com valor | print do resumo |
| 9 | Tutor | Paga (PIX ou cartão de teste) | print do pagamento aprovado; `payment_id` no banco |
| 10 | Tutor | Avalia o vet | print da avaliação; nota no perfil do vet |
| 11 | Vet | Vê o repasse no financeiro | print do extrato |
| 12 | Parceiro | Login em `/parceiro`, vê indicação, confirma atendimento com valor, vê extrato | 5 prints (é o critério do Todoist) |

Registrar os prints em `docs/evidencias/fase5-<data>/` e anotar aqui o que quebrou, com prioridade.

## Dívidas encontradas durante a preparação (11/09)

- Loja de demonstração pública: corrigida no mesmo dia (portão estrutural).
- nginx perdendo o backend após recriar o container: corrigido no mesmo dia (`resolver`).
- Lojas antigas sem coordenada: script de preenchimento entregue (`scripts/geocodificar-lojas`).
