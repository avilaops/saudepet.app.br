-- Saúde Pet Mercado — primeira fatia: loja, catálogo, carrinho, pedido e pagamento.
--
-- Aditiva por inteiro: oito tabelas novas, três enums novos e UMA coluna nova
-- em `payments`. Nada existente muda de tipo, perde default ou é removido, então
-- o deploy pode subir antes do código novo sem quebrar o que está no ar.
--
-- A entrega por ENTREGADOR não está nesta fatia. O enum já reserva o valor
-- porque mudar enum em Postgres exige transação própria, e deixar o buraco
-- aberto agora evita uma migração de tipo no meio da operação depois.

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "StatusLojaMercado" AS ENUM ('rascunho', 'pendente', 'aprovada', 'suspensa', 'recusada');

CREATE TYPE "StatusPedidoMercado" AS ENUM (
    'aguardando_pagamento',
    'pagamento_falhou',
    'pago',
    'em_separacao',
    'pronto',
    'concluido',
    'cancelado',
    'reembolsado'
);

CREATE TYPE "EntregaMercado" AS ENUM ('retirada', 'combinar', 'entregador');

-- ── Loja ─────────────────────────────────────────────────────────────────────
--
-- O vendedor não é a plataforma: é uma empresa de fora, com CNPJ próprio, que
-- passa por conferência antes de aparecer na vitrine — do mesmo jeito que o
-- veterinário passa. Quem vende medicamento para animal doente é conferido.

CREATE TABLE "mercado_lojas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "responsavel_id" TEXT NOT NULL,
    "nome_fantasia" TEXT NOT NULL,
    "razao_social" TEXT,
    "cnpj" TEXT,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "logo_url" TEXT,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "cep" TEXT,
    "endereco" TEXT NOT NULL,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "StatusLojaMercado" NOT NULL DEFAULT 'rascunho',
    "motivo_recusa" TEXT,
    "enviada_em" TIMESTAMP(3),
    "aprovada_em" TIMESTAMP(3),
    "aprovada_por" TEXT,
    "comissao_pct" DECIMAL(5,2),
    "gateway_recebedor_id" TEXT,
    "aceita_retirada" BOOLEAN NOT NULL DEFAULT true,
    "aceita_combinar" BOOLEAN NOT NULL DEFAULT true,
    "prazo_preparo_min" INTEGER NOT NULL DEFAULT 60,
    "pedido_minimo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_lojas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mercado_lojas_tenant_id_slug_key" ON "mercado_lojas"("tenant_id", "slug");
CREATE INDEX "mercado_lojas_tenant_id_status_idx" ON "mercado_lojas"("tenant_id", "status");
CREATE INDEX "mercado_lojas_responsavel_id_idx" ON "mercado_lojas"("responsavel_id");
CREATE INDEX "mercado_lojas_cidade_idx" ON "mercado_lojas"("cidade");

-- ── Categoria ────────────────────────────────────────────────────────────────
--
-- Curada pela plataforma. Se cada loja inventasse a própria prateleira, a busca
-- do tutor viraria um amontoado de sinônimos.

CREATE TABLE "mercado_categorias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icone" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_categorias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mercado_categorias_tenant_id_slug_key" ON "mercado_categorias"("tenant_id", "slug");
CREATE INDEX "mercado_categorias_tenant_id_ativo_idx" ON "mercado_categorias"("tenant_id", "ativo");

-- ── Produto ──────────────────────────────────────────────────────────────────

CREATE TABLE "mercado_produtos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "loja_id" TEXT NOT NULL,
    "categoria_id" TEXT,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "marca" TEXT,
    "sku" TEXT,
    "ean" TEXT,
    "variacao" TEXT,
    "tamanho" TEXT,
    -- Economia da loja. Nunca sai na resposta pública: a seleção de campos do
    -- catálogo do tutor não inclui nenhuma destas três colunas.
    "custo" DECIMAL(10,2),
    "margem_pct" DECIMAL(5,4),
    "fornecedor" TEXT,
    "preco" DECIMAL(10,2) NOT NULL,
    "preco_promocional" DECIMAL(10,2),
    "unidade" TEXT NOT NULL DEFAULT 'un',
    "peso_gramas" INTEGER,
    "estoque" INTEGER NOT NULL DEFAULT 0,
    -- Petshop de bairro em geral não faz contagem: vende enquanto tem e confere
    -- na separação. Com `false`, o item vende sem reservar estoque — o que evita
    -- prateleira cheia aparecendo como "esgotado" só porque ninguém digitou
    -- número nenhum.
    "controla_estoque" BOOLEAN NOT NULL DEFAULT true,
    "granel" BOOLEAN NOT NULL DEFAULT false,
    "sob_encomenda" BOOLEAN NOT NULL DEFAULT false,
    "prazo_reposicao_dias" INTEGER,
    "nota_interna" TEXT,
    "exige_receita" BOOLEAN NOT NULL DEFAULT false,
    "especie_alvo" TEXT,
    "imagem_url" TEXT,
    "imagens" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_produtos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mercado_produtos_loja_id_slug_key" ON "mercado_produtos"("loja_id", "slug");
CREATE INDEX "mercado_produtos_tenant_id_ativo_idx" ON "mercado_produtos"("tenant_id", "ativo");
CREATE INDEX "mercado_produtos_loja_id_ativo_idx" ON "mercado_produtos"("loja_id", "ativo");
CREATE INDEX "mercado_produtos_categoria_id_idx" ON "mercado_produtos"("categoria_id");
-- O EAN é o que evita o mesmo produto entrar duas vezes quando um segundo
-- fornecedor subir o catálogo dele: o nome muda de loja para loja, o código de
-- barras não. Índice, e não único: duas lojas diferentes vendem o mesmo item.
CREATE INDEX "mercado_produtos_ean_idx" ON "mercado_produtos"("ean");

-- O estoque nunca pode ficar negativo. A baixa acontece em UPDATE condicional
-- dentro da transação do checkout, mas quem escreve SQL direto no banco (script
-- de importação, correção manual) não passa por lá — e um estoque negativo
-- viraria venda de produto inexistente.
ALTER TABLE "mercado_produtos"
    ADD CONSTRAINT "mercado_produtos_estoque_nao_negativo" CHECK ("estoque" >= 0);

-- ── Carrinho ─────────────────────────────────────────────────────────────────
--
-- Um por loja. Cada loja separa, embala e entrega o que é dela; um carrinho só
-- com itens de três vendedores viraria três pedidos escondidos atrás de um botão.

CREATE TABLE "mercado_carrinhos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "loja_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_carrinhos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mercado_carrinhos_tutor_id_loja_id_key" ON "mercado_carrinhos"("tutor_id", "loja_id");
CREATE INDEX "mercado_carrinhos_tenant_id_idx" ON "mercado_carrinhos"("tenant_id");

CREATE TABLE "mercado_carrinho_itens" (
    "id" TEXT NOT NULL,
    "carrinho_id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_carrinho_itens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mercado_carrinho_itens_carrinho_id_produto_id_key"
    ON "mercado_carrinho_itens"("carrinho_id", "produto_id");
CREATE INDEX "mercado_carrinho_itens_produto_id_idx" ON "mercado_carrinho_itens"("produto_id");

ALTER TABLE "mercado_carrinho_itens"
    ADD CONSTRAINT "mercado_carrinho_itens_quantidade_positiva" CHECK ("quantidade" > 0);

-- ── Pedido ───────────────────────────────────────────────────────────────────

CREATE TABLE "mercado_pedidos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "loja_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "status" "StatusPedidoMercado" NOT NULL DEFAULT 'aguardando_pagamento',
    "entrega_tipo" "EntregaMercado" NOT NULL DEFAULT 'retirada',
    "entrega_endereco" TEXT,
    "entrega_complemento" TEXT,
    "entrega_cidade" TEXT,
    "entrega_latitude" DOUBLE PRECISION,
    "entrega_longitude" DOUBLE PRECISION,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "frete" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "comissao_pct" DECIMAL(5,2) NOT NULL,
    "comissao_valor" DECIMAL(10,2) NOT NULL,
    "repasse_loja" DECIMAL(10,2) NOT NULL,
    "payment_id" TEXT,
    "exige_receita" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "cancelado_motivo" TEXT,
    "cancelado_por" TEXT,
    "expira_em" TIMESTAMP(3),
    "pago_em" TIMESTAMP(3),
    "separado_em" TIMESTAMP(3),
    "pronto_em" TIMESTAMP(3),
    "concluido_em" TIMESTAMP(3),
    "cancelado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_pedidos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mercado_pedidos_codigo_key" ON "mercado_pedidos"("codigo");
CREATE INDEX "mercado_pedidos_tenant_id_status_idx" ON "mercado_pedidos"("tenant_id", "status");
CREATE INDEX "mercado_pedidos_loja_id_status_idx" ON "mercado_pedidos"("loja_id", "status");
CREATE INDEX "mercado_pedidos_tutor_id_idx" ON "mercado_pedidos"("tutor_id");
CREATE INDEX "mercado_pedidos_payment_id_idx" ON "mercado_pedidos"("payment_id");

CREATE TABLE "mercado_pedido_itens" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "produto_id" TEXT,
    "nome" TEXT NOT NULL,
    "sku" TEXT,
    "variacao" TEXT,
    "unidade" TEXT NOT NULL DEFAULT 'un',
    "preco_unitario" DECIMAL(10,2) NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "exige_receita" BOOLEAN NOT NULL DEFAULT false,
    -- Prazo prometido quando o item era sob encomenda. Fica no item porque é a
    -- promessa feita NAQUELA compra: mudar o cadastro depois não pode reescrever
    -- o que o tutor leu antes de pagar.
    "prazo_encomenda_dias" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mercado_pedido_itens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mercado_pedido_itens_pedido_id_idx" ON "mercado_pedido_itens"("pedido_id");
CREATE INDEX "mercado_pedido_itens_produto_id_idx" ON "mercado_pedido_itens"("produto_id");

CREATE TABLE "mercado_pedido_eventos" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "status" "StatusPedidoMercado" NOT NULL,
    "status_anterior" "StatusPedidoMercado",
    "ator_id" TEXT,
    "ator_papel" TEXT,
    "origem" TEXT,
    "motivo" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mercado_pedido_eventos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mercado_pedido_eventos_pedido_id_idx" ON "mercado_pedido_eventos"("pedido_id");

-- ── Chaves estrangeiras ──────────────────────────────────────────────────────
--
-- Loja e pedido ficam em RESTRICT de propósito: apagar a conta de quem responde
-- por uma loja com pedido pago apagaria a nota fiscal do que já foi vendido.
-- Carrinho e catálogo são CASCADE — não são registro contábil.

ALTER TABLE "mercado_lojas" ADD CONSTRAINT "mercado_lojas_responsavel_id_fkey"
    FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mercado_produtos" ADD CONSTRAINT "mercado_produtos_loja_id_fkey"
    FOREIGN KEY ("loja_id") REFERENCES "mercado_lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mercado_produtos" ADD CONSTRAINT "mercado_produtos_categoria_id_fkey"
    FOREIGN KEY ("categoria_id") REFERENCES "mercado_categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mercado_carrinhos" ADD CONSTRAINT "mercado_carrinhos_tutor_id_fkey"
    FOREIGN KEY ("tutor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mercado_carrinhos" ADD CONSTRAINT "mercado_carrinhos_loja_id_fkey"
    FOREIGN KEY ("loja_id") REFERENCES "mercado_lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mercado_carrinho_itens" ADD CONSTRAINT "mercado_carrinho_itens_carrinho_id_fkey"
    FOREIGN KEY ("carrinho_id") REFERENCES "mercado_carrinhos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mercado_carrinho_itens" ADD CONSTRAINT "mercado_carrinho_itens_produto_id_fkey"
    FOREIGN KEY ("produto_id") REFERENCES "mercado_produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mercado_pedidos" ADD CONSTRAINT "mercado_pedidos_loja_id_fkey"
    FOREIGN KEY ("loja_id") REFERENCES "mercado_lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mercado_pedidos" ADD CONSTRAINT "mercado_pedidos_tutor_id_fkey"
    FOREIGN KEY ("tutor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mercado_pedido_itens" ADD CONSTRAINT "mercado_pedido_itens_pedido_id_fkey"
    FOREIGN KEY ("pedido_id") REFERENCES "mercado_pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mercado_pedido_eventos" ADD CONSTRAINT "mercado_pedido_eventos_pedido_id_fkey"
    FOREIGN KEY ("pedido_id") REFERENCES "mercado_pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Ligação com a cobrança ───────────────────────────────────────────────────
--
-- `payments` já sabia cobrar atendimento e assinatura. Agora sabe cobrar pedido:
-- é por esta coluna que o webhook do Mercado Pago encontra o pedido e libera a
-- separação na loja. Coluna anulável — nenhuma cobrança existente é afetada.

ALTER TABLE "payments" ADD COLUMN "pedido_mercado_id" TEXT;
CREATE INDEX "payments_pedido_mercado_id_idx" ON "payments"("pedido_mercado_id");

-- ── Prateleiras iniciais ─────────────────────────────────────────────────────
--
-- Vitrine sem categoria nenhuma é uma tela vazia que parece defeito. As nove
-- prateleiras abaixo não foram inventadas na mesa: saíram do levantamento feito
-- na Casa de Rações Filhos de 4 Patas em 26/08/2026, onde 175 itens reais se
-- distribuíram exatamente nelas. Cada tenant existente nasce com as nove; quem
-- for criado depois recebe as mesmas pelo cadastro no painel.
--
-- A espécie (cão, gato, pássaro) NÃO é categoria: é `especie_alvo` no produto.
-- Fosse categoria, "Ração cão" e "Ração gato" seriam duas prateleiras e quem
-- tem os dois animais teria de procurar a mesma ração duas vezes.

INSERT INTO "mercado_categorias" ("id", "tenant_id", "nome", "slug", "ordem", "ativo", "criado_em", "atualizado_em")
SELECT
    gen_random_uuid()::text,
    t."id",
    c."nome",
    c."slug",
    c."ordem",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN (VALUES
    ('Ração', 'racao', 1),
    ('Alimento úmido', 'alimento-umido', 2),
    ('Petiscos', 'petiscos', 3),
    ('Higiene e banho', 'higiene-e-banho', 4),
    ('Medicamentos', 'medicamentos', 5),
    ('Antipulgas e vermífugos', 'antipulgas-e-vermifugos', 6),
    ('Brinquedos', 'brinquedos', 7),
    ('Acessórios', 'acessorios', 8),
    ('Casa e conforto', 'casa-e-conforto', 9)
) AS c("nome", "slug", "ordem")
ON CONFLICT ("tenant_id", "slug") DO NOTHING;
