import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { gerarSlug } from '../src/services/mercado/comum';
import { otimizarFoto } from '../src/services/mercado/imagem-produto.service';
import { uploadBuffer } from '../src/config/r2';

/**
 * Importa um levantamento de fornecedor para o catálogo do Saúde Pet Mercado.
 *
 * A entrada é o JSON gerado por `marketplace/scripts/planilha-para-json.py` a
 * partir da planilha de campo. O primeiro deles saiu de 50 fotos tiradas na
 * Casa de Rações Filhos de 4 Patas (Ribeirão Preto/SP) em 26/08/2026: 175
 * itens, 109 com preço de etiqueta.
 *
 * Três decisões que o script NÃO toma sozinho, de propósito:
 *
 * 1. **Não inventa conta.** O responsável pela loja tem de existir — é uma
 *    pessoa que vai receber pedido e dinheiro, não um registro de conveniência.
 * 2. **Não aprova a loja.** Ela entra como `rascunho` e passa pela mesma
 *    conferência que qualquer outra. Importar catálogo não é credenciar
 *    fornecedor.
 * 3. **Não inventa preço nem estoque.** Item sem preço no levantamento entra
 *    INATIVO, com a pendência escrita em `nota_interna`. E como o levantamento
 *    não trouxe contagem nenhuma, os produtos entram com `controla_estoque =
 *    false`: a loja vende enquanto tem e confere na separação, que é como ela
 *    já trabalha hoje.
 *
 * Uso:
 *   npx tsx scripts/importar-catalogo-mercado.ts \
 *     --arquivo=../marketplace/dados/fornecedor-01-filhos-de-4-patas.json \
 *     --responsavel=email@da.pessoa \
 *     [--fotos=../marketplace/fotos/fornecedor-01] [--tenant=saudepet] [--aplicar]
 *
 * Com `--fotos`, sobe para o R2 a foto de cada produto com `foto_status =
 * 'aprovada'` (e só dessas), inclusive para produto já importado que ainda
 * não tem `imagem_url`. `revisar` e `sem_foto` ficam de fora.
 *
 * Sem `--aplicar` o script só mostra o que faria. É ensaio por padrão porque
 * escrever 175 produtos no catálogo de uma loja real não deveria acontecer por
 * um comando digitado sem querer.
 */

type ProdutoDoLevantamento = {
  referencia: string;
  nome: string;
  slug: string;
  marca: string | null;
  variacao: string | null;
  tamanho: string | null;
  categoria_slug: string;
  especie_alvo: string;
  unidade: string;
  granel: boolean;
  peso_gramas: number | null;
  preco: number | null;
  custo: number | null;
  margem_pct: number | null;
  ean: string | null;
  estoque: number;
  ativo: boolean;
  nota_interna: string | null;
  foto_referencia: string | null;
  /** Preenchidos por marketplace/scripts/fotos/metatags.py. Ausentes em levantamento sem foto tratada. */
  foto_arquivo?: string | null;
  foto_alt?: string | null;
  foto_titulo?: string | null;
  foto_status?: 'aprovada' | 'revisar' | 'sem_foto' | 'rejeitada' | null;
  tem_etiqueta_preco?: boolean | null;
};

type Pacote = {
  fornecedor: {
    referencia: string;
    nome_fantasia: string;
    cidade: string;
    estado: string;
    telefone: string;
  };
  levantamento: { data: string; origem: string; total_itens: number };
  produtos: ProdutoDoLevantamento[];
};

const prisma = new PrismaClient();

function argumento(nome: string): string | null {
  const encontrado = process.argv.find((item) => item.startsWith(`--${nome}=`));
  return encontrado ? encontrado.slice(nome.length + 3) : null;
}

const APLICAR = process.argv.includes('--aplicar');
/**
 * Pasta com as fotos tratadas (`marketplace/fotos/<fornecedor>/`). Só sobe para
 * o R2 o que está `foto_status = 'aprovada'`: a foto marcada `revisar` existe
 * para a fila de QA, não para a vitrine. Publicar uma segmentação ruim é pior
 * do que deixar o item sem imagem, e o feed do Google recusa os dois.
 */
const PASTA_FOTOS = argumento('fotos');

function fotoPublicavel(item: ProdutoDoLevantamento): string | null {
  if (!PASTA_FOTOS || item.foto_status !== 'aprovada' || !item.foto_arquivo) return null;
  const caminho = resolve(process.cwd(), PASTA_FOTOS, item.foto_arquivo);
  return existsSync(caminho) ? caminho : null;
}

async function subirFoto(params: { tenantId: string; lojaId: string; produtoId: string; caminho: string; alt: string | null; etiqueta: boolean }) {
  const buffer = readFileSync(params.caminho);
  // Mesmo caminho da tela do lojista (WebP, 1200 px), para a foto importada
  // não ser um segundo tipo de arquivo no bucket.
  const otimizada = await otimizarFoto({ buffer, mimetype: 'image/webp', size: buffer.length });
  const chave = `mercado/${params.tenantId}/${params.lojaId}/${params.produtoId}/${randomUUID()}.webp`;
  const url = await uploadBuffer(otimizada, chave, 'image/webp', {
    cacheControl: 'public, max-age=31536000, immutable'
  });
  await prisma.produtoMercado.update({
    where: { id: params.produtoId },
    data: {
      imagens: [url],
      imagem_url: url,
      imagem_alt: params.alt?.slice(0, 160) ?? null,
      // Só `aprovada` chega aqui (fotoPublicavel); a etiqueta vira fila de troca.
      imagem_status: 'aprovada',
      imagem_tem_etiqueta: params.etiqueta
    }
  });
  return url;
}

async function main() {
  const caminho = argumento('arquivo');
  const emailResponsavel = argumento('responsavel');
  const tenantSlug = argumento('tenant') || process.env.PUBLIC_TENANT_SLUG || 'saudepet';

  if (!caminho) throw new Error('Informe --arquivo=caminho/para/levantamento.json');
  if (!emailResponsavel) throw new Error('Informe --responsavel=email da pessoa que responde pela loja');

  const pacote: Pacote = JSON.parse(readFileSync(resolve(process.cwd(), caminho), 'utf-8'));

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, nome: true } });
  if (!tenant) throw new Error(`Importação interrompida: tenant "${tenantSlug}" não encontrado.`);

  const responsavel = await prisma.usuario.findFirst({
    where: { tenant_id: tenant.id, email: emailResponsavel.toLowerCase() },
    select: { id: true, nome: true, email: true }
  });
  if (!responsavel) {
    // Criar a conta aqui pareceria conveniente e seria o começo de uma loja
    // fantasma: quem responde por ela precisa ter entrado no aplicativo e
    // aceitado os termos, não ter sido cadastrado por um script.
    throw new Error(
      `Importação interrompida: nenhum usuário "${emailResponsavel}" no tenant "${tenantSlug}". ` +
        'Peça à pessoa para criar a conta pelo aplicativo antes de importar o catálogo dela.'
    );
  }

  const categorias = await prisma.categoriaMercado.findMany({
    where: { tenant_id: tenant.id },
    select: { id: true, slug: true }
  });
  const categoriaPorSlug = new Map(categorias.map((categoria) => [categoria.slug, categoria.id]));

  const semCategoria = [
    ...new Set(pacote.produtos.map((produto) => produto.categoria_slug))
  ].filter((slug) => !categoriaPorSlug.has(slug));
  if (semCategoria.length > 0) {
    throw new Error(
      `Importação interrompida: categorias ausentes no tenant (${semCategoria.join(', ')}). ` +
        'Rode a migração do mercado antes — é ela que cria as prateleiras.'
    );
  }

  console.log(`\nTenant.......... ${tenant.nome} (${tenantSlug})`);
  console.log(`Responsável..... ${responsavel.nome} <${responsavel.email}>`);
  console.log(`Fornecedor...... ${pacote.fornecedor.nome_fantasia} — ${pacote.fornecedor.cidade}/${pacote.fornecedor.estado}`);
  console.log(`Levantamento.... ${pacote.levantamento.data} · ${pacote.levantamento.origem}`);
  console.log(`Produtos........ ${pacote.produtos.length} no arquivo`);

  const comPreco = pacote.produtos.filter((produto) => produto.preco !== null);
  const semPreco = pacote.produtos.filter((produto) => produto.preco === null);
  console.log(`  publicáveis... ${comPreco.length}`);
  console.log(`  sem preço..... ${semPreco.length} (entram inativos, com a pendência anotada)`);

  const porStatus = (status: string) => pacote.produtos.filter((produto) => (produto.foto_status ?? 'sem_foto') === status);
  const aprovadas = pacote.produtos.filter((produto) => fotoPublicavel(produto));
  const aprovadasSemArquivo = porStatus('aprovada').length - aprovadas.length;
  console.log(`Fotos........... ${PASTA_FOTOS ? PASTA_FOTOS : '(sem --fotos, nenhuma sobe)'}`);
  console.log(`  aprovadas..... ${porStatus('aprovada').length}${PASTA_FOTOS ? ` (${aprovadas.length} sobem para o R2)` : ''}`);
  console.log(`  revisar....... ${porStatus('revisar').length} (ficam fora até alguém aprovar)`);
  console.log(`  sem foto...... ${porStatus('sem_foto').length + porStatus('rejeitada').length}`);
  if (PASTA_FOTOS && aprovadasSemArquivo > 0) {
    throw new Error(
      `Importação interrompida: ${aprovadasSemArquivo} produto(s) aprovados apontam para arquivo que não está em ${PASTA_FOTOS}.`
    );
  }

  if (!APLICAR) {
    console.log('\nEnsaio. Nada foi gravado. Repita com --aplicar para valer.\n');
    return;
  }

  const loja = await prisma.lojaMercado.upsert({
    where: {
      tenant_id_slug: { tenant_id: tenant.id, slug: gerarSlug(pacote.fornecedor.nome_fantasia) }
    },
    update: {},
    create: {
      tenant_id: tenant.id,
      responsavel_id: responsavel.id,
      nome_fantasia: pacote.fornecedor.nome_fantasia,
      slug: gerarSlug(pacote.fornecedor.nome_fantasia),
      email: responsavel.email,
      telefone: pacote.fornecedor.telefone,
      // O levantamento tem o telefone e a cidade, e não tem o endereço da rua.
      // Deixar um endereço inventado seria pior do que deixar a pendência à
      // vista: sem ele a loja não passa na conferência, que é o certo.
      endereco: 'ENDEREÇO A CONFIRMAR — levantamento de campo não registrou',
      cidade: pacote.fornecedor.cidade,
      estado: pacote.fornecedor.estado,
      // Rascunho. Importar catálogo não é credenciar fornecedor: a loja passa
      // pela mesma conferência que qualquer outra antes de aparecer na vitrine.
      status: 'rascunho',
      descricao: `Catálogo importado do levantamento de ${pacote.levantamento.data}.`
    },
    select: { id: true, nome_fantasia: true, status: true }
  });

  console.log(`\nLoja............ ${loja.nome_fantasia} (${loja.status})`);

  // O levantamento tem nomes repetidos (mesmo produto em dois sabores, mesma
  // areia em duas fragrâncias). O slug é único por loja, então a colisão é
  // resolvida aqui em vez de estourar no meio da importação.
  const usados = new Set<string>();
  const slugLivre = (base: string) => {
    let candidato = base || 'produto';
    let numero = 2;
    while (usados.has(candidato)) {
      candidato = `${base}-${numero}`;
      numero += 1;
    }
    usados.add(candidato);
    return candidato;
  };

  const existentes = await prisma.produtoMercado.findMany({
    where: { loja_id: loja.id },
    select: { id: true, slug: true, imagem_url: true }
  });
  existentes.forEach((produto) => usados.add(produto.slug));

  let criados = 0;
  let pulados = 0;
  let fotosSubidas = 0;

  for (const item of pacote.produtos) {
    const slug = slugLivre(item.slug);

    // Já importado numa rodada anterior: não sobrescreve. O lojista pode ter
    // corrigido o preço na tela desde então, e um reimport silencioso jogaria
    // essa correção fora.
    const existente = usados.has(item.slug) ? existentes.find((produto) => produto.slug === item.slug) : undefined;
    if (existente) {
      pulados += 1;
      // A foto é a exceção ao "não sobrescreve": o catálogo foi importado antes
      // de existir foto tratada, e o lojista que já subiu a própria foto
      // (imagem_url preenchida) não tem a dele trocada.
      const caminho = fotoPublicavel(item);
      if (caminho && !existente.imagem_url) {
        await subirFoto({ tenantId: tenant.id, lojaId: loja.id, produtoId: existente.id, caminho, alt: item.foto_alt ?? null, etiqueta: item.tem_etiqueta_preco === true });
        fotosSubidas += 1;
      }
      continue;
    }

    const criado = await prisma.produtoMercado.create({
      data: {
        tenant_id: tenant.id,
        loja_id: loja.id,
        categoria_id: categoriaPorSlug.get(item.categoria_slug)!,
        nome: item.nome,
        slug,
        marca: item.marca,
        variacao: item.variacao,
        tamanho: item.tamanho,
        ean: item.ean,
        fornecedor: pacote.fornecedor.nome_fantasia,
        custo: item.custo,
        margem_pct: item.margem_pct,
        // Sem preço no levantamento, entra com zero e INATIVO. O zero nunca é
        // cobrado de ninguém: produto inativo não aparece na vitrine e não
        // entra em carrinho.
        preco: item.preco ?? 0,
        unidade: item.unidade,
        granel: item.granel,
        peso_gramas: item.peso_gramas,
        estoque: item.estoque,
        // O levantamento não trouxe contagem de nada. A loja vende enquanto tem
        // e confere na separação — é como ela já trabalha, e forçar contagem
        // faria a prateleira cheia aparecer como esgotada.
        controla_estoque: false,
        especie_alvo: item.especie_alvo,
        nota_interna: [item.nota_interna, item.foto_referencia ? `Foto: ${item.foto_referencia}` : null]
          .filter(Boolean)
          .join(' · ') || null,
        ativo: item.ativo
      },
      select: { id: true }
    });

    criados += 1;

    const caminho = fotoPublicavel(item);
    if (caminho) {
      await subirFoto({ tenantId: tenant.id, lojaId: loja.id, produtoId: criado.id, caminho, alt: item.foto_alt ?? null, etiqueta: item.tem_etiqueta_preco === true });
      fotosSubidas += 1;
    }
  }

  console.log(`Produtos........ ${criados} criados, ${pulados} já existiam`);
  console.log(`Fotos........... ${fotosSubidas} subidas para o R2 (só as aprovadas; as "revisar" ficam na fila)`);
  console.log('\nPróximos passos:');
  console.log('  1. A loja está em RASCUNHO. Complete o endereço pelo painel do lojista.');
  console.log(`  2. ${semPreco.length} produtos estão inativos esperando preço.`);
  console.log('  3. Envie para análise e aprove pelo /admin/mercado.\n');
}

main()
  .catch((erro) => {
    console.error('\n❌', erro.message, '\n');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
