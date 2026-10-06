import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { deleteObject, keyFromUrl } from '../config/r2';
import { sugerirTextosDoBanner } from '../services/banner-copy.service';
import { uploadBannerImage } from '../services/banner-image.service';
import type { UsuarioAutenticado } from '../types/express';

// Campos que o admin pode alterar via PUT /:id, separados pelo tipo que o
// Prisma aceita em cada um. `status` fica de fora de propósito: publicar/
// pausar/arquivar passa por /:id/publish (com senha) e /:id/status, nunca por
// um update genérico.
/** Texto obrigatório no modelo: aceita string, nunca null. */
const CAMPOS_DE_TEXTO = ['title', 'altText', 'desktopImageUrl'] as const;
/** Texto opcional no modelo: aceita string ou null (para limpar). */
const CAMPOS_DE_TEXTO_ANULAVEIS = ['targetUrl', 'buttonLabel', 'mobileImageUrl'] as const;
/** Datas: string ISO vira Date; vazio ou null limpa. */
const CAMPOS_DE_DATA = ['startsAt', 'endsAt'] as const;
// ...e `position`, tratado à parte porque vem como string no multipart.

/** Arquivos que o multer pendura em `req.files` quando a rota usa `fields()`. */
type ArquivosDoBanner = { [campo: string]: Express.Multer.File[] | undefined };

const arquivosDaRequisicao = (req: Request): ArquivosDoBanner | undefined =>
  req.files && !Array.isArray(req.files) ? req.files : undefined;

const texto = (valor: unknown): string | undefined => (typeof valor === 'string' ? valor : undefined);

const corpoDaRequisicao = (req: Request): Record<string, unknown> =>
  (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

/** `req.ip || x-forwarded-for || null`, sem deixar um array chegar ao banco. */
function ipDaRequisicao(req: Request): string | null {
  const encaminhado = req.headers['x-forwarded-for'];
  return req.ip || (Array.isArray(encaminhado) ? encaminhado[0] : encaminhado) || null;
}

/** O admin autenticado. Sem `authMiddleware` na frente a rota não faz sentido. */
function usuarioDaRequisicao(req: Request): UsuarioAutenticado {
  if (!req.user) throw new Error('Usuário não autenticado');
  return req.user;
}

/**
 * O tenant do admin. `tenant_id` é nulo para super_admin sem organização; o
 * Prisma recusaria o `null` num campo obrigatório, então o erro sobe daqui.
 */
function tenantDaRequisicao(req: Request): string {
  const { tenant_id } = usuarioDaRequisicao(req);
  if (!tenant_id) throw new Error('Usuário sem organização associada');
  return tenant_id;
}

function descreverErro(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  return { message: String(error) };
}

type ConferenciaDeSenha =
  | { ok: false; status: number; message: string }
  | { ok: true; user: { id: string; email: string } };

/**
 * Confere a senha do admin nas ações críticas (publicar/excluir).
 *
 * Usa `senha`, que é o campo com que o login autentica. O schema também tem
 * `senha_hash`, mas ele nasceu vazio em todos os usuários: comparar com ele
 * entregava null ao bcrypt ("Illegal arguments: string, object") e derrubava
 * a rota com 500 em vez de recusar a senha.
 */
async function conferirSenhaAdmin(userId: string, password: string): Promise<ConferenciaDeSenha> {
  const user = await prisma.usuario.findUnique({ where: { id: userId } });

  if (!user) {
    return { ok: false, status: 401, message: 'Usuário não encontrado' };
  }

  if (!user.senha) {
    return {
      ok: false,
      status: 400,
      message: 'Sua conta entra por login social e não tem senha definida. Defina uma senha para confirmar esta ação.'
    };
  }

  if (!(await bcrypt.compare(password, user.senha))) {
    return { ok: false, status: 401, message: 'Senha de confirmação incorreta' };
  }

  return { ok: true, user };
}

class BannerController {
  /**
   * 🌐 ROTA PÚBLICA: Consulta apenas banners PUBLISHED dentro da vigência
   */
  async getPublicBanners(req: Request, res: Response) {
    try {
      console.log('📌 [HTTP] getPublicBanners chamado!');
      const tenantSlug = texto(req.query.tenant_slug) || process.env.PUBLIC_TENANT_SLUG || 'saudepet';
      let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });

      if (!tenant) {
        // Tenta buscar o primeiro tenant cadastrado se a slug padrão não existir
        tenant = await prisma.tenant.findFirst();
      }

      if (!tenant) {
        return res.json({ success: true, count: 0, banners: [] });
      }

      const now = new Date();

      const banners = await prisma.landingBanner.findMany({
        where: {
          tenantId: tenant.id,
          status: 'PUBLISHED',
          AND: [
            {
              OR: [
                { startsAt: null },
                { startsAt: { lte: now } }
              ]
            },
            {
              OR: [
                { endsAt: null },
                { endsAt: { gte: now } }
              ]
            }
          ]
        },
        orderBy: { position: 'asc' }
      });

      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.json({ success: true, count: banners.length, banners });
    } catch (error) {
      console.error('❌ Erro ao buscar banners públicos:', error);
      const { message, stack } = descreverErro(error);
      return res.status(500).json({ success: false, error: message, stack });
    }
  }

  /**
   * 🏢 ROTA ADMIN: Lista todos os banners do tenant com suporte a histórico de auditoria
   */
  async getAdminBanners(req: Request, res: Response) {
    try {
      const tenantId = tenantDaRequisicao(req);

      const banners = await prisma.landingBanner.findMany({
        where: { tenantId },
        include: {
          auditLogs: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { position: 'asc' }
      });

      return res.json({ success: true, count: banners.length, banners });
    } catch (error) {
      console.error('❌ Erro ao listar banners no admin:', error);
      return res.status(500).json({ success: false, message: 'Erro ao carregar banners no painel' });
    }
  }

  /**
   * 📸 ROTA ADMIN: Upload & Criação de Banner (Salvo como DRAFT por padrão)
   */
  async createBanner(req: Request, res: Response) {
    try {
      const usuario = usuarioDaRequisicao(req);
      const tenantId = tenantDaRequisicao(req);
      const corpo = corpoDaRequisicao(req);
      const title = texto(corpo.title);
      const altText = texto(corpo.altText);
      const targetUrl = texto(corpo.targetUrl);
      const buttonLabel = texto(corpo.buttonLabel);
      const startsAt = texto(corpo.startsAt);
      const endsAt = texto(corpo.endsAt);
      const position = corpo.position;

      let desktopImageUrl = texto(corpo.desktopImageUrl);
      let mobileImageUrl = texto(corpo.mobileImageUrl);

      // Se enviou arquivos de imagem no upload
      const arquivos = arquivosDaRequisicao(req);
      if (arquivos) {
        if (arquivos.desktopImage?.[0]) {
          const file = arquivos.desktopImage[0];
          this.validateImageFile(file);
          desktopImageUrl = (await uploadBannerImage(file, tenantId, 'desktop')).url;
        }

        if (arquivos.mobileImage?.[0]) {
          const file = arquivos.mobileImage[0];
          this.validateImageFile(file);
          mobileImageUrl = (await uploadBannerImage(file, tenantId, 'mobile')).url;
        }
      }

      if (!desktopImageUrl) {
        return res.status(400).json({ success: false, message: 'Imagem desktop é obrigatória' });
      }

      const totalBanners = await prisma.landingBanner.count({ where: { tenantId } });

      const newBanner = await prisma.landingBanner.create({
        data: {
          tenantId,
          title: title || 'Novo Banner Rascunho',
          altText: altText || title || 'Banner promocional',
          desktopImageUrl,
          mobileImageUrl: mobileImageUrl || desktopImageUrl,
          targetUrl: targetUrl || null,
          buttonLabel: buttonLabel || null,
          status: 'DRAFT',
          position: position ? parseInt(String(position)) : totalBanners,
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
          createdById: usuario.id
        }
      });

      // Registra Log de Auditoria de Criação
      await prisma.bannerAuditLog.create({
        data: {
          tenantId,
          bannerId: newBanner.id,
          action: 'LANDING_BANNER_DRAFT_SAVED',
          bannerTitle: newBanner.title,
          performedById: usuario.id,
          performedByName: usuario.nome || 'Administrador',
          userIp: ipDaRequisicao(req),
          newVersion: JSON.stringify(newBanner)
        }
      });

      return res.status(201).json({
        success: true,
        message: 'Banner salvo como rascunho com sucesso',
        banner: newBanner
      });
    } catch (error) {
      console.error('❌ Erro ao criar banner:', error);
      return res.status(400).json({ success: false, message: descreverErro(error).message || 'Erro ao criar banner' });
    }
  }

  /**
   * ✨ ROTA ADMIN: Sugere título, alt text e rótulo do botão a partir da imagem
   *
   * Não grava nada: devolve o texto para o admin revisar e editar antes de salvar.
   */
  async suggestCopy(req: Request, res: Response) {
    try {
      const arquivos = arquivosDaRequisicao(req);
      const arquivo = arquivos?.desktopImage?.[0] || arquivos?.mobileImage?.[0];
      if (arquivo) this.validateImageFile(arquivo);

      const brief = corpoDaRequisicao(req).brief;
      const resultado = await sugerirTextosDoBanner({
        imageBase64: arquivo ? arquivo.buffer.toString('base64') : undefined,
        mimeType: arquivo?.mimetype,
        brief: typeof brief === 'string' ? brief.slice(0, 500) : ''
      });

      if (!resultado.ok) {
        return res.status(resultado.status).json({ success: false, message: resultado.message });
      }

      console.log(`✨ [IA] Textos de banner sugeridos para tenant ${req.user?.tenant_id} (${resultado.modelo})`);

      return res.json({ success: true, sugestao: resultado.sugestao });
    } catch (error) {
      console.error('❌ Erro ao sugerir textos do banner:', error);
      return res.status(400).json({ success: false, message: descreverErro(error).message || 'Erro ao gerar os textos' });
    }
  }

  /**
   * ✏️ ROTA ADMIN: Atualizar Rascunho de Banner
   */
  async updateBanner(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const usuario = usuarioDaRequisicao(req);
      const tenantId = tenantDaRequisicao(req);
      const corpo = corpoDaRequisicao(req);

      const existingBanner = await prisma.landingBanner.findFirst({
        where: { id, tenantId }
      });

      if (!existingBanner) {
        return res.status(404).json({ success: false, message: 'Banner não encontrado ou sem permissão' });
      }

      // Só aceita os campos da whitelist. Evita que um PUT com { status: 'PUBLISHED' }
      // coloque banner no ar sem passar pela confirmação de senha.
      const updateData: Prisma.LandingBannerUncheckedUpdateInput = {};
      for (const field of CAMPOS_DE_TEXTO) {
        const valor = corpo[field];
        if (typeof valor === 'string') updateData[field] = valor;
      }
      for (const field of CAMPOS_DE_TEXTO_ANULAVEIS) {
        const valor = corpo[field];
        if (typeof valor === 'string' || valor === null) updateData[field] = valor;
      }

      for (const field of CAMPOS_DE_DATA) {
        const valor = corpo[field];
        if (valor === undefined) continue;
        if (typeof valor === 'string' && valor) updateData[field] = new Date(valor);
        else if (valor === '' || valor === null) updateData[field] = null;
      }

      // multipart/form-data sempre chega como string; o Prisma espera Int aqui.
      if (corpo.position !== undefined) updateData.position = parseInt(String(corpo.position), 10);

      const arquivos = arquivosDaRequisicao(req);
      if (arquivos) {
        if (arquivos.desktopImage?.[0]) {
          const file = arquivos.desktopImage[0];
          this.validateImageFile(file);
          updateData.desktopImageUrl = (await uploadBannerImage(file, tenantId, 'desktop')).url;
        }
        if (arquivos.mobileImage?.[0]) {
          const file = arquivos.mobileImage[0];
          this.validateImageFile(file);
          updateData.mobileImageUrl = (await uploadBannerImage(file, tenantId, 'mobile')).url;
        }
      }

      const updatedBanner = await prisma.landingBanner.update({
        where: { id },
        data: updateData
      });

      await prisma.bannerAuditLog.create({
        data: {
          tenantId,
          bannerId: id,
          action: 'LANDING_BANNER_UPDATED',
          bannerTitle: updatedBanner.title,
          performedById: usuario.id,
          performedByName: usuario.nome || 'Administrador',
          userIp: ipDaRequisicao(req),
          previousVersion: JSON.stringify(existingBanner),
          newVersion: JSON.stringify(updatedBanner)
        }
      });

      return res.json({ success: true, message: 'Banner atualizado', banner: updatedBanner });
    } catch (error) {
      console.error('❌ Erro ao atualizar banner:', error);
      return res.status(500).json({ success: false, message: 'Erro ao atualizar banner' });
    }
  }

  /**
   * 🔒 ROTA CRÍTICA ADMIN: Publicar Banner com Confirmação por Senha do Usuário
   */
  async publishBannerWithPassword(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const password = texto(corpoDaRequisicao(req).password);
      const usuario = usuarioDaRequisicao(req);
      const tenantId = tenantDaRequisicao(req);

      if (!password) {
        return res.status(400).json({ success: false, message: 'Senha de confirmação é obrigatória para publicar' });
      }

      // 1. Confere permissão do usuário
      if (usuario.tipo_usuario !== 'admin' && usuario.tipo_usuario !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Apenas administradores podem publicar banners no site' });
      }

      // 2. Busca usuário no banco para validar senha no backend
      const conferencia = await conferirSenhaAdmin(usuario.id, password);
      if (!conferencia.ok) {
        return res.status(conferencia.status).json({ success: false, message: conferencia.message });
      }
      const user = conferencia.user;

      // 3. Busca banner garantindo isolamento por tenant
      const banner = await prisma.landingBanner.findFirst({
        where: { id, tenantId }
      });

      if (!banner) {
        return res.status(404).json({ success: false, message: 'Banner não encontrado para este tenant' });
      }

      const previousState = { ...banner };

      // 4. Publica o banner
      const publishedBanner = await prisma.landingBanner.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedById: usuario.id
        }
      });

      // 5. Registra log de auditoria detalhado
      await prisma.bannerAuditLog.create({
        data: {
          tenantId,
          bannerId: id,
          action: 'LANDING_BANNER_PUBLISHED',
          bannerTitle: publishedBanner.title,
          performedById: usuario.id,
          performedByName: usuario.nome || 'Administrador',
          userIp: ipDaRequisicao(req),
          previousVersion: JSON.stringify(previousState),
          newVersion: JSON.stringify(publishedBanner)
        }
      });

      console.log(`📢 [AUDITORIA] Banner #${id} (${publishedBanner.title}) PUBLICADO por ${user.email} IP: ${req.ip}`);

      return res.json({
        success: true,
        message: 'Banner publicado na landing page com sucesso!',
        banner: publishedBanner
      });
    } catch (error) {
      console.error('❌ Erro ao publicar banner:', error);
      return res.status(500).json({ success: false, message: 'Erro ao publicar banner' });
    }
  }

  /**
   * ⏸️ ROTA ADMIN: Alterar Estado do Banner (DRAFT, PAUSED, ARCHIVED)
   */
  async setBannerStatus(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const status = corpoDaRequisicao(req).status;
      const usuario = usuarioDaRequisicao(req);
      const tenantId = tenantDaRequisicao(req);

      // 'PUBLISHED' NÃO entra aqui: publicar exige senha e passa por
      // `publishBanner`. Aceitá-lo nesta rota abria um caminho para colocar
      // banner no ar sem senha nenhuma, furando o próprio portão.
      const validStatuses = ['DRAFT', 'SCHEDULED', 'PAUSED', 'ARCHIVED'] as const;
      const statusValido = validStatuses.find((candidato) => candidato === status);
      if (!statusValido) {
        return res.status(400).json({ success: false, message: 'Status de banner inválido' });
      }

      const banner = await prisma.landingBanner.findFirst({ where: { id, tenantId } });
      if (!banner) return res.status(404).json({ success: false, message: 'Banner não encontrado' });

      const updated = await prisma.landingBanner.update({
        where: { id },
        data: { status: statusValido }
      });

      await prisma.bannerAuditLog.create({
        data: {
          tenantId,
          bannerId: id,
          action: `LANDING_BANNER_STATUS_${statusValido}`,
          bannerTitle: updated.title,
          performedById: usuario.id,
          performedByName: usuario.nome || 'Administrador',
          userIp: req.ip || null,
          previousVersion: JSON.stringify(banner),
          newVersion: JSON.stringify(updated)
        }
      });

      return res.json({ success: true, message: `Status alterado para ${statusValido}`, banner: updated });
    } catch (error) {
      console.error('❌ Erro ao alterar status do banner:', error);
      return res.status(500).json({ success: false, message: 'Erro ao alterar status' });
    }
  }

  /**
   * 🔄 ROTA ADMIN: Reordenar Banners (Drag and Drop)
   */
  async reorderBanners(req: Request, res: Response) {
    try {
      const tenantId = tenantDaRequisicao(req);
      const { positions } = corpoDaRequisicao(req); // Array de { id, position }

      if (!Array.isArray(positions)) {
        return res.status(400).json({ success: false, message: 'Array de posições inválido' });
      }

      for (const item of positions as Array<{ id?: unknown; position?: unknown }>) {
        await prisma.landingBanner.updateMany({
          where: { id: String(item.id), tenantId },
          data: { position: parseInt(String(item.position)) }
        });
      }

      return res.json({ success: true, message: 'Ordem dos banners atualizada' });
    } catch (error) {
      console.error('❌ Erro ao reordenar banners:', error);
      return res.status(500).json({ success: false, message: 'Erro ao reordenar banners' });
    }
  }

  /**
   * ⏪ ROTA ADMIN: Restaurar Versão Anterior (Desfazer Publicação)
   */
  async rollbackBanner(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const usuario = usuarioDaRequisicao(req);
      const tenantId = tenantDaRequisicao(req);

      const lastAudit = await prisma.bannerAuditLog.findFirst({
        where: { bannerId: id, tenantId, previousVersion: { not: null } },
        orderBy: { createdAt: 'desc' }
      });

      if (!lastAudit || !lastAudit.previousVersion) {
        return res.status(400).json({ success: false, message: 'Nenhum histórico anterior encontrado para este banner' });
      }

      // O snapshot é o próprio LandingBanner serializado pelo `JSON.stringify`
      // de quem gravou o log; datas voltam como ISO string, que o Prisma aceita.
      const previousState: Record<string, unknown> = JSON.parse(lastAudit.previousVersion);
      delete previousState.id;
      delete previousState.createdAt;
      delete previousState.updatedAt;

      const restoredBanner = await prisma.landingBanner.update({
        where: { id },
        data: previousState as Prisma.LandingBannerUncheckedUpdateInput
      });

      await prisma.bannerAuditLog.create({
        data: {
          tenantId,
          bannerId: id,
          action: 'LANDING_BANNER_RESTORED',
          bannerTitle: restoredBanner.title,
          performedById: usuario.id,
          performedByName: usuario.nome || 'Administrador',
          userIp: req.ip || null,
          newVersion: JSON.stringify(restoredBanner)
        }
      });

      return res.json({ success: true, message: 'Versão anterior do banner restaurada com sucesso', banner: restoredBanner });
    } catch (error) {
      console.error('❌ Erro ao restaurar banner:', error);
      return res.status(500).json({ success: false, message: 'Erro ao desfazer publicação' });
    }
  }

  /**
   * 🗑️ ROTA CRÍTICA ADMIN: Excluir Banner Definitivamente (Confirmação por Senha)
   *
   * Exclusão é irreversível: apaga o registro, os logs de auditoria do banner
   * (cascata do schema) e as imagens no R2. Por isso exige senha, igual à publicação.
   * Para tirar do ar sem perder o histórico, use ARCHIVED em /:id/status.
   */
  async deleteBanner(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const corpo = corpoDaRequisicao(req);
      const password = texto(corpo.password);
      const usuario = usuarioDaRequisicao(req);
      const tenantId = tenantDaRequisicao(req);

      if (!password) {
        return res.status(400).json({ success: false, message: 'Senha de confirmação é obrigatória para excluir' });
      }

      if (usuario.tipo_usuario !== 'admin' && usuario.tipo_usuario !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Apenas administradores podem excluir banners' });
      }

      const conferencia = await conferirSenhaAdmin(usuario.id, password);
      if (!conferencia.ok) {
        return res.status(conferencia.status).json({ success: false, message: conferencia.message });
      }
      const user = conferencia.user;

      const banner = await prisma.landingBanner.findFirst({ where: { id, tenantId } });
      if (!banner) {
        return res.status(404).json({ success: false, message: 'Banner não encontrado para este tenant' });
      }

      // Grava o rastro ANTES de apagar: banner_audit_logs cai em cascata junto
      // com o banner, então o registro da exclusão vai para a auditoria central.
      await prisma.auditLog.create({
        data: {
          tenant_id: tenantId,
          usuario_id: usuario.id,
          actor_role: usuario.tipo_usuario,
          acao: 'LANDING_BANNER_DELETED',
          recurso: 'landing_banner',
          recurso_id: id,
          entity_type: 'landing_banner',
          entity_id: id,
          ip: ipDaRequisicao(req),
          user_agent: req.headers['user-agent'] || null,
          estado_anterior: JSON.parse(JSON.stringify(banner)), // datas viram ISO string no snapshot
          motivo: texto(corpo.motivo) || 'Exclusão solicitada pelo administrador no painel',
          detalhes: `Banner "${banner.title}" (status ${banner.status}) excluído por ${user.email}`
        }
      });

      await prisma.landingBanner.delete({ where: { id } });

      await this.removeBannerImages(banner, tenantId);

      console.log(`🗑️ [AUDITORIA] Banner #${id} (${banner.title}) EXCLUÍDO por ${user.email} IP: ${req.ip}`);

      return res.json({ success: true, message: 'Banner excluído definitivamente' });
    } catch (error) {
      console.error('❌ Erro ao excluir banner:', error);
      return res.status(500).json({ success: false, message: 'Erro ao excluir banner' });
    }
  }

  /**
   * 🧹 Remove as imagens do banner no R2 (best-effort).
   *
   * Só apaga chaves dentro de banners/<tenantId>/: desktopImageUrl e mobileImageUrl
   * aceitam URL externa no cadastro, e sem essa checagem uma URL apontada de
   * propósito para outro objeto do bucket seria destruída junto com o banner.
   */
  async removeBannerImages(
    banner: { desktopImageUrl: string | null; mobileImageUrl: string | null },
    tenantId: string
  ) {
    const tenantPrefix = `banners/${tenantId}/`;
    const urls = [...new Set([banner.desktopImageUrl, banner.mobileImageUrl].filter((url): url is string => Boolean(url)))];

    for (const url of urls) {
      const key = keyFromUrl(url);
      if (!key || !key.startsWith(tenantPrefix)) continue;

      try {
        await deleteObject(key);
      } catch (err) {
        // Imagem órfã no R2 não justifica falhar a exclusão já confirmada no banco.
        console.error(`⚠️ Falha ao remover imagem ${key} do R2:`, descreverErro(err).message);
      }
    }
  }

  /**
   * 🔍 Validação rigorosa de arquivos de imagem (JPEG, PNG, WebP, AVIF, bloqueio de SVG)
   */
  validateImageFile(file: { mimetype: string; size: number }) {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Formato de imagem inválido. Use apenas JPEG, PNG, WebP ou AVIF (arquivos SVG não são permitidos por segurança).');
    }

    if (file.size > maxSizeBytes) {
      throw new Error('A imagem deve ter no máximo 5MB.');
    }
  }
}

const bannerController = new BannerController();

module.exports = bannerController;
export default bannerController;
