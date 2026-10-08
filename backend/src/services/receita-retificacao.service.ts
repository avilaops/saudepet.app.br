import { dataBr } from '../utils/datas';
import { logoParaDocumento } from './logo-veterinario.service';
import prisma from '../config/database';
import { NotFoundError, ConflictError, ValidationError } from '../middleware/error.middleware';
import type { PdfService } from './pdf.service';
import type { EmailService } from './email.service';
import type { enviarParaUsuario } from './push.service';

/**
 * Correção de receita depois do atendimento fechado.
 *
 * O endpoint antigo alterava só o texto livre `Solicitacao.receita`: os
 * `PrescricaoItem` do prontuário ficavam com o conteúdo velho e o PDF já
 * emitido também. Resultado: o tutor com um documento assinado dizendo uma
 * coisa e o registro clínico dizendo outra, sem nada indicando qual valia.
 *
 * Aqui a correção é um ato explícito e rastreável: exige motivo, guarda a
 * versão anterior inteira (texto, itens e PDF), reemite o documento marcado
 * como retificação e avisa o tutor — que precisa saber que a via em mãos foi
 * substituída.
 */

/** Item de prescrição como chega do veterinário ou como está no prontuário. */
export type ItemDePrescricao = {
  medicamento: string;
  concentracao?: string | null;
  forma_farmaceutica?: string | null;
  posologia: string;
  duracao_dias?: number | null;
};

/** O recorte do veterinário autor que a retificação usa. */
export interface VeterinarioAutor {
  id: string;
  crmv?: string | null;
  crmv_uf?: string | null;
  usuario?: { nome?: string | null } | null;
  /** Para o logo do consultório no cabeçalho da receita retificada. */
  tenant_id?: string;
  usuario_id?: string;
  logo_documentos_url?: string | null;
}

export interface PedidoDeRetificacao {
  atendimentoId: string;
  tenantId: string;
  /** Registro do veterinário autor. */
  veterinario: VeterinarioAutor;
  /** Por que a receita está sendo corrigida. */
  motivo: string;
  /** Novos itens estruturados. */
  prescricoes?: ItemDePrescricao[] | null;
  /** Texto livre, quando não há itens. */
  receitaTexto?: string | null;
}

/** Texto plano da receita a partir dos itens estruturados. */
function textoDaPrescricao(itens: ItemDePrescricao[] = []): string | null {
  if (!itens.length) return null;
  return itens.map((item, indice) => {
    const nome = [item.medicamento, item.concentracao, item.forma_farmaceutica].filter(Boolean).join(' ');
    const duracao = item.duracao_dias ? ` Por ${item.duracao_dias} dia(s).` : '';
    return `${indice + 1}. ${nome} — ${item.posologia}${duracao}`;
  }).join('\n');
}

async function retificarReceita({ atendimentoId, tenantId, veterinario, motivo, prescricoes, receitaTexto }: PedidoDeRetificacao) {
  if (!motivo || motivo.trim().length < 10) {
    throw new ValidationError('Descreva o motivo da retificação com pelo menos 10 caracteres — ele vai no documento entregue ao tutor.');
  }

  const atendimento = await prisma.solicitacao.findFirst({
    where: { id: atendimentoId, tenant_id: tenantId },
    include: {
      pet: true,
      tutor: { select: { id: true, nome: true, email: true, cpf: true } },
      prontuario: { include: { itensPrescricao: true } }
    }
  });

  if (!atendimento) throw new NotFoundError('Atendimento não encontrado');
  if (atendimento.veterinario_id !== veterinario.id) {
    throw new ConflictError('Só o veterinário que conduziu o atendimento pode retificar a receita.');
  }

  const prontuario = atendimento.prontuario;
  const itensAnteriores: ItemDePrescricao[] = prontuario?.itensPrescricao || [];
  const itensNovos = Array.isArray(prescricoes) ? prescricoes : null;
  const novoTexto = itensNovos ? textoDaPrescricao(itensNovos) : (receitaTexto ?? atendimento.receita);
  const proximaVersao = (atendimento.receita_versao || 1) + 1;

  // PDF novo antes da transação: se o R2 falhar, nada é alterado e o
  // veterinário tenta de novo — melhor do que gravar a correção e deixar o
  // tutor com o documento antigo achando que está tudo certo.
  const pdfService: PdfService = require('../services/pdf.service');
  const resultado = await pdfService.gerarReceitaPdf({
    protocolo: `${atendimento.id.slice(0, 8).toUpperCase()}-V${proximaVersao}`,
    nomeTutor: atendimento.tutor?.nome,
    cpfTutor: atendimento.tutor?.cpf,
    nomePet: atendimento.pet?.nome,
    especiePet: atendimento.pet?.especie || atendimento.pet?.tipo,
    racaPet: atendimento.pet?.raca,
    pesoPet: atendimento.pet?.peso,
    nomeVet: veterinario.usuario?.nome,
    crmvVet: veterinario.crmv,
    ufCrmv: veterinario.crmv_uf || 'SP',
    medicamentos: (itensNovos || itensAnteriores).map((item) => ({
      nome: [item.medicamento, item.concentracao].filter(Boolean).join(' '),
      posologia: [item.posologia, item.duracao_dias ? `Por ${item.duracao_dias} dia(s).` : null].filter(Boolean).join(' ')
    })),
    orientacoes: itensNovos?.length ? null : novoTexto,
    dataAtendimento: dataBr(),
    logoVet: await logoParaDocumento(veterinario),
    versao: proximaVersao,
    motivoRetificacao: motivo.trim()
  });

  const atualizado = await prisma.$transaction(async (tx) => {
    await tx.receitaRetificacao.create({
      data: {
        tenant_id: tenantId,
        atendimento_id: atendimento.id,
        prontuario_id: prontuario?.id || null,
        veterinario_id: veterinario.id,
        versao: proximaVersao,
        motivo: motivo.trim(),
        receita_anterior: atendimento.receita,
        receita_nova: novoTexto,
        itens_anteriores: itensAnteriores.length ? itensAnteriores : undefined,
        itens_novos: itensNovos || undefined,
        pdf_anterior_url: atendimento.receita_pdf_url,
        pdf_novo_url: resultado.cdnUrl
      }
    });

    // Itens estruturados só são trocados quando vieram novos: retificar o
    // texto livre não pode apagar a prescrição estruturada do prontuário.
    if (itensNovos && prontuario) {
      await tx.prescricaoItem.deleteMany({ where: { prontuario_id: prontuario.id } });
      if (itensNovos.length) {
        await tx.prescricaoItem.createMany({
          data: itensNovos.map((item) => ({
            prontuario_id: prontuario.id,
            medicamento: item.medicamento,
            concentracao: item.concentracao || null,
            forma_farmaceutica: item.forma_farmaceutica || null,
            posologia: item.posologia,
            duracao_dias: item.duracao_dias ?? null
          }))
        });
      }
    }

    return tx.solicitacao.update({
      where: { id: atendimento.id },
      data: {
        receita: novoTexto,
        receita_pdf_url: resultado.cdnUrl,
        receita_versao: proximaVersao
      },
      select: { id: true, receita: true, receita_pdf_url: true, receita_versao: true, atualizado_em: true }
    });
  });

  // O tutor tem em mãos um documento que não vale mais.
  try {
    const pushService: { enviarParaUsuario: typeof enviarParaUsuario } = require('./push.service');
    void pushService.enviarParaUsuario(atendimento.tutor_id, {
      title: '📄 Receita atualizada',
      body: `A receita de ${atendimento.pet?.nome || 'seu pet'} foi corrigida pelo veterinário. Use a versão nova.`,
      url: `/tutor/atendimento/${atendimento.id}/prontuario`,
      tag: `receita-${atendimento.id}`
    });
  } catch (erro) {
    console.error('⚠️  [RETIFICACAO] Push ao tutor falhou (ignorado):', (erro as Error).message);
  }

  if (atendimento.tutor?.email) {
    const emailService: EmailService = require('./email.service');
    emailService.sendMail({
      to: atendimento.tutor.email,
      subject: `Receita atualizada — ${atendimento.pet?.nome || 'seu pet'}`,
      html: `<p>Olá, ${atendimento.tutor.nome || 'tutor(a)'}.</p>
        <p>O veterinário responsável corrigiu a receita do atendimento de <strong>${atendimento.pet?.nome || 'seu pet'}</strong>.</p>
        <p><strong>Motivo:</strong> ${motivo.trim()}</p>
        <p>A versão anterior não deve mais ser usada. <a href="${resultado.cdnUrl}">Abrir a receita atualizada</a>.</p>`
    }).catch((erro: unknown) => console.error('⚠️  [RETIFICACAO] E-mail ao tutor falhou (ignorado):', (erro as Error).message));
  }

  return { solicitacao: atualizado, versao: proximaVersao, pdf_url: resultado.cdnUrl };
}

module.exports = { retificarReceita, textoDaPrescricao };

export { retificarReceita, textoDaPrescricao };
