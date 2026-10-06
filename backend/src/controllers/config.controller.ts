import type { Request, Response } from 'express';
import emailService from '../services/email.service';

const mensagemDoErro = (erro: unknown): string | undefined =>
  erro instanceof Error ? erro.message : undefined;

class ConfigController {
  // Testar conexão SMTP
  async testarSMTP(req: Request, res: Response) {
    try {
      const result = await emailService.testarConexao();
      return res.json(result);
    } catch (error) {
      console.error('Erro ao testar SMTP:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao testar conexão SMTP',
        error: mensagemDoErro(error)
      });
    }
  }

  // Obter configurações SMTP (sem expor a senha)
  async obterConfigSMTP(req: Request, res: Response) {
    try {
      const config = {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER
      };
      return res.json(config);
    } catch (error) {
      console.error('Erro ao obter configuração SMTP:', error);
      return res.status(500).json({ error: 'Erro ao obter configuração SMTP' });
    }
  }

  // Enviar e-mail de teste
  async enviarEmailTeste(req: Request, res: Response) {
    try {
      const destinatario: unknown = req.body.destinatario;

      if (!destinatario) {
        return res.status(400).json({ error: 'Destinatário é obrigatório' });
      }

      await emailService.enviarEmailTeste(String(destinatario));

      return res.json({
        success: true,
        message: 'E-mail de teste enviado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao enviar e-mail de teste:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao enviar e-mail de teste',
        error: mensagemDoErro(error)
      });
    }
  }
}

const configController = new ConfigController();

module.exports = configController;
export default configController;
