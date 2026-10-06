import { graphPost } from './meta-graph.service';

function isConfigured(): boolean {
  return Boolean(process.env.META_THREADS_USER_ID && process.env.META_THREADS_ACCESS_TOKEN);
}

/**
 * Publicação no Threads é em 2 passos: cria um container de mídia e depois publica.
 * https://developers.facebook.com/docs/threads/posts
 */
async function publishText(text: string): Promise<{ id: string }> {
  if (!isConfigured()) {
    throw new Error('Integração com Threads não configurada (META_THREADS_USER_ID/META_THREADS_ACCESS_TOKEN ausentes)');
  }
  const userId = process.env.META_THREADS_USER_ID as string;
  const token = process.env.META_THREADS_ACCESS_TOKEN as string;

  const container = await graphPost<{ id: string }>(`${userId}/threads`, token, {
    media_type: 'TEXT',
    text
  });

  const publish = await graphPost<{ id: string }>(`${userId}/threads_publish`, token, {
    creation_id: container.id
  });

  return publish;
}

export { isConfigured, publishText };
