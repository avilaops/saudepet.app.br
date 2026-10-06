-- Saúde Pet Mercado — segunda fatia: entrega pela loja, margem por categoria
-- e distância do pedido.
--
-- Aditiva por inteiro. Nada muda de tipo, nada perde default, nada é removido.

-- ── Loja: política de entrega ────────────────────────────────────────────────
--
-- Ração pesada só fecha conta em raio curto (decisão do plano comercial de
-- 27/08/2026). O raio, o frete e o piso do frete grátis são DA LOJA — a
-- plataforma só faz a conta e recusa o que está fora do raio.

ALTER TABLE "mercado_lojas"
    ADD COLUMN "aceita_entrega"      BOOLEAN        NOT NULL DEFAULT false,
    ADD COLUMN "entrega_raio_km"     DECIMAL(5,1),
    ADD COLUMN "frete_base"          DECIMAL(10,2)  NOT NULL DEFAULT 0,
    ADD COLUMN "frete_por_km"        DECIMAL(10,2)  NOT NULL DEFAULT 0,
    ADD COLUMN "frete_gratis_acima"  DECIMAL(10,2),
    ADD COLUMN "entrega_prazo_horas" INTEGER;

-- ── Categoria: margem padrão ─────────────────────────────────────────────────
--
-- "Definir margem por categoria em vez de 40% fixo": ração premium suporta
-- 18% a 30%; acessório, cosmético e brinquedo suportam bem mais. O produto sem
-- margem própria herda a da prateleira; o 40% vira o último recurso.

ALTER TABLE "mercado_categorias"
    ADD COLUMN "margem_padrao_pct" DECIMAL(5,4);

-- ── Pedido: a distância que foi cobrada ──────────────────────────────────────
--
-- Guardada no pedido, e não recalculada: a loja pode mudar o raio amanhã, e o
-- frete que o tutor pagou hoje precisa continuar explicável.

ALTER TABLE "mercado_pedidos"
    ADD COLUMN "entrega_distancia_km" DECIMAL(6,2);
