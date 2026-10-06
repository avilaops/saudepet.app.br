# Mercado: entrega, transportadora e Correios (estado em 11/09/2026)

Mapa do que existe no código, do que está ligado em produção e do que falta para o Mercado
enviar por Correios. Escrito para não prometer na tela o que a operação ainda não faz.

## Os quatro jeitos de o pedido chegar

| Tipo (`entrega_tipo`) | Quem faz | Como o frete é calculado | Estado em produção |
| --- | --- | --- | --- |
| `retirada` | tutor busca no balcão | zero | Funciona. As duas lojas aceitam. |
| `combinar` | loja e tutor combinam fora do app | zero, registrado como "a combinar" | Funciona. |
| `loja` (entrega própria) | a loja entrega | distância entre a coordenada da loja e o endereço do tutor: `frete_base + frete_por_km × km`, dentro de `entrega_raio_km`, grátis acima de `frete_gratis_acima` | Código pronto (`entrega.service`). Depende da loja ter coordenada; hoje nenhuma tem (ver `scripts/geocodificar-lojas`). |
| `transportadora` (PAC, SEDEX, Jadlog, Loggi) | CepCerto emite a etiqueta, a loja despacha | cotação na CepCerto pelo CEP de origem, CEP de destino, peso real dos itens e caixa da loja | Código pronto, **desligado**: sem `CEP_CERTO_POSTAGEM_API_KEY` no servidor, e nenhuma loja com `aceita_transportadora`. |

Correios entram pela transportadora: PAC e SEDEX são dois dos cinco serviços que a CepCerto
cota (`ServicoCepCerto` em `backend/src/services/cepcerto.service.ts`). Não existe integração
direta com a API dos Correios, e não precisa existir: a CepCerto é a conta única que paga a
etiqueta e devolve o rastreio.

## O fluxo da transportadora, ponta a ponta

1. **Loja habilita** no cadastro (`LojaCadastro.tsx`): liga `aceita_transportadora`, informa CEP de
   origem, CNPJ e as medidas da caixa (`embalagem_*_cm`). Cada produto precisa de `peso_gramas`.
2. **Tutor escolhe** "Transportadora" no carrinho (`TutorMercadoCarrinho.tsx`, só aparece se a loja
   aceita). O app chama `POST /api/v1/mercado/carrinhos/:lojaId/transportadoras`, que monta o
   pacote (`pacoteDoCarrinho`: soma dos pesos, limite de 30 kg, caixa entre os mínimos dos
   Correios) e cota na CepCerto (`cotarTransportadoras`).
3. **Fechamento** (`POST /api/v1/mercado/pedidos`): o serviço escolhido vira `frete_servico` e
   `frete_transportadora` no pedido; o valor entra no total.
4. **Pagamento** pelo Mercado Pago; o pedido vai a `pago`.
5. **Etiqueta**: a loja clica "Emitir etiqueta" no painel (`LojaPainel.tsx`), que chama
   `POST /api/v1/mercado/loja/pedidos/:id/etiqueta`. `emitirEtiquetaDoPedido` usa a chave
   `pedido-<uuid>` como idempotência na CepCerto, debita a carteira, grava `etiqueta_url` e
   `rastreio_codigo`, e registra o evento no pedido.
6. **Despacho**: com rastreio gravado, o painel oferece "Marcar como despachado"; sem rastreio, o
   pedido de transportadora não sai de `em_separacao` (`pedido.service`, linha ~655).
7. **Rastreio**: o código fica no pedido e aparece para tutor e loja. Não há consulta automática
   de movimentação nem atualização do pedido por evento dos Correios: a conclusão continua
   manual.

## O que falta para ligar

| Item | Quem | Observação |
| --- | --- | --- |
| Conta CepCerto com saldo e chave de postagem | Abraão (conta comercial) e Nicolas (`.env`) | A chave entra em `CEP_CERTO_POSTAGEM_API_KEY` no `backend/.env`; nunca no chat, nunca no git. |
| Decidir qual loja envia | Abraão | Casa de Rações está sem endereço e sem CEP; a transportadora exige CEP de origem e CNPJ. |
| Peso e caixa cadastrados | loja | Sem peso em cada item a cotação recusa com mensagem clara. |
| Rastreio automático | Dev, depois de existir envio real | Consultar a CepCerto por pedido despachado e concluir o pedido na entrega. Só vale construir com pedido de verdade circulando. |

## O que a interface promete hoje

- O botão "Transportadora" só aparece para loja com `aceita_transportadora`; como nenhuma tem, o
  tutor não vê a opção. Nada promete Correios sem a operação existir.
- Se a chave faltar com uma loja habilitada, a cotação responde 503 com "O frete por transportadora
  está temporariamente indisponível" e o carrinho mostra a mensagem, sem travar retirada e
  entrega própria.
