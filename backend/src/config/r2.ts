const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

async function uploadBuffer(
  buffer: Buffer,
  key: string,
  contentType: string,
  options: { cacheControl?: string } = {}
) {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ...(options.cacheControl ? { CacheControl: options.cacheControl } : {})
  }));
  return `${PUBLIC_URL}/${key}`;
}

async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Uma página de objetos do bucket sob um prefixo.
 *
 * Existe para a varredura de anexos órfãos (`anexo-retencao.worker.js`): o banco
 * não sabe o que existe no bucket, então a única forma de encontrar um objeto
 * que ficou sem linha é perguntar ao próprio R2. Devolve a página crua do S3 —
 * quem chama decide o que fazer com `IsTruncated`/`NextContinuationToken`.
 */
async function listObjects(
  { prefix, continuationToken = null, maxKeys = 1000 }: {
    prefix?: string;
    continuationToken?: string | null;
    maxKeys?: number;
  } = {}
) {
  return r2.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
    MaxKeys: maxKeys,
    ...(continuationToken ? { ContinuationToken: continuationToken } : {})
  }));
}

function keyFromUrl(url: string) {
  // Sem `R2_PUBLIC_URL` configurada não há prefixo a remover: o valor recebido
  // já é a chave. O compilador cobrou o caso, que em JavaScript virava
  // `startsWith(undefined)` e explodia em tempo de execução.
  if (!url || !PUBLIC_URL) return url || null;
  if (url.startsWith(PUBLIC_URL)) {
    return url.slice(PUBLIC_URL.length + 1);
  }
  return url;
}

/**
 * Gera URL temporaria assinada (15 minutos) para download privado de documentos do R2
 */
async function getSignedDownloadUrl(urlOrKey: string, expiresInSeconds = 900) {
  if (!urlOrKey) return null;
  const key = keyFromUrl(urlOrKey);
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return await getSignedUrl(r2, command, { expiresIn: expiresInSeconds });
  } catch (err: any) {
    console.error('❌ Error generating R2 signed URL:', err.message);
    return urlOrKey; // Fallback
  }
}

export {
  uploadBuffer,
  deleteObject,
  listObjects,
  keyFromUrl,
  getSignedDownloadUrl
};
