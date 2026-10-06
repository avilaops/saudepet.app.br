import prisma from '../config/database';
import { buscar } from '../services/geocoding.service';

/**
 * Preenche a coordenada das lojas do Mercado que ficaram sem ela.
 *
 * O cadastro de hoje já geocodifica ao salvar e recusa ligar a entrega sem
 * ponto no mapa (`localizarLoja` e `exigirPontoParaEntregar` em
 * services/mercado/loja.service.ts). O que este script cobre são os registros
 * anteriores a essa regra: o levantamento de 01/09/2026 achou as duas lojas de
 * produção com latitude e longitude nulas, e a entrega pela própria loja é
 * calculada pela distância entre a loja e o tutor — sem ponto, a loja não
 * entrega, mesmo com `aceita_entrega` ligado.
 *
 * Regras, na ordem em que importam:
 *   - nunca inventa coordenada: só grava o que o geocodificador devolveu para
 *     o endereço real, e só quando a cidade devolvida é a cidade cadastrada;
 *   - nunca sobrescreve coordenada válida: loja com ponto não entra na lista;
 *   - endereço ambíguo (resultados em cidades diferentes) ou não localizado
 *     fica como está e vai para o relatório, com o motivo;
 *   - idempotente: rodar de novo não muda o que já foi resolvido;
 *   - ensaio por padrão; `--aplicar` grava.
 *
 * Uso, dentro do container do backend:
 *   node dist/scripts/geocodificar-lojas.js            (ensaio)
 *   node dist/scripts/geocodificar-lojas.js --aplicar  (grava)
 */

const APLICAR = process.argv.includes('--aplicar');

type Resultado = { latitude: number; longitude: number; cidade: string | null; estado: string | null };

/** Compara nomes de cidade sem acento, caixa ou espaço sobrando. */
function normalizar(texto: string | null | undefined): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

async function main() {
  const lojas = await prisma.lojaMercado.findMany({
    where: { OR: [{ latitude: null }, { longitude: null }] },
    select: {
      id: true,
      nome_fantasia: true,
      endereco: true,
      numero: true,
      bairro: true,
      cidade: true,
      estado: true,
      aceita_entrega: true,
      demonstracao: true
    },
    orderBy: { criado_em: 'asc' }
  });

  console.log(`${APLICAR ? 'APLICANDO' : 'ENSAIO'}: ${lojas.length} loja(s) sem coordenada.`);
  if (lojas.length === 0) return;

  let resolvidas = 0;
  let pendentes = 0;

  for (const loja of lojas) {
    const rotulo = `${loja.nome_fantasia}${loja.demonstracao ? ' (demonstração)' : ''}`;
    const endereco = String(loja.endereco || '').trim();

    if (!endereco) {
      pendentes += 1;
      console.log(`  - ${rotulo}: sem endereço cadastrado; nada a geocodificar${loja.aceita_entrega ? ' — ENTREGA LIGADA SEM PONTO' : ''}.`);
      continue;
    }

    const termo = [
      [endereco, loja.numero].filter(Boolean).join(', '),
      loja.bairro,
      loja.cidade,
      loja.estado
    ].filter(Boolean).join(', ');

    let resultados: Resultado[] = [];
    try {
      resultados = await buscar({ termo, limite: 3 });
    } catch (erro) {
      pendentes += 1;
      console.log(`  - ${rotulo}: geocodificador falhou (${(erro as Error).message}); fica como está.`);
      continue;
    }

    if (resultados.length === 0) {
      pendentes += 1;
      console.log(`  - ${rotulo}: endereço não localizado ("${termo}")${loja.aceita_entrega ? ' — ENTREGA LIGADA SEM PONTO' : ''}.`);
      continue;
    }

    // Ambíguo = o geocodificador espalhou o endereço por cidades diferentes.
    // O primeiro resultado até pode ser o certo, mas "pode" não é critério
    // para um ponto que decide se a loja entrega ou não.
    const cidades = new Set(resultados.map((r) => normalizar(r.cidade)).filter(Boolean));
    if (cidades.size > 1) {
      pendentes += 1;
      console.log(`  - ${rotulo}: ambíguo, resultados em ${[...cidades].join(' / ')}; fica como está.`);
      continue;
    }

    const primeiro = resultados[0];
    if (primeiro.cidade && normalizar(primeiro.cidade) !== normalizar(loja.cidade)) {
      pendentes += 1;
      console.log(`  - ${rotulo}: geocodificador devolveu ${primeiro.cidade}, cadastro diz ${loja.cidade}; fica como está.`);
      continue;
    }

    resolvidas += 1;
    console.log(`  + ${rotulo}: ${primeiro.latitude.toFixed(5)}, ${primeiro.longitude.toFixed(5)} (${primeiro.cidade || loja.cidade})${APLICAR ? ' — gravado' : ''}.`);

    if (APLICAR) {
      // `updateMany` com o filtro de nulo repetido: se alguém gravou ponto
      // entre a leitura e a escrita, o dado dele vence.
      await prisma.lojaMercado.updateMany({
        where: { id: loja.id, OR: [{ latitude: null }, { longitude: null }] },
        data: { latitude: primeiro.latitude, longitude: primeiro.longitude }
      });
    }
  }

  console.log(`\n${resolvidas} resolvida(s), ${pendentes} pendente(s).`);
  if (!APLICAR && resolvidas > 0) console.log('Ensaio: rode com --aplicar para gravar.');
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
