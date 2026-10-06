import type { Request, Response } from 'express';
import prisma from '../config/database';

/** Corpo de PUT /notificacoes/configuracoes: só os interruptores enviados mudam. */
interface CorpoDasConfiguracoes {
  notificacao_email?: boolean;
  notificacao_popup?: boolean;
  notificacao_sms?: boolean;
  email_novo_veterinario?: boolean;
  popup_novo_veterinario?: boolean;
  sms_novo_veterinario?: boolean;
}

/** Por quais canais um aviso deve sair. */
export interface CanaisDeNotificacao {
  email: boolean;
  popup: boolean;
  sms: boolean;
}

class NotificacaoController {
  // Obter configurações de notificação
  async obterConfiguracoes(_req: Request, res: Response) {
    try {
      // Sempre há apenas uma configuração no sistema
      let config = await prisma.configuracaoNotificacao.findFirst();

      // Se não existir, criar com valores padrão
      if (!config) {
        config = await prisma.configuracaoNotificacao.create({
          data: {
            notificacao_email: true,
            notificacao_popup: true,
            notificacao_sms: false,
            email_novo_veterinario: true,
            popup_novo_veterinario: true,
            sms_novo_veterinario: false
          }
        });
      }

      return res.json(config);
    } catch (error: unknown) {
      console.error('Erro ao obter configurações:', error);
      return res.status(500).json({ error: 'Erro ao obter configurações' });
    }
  }

  // Atualizar configurações de notificação
  async atualizarConfiguracoes(req: Request, res: Response) {
    try {
      const corpo: CorpoDasConfiguracoes = req.body;
      const {
        notificacao_email,
        notificacao_popup,
        notificacao_sms,
        email_novo_veterinario,
        popup_novo_veterinario,
        sms_novo_veterinario
      } = corpo;

      // Buscar configuração existente
      let config = await prisma.configuracaoNotificacao.findFirst();

      if (!config) {
        // Criar se não existir
        config = await prisma.configuracaoNotificacao.create({
          data: {
            notificacao_email: notificacao_email ?? true,
            notificacao_popup: notificacao_popup ?? true,
            notificacao_sms: notificacao_sms ?? false,
            email_novo_veterinario: email_novo_veterinario ?? true,
            popup_novo_veterinario: popup_novo_veterinario ?? true,
            sms_novo_veterinario: sms_novo_veterinario ?? false
          }
        });
      } else {
        // Atualizar existente
        config = await prisma.configuracaoNotificacao.update({
          where: { id: config.id },
          data: {
            ...(notificacao_email !== undefined && { notificacao_email }),
            ...(notificacao_popup !== undefined && { notificacao_popup }),
            ...(notificacao_sms !== undefined && { notificacao_sms }),
            ...(email_novo_veterinario !== undefined && { email_novo_veterinario }),
            ...(popup_novo_veterinario !== undefined && { popup_novo_veterinario }),
            ...(sms_novo_veterinario !== undefined && { sms_novo_veterinario })
          }
        });
      }

      return res.json(config);
    } catch (error: unknown) {
      console.error('Erro ao atualizar configurações:', error);
      return res.status(500).json({ error: 'Erro ao atualizar configurações' });
    }
  }

  // Verificar se deve enviar notificação
  async deveNotificar(tipo: string): Promise<CanaisDeNotificacao> {
    try {
      const config = await prisma.configuracaoNotificacao.findFirst();

      if (!config) {
        // Valores padrão se não houver configuração
        return {
          email: true,
          popup: true,
          sms: false
        };
      }

      if (tipo === 'novo_veterinario') {
        return {
          email: config.notificacao_email && config.email_novo_veterinario,
          popup: config.notificacao_popup && config.popup_novo_veterinario,
          sms: config.notificacao_sms && config.sms_novo_veterinario
        };
      }

      // Tipo geral
      return {
        email: config.notificacao_email,
        popup: config.notificacao_popup,
        sms: config.notificacao_sms
      };
    } catch (error: unknown) {
      console.error('Erro ao verificar notificações:', error);
      // Em caso de erro, retornar valores padrão
      return {
        email: true,
        popup: true,
        sms: false
      };
    }
  }
}

const notificacaoController = new NotificacaoController();

// As rotas e o `notificacao-admin.service` fazem `require(...)` e leem os
// métodos direto da instância — a forma exportada precisa continuar a mesma.
module.exports = notificacaoController;

export default notificacaoController;
