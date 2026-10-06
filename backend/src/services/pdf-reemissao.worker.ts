import { pendentesDeReemissao, reemitirDocumentos, JANELA_DIAS } from './pdf-reemissao.service';

/**
 * Fila de reemissão dos PDFs que o fechamento não conseguiu gerar.
 *
 * Sem ela, uma indisponibilidade momentânea do R2 na hora de fechar o
 * atendimento deixava o tutor permanentemente sem receita e sem prontuário —
 * com o registro clínico correto no banco e nenhum documento para mostrar.
 */

const INTERVALO_MS = 30 * 60 * 1000;
const ATRASO_INICIAL_MS = 150 * 1000;

interface ResultadoDoCiclo {
  pendentes: number;
  reemitidos: number;
  falhas: number;
}

async function processarReemissoes(): Promise<ResultadoDoCiclo> {
  const pendentes = await pendentesDeReemissao();
  let reemitidos = 0;
  let falhas = 0;

  for (const atendimento of pendentes) {
    try {
      const feito = await reemitirDocumentos(atendimento);
      if (feito.receita || feito.prontuario) reemitidos += 1;
    } catch (erro) {
      // Continua fora do ar: o próximo ciclo tenta de novo, dentro da janela.
      falhas += 1;
      console.warn(`⚠️  [PDF] Reemissão do atendimento ${atendimento.id} falhou: ${(erro as Error).message}`);
    }
  }

  return { pendentes: pendentes.length, reemitidos, falhas };
}

function startPdfReemissaoWorker(): NodeJS.Timeout {
  console.log(`📄 [WORKER] Reemissão de documentos inicializada (a cada 30 min, janela de ${JANELA_DIAS} dias).`);

  const ciclo = async (): Promise<void> => {
    try {
      const { pendentes, reemitidos, falhas } = await processarReemissoes();
      if (pendentes > 0) {
        console.log(`📄 [PDF] ${reemitidos}/${pendentes} atendimento(s) com documento reemitido (${falhas} falha(s)).`);
      }
    } catch (erro) {
      console.error('❌ [PDF] Ciclo de reemissão falhou (ignorado):', (erro as Error).message);
    }
  };

  setTimeout(ciclo, ATRASO_INICIAL_MS);
  return setInterval(ciclo, INTERVALO_MS);
}

export { startPdfReemissaoWorker, processarReemissoes };
