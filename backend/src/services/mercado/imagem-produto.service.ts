import { randomUUID } from 'crypto';
import prisma from '../../config/database';
import { deleteObject, keyFromUrl, uploadBuffer } from '../../config/r2';
import { NotFoundError, ValidationError } from '../../middleware/error.middleware';
import { lojaDoResponsavel } from './catalogo.service';

const sharp = require('sharp');

/**
 * Fotos do produto, subidas pela tela do lojista.
 *
 * Até 27/08/2026 `imagem_url` era um campo de texto: quem quisesse foto tinha
 * de hospedar a imagem em algum lugar e colar o endereço. Na prática ninguém
 * fazia — os 175 itens do primeiro fornecedor foram fotografados na prateleira
 * e nenhuma foto chegou ao catálogo.
 *
 * A foto importa mais do que parece: o catálogo do WhatsApp e o Google
 * Merchant RECUSAM item sem imagem. Sem upload aqui, o feed nasce vazio.
 *
 * Tudo vira WebP de no máximo 1200 px de largura. Foto de celular de 6 MB
 * passa a pesar cem e poucos KB, e a vitrine no 4G da pessoa agradece.
 */

const LARGURA_MAXIMA = 1200;
const QUALIDADE = 80;
/** Uma ração não precisa de álbum: frente, verso, tabela nutricional e sobra. */
export const MAXIMO_DE_FOTOS = 6;
const LIMITE_BYTES = 12 * 1024 * 1024;

type ArquivoRecebido = { buffer: Buffer; mimetype?: string; size?: number };

async function produtoDoLojista(tenantId: string, usuarioId: string, produtoId: string) {
  const loja = await lojaDoResponsavel(tenantId, usuarioId);
  const produto = await prisma.produtoMercado.findFirst({
    where: { id: produtoId, loja_id: loja.id, tenant_id: tenantId },
    select: { id: true, imagem_url: true, imagens: true }
  });
  if (!produto) throw new NotFoundError('Produto não encontrado.');
  return { loja, produto };
}

/** `imagens` é JSON livre no banco; aqui vira o que a tela espera: lista de URLs. */
function listaDeFotos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export async function otimizarFoto(arquivo: ArquivoRecebido): Promise<Buffer> {
  if (!arquivo?.buffer?.length) throw new ValidationError('Envie uma imagem.');
  if (!String(arquivo.mimetype || '').startsWith('image/')) {
    throw new ValidationError('Só imagens são aceitas como foto de produto.');
  }
  if ((arquivo.size ?? arquivo.buffer.length) > LIMITE_BYTES) {
    throw new ValidationError('A foto passa de 12 MB. Envie uma menor.');
  }

  try {
    return await sharp(arquivo.buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: LARGURA_MAXIMA, withoutEnlargement: true })
      .webp({ quality: QUALIDADE, effort: 5, smartSubsample: true })
      .toBuffer();
  } catch {
    throw new ValidationError('Não foi possível ler esta imagem. Tente outra foto.');
  }
}

export async function adicionarFotoDoProduto(params: {
  tenantId: string;
  usuarioId: string;
  produtoId: string;
  arquivo: ArquivoRecebido;
}) {
  const { loja, produto } = await produtoDoLojista(params.tenantId, params.usuarioId, params.produtoId);

  const fotos = listaDeFotos(produto.imagens);
  if (fotos.length >= MAXIMO_DE_FOTOS) {
    throw new ValidationError(`Este produto já tem ${MAXIMO_DE_FOTOS} fotos. Remova uma antes de subir outra.`);
  }

  const otimizada = await otimizarFoto(params.arquivo);
  const chave = `mercado/${params.tenantId}/${loja.id}/${produto.id}/${randomUUID()}.webp`;
  const url = await uploadBuffer(otimizada, chave, 'image/webp', {
    cacheControl: 'public, max-age=31536000, immutable'
  });

  const atualizado = await prisma.produtoMercado.update({
    where: { id: produto.id },
    data: {
      imagens: [...fotos, url],
      // A primeira foto vira a capa sozinha. Exigir um segundo toque para
      // "definir como principal" deixaria metade do catálogo sem capa.
      imagem_url: produto.imagem_url || url,
      // Quem sobe a própria foto responde por ela: a primeira capa nasce aprovada.
      ...(produto.imagem_url ? {} : { imagem_status: 'aprovada' })
    },
    select: { id: true, imagem_url: true, imagens: true }
  });

  return { ...atualizado, imagens: listaDeFotos(atualizado.imagens) };
}

export async function definirCapaDoProduto(params: {
  tenantId: string;
  usuarioId: string;
  produtoId: string;
  url: string;
}) {
  const { produto } = await produtoDoLojista(params.tenantId, params.usuarioId, params.produtoId);
  const fotos = listaDeFotos(produto.imagens);
  if (!fotos.includes(params.url)) throw new ValidationError('Esta foto não é deste produto.');

  const atualizado = await prisma.produtoMercado.update({
    where: { id: produto.id },
    data: { imagem_url: params.url },
    select: { id: true, imagem_url: true, imagens: true }
  });
  return { ...atualizado, imagens: listaDeFotos(atualizado.imagens) };
}

export async function removerFotoDoProduto(params: {
  tenantId: string;
  usuarioId: string;
  produtoId: string;
  url: string;
}) {
  const { produto } = await produtoDoLojista(params.tenantId, params.usuarioId, params.produtoId);
  const fotos = listaDeFotos(produto.imagens);
  if (!fotos.includes(params.url)) throw new ValidationError('Esta foto não é deste produto.');

  const restantes = fotos.filter((foto) => foto !== params.url);
  const atualizado = await prisma.produtoMercado.update({
    where: { id: produto.id },
    data: {
      imagens: restantes,
      imagem_url: produto.imagem_url === params.url ? restantes[0] || null : produto.imagem_url,
      // Sem capa não há o que revisar nem etiqueta para trocar.
      ...(produto.imagem_url === params.url && !restantes[0] ? { imagem_status: null, imagem_tem_etiqueta: false } : {})
    },
    select: { id: true, imagem_url: true, imagens: true }
  });

  // O binário sai depois do registro, e sem derrubar a resposta: uma foto órfã
  // no bucket custa centavos; um produto apontando para foto apagada custa a
  // venda.
  const chave = keyFromUrl(params.url);
  if (chave && chave !== params.url) {
    await deleteObject(chave).catch((erro: Error) => {
      console.error('[mercado] não apagou a foto do R2:', erro.message);
    });
  }

  return { ...atualizado, imagens: listaDeFotos(atualizado.imagens) };
}

export { listaDeFotos };
