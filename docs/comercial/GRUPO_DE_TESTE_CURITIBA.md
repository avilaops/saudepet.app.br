# Grupo de teste de Curitiba: 10 veterinários e 10 tutores

Plano de 11/09/2026 para colocar gente de verdade usando o Saúde Pet em Curitiba e ver o
produto funcionar de ponta a ponta fora da equipe.

## Onde estamos

Levantado no banco de produção em 11/09:

| O quê | Hoje |
| --- | --- |
| Veterinários | 3, todos contas de teste da equipe, nenhum online, nenhum com CRMV do Paraná |
| Tutores | 7, todos contas da equipe |
| Cidades de cobertura | nenhuma. Sem Curitiba cadastrada, o app cobra a tabela padrão (R$ 150 consulta domiciliar, R$ 120 vacinação, R$ 80 teleorientação), usa raio de 20 km e 20% de comissão |

## Antes de convidar alguém (Nicolas)

1. **Rodar o roteiro da Fase 5 sozinho, num dia.** Está em `docs/FASE5_ROTEIRO_PONTA_A_PONTA.md`.
   São 20 pessoas que vão formar a primeira impressão do produto. Um erro que a equipe acharia
   em uma hora não pode ser o primeiro contato de um veterinário.
2. **Cadastrar Curitiba** em `saudepet.app.br/admin/cidades`: preço por tipo de atendimento, raio
   e comissão. O preço é decisão sua com o Abraão. Uma forma simples: perguntar aos três
   primeiros veterinários quanto cobram hoje por uma consulta em casa e usar a média.
3. **Decidir a condição do grupo de teste.** Recomendação abaixo.
4. **Aprovar credenciamento no mesmo dia** em `saudepet.app.br/admin/veterinarios`. O veterinário
   que pede e espera três dias desiste.

## Condição do grupo de teste (recomendação)

- **Veterinário:** comissão de 1% em Curitiba durante o teste e sem mensalidade do Clube Vet.
  Ele recebe 99% do que o tutor paga. É 1% e não 0% porque o sistema trata comissão zero como
  engano e grava 20% no lugar, de propósito (`admin-cidade.controller`). Se a decisão for zero
  de verdade, é mudança nessa regra, e pede ao Dev.
- **Tutor:** paga o preço normal da consulta, o mesmo que já pagaria ao veterinário. Nada a mais.
- **Prazo:** até 31/10/2026. Depois disso vale a regra comercial que estiver decidida, e o
  grupo fica sabendo antes.

Por que assim: não custa dinheiro da empresa, e o veterinário não perde nada por testar. O que
pedimos em troca é tempo e opinião sincera.

## Quem convidar

### Veterinários: os que já atendem em casa

O Saúde Pet é atendimento domiciliar. O melhor testador é quem já faz isso hoje, por conta
própria, com CRMV do Paraná. Clínica e hospital ficam para depois: têm balcão próprio e
decisão mais lenta.

Meta: abordar 30 para fechar 10. A lista de alvos, com contato público de cada um, está na
tarefa do Abraão no Todoist. As fontes foram os sites e perfis que os próprios profissionais
publicam:

- Exclusivamente domiciliares, com WhatsApp no site: LF VET, Collaço Vet, Dra. Janainna Mahs,
  A Saúde Felina, Dra. Gatos, Dra. Ariane Portela, Gabriella Lima (São José dos Pinhais).
- Perfis de Instagram: Veterinária em Domicílio Curitiba, Veterinárias em Casa.
- Autônomos listados no Cronoshare (dez nomes, por bairro) e no Snooter (oito nomes com
  atendimento domiciliar).

Ficam de fora do grupo: My Pet, Animal Save, Hospital Santa Mônica e Vidapet. Têm plano ou
serviço domiciliar próprio, então são concorrentes ou parceiros futuros, não testadores.

### Tutores: cada veterinário traz um cliente

O jeito mais seguro de o teste ter atendimento de verdade é o veterinário convidar um cliente
que ele já atende e que já precisa de vacina, avaliação ou consulta de rotina. Nesses três
tipos o tutor **escolhe o profissional** no app, então o pedido vai direto para o veterinário
que o convidou. É uma consulta que ia acontecer de qualquer jeito, agora passando pelo app.

Se faltar tutor:

- Rede pessoal do Nicolas e do Abraão em Curitiba.
- Agenda de feiras de adoção de Curitiba em
  [adotar.com.br](https://adotar.com.br/feiras-adocao/curitiba-pr), para abordagem com QR code.

O tutor precisa morar em Curitiba ou região e estar dentro do raio do veterinário.

## Passo a passo no app

**Veterinário**

1. Abre `saudepet.app.br/login?perfil=veterinario` e cria a conta (pode ser com Google).
2. Em Perfil, toca em "Pedir credenciamento", informa CRMV e UF (PR).
3. A equipe confere o CRMV e aprova. Ele recebe e-mail.
4. Completa o que o app pede antes de ficar online: endereço de atendimento, raio e conta para
   receber.
5. Fica online, ou espera o cliente escolher o nome dele.

**Tutor**

1. Abre `saudepet.app.br/login?perfil=tutor` e cria a conta.
2. Cadastra o pet.
3. Pede atendimento. Em vacinação, avaliação ou rotina, escolhe o veterinário que o convidou.
4. Paga pelo app, recebe o atendimento e avalia.

## Mensagens prontas

Quem envia é o Abraão, do número dele. Tom de conversa, sem promessa de volume.

**Primeira mensagem ao veterinário**

> Oi, Dra. [nome], tudo bem? Aqui é o Abraão, do Saúde Pet. Vi que você atende em casa aqui em
> Curitiba. Estamos montando um grupo pequeno de veterinários domiciliares para testar nosso
> app antes de abrir ao público: o tutor pede pelo app, você aceita, atende e recebe por lá, com
> prontuário e receita prontos no celular. Durante o teste [condição decidida pelo Nicolas,
> por exemplo: a comissão é de 1% e não há mensalidade]. Topa uma conversa de 15 minutos esta
> semana?

**Se não responder em 3 dias**

> Oi, Dra. [nome], passando só para não deixar a mensagem perdida. Se não for o momento, sem
> problema. Se quiser ver como funciona, te mando um vídeo de 2 minutos.

**O que o veterinário manda para o cliente**

> Oi, [nome]! Estou testando um app novo para marcar as consultas em casa, o Saúde Pet. A
> próxima vacina/consulta do [pet] pode ser marcada por lá? É o mesmo valor de sempre, e fica
> tudo registrado: histórico, receita e lembrete da próxima dose. O link é
> saudepet.app.br/login?perfil=tutor, e na hora de pedir você escolhe meu nome.

**Rede pessoal (tutor)**

> Oi, [nome]! Estou ajudando a testar um app de veterinário que vai em casa, aqui em Curitiba.
> Se o [pet] estiver precisando de vacina ou consulta nas próximas semanas, você toparia marcar
> por ele e me contar o que achou? É o preço normal da consulta.

## Combinado com quem entra

- É fase de teste: pode ter erro, e queremos saber de todos.
- Os dados são reais e seguem a política de privacidade (`saudepet.app.br/privacidade`).
- Grupo de WhatsApp "Saúde Pet: grupo de teste Curitiba" para dúvida e opinião, com o Abraão e
  o Nicolas.
- Ao fim de cada atendimento, três perguntas: o que travou, o que faltou, você usaria de novo?

## Cronograma

| Semana | O quê | Quem |
| --- | --- | --- |
| 15 a 19/09 | Roteiro da Fase 5, Curitiba cadastrada, condição decidida; primeiras 15 abordagens | Nicolas, Abraão |
| 22 a 26/09 | Mais 15 abordagens; meta de 10 veterinários credenciados; cada um convida um cliente | Abraão |
| 29/09 a 10/10 | Atendimentos reais pelo app; acompanhamento diário do grupo | Abraão, Nicolas |
| 13/10 | Consolidar o que travou e virar tarefa no Todoist | Nicolas |

## Como acompanhar

O funil sai do banco, não de planilha: veterinários com CRMV do PR (pediram, aprovados,
online), tutores com cidade Curitiba, atendimentos criados, pagos e avaliados. Pedir ao Dev o
retrato do dia.

| Etapa | Meta |
| --- | --- |
| Veterinários abordados | 30 |
| Responderam | 15 |
| Credenciamento pedido | 12 |
| Aprovados e com conta para receber | 10 |
| Tutores cadastrados em Curitiba | 10 |
| Atendimentos pagos pelo app | 10 |
| Avaliados | 10 |
