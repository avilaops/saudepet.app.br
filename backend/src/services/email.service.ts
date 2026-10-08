import { dataHoraBr } from '../utils/datas';
import axios from 'axios';

// `nodemailer` não traz tipos e `@types/nodemailer` não está instalado; o
// contrato abaixo descreve só o que a casa usa do transporte SMTP.
interface TransporteSmtp {
  sendMail(opcoes: { from: string; to: string | string[]; subject: string; html: string }): Promise<unknown>;
  verify(): Promise<unknown>;
}

interface ConfiguracaoSmtp {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string | undefined; pass: string | undefined };
}

const nodemailer = require('nodemailer') as { createTransport(config: ConfiguracaoSmtp): TransporteSmtp };

/** Cada template recebe os dados do e-mail e devolve o HTML pronto. */
type Template = (dados: Record<string, unknown>) => string;

interface TemplatesDeEmail {
  auth: { verificacaoEmail: Template; recuperacaoSenha: Template; alertaSenhaAlterada: Template };
  tutor: {
    boasVindas: Template;
    solicitacaoRecebida: Template;
    veterinarioACaminho: Template;
    prontuarioPrescricao: Template;
    avaliacaoNps: Template;
    lembreteRetorno: Template;
    alertaVacina: Template;
    lembreteMedicamento: Template;
    agendamentoConsulta: Template;
  };
  vet: {
    cadastroRecebido: Template;
    cadastroAprovado: Template;
    cadastroAjuste: Template;
    chamadoUrgente: Template;
    extratoMensal: Template;
    agendamentoConsulta: Template;
  };
  admin: { novoVetPendente: Template; alertaSla: Template; alertaNpsRuim: Template };
}

const templates = require('../templates/emails') as TemplatesDeEmail;

export interface AnexoDeEmail {
  filename: string;
  path: string;
}

export interface EnvioDeEmail {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: AnexoDeEmail[];
  from?: string;
}

export interface ResultadoDoEnvio {
  success: boolean;
  resendId?: string;
}

/** Dados livres dos e-mails de jornada: cada template lê os campos que precisa. */
export type DadosDoEmail = Record<string, unknown>;

/** `erro.response?.data || erro.message`, sem supor que o erro é um Error. */
function detalheDoErro(erro: unknown): unknown {
  const e = erro as { response?: { data?: unknown }; message?: string } | null;
  return e?.response?.data || e?.message;
}

class EmailService {
  transporter!: TransporteSmtp;

  constructor() {
    this.configureSMTP();
  }

  configureSMTP(): void {
    const smtpConfig: ConfiguracaoSmtp = {
      // O padrão acompanha a caixa própria do Saúde Pet (noreply@saudepet.app.br
      // no mail.avilaops.com, 27/08/2026). Antes caía na Porkbun, que era a caixa
      // pessoal do Nicolas: um ambiente sem SMTP_HOST tentava autenticar no lugar
      // errado e falhava sem dizer por quê.
      host: process.env.SMTP_HOST || 'mail.avilaops.com',
      port: parseInt(process.env.SMTP_PORT || '') || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD
      }
    };

    this.transporter = nodemailer.createTransport(smtpConfig);
    console.log('📧 Serviço de e-mail (SMTP) configurado');
  }

  /**
   * Método centralizado de envio de e-mails com suporte a Resend API + Fallback SMTP
   */
  async sendMail({ to, subject, html, attachments, from }: EnvioDeEmail): Promise<ResultadoDoEnvio> {
    const sender = from || process.env.EMAIL_FROM || `"Saúde Pet" <${process.env.SMTP_USER}>`;

    // Prioridade 1: Resend HTTP API (HTTPS 443)
    if (process.env.RESEND_API_KEY) {
      try {
        const payload: { from: string; to: string[]; subject: string; html: string; attachments?: AnexoDeEmail[] } = {
          from: sender.includes('<') ? sender : `"Saúde Pet" <${sender}>`,
          to: Array.isArray(to) ? to : [to],
          subject,
          html
        };
        if (attachments && attachments.length > 0) {
          payload.attachments = attachments;
        }

        const response = await axios.post<{ id?: string }>(
          'https://api.resend.com/emails',
          payload,
          {
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log(`✅ [RESEND] E-mail enviado com sucesso para: ${to}`);
        return { success: true, resendId: response.data?.id };
      } catch (resendError) {
        console.error('⚠️ [RESEND] Falha no envio via Resend API:', detalheDoErro(resendError));
      }
    }

    // Prioridade 2: SMTP (Porkbun / Nodemailer)
    try {
      const mailOptions = {
        from: sender,
        to,
        subject,
        html
      };
      await this.transporter.sendMail(mailOptions);
      console.log(`✅ [SMTP] E-mail enviado com sucesso para: ${to}`);
      return { success: true };
    } catch (smtpError) {
      console.error('❌ [SMTP] Erro ao enviar e-mail:', (smtpError as Error).message);
      throw smtpError;
    }
  }

  // ═══════════════════════════════════════════════════════
  // 1. AUTENTICAÇÃO E CONTA
  // ═══════════════════════════════════════════════════════
  async enviarEmailVerificacao(destinatario: string, nomeUsuario: string, verifyUrl: string): Promise<ResultadoDoEnvio> {
    const html = templates.auth.verificacaoEmail({ nomeUsuario, verifyUrl });
    return this.sendMail({
      to: destinatario,
      subject: '📧 Confirme seu e-mail para ativar sua conta no Saúde PET',
      html
    });
  }

  async enviarEmailResetSenha(destinatario: string, nomeUsuario: string, resetUrl: string): Promise<ResultadoDoEnvio> {
    const html = templates.auth.recuperacaoSenha({ nomeUsuario, resetUrl });
    return this.sendMail({
      to: destinatario,
      subject: '🔐 Instruções para redefinir sua senha — Saúde PET',
      html
    });
  }

  async enviarEmailConfirmacaoMudancaSenha(destinatario: string, nomeUsuario: string, dataHora: string): Promise<ResultadoDoEnvio> {
    const html = templates.auth.alertaSenhaAlterada({ nomeUsuario, dataHora });
    return this.sendMail({
      to: destinatario,
      subject: '🛡️ Sua senha no Saúde PET foi alterada',
      html
    });
  }

  // ═══════════════════════════════════════════════════════
  // 2. JORNADA DO TUTOR
  // ═══════════════════════════════════════════════════════
  async enviarEmailBoasVindasTutor(destinatario: string, nomeTutor: string): Promise<ResultadoDoEnvio> {
    const html = templates.tutor.boasVindas({ nomeTutor });
    return this.sendMail({
      to: destinatario,
      subject: '🐾 Bem-vindo ao Saúde PET!',
      html
    });
  }

  async enviarEmailSolicitacaoRecebida(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.tutor.solicitacaoRecebida(dados);
    return this.sendMail({
      to: destinatario,
      subject: `📋 Solicitação #${dados.protocolo || '1234'} recebida — Saúde PET`,
      html
    });
  }

  async enviarEmailVeterinarioACaminho(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.tutor.veterinarioACaminho(dados);
    return this.sendMail({
      to: destinatario,
      subject: `🚗 O veterinário está a caminho para atender ${dados.nomePet} — Saúde PET`,
      html
    });
  }

  async enviarEmailProntuarioPrescricao(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.tutor.prontuarioPrescricao(dados);
    return this.sendMail({
      to: destinatario,
      subject: `📄 Prontuário e Receita Digital de ${dados.nomePet} — Saúde PET`,
      html
    });
  }

  async enviarEmailAvaliacaoNps(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.tutor.avaliacaoNps(dados);
    return this.sendMail({
      to: destinatario,
      subject: `⭐ Como foi a consulta do ${dados.nomePet}? — Saúde PET`,
      html
    });
  }

  async enviarEmailLembreteRetorno(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.tutor.lembreteRetorno(dados);
    return this.sendMail({
      to: destinatario,
      subject: `🩺 Lembrete de retorno para ${dados.nomePet} — Saúde PET`,
      html
    });
  }

  async enviarEmailAlertaVacina(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.tutor.alertaVacina(dados);
    return this.sendMail({
      to: destinatario,
      subject: `💉 Vacina ${dados.nomeVacina || 'V10'} do ${dados.nomePet} vence em breve — Saúde PET`,
      html
    });
  }

  async enviarEmailLembreteMedicamento(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.tutor.lembreteMedicamento(dados);
    return this.sendMail({
      to: destinatario,
      subject: `💊 Lembrete de reposição de medicamento para ${dados.nomePet} — Saúde PET`,
      html
    });
  }

  async enviarEmailAgendamentoTutor(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.tutor.agendamentoConsulta(dados);
    const assuntos: Record<string, string> = {
      marcado: `📅 Consulta marcada para ${dados.nomePet} — Saúde PET`,
      remarcado: `🔁 A consulta de ${dados.nomePet} mudou de horário — Saúde PET`,
      cancelado: `❌ A consulta de ${dados.nomePet} foi cancelada — Saúde PET`,
      lembrete: `⏰ Lembrete: consulta de ${dados.nomePet} em breve — Saúde PET`
    };
    const assunto = assuntos[String(dados.evento)] || `📅 Atualização da consulta de ${dados.nomePet} — Saúde PET`;
    return this.sendMail({ to: destinatario, subject: assunto, html });
  }

  // ═══════════════════════════════════════════════════════
  // 3. JORNADA DO VETERINÁRIO PARCEIRO
  // ═══════════════════════════════════════════════════════
  async enviarEmailPendenciaAprovacao(
    destinatario: string,
    nomeVeterinario: string,
    crmvVet?: string | null,
    ufCrmv?: string | null
  ): Promise<ResultadoDoEnvio> {
    const html = templates.vet.cadastroRecebido({ nomeVet: nomeVeterinario, crmvVet, ufCrmv });
    return this.sendMail({
      to: destinatario,
      subject: '⏳ Cadastro recebido em análise — Saúde PET',
      html
    });
  }

  async enviarEmailAprovacao(destinatario: string, nomeVeterinario: string): Promise<ResultadoDoEnvio> {
    const html = templates.vet.cadastroAprovado({ nomeVet: nomeVeterinario });
    return this.sendMail({
      to: destinatario,
      subject: '🎉 Seu cadastro profissional no Saúde PET foi aprovado!',
      html
    });
  }

  async enviarEmailRejeicao(destinatario: string, nomeVeterinario: string, motivo = ''): Promise<ResultadoDoEnvio> {
    const html = templates.vet.cadastroAjuste({ nomeVet: nomeVeterinario, motivo });
    return this.sendMail({
      to: destinatario,
      subject: '⚠️ Ajuste necessário no seu cadastro — Saúde PET',
      html
    });
  }

  async enviarEmailChamadoUrgenteVet(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.vet.chamadoUrgente(dados);
    return this.sendMail({
      to: destinatario,
      subject: `🚨 Novo chamado de atendimento próximo em ${dados.bairroCidade || 'sua região'} — Saúde PET`,
      html
    });
  }

  async enviarEmailExtratoMensalVet(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.vet.extratoMensal(dados);
    return this.sendMail({
      to: destinatario,
      subject: `💰 Extrato financeiro de ${dados.mesAno} — Saúde PET`,
      html
    });
  }

  async enviarEmailAgendamentoVet(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.vet.agendamentoConsulta(dados);
    const assuntos: Record<string, string> = {
      confirmado: `✅ ${dados.nomeTutor} confirmou a consulta de ${dados.dataHora} — Saúde PET`,
      cancelado: `❌ ${dados.nomeTutor} cancelou a consulta de ${dados.dataHora} — Saúde PET`
    };
    const assunto = assuntos[String(dados.evento)] || `🗓️ Atualização de agendamento — Saúde PET`;
    return this.sendMail({ to: destinatario, subject: assunto, html });
  }

  // ═══════════════════════════════════════════════════════
  // 4. ALERTAS INTERNOS E ADMIN
  // ═══════════════════════════════════════════════════════
  async enviarEmailNovoVetAdmin(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.admin.novoVetPendente(dados);
    return this.sendMail({
      to: destinatario,
      subject: `🔔 [ADMIN] Novo CRMV pendente de análise: Dr(a). ${dados.nomeVet}`,
      html
    });
  }

  async enviarEmailAlertaSlaAdmin(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.admin.alertaSla(dados);
    return this.sendMail({
      to: destinatario,
      subject: `🚨 [SLA URGENTE] Chamado #${dados.protocolo} sem aceite há ${dados.tempoDecorrido || '10 min'}`,
      html
    });
  }

  async enviarEmailAlertaNpsRuimAdmin(destinatario: string, dados: DadosDoEmail): Promise<ResultadoDoEnvio> {
    const html = templates.admin.alertaNpsRuim(dados);
    return this.sendMail({
      to: destinatario,
      subject: `⚠️ [QUALIDADE] Avaliação de ${dados.nota} estrela(s) no Atendimento #${dados.protocolo}`,
      html
    });
  }

  async enviarEmailReceitaEProntuario(
    destinatario: string,
    nomeTutor: string,
    nomePet: string,
    receitaUrl?: string | null,
    prontuarioUrl?: string | null
  ): Promise<ResultadoDoEnvio> {
    const html = `
      <div style="font-family: sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
        <h2 style="color: #0f766e; margin-top: 0;">📄 Documentos Médicos de ${nomePet}</h2>
        <p>Olá, <strong>${nomeTutor}</strong>!</p>
        <p>O atendimento veterinário do(a) seu(sua) pet <strong>${nomePet}</strong> foi concluído com sucesso pela equipe do Saúde PET.</p>
        <p>Disponibilizamos abaixo os links oficiais para download dos seus documentos assinados:</p>

        <div style="margin: 24px 0; display: flex; gap: 12px; flex-wrap: wrap;">
          ${receitaUrl ? `<a href="${receitaUrl}" target="_blank" style="background-color: #0d9488; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">📄 Baixar Receita Médica (PDF)</a>` : ''}
          ${prontuarioUrl ? `<a href="${prontuarioUrl}" target="_blank" style="background-color: #0f766e; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">📋 Baixar Prontuário Clínico (PDF)</a>` : ''}
        </div>

        <p style="font-size: 12px; color: #64748b;">Em caso de dúvidas sobre a posologia ou orientações, acesse o aplicativo Saúde PET para conversar com o profissional responsável.</p>
      </div>
    `;

    return this.sendMail({
      to: destinatario,
      subject: `📄 Receita e Prontuário Médico de ${nomePet} — Saúde PET`,
      html,
      attachments: [
        ...(receitaUrl ? [{ filename: `Receita_${nomePet}.pdf`, path: receitaUrl }] : []),
        ...(prontuarioUrl ? [{ filename: `Prontuario_${nomePet}.pdf`, path: prontuarioUrl }] : [])
      ]
    });
  }

  // O "enviar e-mail de teste" do painel reaproveitava `enviarEmailAprovacao`:
  // quem testava o SMTP recebia um comunicado de "cadastro profissional
  // aprovado". Teste de servidor precisa parecer teste de servidor.
  async enviarEmailTeste(destinatario: string): Promise<ResultadoDoEnvio> {
    const quando = dataHoraBr();
    return this.sendMail({
      to: destinatario,
      subject: 'Teste de envio — Saúde PET',
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 12px;font-size:18px">Envio de e-mail funcionando</h2>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6">Esta mensagem foi disparada pelo painel administrativo do Saúde PET para conferir a configuração do servidor de e-mail.</p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6">Se você recebeu isto, o SMTP está entregando normalmente.</p>
        <p style="margin:16px 0 0;font-size:12px;color:#64748b">Disparado em ${quando}. Nenhuma ação é necessária.</p>
      </div>`
    });
  }

  async testarConexao(): Promise<{ success: boolean; provider: string }> {
    if (process.env.RESEND_API_KEY) {
      console.log('✅ Provedor de e-mail ativo: Resend API (HTTPS)');
      return { success: true, provider: 'Resend API' };
    }
    try {
      await this.transporter.verify();
      console.log('✅ Servidor SMTP pronto para envio');
      return { success: true, provider: 'SMTP' };
    } catch (error) {
      console.error('❌ Erro ao conectar com servidor SMTP:', error);
      throw error;
    }
  }
}

const emailService = new EmailService();

// A exportação continua sendo a INSTÂNCIA: dezenas de arquivos fazem
// `require('../services/email.service')` e chamam `.sendMail()` direto.
module.exports = emailService;

export type { EmailService };
export default emailService;
