import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { Veterinario } from '@prisma/client';
import prisma from '../config/database';
import { UFS } from '../schemas/auth.schema';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  asyncHandler
} from '../middleware/error.middleware';
import { uploadBuffer } from '../config/r2';
import { removerLogo, salvarLogo } from '../services/logo-veterinario.service';
import { analisarDocumento } from '../services/documento-veterinario.service';
import * as vetAnalytics from '../services/vet-analytics.service';
import AuditService from '../services/audit.service';
import { avisarNovoVeterinario } from '../services/notificacao-admin.service';
import emailService from '../services/email.service';
import { ProntuarioIaService } from '../services/prontuario-ia.service';
import type { updateOnlineStatusSchema } from '../schemas/veterinario.schema';
import type { z } from 'zod';

const usuarioDe = (req: Request) => String(req.userId);
const tenantDe = (req: Request) => String(req.tenantId);

/** Query string vem como texto, lista ou objeto; só o texto interessa aqui. */
const textoDaQuery = (valor: unknown): string | undefined =>
  typeof valor === 'string' ? valor : undefined;

/** O recorte do cadastro que decide se o profissional pode entrar de plantão. */
type CadastroParaPlantao = Pick<Veterinario, 'aprovado_admin' | 'dados_bancarios' | 'especialidade'>;

interface Pendencia {
  campo: string;
  texto: string;
  onde: string | null;
}

/** Corpo de PUT /perfil, já validado pelo `updateVeterinarioSchema`. */
interface CorpoDoPerfil {
  especialidade?: string;
  sobre?: string | null;
  crmv?: string;
  crmv_uf?: string | null;
  raio_atendimento_km?: number | string | null;
  area_atuacao?: string | null;
}

type CorpoDoStatusOnline = z.infer<typeof updateOnlineStatusSchema>;

class VeterinarioController {
  // Upload da foto do documento profissional (CRMV/diploma) + análise por IA
  uploadDocumento = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = usuarioDe(req);

    if (!req.file) {
      throw new ValidationError('Nenhum arquivo enviado');
    }

    const veterinario = await prisma.veterinario.findUnique({
      where: { usuario_id: usuarioId, tenant_id: tenantDe(req) },
      include: { usuario: { select: { nome: true } } }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const ext = req.file.originalname.split('.').pop();
    const key = `veterinarios/${veterinario.id}/documento-${crypto.randomUUID()}.${ext}`;
    const url = await uploadBuffer(req.file.buffer, key, req.file.mimetype);

    const analise = await analisarDocumento({
      imageUrl: url,
      contentType: req.file.mimetype,
      crmvDigitado: veterinario.crmv,
      nomeDigitado: veterinario.usuario.nome
    });

    const atualizado = await prisma.veterinario.update({
      where: { id: veterinario.id },
      data: {
        documento_url: url,
        documento_analise: analise,
        documento_analisado_em: new Date()
      }
    });

    return res.json({
      documento_url: atualizado.documento_url,
      documento_analise: atualizado.documento_analise
    });
  });

  // Atualizar status online/offline
  /**
   * O que falta para este profissional poder entrar de plantão.
   *
   * A regra do produto exige aprovação E configuração, e só a aprovação era
   * conferida: um veterinário aprovado entrava na fila sem dados bancários,
   * aceitava um atendimento, e a plataforma descobria depois que não tinha para
   * onde mandar o repasse. Quem pagava por isso era o tutor, esperando.
   *
   * Devolve a lista do que falta — não um "não" seco: a tela precisa dizer o
   * que fazer, e cada item tem para onde levar.
   */
  static pendenciasParaPlantao(veterinario: CadastroParaPlantao): Pendencia[] {
    const pendencias: Pendencia[] = [];

    if (!veterinario.aprovado_admin) {
      pendencias.push({ campo: 'aprovacao', texto: 'Seu cadastro ainda está em análise.', onde: null });
    }
    if (!veterinario.dados_bancarios) {
      pendencias.push({
        campo: 'dados_bancarios',
        texto: 'Cadastre a conta que vai receber os repasses.',
        onde: '/veterinario/conta-bancaria'
      });
    }
    if (!veterinario.especialidade) {
      pendencias.push({
        campo: 'especialidade',
        texto: 'Informe sua especialidade — é o que o tutor vê antes de aceitar.',
        onde: '/veterinario/perfil'
      });
    }

    return pendencias;
  }

  atualizarStatusOnline = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = usuarioDe(req);
    const corpo: CorpoDoStatusOnline = req.body;
    const { online, latitude, longitude } = corpo;

    const veterinario = await prisma.veterinario.findUnique({
      where: { usuario_id: usuarioId, tenant_id: tenantDe(req) }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    // Sair de plantão nunca é bloqueado: seria prender alguém disponível.
    if (online) {
      const pendencias = VeterinarioController.pendenciasParaPlantao(veterinario);
      if (pendencias.length > 0) {
        return res.status(400).json({
          error: 'Complete seu cadastro para entrar de plantão.',
          pendencias
        });
      }
    }

    const veterinarioAtualizado = await prisma.veterinario.update({
      where: { usuario_id: usuarioId },
      data: {
        online,
        ...(latitude !== undefined && { latitude }),
        ...(longitude !== undefined && { longitude })
      }
    });

    return res.json(veterinarioAtualizado);
  });

  // Buscar veterinários online (para tutores)
  listarOnline = asyncHandler(async (req: Request, res: Response) => {
    const cidade = textoDaQuery(req.query.cidade);

    // Cidade padrão configurável pelo painel; a env fica como último recurso.
    const cidadeEfetiva = cidade
      || (await prisma.configuracaoTenant.findUnique({ where: { tenant_id: tenantDe(req) }, select: { cidade_padrao: true } }))?.cidade_padrao
      || process.env.CIDADE_INICIAL;

    const veterinarios = await prisma.veterinario.findMany({
      where: {
        tenant_id: tenantDe(req),
        online: true,
        aprovado_admin: true,
        usuario: {
          cidade: cidadeEfetiva
        }
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            foto_perfil: true,
            cidade: true
          }
        }
      }
    });

    return res.json(veterinarios);
  });

  // Obter dados do veterinário logado
  /**
   * Pedir credenciamento como veterinário, já estando dentro da conta.
   *
   * Até 26/08/2026 o único jeito de ser veterinário era escolher isso na tela
   * de cadastro, no primeiro segundo da vida da conta. Quem entrasse com o
   * Google virava tutor sem ser perguntado (o `AUTH_DEFAULT_ROLE`), e quem se
   * cadastrasse como tutor ficava tutor para sempre: não havia NENHUMA rota,
   * em lugar nenhum do backend, que mudasse o papel de alguém. A saída real
   * era criar uma segunda conta, com outro e-mail.
   *
   * Aqui o pedido é só um pedido. O papel NÃO muda agora: o registro nasce
   * `PENDING_REVIEW` e quem promove é o admin, ao aprovar — CRMV é documento
   * profissional, não campo de formulário. Enquanto isso, a pessoa segue
   * usando a conta como tutor normalmente.
   *
   * Idempotente de propósito: quem pede duas vezes recebe a situação do
   * pedido que já existe, não um erro nem um registro duplicado.
   */
  solicitarCredenciamento = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = usuarioDe(req);
    const tenantId = tenantDe(req);
    const corpo: { crmv?: unknown; especialidade?: unknown; crmv_uf?: unknown } = req.body;
    const { crmv, especialidade } = corpo;
    const crmvUf = typeof corpo.crmv_uf === 'string' ? corpo.crmv_uf.trim().toUpperCase() : '';

    const jaExiste = await prisma.veterinario.findUnique({
      where: { usuario_id: usuarioId },
      select: { id: true, crmv: true, status_credenciamento: true, aprovado_admin: true, motivo_decisao: true }
    });

    if (jaExiste) {
      return res.json({
        success: true,
        jaSolicitado: true,
        message: jaExiste.aprovado_admin
          ? 'Seu credenciamento já está aprovado.'
          : 'Seu pedido já está em análise. Avisamos assim que a equipe decidir.',
        credenciamento: jaExiste
      });
    }

    if (!crmv || !String(crmv).trim()) {
      throw new ValidationError('CRMV é obrigatório para pedir credenciamento');
    }
    if (!UFS.includes(crmvUf)) {
      throw new ValidationError('Informe o estado (UF) do seu CRMV');
    }

    const usuario = await prisma.usuario.findFirst({
      where: { id: usuarioId, tenant_id: tenantId },
      select: { id: true, nome: true, email: true, cidade: true }
    });

    if (!usuario) {
      throw new NotFoundError('Usuário não encontrado');
    }

    const veterinario = await prisma.veterinario.create({
      data: {
        tenant_id: tenantId,
        usuario_id: usuarioId,
        crmv: String(crmv).trim().toUpperCase(),
        crmv_uf: crmvUf,
        especialidade: String(especialidade || 'Clínica geral').trim(),
        aprovado_admin: false,
        status_credenciamento: 'PENDING_REVIEW'
      },
      select: { id: true, crmv: true, crmv_uf: true, especialidade: true, status_credenciamento: true, aprovado_admin: true }
    });

    // Mesmo aviso do cadastro público de veterinário: a fila de moderação
    // precisa saber que chegou gente, senão o pedido espera pelo acaso de
    // alguém abrir a tela.
    void avisarNovoVeterinario({
      tenantId,
      io: req.app.get('io'),
      veterinario: {
        id: usuario.id,
        tenant_id: tenantId,
        nome: usuario.nome,
        email: usuario.email,
        cidade: usuario.cidade,
        crmv: veterinario.crmv,
        especialidade: veterinario.especialidade
      }
    });

    try {
      await emailService.enviarEmailPendenciaAprovacao(usuario.email, usuario.nome);
    } catch (erro: unknown) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error('⚠️  Falha ao avisar sobre a pendência de aprovação:', mensagem);
    }

    await AuditService.logForensicEvent({
      req,
      entityType: 'veterinario',
      entityId: veterinario.id,
      action: 'credenciamento_solicitado',
      motivo: 'Pedido de credenciamento feito de dentro da conta'
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Pedido enviado. A equipe confere o CRMV e avisa por e-mail — sua conta continua funcionando normalmente enquanto isso.',
      credenciamento: veterinario
    });
  });

  /**
   * Logo do consultório na receita e no prontuário.
   * POST /veterinarios/logo-documentos (multipart, campo `logo`)
   */
  enviarLogoDocumentos = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new ValidationError('Nenhum arquivo enviado');
    const veterinario = await prisma.veterinario.findUnique({
      where: { usuario_id: usuarioDe(req), tenant_id: tenantDe(req) }
    });
    if (!veterinario) throw new NotFoundError('Veterinário não encontrado');

    const url = await salvarLogo(veterinario, req.file.buffer);

    // A marca vai impressa em documento clínico: a troca fica registrada.
    await AuditService.logForensicEvent({
      req,
      entityType: 'veterinario',
      entityId: veterinario.id,
      action: 'logo_documentos_enviado',
      motivo: 'Logo do consultório para receita e prontuário'
    }).catch(() => {});

    return res.json({ success: true, logo_documentos_url: url });
  });

  /** DELETE /veterinarios/logo-documentos */
  removerLogoDocumentos = asyncHandler(async (req: Request, res: Response) => {
    const veterinario = await prisma.veterinario.findUnique({
      where: { usuario_id: usuarioDe(req), tenant_id: tenantDe(req) }
    });
    if (!veterinario) throw new NotFoundError('Veterinário não encontrado');

    await removerLogo(veterinario);
    await AuditService.logForensicEvent({
      req,
      entityType: 'veterinario',
      entityId: veterinario.id,
      action: 'logo_documentos_removido',
      motivo: 'Documentos voltam a sair só com a marca Saúde PET'
    }).catch(() => {});

    return res.json({ success: true, logo_documentos_url: null });
  });

  obterDados = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = usuarioDe(req);

    const veterinario = await prisma.veterinario.findUnique({
      where: { usuario_id: usuarioId, tenant_id: tenantDe(req) },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            telefone: true,
            cidade: true,
            foto_perfil: true,
            foto_capa: true,
            sobre: true
          }
        }
      }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    return res.json(veterinario);
  });

  // Atualizar dados do veterinário
  atualizar = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = usuarioDe(req);
    const corpo: CorpoDoPerfil = req.body;
    const { especialidade, sobre, crmv, crmv_uf, raio_atendimento_km, area_atuacao } = corpo;

    const veterinario = await prisma.veterinario.findUnique({
      where: { usuario_id: usuarioId, tenant_id: tenantDe(req) }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    // O CRMV era enviado pela tela e descartado em silêncio aqui — o vet
    // corrigia o número, lia "Perfil atualizado com sucesso!" e nada mudava.
    // Agora é aceito, mas com o cuidado que o dado exige: o CRMV é a
    // credencial que o admin analisou. Depois de aprovado, trocá-lo por conta
    // própria transformaria a aprovação em carta branca para qualquer número.
    const crmvNovo = typeof crmv === 'string' ? crmv.trim().toUpperCase() : undefined;
    const mudouCrmv = crmvNovo !== undefined && crmvNovo !== veterinario.crmv;
    // A UF segue a mesma regra do número: faz parte da credencial conferida.
    const ufNova = typeof crmv_uf === 'string' ? crmv_uf.trim().toUpperCase() : undefined;
    const mudouUf = ufNova !== undefined && ufNova !== (veterinario.crmv_uf || '');

    if (mudouUf && veterinario.status_credenciamento === 'APPROVED' && veterinario.crmv_uf) {
      throw new ConflictError('O estado do CRMV já foi verificado no credenciamento e não pode ser alterado por aqui.');
    }

    if (mudouCrmv) {
      if (!crmvNovo) {
        throw new ValidationError('O CRMV não pode ficar em branco.');
      }
      if (veterinario.status_credenciamento === 'APPROVED') {
        throw new ConflictError(
          'Seu CRMV já foi verificado no credenciamento e não pode ser alterado por aqui. ' +
          'Envie o documento novo em "Documentação" para que a equipe analise a mudança.'
        );
      }
      const jaExiste = await prisma.veterinario.findFirst({
        where: { tenant_id: tenantDe(req), crmv: crmvNovo, NOT: { usuario_id: usuarioId } },
        select: { id: true }
      });
      if (jaExiste) {
        throw new ConflictError('Este CRMV já está cadastrado por outro veterinário.');
      }
    }

    const atualizado = await prisma.veterinario.update({
      where: { usuario_id: usuarioId },
      data: {
        ...(especialidade && { especialidade }),
        ...(sobre !== undefined && { sobre }),
        ...(mudouCrmv && { crmv: crmvNovo }),
        ...(mudouUf && { crmv_uf: ufNova || null }),
        // Vazio volta a valer o raio da cidade — é escolha legítima, e por isso
        // `null` é aceito em vez de ignorado.
        ...(raio_atendimento_km !== undefined && {
          raio_atendimento_km: raio_atendimento_km === null || raio_atendimento_km === ''
            ? null
            : Math.min(200, Math.max(1, Number(raio_atendimento_km) || 0)) || null
        }),
        ...(area_atuacao !== undefined && {
          area_atuacao: area_atuacao ? String(area_atuacao).trim().slice(0, 200) : null
        })
      },
      include: {
        usuario: true
      }
    });

    return res.json(atualizado);
  });

  // Obter estatísticas do veterinário
  estatisticas = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = usuarioDe(req);
    const tenantId = tenantDe(req);

    const veterinario = await prisma.veterinario.findUnique({
      where: { usuario_id: usuarioId, tenant_id: tenantId }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    // Números reais: dinheiro vem de PaymentSplit e as distribuições do
    // vet-analytics — a versão anterior devolvia TODOs zerados e a tela
    // desenhava um gráfico hardcoded por cima.
    const [financeiro, faturamento_por_mes, avaliacoes, atendimentos_por_tipo] = await Promise.all([
      vetAnalytics.resumoFinanceiro({ veterinarioId: veterinario.id }),
      vetAnalytics.faturamentoPorMes({ veterinarioId: veterinario.id, meses: 6 }),
      vetAnalytics.distribuicaoDeAvaliacoes({ tenantId, veterinarioId: veterinario.id }),
      vetAnalytics.atendimentosPorTipo({ tenantId, veterinarioId: veterinario.id })
    ]);

    return res.json({
      totalAtendimentos: veterinario.total_atendimentos,
      avaliacaoMedia: avaliacoes.media ?? Number(veterinario.avaliacao_media) ?? null,
      totalAvaliacoes: avaliacoes.total,
      distribuicaoAvaliacoes: avaliacoes.distribuicao,
      financeiro,
      faturamento_por_mes,
      atendimentos_por_tipo
    });
  });

  // Buscar veterinário por ID (público). Aceita tanto o id do Veterinario
  // quanto o id do Usuario dele: as conversas do chat identificam o outro
  // lado pelo usuário, e era esse 404 que deixava o chat do tutor em branco.
  buscarPorId = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const veterinario = await prisma.veterinario.findFirst({
      where: { tenant_id: tenantDe(req), OR: [{ id }, { usuario_id: id }] },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            foto_perfil: true,
            cidade: true,
            sobre: true
          }
        }
      }
    });

    if (!veterinario) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    if (!veterinario.aprovado_admin) {
      throw new ForbiddenError('Veterinário ainda não aprovado');
    }

    return res.json(veterinario);
  });

  /**
   * Processa texto de voz/ditado e retorna a estrutura clínica do prontuário
   */
  parseProntuarioPorVoz = asyncHandler(async (req: Request, res: Response) => {
    const corpo: { texto?: unknown } = req.body;
    const { texto } = corpo;
    if (!texto || typeof texto !== 'string' || !texto.trim()) {
      throw new ValidationError('O texto ditado é obrigatório para processamento da IA.');
    }

    const estruturado = await ProntuarioIaService.parseTextoVoz(texto);

    return res.json({
      success: true,
      dados: estruturado
    });
  });
}

const veterinarioController = new VeterinarioController();

// As rotas fazem `require('../controllers/veterinario.controller')` e leem os
// métodos direto da instância — a forma exportada precisa continuar a mesma.
module.exports = veterinarioController;

export default veterinarioController;
