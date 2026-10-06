import prisma from '../config/database';
import { deleteObject, listObjects } from '../config/r2';

/**
 * Retenção dos anexos do chat no R2.
 *
 * Dois vazamentos conhecidos do bucket, ambos registrados no ROADMAP:
 *
 * 1. **Anexo órfão.** O arquivo sobe antes da linha existir em `mensagens_anexos`
 *    (`mensagem.controller.js`). Se a gravação falhar, o controller tenta apagar
 *    o objeto — mas quando essa remoção também falha o objeto fica pago no bucket
 *    para sempre, porque nada varria o R2 atrás dele.
 * 2. **Exclusão lógica não removia o binário.** Mensagem apagada mantinha o
 *    arquivo indefinidamente, sem prazo nenhum.
 *
 * A auditoria do conteúdo é intencional no produto — o admin do tenant enxerga a
 * mensagem excluída — então este worker **nunca apaga linha do banco**. Ele apaga
 * só o binário no R2 e carimba `arquivo_removido_em`, que serve a dois propósitos:
 * não tentar de novo no ciclo seguinte, e permitir à API dizer à tela que o
 * arquivo saiu por política de retenção em vez de servir uma URL quebrada.
 */

// Prazo entre a exclusão lógica da mensagem e a remoção do binário. Padrão de 90
// dias: tempo suficiente para uma contestação sobre o atendimento aparecer, curto
// o bastante para o bucket não crescer para sempre.
const DIAS_PADRAO = 90;
const DIAS_MINIMO = 7;
const DIAS_MAXIMO = 3650;

// Prefixo dos anexos de chat no R2 — o mesmo montado no envio da mensagem. A
// varredura de órfãos é cega ao conteúdo, então precisa ser cirúrgica no escopo:
// `banners/`, `pets/`, `usuarios/`, `veterinarios/`, `receitas/` e `prontuarios/`
// têm outros donos e nenhuma linha em `mensagens_anexos`. Apagar por lá seria
// destruir arquivo vivo.
const PREFIXO_CHAT = 'chat/';

// Um objeto recém-subido pode estar no intervalo entre o upload e o `create` da
// linha. 24h é folga larga o suficiente para nunca competir com um envio em curso.
const IDADE_MINIMA_DO_ORFAO_HORAS = 24;

const INTERVALO_MS = 24 * 60 * 60 * 1000;
const ATRASO_INICIAL_MS = 5 * 60 * 1000;
const LOTE = 200;
// Teto de páginas do ListObjectsV2 por ciclo: o que sobrar é varrido amanhã.
// Sem isso, um bucket grande transformaria o ciclo diário numa varredura sem fim.
const MAXIMO_DE_PAGINAS = 20;

interface ResultadoDosExpirados {
  encontrados: number;
  removidos: number;
  dias: number;
}

interface ResultadoDosOrfaos {
  examinados: number;
  removidos: number;
  paginas: number;
}

interface ResultadoDoCiclo {
  expirados: ResultadoDosExpirados;
  orfaos: ResultadoDosOrfaos;
}

/**
 * O recorte da resposta do ListObjectsV2 que a varredura lê. `config/r2`
 * instancia o cliente por `require`, então `listObjects` devolve `any` — o
 * contrato fica declarado aqui, no único lugar que o consome.
 */
interface ObjetoDoBucket {
  Key?: string;
  LastModified?: Date | string;
}

interface PaginaDoBucket {
  Contents?: ObjetoDoBucket[];
  IsTruncated?: boolean;
  NextContinuationToken?: string;
}

/** Um objeto da listagem do R2 que passou no filtro: tem chave e data. */
interface ObjetoCandidato extends ObjetoDoBucket {
  Key: string;
  LastModified: Date | string;
}

function diasDeRetencao(): number {
  const configurado = Number.parseInt(process.env.ANEXO_RETENCAO_DIAS || '', 10);
  if (!Number.isFinite(configurado)) return DIAS_PADRAO;
  return Math.min(DIAS_MAXIMO, Math.max(DIAS_MINIMO, configurado));
}

/**
 * Binário dos anexos de mensagens excluídas há mais tempo que o prazo.
 *
 * A linha permanece: some o arquivo, não o registro de que ele existiu.
 */
async function removerAnexosExpirados(): Promise<ResultadoDosExpirados> {
  const dias = diasDeRetencao();
  const corte = new Date(Date.now() - dias * 86400000);

  const anexos = await prisma.mensagemAnexo.findMany({
    where: {
      arquivo_removido_em: null,
      mensagem: { deletada_em: { not: null, lt: corte } }
    },
    orderBy: { criado_em: 'asc' },
    take: LOTE,
    select: { id: true, storage_key: true }
  });

  let removidos = 0;

  for (const anexo of anexos) {
    try {
      await deleteObject(anexo.storage_key);
      // Só marca depois de o objeto sair. Falha de rede no R2 deixa a linha
      // intacta e o próximo ciclo tenta de novo.
      await prisma.mensagemAnexo.update({
        where: { id: anexo.id },
        data: { arquivo_removido_em: new Date() }
      });
      removidos += 1;
    } catch (erro) {
      console.error(`⚠️  [ANEXO] Falha ao remover ${anexo.storage_key} do R2 (ignorado):`, (erro as Error).message);
    }
  }

  return { encontrados: anexos.length, removidos, dias };
}

/**
 * Objetos sob `chat/` sem linha correspondente no banco.
 *
 * O banco não sabe o que existe no bucket — a pergunta só pode ser feita ao R2 e
 * conferida contra `mensagens_anexos`. Anexo já expirado não reaparece aqui: a
 * linha continua lá com a mesma `storage_key`, e o objeto já não existe.
 */
async function varrerOrfaosDoChat(): Promise<ResultadoDosOrfaos> {
  const limite = new Date(Date.now() - IDADE_MINIMA_DO_ORFAO_HORAS * 3600000);

  let continuationToken: string | null = null;
  let paginas = 0;
  let examinados = 0;
  let removidos = 0;

  do {
    const pagina: PaginaDoBucket = await listObjects({ prefix: PREFIXO_CHAT, continuationToken });
    paginas += 1;

    const candidatos = (pagina.Contents || []).filter((objeto): objeto is ObjetoCandidato =>
      Boolean(objeto.Key
      && objeto.Key.startsWith(PREFIXO_CHAT)
      && objeto.LastModified
      && new Date(objeto.LastModified) < limite));

    examinados += candidatos.length;

    if (candidatos.length) {
      const conhecidos = await prisma.mensagemAnexo.findMany({
        where: { storage_key: { in: candidatos.map((objeto) => objeto.Key) } },
        select: { storage_key: true }
      });
      const comLinha = new Set(conhecidos.map((anexo) => anexo.storage_key));

      for (const objeto of candidatos) {
        if (comLinha.has(objeto.Key)) continue;
        try {
          await deleteObject(objeto.Key);
          removidos += 1;
          console.warn(`🧹 [ANEXO] Órfão removido do R2: ${objeto.Key}`);
        } catch (erro) {
          console.error(`⚠️  [ANEXO] Falha ao remover órfão ${objeto.Key} (ignorado):`, (erro as Error).message);
        }
      }
    }

    continuationToken = pagina.IsTruncated ? (pagina.NextContinuationToken ?? null) : null;
  } while (continuationToken && paginas < MAXIMO_DE_PAGINAS);

  return { examinados, removidos, paginas };
}

async function processarRetencaoDeAnexos(): Promise<ResultadoDoCiclo> {
  const expirados = await removerAnexosExpirados();

  // A varredura de órfãos é independente: erro de listagem no R2 não pode
  // engolir o resultado da parte que já rodou.
  let orfaos: ResultadoDosOrfaos = { examinados: 0, removidos: 0, paginas: 0 };
  try {
    orfaos = await varrerOrfaosDoChat();
  } catch (erro) {
    console.error('❌ [ANEXO] Varredura de órfãos falhou (ignorado):', (erro as Error).message);
  }

  return { expirados, orfaos };
}

function startAnexoRetencaoWorker(): NodeJS.Timeout {
  console.log(`🧹 [WORKER] Retenção de anexos do chat inicializada (1x por dia, prazo de ${diasDeRetencao()} dias).`);

  const ciclo = async (): Promise<void> => {
    try {
      const { expirados, orfaos } = await processarRetencaoDeAnexos();
      if (expirados.removidos > 0 || orfaos.removidos > 0) {
        console.log(`🧹 [ANEXO] ${expirados.removidos}/${expirados.encontrados} anexo(s) expirado(s) e ${orfaos.removidos} órfão(s) removido(s) do R2.`);
      }
    } catch (erro) {
      console.error('❌ [ANEXO] Ciclo de retenção falhou (ignorado):', (erro as Error).message);
    }
  };

  setTimeout(ciclo, ATRASO_INICIAL_MS);
  return setInterval(ciclo, INTERVALO_MS);
}

export {
  startAnexoRetencaoWorker,
  processarRetencaoDeAnexos,
  removerAnexosExpirados,
  varrerOrfaosDoChat,
  diasDeRetencao,
  PREFIXO_CHAT,
  DIAS_PADRAO,
  IDADE_MINIMA_DO_ORFAO_HORAS
};
