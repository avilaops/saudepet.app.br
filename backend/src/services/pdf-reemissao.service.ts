import { logoParaDocumento } from './logo-veterinario.service';
import type { Prisma, StatusAtendimento } from '@prisma/client';
import prisma from '../config/database';
import type { PdfService, DadosDoPaciente } from './pdf.service';

/**
 * Reemissão dos documentos que o fechamento não conseguiu gerar.
 *
 * A geração dos PDFs no `finalizar` é best-effort e acontece fora da
 * transação: se o R2 estiver fora do ar naquele instante, o atendimento fecha
 * com o registro clínico correto e `receita_pdf_url`/`prontuario_pdf_url`
 * nulos. Até aqui ninguém tentava de novo — o tutor simplesmente ficava sem a
 * receita e sem o prontuário, e a única saída era refazer à mão.
 *
 * Este serviço recompõe os documentos a partir do que está no banco. Nada é
 * inventado: se o prontuário não existe, não há o que reemitir.
 */

/** Janela de tentativas. Depois disso, o silêncio é proposital: algo mais
 *  grave aconteceu e insistir para sempre só polui o log. */
const JANELA_DIAS = 7;

const STATUS_FECHADOS: StatusAtendimento[] = ['finalizado', 'concluido', 'encaminhado'];

const INCLUDE_DA_REEMISSAO = {
  pet: true,
  tutor: { select: { nome: true, cpf: true } },
  veterinario: { include: { usuario: { select: { nome: true } } } },
  prontuario: { include: { itensPrescricao: true, examesSolicitados: true } }
} satisfies Prisma.SolicitacaoInclude;

type SolicitacaoCarregada = Prisma.SolicitacaoGetPayload<{ include: typeof INCLUDE_DA_REEMISSAO }>;

/**
 * O atendimento como a fila o entrega: a consulta exige `prontuario: { isNot: null }`,
 * então o registro clínico é garantido — o tipo diz isso em vez de deixar
 * cada leitura fingir que ele pode faltar.
 */
export type AtendimentoParaReemissao = Omit<SolicitacaoCarregada, 'prontuario'> & {
  prontuario: NonNullable<SolicitacaoCarregada['prontuario']>;
};

function dadosDoPaciente(atendimento: AtendimentoParaReemissao): DadosDoPaciente & { idadePet?: number | null } {
  const vet = atendimento.veterinario;
  return {
    protocolo: atendimento.id.slice(0, 8).toUpperCase(),
    nomeTutor: atendimento.tutor?.nome,
    cpfTutor: atendimento.tutor?.cpf,
    nomePet: atendimento.pet?.nome,
    especiePet: atendimento.pet?.especie || atendimento.pet?.tipo,
    racaPet: atendimento.pet?.raca,
    idadePet: atendimento.pet?.idade,
    pesoPet: atendimento.pet?.peso,
    nomeVet: vet?.usuario?.nome,
    crmvVet: vet?.crmv,
    ufCrmv: vet?.crmv_uf || 'SP',
    dataAtendimento: (atendimento.finalizado_em || atendimento.criado_em).toLocaleDateString('pt-BR')
  };
}

/** Atendimentos fechados, dentro da janela, com algum documento faltando. */
async function pendentesDeReemissao({ limite = 20 }: { limite?: number } = {}): Promise<AtendimentoParaReemissao[]> {
  const desde = new Date(Date.now() - JANELA_DIAS * 86400000);

  const pendentes = await prisma.solicitacao.findMany({
    where: {
      status: { in: STATUS_FECHADOS },
      finalizado_em: { gte: desde },
      OR: [{ receita_pdf_url: null }, { prontuario_pdf_url: null }],
      prontuario: { isNot: null }
    },
    orderBy: { finalizado_em: 'asc' },
    take: limite,
    include: INCLUDE_DA_REEMISSAO
  });

  // O filtro `prontuario: { isNot: null }` acima é o que sustenta este tipo.
  return pendentes as AtendimentoParaReemissao[];
}

/**
 * Reemite o que faltar de um atendimento.
 * @returns o que foi gerado agora.
 */
async function reemitirDocumentos(atendimento: AtendimentoParaReemissao): Promise<{ receita: boolean; prontuario: boolean }> {
  const pdfService: PdfService = require('./pdf.service');
  const registro = atendimento.prontuario;
  const base = { ...dadosDoPaciente(atendimento), logoVet: await logoParaDocumento(atendimento.veterinario) };
  const dados: { receita_pdf_url?: string; prontuario_pdf_url?: string } = {};

  if (!atendimento.receita_pdf_url) {
    const itens = registro.itensPrescricao || [];
    const resultado = await pdfService.gerarReceitaPdf({
      ...base,
      medicamentos: itens.map((item) => ({
        nome: [item.medicamento, item.concentracao].filter(Boolean).join(' '),
        posologia: [item.posologia, item.duracao_dias ? `Por ${item.duracao_dias} dia(s).` : null].filter(Boolean).join(' ')
      })),
      // Sem itens estruturados, o texto livre é o corpo do documento.
      orientacoes: [itens.length ? null : atendimento.receita, registro.orientacoes_tutor].filter(Boolean).join('\n\n') || null,
      versao: atendimento.receita_versao || 1
    });
    dados.receita_pdf_url = resultado.cdnUrl;
  }

  if (!atendimento.prontuario_pdf_url) {
    const resultado = await pdfService.gerarProntuarioPdf({
      ...base,
      anamnese: registro.queixa_principal,
      exameFisico: registro.exame_fisico,
      hipotesesDiagnosticas: [
        registro.hipotese_diagnostica,
        registro.diagnostico_definitivo && registro.diagnostico_definitivo !== registro.hipotese_diagnostica
          ? `Diagnóstico definitivo: ${registro.diagnostico_definitivo}`
          : null
      ].filter(Boolean).join('\n'),
      conduta: [atendimento.receita, registro.orientacoes_tutor].filter(Boolean).join('\n\n') || null,
      exames: registro.examesSolicitados || [],
      retornoSugerido: registro.retorno_sugerido_em
        ? new Date(registro.retorno_sugerido_em).toLocaleDateString('pt-BR')
        : null
    });
    dados.prontuario_pdf_url = resultado.cdnUrl;
  }

  if (!Object.keys(dados).length) return { receita: false, prontuario: false };

  await prisma.solicitacao.update({ where: { id: atendimento.id }, data: dados });
  if (dados.prontuario_pdf_url && registro?.id) {
    await prisma.prontuarioEletronico.update({
      where: { id: registro.id },
      data: { pdf_prontuario_url: dados.prontuario_pdf_url }
    });
  }

  return { receita: Boolean(dados.receita_pdf_url), prontuario: Boolean(dados.prontuario_pdf_url) };
}

module.exports = { pendentesDeReemissao, reemitirDocumentos, dadosDoPaciente, JANELA_DIAS, STATUS_FECHADOS };

export { pendentesDeReemissao, reemitirDocumentos, dadosDoPaciente, JANELA_DIAS, STATUS_FECHADOS };
