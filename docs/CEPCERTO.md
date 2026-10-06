# CepCerto no Saúde Pet Mercado

## O que está integrado

- Cotação no carrinho com PAC, SEDEX, Jadlog Package, Jadlog .COM e Loggi.
- Preço, prazo, peso e caixa recalculados pelo backend ao fechar o pedido.
- Frete da transportadora separado do repasse da loja.
- Emissão da etiqueta somente para pedido pago, com saldo conferido antes.
- Idempotência por `pedido-<uuid>` para retry não debitar duas vezes.
- Código de rastreio, etiqueta e declaração de conteúdo visíveis no pedido.

## Configuração segura

O backend lê `CEP_CERTO_POSTAGEM_API_KEY`. Em desenvolvimento, se a variável
não estiver no `backend/.env`, também procura `~/.avilaops/cepcerto.env`.
Produção deve guardar a variável em `/opt/saudepet/backend/.env`, com acesso
restrito, e recriar o container depois da alteração.

Nunca colocar a chave em variável `VITE_*`, resposta HTTP ou código do frontend.

## Habilitar uma loja

No cadastro da loja:

1. preencher CEP e número separados, CNPJ e telefone;
2. marcar **Envio nacional com CepCerto**;
3. informar altura, largura e comprimento da caixa padrão;
4. preencher o peso bruto de cada produto enviado.

O pacote aceita até 30 kg, lados de até 100 cm e soma das dimensões de até
200 cm. A caixa mínima é 2 × 11 × 16 cm.

## Fluxo operacional

1. O tutor informa o destino e escolhe uma cotação.
2. O servidor cota novamente, congela os dados e cria o pedido.
3. Depois do pagamento, a loja começa a separação.
4. A loja confirma **Emitir etiqueta**; a carteira é consultada e debitada.
5. A loja imprime etiqueta e declaração, posta o pacote e marca como despachado.

Se já existir código de rastreio, o cancelamento do pedido é bloqueado para não
deixar uma postagem ativa e um pagamento estornado ao mesmo tempo. A equipe
deve cancelar a postagem na CepCerto antes de cancelar o pedido.

## Próxima automação

O acompanhamento recorrente deve rodar no n8n: consultar o rastreio a cada
poucas horas e, somente quando o último evento mudar, avisar o tutor por Twilio
em “saiu para entrega”, “entregue”, “destinatário ausente” ou “aguardando
retirada”. O código de rastreio salvo no pedido é a fonte desse fluxo.
