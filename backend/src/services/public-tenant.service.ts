import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

/**
 * Qual organização responde pelo que é público.
 *
 * Blog, landing, formulários abertos e sitemap não têm ninguém logado, então
 * não têm `req.tenantId` — mas os dados que eles leem são de um tenant. Este
 * arquivo é a resposta única para "de quem é este conteúdo quando não há
 * sessão", em vez de cada rota pública chutar um slug.
 */

export type TenantPublico = { id: string; slug: string; nome: string };

/**
 * @throws 503 quando o tenant público não existe ou está suspenso — e 503 é
 *         proposital: o problema é do serviço, não do visitante. Um 404 diria
 *         que a página não existe, e ela existe; é a configuração que falta.
 */
export async function resolvePublicTenant(): Promise<TenantPublico> {
  const slug = process.env.PUBLIC_TENANT_SLUG || 'saudepet';

  const tenant = await prisma.tenant.findFirst({
    where: { slug, status: { in: ['ativo', 'trial'] } },
    select: { id: true, slug: true, nome: true }
  });

  if (!tenant) {
    throw new AppError('Canal público temporariamente indisponível', 503);
  }

  return tenant;
}

/**
 * Tenant para uma tela administrativa, em ordem de confiança.
 *
 * 1. O da sessão, quando existe — é o único que já passou por autenticação.
 * 2. `?tenant_id=` da query, conferido no banco. Serve ao super_admin que
 *    inspeciona outra organização; a checagem de PERMISSÃO para isso é de quem
 *    chama, não daqui.
 * 3. O público, como último recurso.
 */
export async function resolveAdminTenant(
  req: { tenantId?: string | null; query?: Record<string, unknown> }
): Promise<string> {
  if (req.tenantId) return req.tenantId;

  const pedido = req.query?.tenant_id;
  if (typeof pedido === 'string' && pedido) {
    const tenant = await prisma.tenant.findUnique({ where: { id: pedido }, select: { id: true } });
    if (tenant) return tenant.id;
  }

  return (await resolvePublicTenant()).id;
}

module.exports = { resolvePublicTenant, resolveAdminTenant };
