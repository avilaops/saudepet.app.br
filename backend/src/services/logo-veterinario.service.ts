import sharp from 'sharp';
import prisma from '../config/database';
import { deleteObject, keyFromUrl, uploadBuffer } from '../config/r2';
import { ValidationError } from '../middleware/error.middleware';
import { RECURSOS, recursosDoVeterinario } from '../middleware/plano-vet.middleware';

/**
 * Logo do veterinário na receita e no prontuário.
 *
 * Os dois documentos saíam só com a marca Saúde PET. O profissional que tem
 * consultório próprio passa a poder imprimir a marca dele no cabeçalho — a do
 * Saúde PET continua lá, porque é a plataforma que assina e guarda o
 * documento.
 *
 * É um recurso de plano (`RECURSOS.LOGO_DOCUMENTOS`). Hoje todos os recursos
 * estão liberados para todos; quando a trava de plano voltar, este entra nela
 * sem mudar nada aqui: quem perde o recurso continua com o logo guardado, e
 * ele só deixa de ser impresso.
 */

/** Cabe no cabeçalho com folga para impressão em 300 dpi. */
const LARGURA_MAXIMA = 600;
const ALTURA_MAXIMA = 200;
/** Menor que isso vira borrão no papel. */
const LADO_MINIMO = 60;
const TAMANHO_MAXIMO_NO_PDF = 1024 * 1024;
const PREFIXO_DA_CHAVE = 'veterinarios/';

interface VeterinarioComLogo {
  id: string;
  tenant_id: string;
  usuario_id: string;
  logo_documentos_url?: string | null;
}

/**
 * Converte o que o veterinário enviou num PNG do tamanho do cabeçalho.
 *
 * Sempre PNG: é o que o `pdfkit` desenha (ele não lê WebP nem SVG) e mantém a
 * transparência de quem enviou logo sem fundo.
 */
export async function prepararLogo(original: Buffer): Promise<Buffer> {
  let imagem: ReturnType<typeof sharp>;
  let largura = 0;
  let altura = 0;
  try {
    imagem = sharp(original, { limitInputPixels: 40_000_000 }).rotate();
    const medidas = await imagem.metadata();
    largura = medidas.width || 0;
    altura = medidas.height || 0;
  } catch {
    throw new ValidationError('Não foi possível ler a imagem. Envie o logo em PNG, JPG ou WebP.');
  }
  if (largura < LADO_MINIMO || altura < LADO_MINIMO) {
    throw new ValidationError(`A imagem é pequena demais para imprimir (mínimo de ${LADO_MINIMO} px de cada lado).`);
  }
  return imagem
    .resize({ width: LARGURA_MAXIMA, height: ALTURA_MAXIMA, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Guarda o logo novo e apaga o anterior do R2. */
export async function salvarLogo(veterinario: VeterinarioComLogo, original: Buffer): Promise<string> {
  const png = await prepararLogo(original);
  const chave = `${PREFIXO_DA_CHAVE}${veterinario.id}/logo-documentos-${Date.now()}.png`;
  const url = await uploadBuffer(png, chave, 'image/png');
  await prisma.veterinario.update({ where: { id: veterinario.id }, data: { logo_documentos_url: url } });
  await apagarArquivo(veterinario.logo_documentos_url);
  return url;
}

export async function removerLogo(veterinario: VeterinarioComLogo): Promise<void> {
  await prisma.veterinario.update({ where: { id: veterinario.id }, data: { logo_documentos_url: null } });
  await apagarArquivo(veterinario.logo_documentos_url);
}

async function apagarArquivo(url?: string | null): Promise<void> {
  const chave = url ? keyFromUrl(url) : null;
  if (chave && chave.startsWith(PREFIXO_DA_CHAVE)) await deleteObject(chave).catch(() => {});
}

/**
 * O logo pronto para o `pdfkit`, ou `null`.
 *
 * Nunca lança: logo fora do ar, plano sem o recurso ou arquivo estranho não
 * podem impedir a emissão de uma receita. O documento sai sem o logo.
 */
export async function logoParaDocumento(
  veterinario?: (Pick<VeterinarioComLogo, 'id'> & Partial<VeterinarioComLogo>) | null
): Promise<Buffer | null> {
  const url = veterinario?.logo_documentos_url;
  if (!veterinario || !url || !veterinario.tenant_id || !veterinario.usuario_id) return null;
  try {
    // Só baixa o que este serviço gravou: a coluna não vira porta para o
    // backend buscar um endereço qualquer.
    const chave = keyFromUrl(url);
    if (!chave || !chave.startsWith(`${PREFIXO_DA_CHAVE}${veterinario.id}/logo-documentos-`) || !/^https:\/\//i.test(url)) return null;

    const { recursos } = await recursosDoVeterinario({ tenantId: veterinario.tenant_id, usuarioId: veterinario.usuario_id });
    if (!recursos.includes(RECURSOS.LOGO_DOCUMENTOS)) return null;

    const resposta = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!resposta.ok) return null;
    const bytes = Buffer.from(await resposta.arrayBuffer());
    const ehPng = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return ehPng && bytes.length <= TAMANHO_MAXIMO_NO_PDF ? bytes : null;
  } catch (erro) {
    console.warn(`[LOGO] Documento do veterinário ${veterinario.id} emitido sem logo:`, (erro as Error).message);
    return null;
  }
}
