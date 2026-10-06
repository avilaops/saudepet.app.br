# Saúde Pet Mercado — Assinatura de ração v1.0 (contrato)

Terceira fatia do Mercado. O tutor programa a cada quantos dias recebe a ração; a
loja define o desconto e o frete grátis de assinante; no dia, a plataforma gera um
**pedido comum** (mesmo estoque, mesma comissão, mesma fila da loja) e avisa o
tutor com o Pix pronto.

**Sem cobrança automática, de propósito.** O checkout não guarda cartão sem CVV e o
preapproval do Mercado Pago não está contratado. Quando um dos dois existir, o
worker passa a cobrar depois de fechar o pedido; nada mais muda.

Código: [`assinatura.service.ts`](../backend/src/services/mercado/assinatura.service.ts),
[`assinatura.worker.ts`](../backend/src/services/mercado/assinatura.worker.ts),
[`mercado-assinatura.schema.ts`](../backend/src/schemas/mercado-assinatura.schema.ts),
migration `20260829120000_mercado_assinatura`.

---

## 1. Modelo

```text
mercado_lojas            + aceita_assinatura (bool, false)
                         + assinatura_desconto_pct (decimal 5,2, 5)
                         + assinatura_frete_gratis (bool, false)

mercado_assinaturas      id, tenant_id, loja_id, tutor_id, pet_id?
                         status: ativa | pausada | cancelada
                         frequencia_dias (7..90), proximo_ciclo_em
                         entrega_tipo: retirada | combinar | loja  (+ cópia do endereço)
                         desconto_pct, frete_gratis        ← congelados no ato de assinar
                         ciclos_gerados, ciclos_pagos, ciclos_perdidos_seguidos
                         ultimo_pedido_id, ultimo_erro
                         pausada_em, cancelada_em, cancelado_motivo

mercado_assinatura_itens assinatura_id, produto_id, quantidade (1..10)   @@unique(assinatura, produto)

mercado_pedidos          + assinatura_id? (SetNull)  — o pedido de cada ciclo aponta para a assinatura
```

Migration aditiva: colunas novas com default, tabelas novas, FK opcional. Conferida
contra o Postgres com `prisma migrate diff` (sem diferença nas tabelas do mercado).

## 2. Estados

```text
                 criar (gera 1º ciclo)            3 vencidos seguidos
   ─────────────────────────────▶  ativa  ────────────────────────────▶  pausada
                                    ▲  │                                   │
                       retomar      │  │ pausar                            │ retomar
                                    │  ▼                                   │
                                  pausada ◀────────────────────────────────┘
                                    │
                        cancelar    ▼      (de ativa ou pausada)
                                cancelada  ── sem volta; pedidos já gerados continuam
```

- **Ciclo** (`gerarCiclo`): esvazia o carrinho da loja, adiciona os itens da assinatura,
  chama `fecharPedido` com `assinatura: { descontoPct, freteGratis, horasParaPagar: 24 }`,
  grava `ultimo_pedido_id`, `ciclos_gerados+1`, `proximo_ciclo_em = agora + frequência`,
  avisa por push + e-mail.
- **Ciclo que falha** (item saiu do catálogo, estoque zerado, fora do raio): `ultimo_erro`
  recebe o motivo, `proximo_ciclo_em = amanhã`. A assinatura não morre.
- **Pedido pago** (`marcarComoPago`): `ciclos_pagos+1`, `ciclos_perdidos_seguidos = 0`.
- **Pedido vencido** (`expirarPedidosVencidos`, 24 h): `ciclos_perdidos_seguidos+1`; no
  terceiro, `status = pausada` e aviso ao tutor.
- **Retomar**: zera perdidos; próximo ciclo = agora + frequência (não dispara pedido).
- **Mudar frequência**: reprograma a partir do **último** ciclo, nunca para o passado.

## 3. Cálculo do pedido do ciclo

```text
subtotal          = Σ preço vigente × quantidade
desconto          = subtotal × desconto_pct        (0..50%)
frete             = 0 se frete_gratis e entrega_tipo = loja; senão a cotação da loja
comissao_valor    = (subtotal − desconto) × comissão da loja     ← sobre o valor já com desconto
total             = subtotal − desconto + frete
repasse_loja      = total − comissao_valor
expira_em         = agora + 24 h                                  (compra avulsa: 60 min)
```

Exemplo verificado na E2E: saco R$ 200, 10% off, frete grátis, comissão 15% →
desconto 20, frete 0, total 180, comissão 27, repasse 153.

## 4. API (`/api/v1`, sessão de tutor — `isTutor`)

| Método | Rota | Corpo / query | Resposta |
| --- | --- | --- | --- |
| GET | `/mercado/assinaturas/sugestao` | `produto_id` (uuid), `pet_id?`, `quantidade?` (1..10) | `{ sugestao: { dias, consumo_diario_gramas } }` |
| POST | `/mercado/assinaturas` | ver **criar** abaixo | `201 { assinatura, pedido \| null }` |
| GET | `/mercado/assinaturas` | — | `{ assinaturas: Assinatura[] }` |
| GET | `/mercado/assinaturas/:id` | — | `{ assinatura, pedidos[≤12] }` (404 se de outro tutor) |
| PUT | `/mercado/assinaturas/:id` | `{ frequencia_dias?, itens?: [{ produto_id, quantidade }] }` (ao menos um) | `{ assinatura }` |
| POST | `/mercado/assinaturas/:id/pausar` | — | `{ assinatura }` |
| POST | `/mercado/assinaturas/:id/retomar` | — | `{ assinatura }` · 409 se cancelada |
| POST | `/mercado/assinaturas/:id/cancelar` | `{ motivo? }` | `{ assinatura }` |
| POST | `/mercado/assinaturas/:id/pedir-agora` | — | `201 { assinatura, pedido }` · 409 se já há pedido aberto |

**Criar** (`criarAssinaturaSchema`):

```json
{
  "itens": [{ "produto_id": "uuid", "quantidade": 1 }],
  "frequencia_dias": 30,
  "pet_id": "uuid",
  "entrega_tipo": "retirada | combinar | loja",
  "endereco": { "endereco": "…", "cep": "", "numero": "", "complemento": "", "cidade": "", "latitude": -21.1, "longitude": -47.8 },
  "observacao": "",
  "gerar_primeiro_ciclo": true
}
```

Validação em duas camadas — Zod (forma) e serviço (negócio):

| Regra | Onde | Resposta |
| --- | --- | --- |
| `itens` 1..10, quantidade 1..10, uuids, `frequencia_dias` 7..90 | Zod | `400 { error: "Erro de validação", details: [{ field, message }] }` |
| `combinar`/`loja` exigem `endereco`; `loja` exige latitude/longitude | Zod | 400 |
| loja não vende por assinatura | serviço | 409 |
| produtos de mais de uma loja · produto exige receita · transportadora | serviço | 400 |
| endereço fora do raio da loja | serviço (`cotarEntregaDaLoja`) | 400 com o motivo |
| `pet_id` de outro tutor | serviço | 404 |

**Lojista** (`/mercado/loja`, vínculo `responsavel_id`):

| Método | Rota | O que faz |
| --- | --- | --- |
| POST/PUT | `/mercado/loja` | aceita `aceita_assinatura`, `assinatura_desconto_pct` (0..50, senão 400), `assinatura_frete_gratis` |
| GET | `/mercado/loja/assinaturas` | assinantes da loja, com `tutor { nome, telefone }`, itens e próximo ciclo |

`GET /mercado/produtos/:id` e `GET /mercado/lojas/:slug` expõem a política
(`aceita_assinatura`, `assinatura_desconto_pct`, `assinatura_frete_gratis`) — é o que a
tela usa para mostrar o botão **Assinar** e o desconto antes de a pessoa decidir.

## 5. Telas

| Papel | Tela | Arquivo |
| --- | --- | --- |
| Tutor | folha **Assinar** na página do produto (pet → quantidade → frequência sugerida → entrega) | [`AssinarProduto.tsx`](../frontend/src/components/tutor/AssinarProduto.tsx) |
| Tutor | `/tutor/mercado/assinaturas`: pedir agora, mudar frequência, pausar, retomar, cancelar, ver pedido aberto | [`TutorMercadoAssinaturas.tsx`](../frontend/src/pages/tutor/TutorMercadoAssinaturas.tsx) |
| Tutor | selo "assinatura" no pedido; atalho "Assinaturas" em Meus pedidos | `TutorMercadoPedidos.tsx` |
| Lojista | cadastro: "Vendo ração por assinatura", desconto, frete grátis | `LojaCadastro.tsx` |
| Lojista | painel: "Assinaturas de ração" (assinantes, próximo pedido) | `LojaPainel.tsx` |

## 6. Testes

```bash
cd backend
npx jest tests/unit/services/mercado-assinatura.test.ts   # 18 — regra de negócio com Prisma mockado
npm run test:e2e                                           # inclui tests/e2e/mercado/assinatura.e2e.test.ts
```

A E2E percorre, contra o Postgres real e pelos endpoints: loja com assinatura → admin
aprova → produto → contrato recusa corpo mal formado → tutor assina (pedido com 10%
off, frete grátis, 24 h, estoque reservado) → pagar conta ciclo → três vencidos pausam
e devolvem estoque → retomar → worker gera o ciclo seguinte → alterar/cancelar →
isolamento entre tutores → lojista vê o assinante.

## 7. Deploy

```bash
cd backend && npx prisma migrate deploy && npx prisma generate   # aditiva
docker compose up -d --build                                       # schema mudou: build, não restart
```

O worker sobe com o backend (`iniciarWorkerDeAssinaturas`, a cada 1 h). Nenhuma
variável de ambiente nova.

## 8. Fora desta versão

- Cobrança automática (cartão sem CVV ou preapproval do Mercado Pago) — decisão comercial.
- Transportadora na assinatura (cotação por ciclo exige CPF e CepCerto a cada geração).
- Produto com receita (a receita é conferida a cada compra).
- Mais de uma loja por assinatura.
