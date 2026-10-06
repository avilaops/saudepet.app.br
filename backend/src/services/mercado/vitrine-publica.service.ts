import prisma from '../../config/database';
import { NotFoundError } from '../../middleware/error.middleware';
import { buscarNaVitrine, CAMPOS_PUBLICOS as CAMPOS_DO_PRODUTO } from './catalogo.service';
import { DISPONIVEL, LOJA_PUBLICA, estaDisponivel, precoVigente } from './comum';
import { CAMPOS_PUBLICOS as CAMPOS_DA_LOJA } from './loja.service';

/**
 * A vitrine SEM sessão.
 *
 * A vitrine do tutor exige login porque o preço, a loja e a disponibilidade são
 * do tenant de quem está logado. Aqui o tenant é o público — o mesmo que
 * responde pelo blog e pela landing — e o que sai é só o que qualquer pessoa
 * veria entrando na loja física: nome, endereço, telefone, produtos e preço de
 * etiqueta. Custo, margem, fornecedor e nota interna continuam sem passar pela
 * seleção pública do catálogo, como sempre.
 *
 * Por que existe: o plano comercial de 27/08/2026 põe o WhatsApp Business, o
 * Google Business Profile e o Merchant Center como canais de venda — e os três
 * precisam de um LINK público para o produto. "Ração perto de mim" no Google
 * não chega numa tela atrás de login.
 */

const LOJA_COM_PRODUTO = { some: { ativo: true, ...DISPONIVEL } };

export async function lojasPublicas(tenantId: string) {
  const lojas = await prisma.lojaMercado.findMany({
    where: { tenant_id: tenantId, ...LOJA_PUBLICA, produtos: LOJA_COM_PRODUTO },
    select: {
      ...CAMPOS_DA_LOJA,
      _count: { select: { produtos: { where: { ativo: true, ...DISPONIVEL } } } }
    },
    orderBy: [{ cidade: 'asc' }, { nome_fantasia: 'asc' }]
  });
  return lojas.map(({ _count, ...loja }) => ({ ...loja, total_produtos: _count.produtos }));
}

export async function lojaPublica(tenantId: string, slug: string) {
  const loja = await prisma.lojaMercado.findFirst({
    where: { tenant_id: tenantId, ...LOJA_PUBLICA, slug },
    select: CAMPOS_DA_LOJA
  });
  if (!loja) throw new NotFoundError('Loja não encontrada.');

  // Só as prateleiras que esta loja realmente tem: filtro por categoria que
  // devolve zero produto é um botão que a pessoa aperta à toa.
  const categorias = await prisma.categoriaMercado.findMany({
    where: {
      tenant_id: tenantId,
      ativo: true,
      produtos: { some: { loja_id: loja.id, ativo: true, ...DISPONIVEL } }
    },
    select: { id: true, nome: true, slug: true, icone: true, ordem: true },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }]
  });

  return { loja, categorias };
}

export async function produtosPublicos(params: {
  tenantId: string;
  lojaSlug: string;
  busca?: string | null;
  categoriaSlug?: string | null;
  especie?: string | null;
  pagina?: number;
  limite?: number;
}) {
  const loja = await prisma.lojaMercado.findFirst({
    where: { tenant_id: params.tenantId, ...LOJA_PUBLICA, slug: params.lojaSlug },
    select: { id: true }
  });
  if (!loja) throw new NotFoundError('Loja não encontrada.');

  // A mesma busca da vitrine logada — mesma regra de disponibilidade, mesma
  // seleção pública de campos. Duas buscas divergiriam um dia.
  return buscarNaVitrine({
    tenantId: params.tenantId,
    lojaId: loja.id,
    busca: params.busca,
    categoriaSlug: params.categoriaSlug,
    especie: params.especie,
    pagina: params.pagina,
    limite: params.limite
  });
}

export async function produtoPublico(tenantId: string, lojaSlug: string, produtoSlug: string) {
  const produto = await prisma.produtoMercado.findFirst({
    where: {
      tenant_id: tenantId,
      ativo: true,
      slug: produtoSlug,
      loja: { ...LOJA_PUBLICA, slug: lojaSlug }
    },
    select: {
      ...CAMPOS_DO_PRODUTO,
      ean: true,
      loja: { select: CAMPOS_DA_LOJA }
    }
  });
  if (!produto) throw new NotFoundError('Produto não encontrado.');

  // Esgotado continua com página: o link do Google e do WhatsApp já foi
  // clicado, e "não encontrado" faria a pessoa achar que a loja fechou.
  return { ...produto, preco_vigente: precoVigente(produto), disponivel: estaDisponivel(produto) };
}

export { CAMPOS_DA_LOJA, CAMPOS_DO_PRODUTO };
