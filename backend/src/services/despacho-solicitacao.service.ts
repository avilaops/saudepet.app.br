import prisma from '../config/database';
import { distanciaKm, ordenarPorDistancia, dentroDoRaio, rotuloDistancia, RAIO_PADRAO_KM } from './geo.service';

/**
 * Entrega o chamado aos veterinários certos.
 *
 * Antes: `io.to('tenant:X:veterinarios').emit(...)` — todo veterinário do
 * tenant recebia todo chamado, e cada app decidia sozinho se mostrava,
 * comparando o nome da cidade por igualdade exata. Agora o servidor calcula a
 * distância real, respeita o raio de atendimento da cidade e manda o chamado
 * para a sala pessoal de cada profissional elegível, já com a distância —
 * quem está mais perto aparece primeiro e sabe quanto vai deslocar.
 *
 * A fila continua aberta (primeiro que aceitar leva, decisão de 19/08): o que
 * muda é QUEM vê o chamado, não como ele é ganho.
 */

/** Raio de atendimento configurado para a cidade do tutor, com padrão. */
/** O que os dois caminhos de busca devolvem: o do índice e o da memória. */
type VeterinarioProximo = {
  id: string;
  usuario_id: string;
  latitude?: number | null;
  longitude?: number | null;
  distancia_km?: number | null;
  raio_atendimento_km?: number | null;
};

type Ponto = { tenantId: string; latitude: unknown; longitude: unknown };

async function raioDaCidade(tenantId: string, cidade?: string | null): Promise<number> {
  if (!cidade) return RAIO_PADRAO_KM;
  const cobertura = await prisma.cidadeCobertura.findFirst({
    where: { tenant_id: tenantId, nome: { equals: cidade, mode: 'insensitive' }, ativo: true },
    select: { raio_atendimento_km: true }
  });
  return Number(cobertura?.raio_atendimento_km) || RAIO_PADRAO_KM;
}

/** Todos os de plantão, com a distância calculada em memória (caminho reserva). */
async function plantaoComDistanciaEmMemoria({ tenantId, latitude, longitude }: Ponto): Promise<VeterinarioProximo[]> {
  const online = await prisma.veterinario.findMany({
    where: { tenant_id: tenantId, online: true, aprovado_admin: true },
    select: {
      id: true,
      usuario_id: true,
      latitude: true,
      longitude: true,
      // Vazio = usa o raio da cidade, que é o comportamento de sempre.
      raio_atendimento_km: true
    }
  });

  return online.map((vet: VeterinarioProximo) => ({
    ...vet,
    distancia_km: distanciaKm(latitude, longitude, vet.latitude, vet.longitude)
  }));
}

/**
 * Busca por raio dentro do banco, com índice espacial GiST.
 *
 * `earth_box` é a caixa envolvente que o índice sabe podar (barata, mas
 * aproximada nas quinas); `earth_distance` refina para o raio exato. Quem
 * está sem coordenada entra pelo `OR` — não é excluído, só não tem distância.
 *
 * @returns {Promise<Array|null>} `null` quando as extensões não existem no
 *          banco (ambiente de teste, por exemplo) — aí vale o caminho reserva.
 */
async function buscarPorProximidadeNoBanco(
  { tenantId, latitude, longitude, raioKm }: Ponto & { raioKm: number }
): Promise<VeterinarioProximo[] | null> {
  const raioMetros = Math.round(raioKm * 1000);

  try {
    return await prisma.$queryRaw`
      SELECT
        id,
        usuario_id,
        latitude,
        longitude,
        CASE
          WHEN latitude IS NOT NULL AND longitude IS NOT NULL
          THEN round((earth_distance(ll_to_earth(${latitude}::float8, ${longitude}::float8), ll_to_earth(latitude, longitude)) / 1000)::numeric, 2)::float8
          ELSE NULL
        END AS distancia_km
      FROM veterinarios
      WHERE tenant_id = ${tenantId}
        AND online = true
        AND aprovado_admin = true
        AND (
          latitude IS NULL
          OR longitude IS NULL
          OR (
            -- A caixa usa o raio da CIDADE, que é o maior possível: é ela que
            -- aproveita o índice espacial. O raio do PROFISSIONAL refina
            -- depois, na distância exata — quem só atende a zona sul não
            -- recebe chamado do outro lado da cidade.
            earth_box(ll_to_earth(${latitude}::float8, ${longitude}::float8), ${raioMetros}::float8) @> ll_to_earth(latitude, longitude)
            AND earth_distance(ll_to_earth(${latitude}::float8, ${longitude}::float8), ll_to_earth(latitude, longitude))
                <= LEAST(${raioMetros}::float8, COALESCE(raio_atendimento_km, ${raioKm})::float8 * 1000)
          )
        )
      ORDER BY distancia_km ASC NULLS LAST
    `;
  } catch (erro: any) {
    // Banco sem cube/earthdistance (ou consulta indisponível): o cálculo em
    // memória continua valendo. A busca não pode depender da extensão.
    console.warn('⚠️  [DESPACHO] Busca geoespacial indisponível, usando cálculo em memória:', erro.message);
    return null;
  }
}

/**
 * Veterinários de plantão aptos a receber o chamado, do mais perto ao mais
 * longe, já anotados com a distância.
 */
/**
 * `excluirUsuarioId` existe por causa de 26/08/2026, quando o veterinário
 * passou a poder ter pets e pedir atendimento como qualquer tutor. A partir
 * dali, quem pede pode estar de plantão — e receber o próprio chamado é, na
 * melhor das hipóteses, ruído; na pior, o caminho para aceitar sozinho e
 * gerar repasse para a própria conta. Ele sai da lista de elegíveis antes de
 * qualquer cálculo de distância.
 */
async function veterinariosElegiveis(
  { tenantId, latitude, longitude, cidade, excluirUsuarioId = null }:
    Ponto & { cidade?: string | null; excluirUsuarioId?: string | null }
) {
  const semOSolicitante = (lista: VeterinarioProximo[]) =>
    excluirUsuarioId ? lista.filter((vet) => vet.usuario_id !== excluirUsuarioId) : lista;

  const raioKm = await raioDaCidade(tenantId, cidade);
  const temPonto = distanciaKm(latitude, longitude, latitude, longitude) !== null;

  // Sem coordenada do tutor não há proximidade a calcular: todos de plantão.
  if (!temPonto) {
    const todos = semOSolicitante(await plantaoComDistanciaEmMemoria({ tenantId, latitude, longitude }));
    return { veterinarios: todos, raioKm, totalOnline: todos.length, fonte: 'sem-coordenada' };
  }

  const doBanco = await buscarPorProximidadeNoBanco({ tenantId, latitude, longitude, raioKm });

  if (doBanco) {
    const noRaio = semOSolicitante(doBanco);
    if (noRaio.length > 0) {
      return { veterinarios: noRaio, raioKm, totalOnline: noRaio.length, fonte: 'postgres' };
    }
    // Nenhum no raio: cai para todos de plantão (regra abaixo).
    const todos = semOSolicitante(await plantaoComDistanciaEmMemoria({ tenantId, latitude, longitude }));
    return { veterinarios: ordenarPorDistancia(todos), raioKm, totalOnline: todos.length, fonte: 'postgres-sem-alcance' };
  }

  const comDistancia = semOSolicitante(await plantaoComDistanciaEmMemoria({ tenantId, latitude, longitude }));
  // O raio do profissional manda quando existe; senão, o da cidade.
  const dentro = comDistancia.filter((vet: VeterinarioProximo) =>
    dentroDoRaio(vet.distancia_km, Number(vet.raio_atendimento_km) || raioKm)
  );

  // Nunca deixar um chamado sem ninguém: se o raio não alcançou nenhum
  // profissional, o chamado vai para todos os de plantão, do mais perto ao
  // mais longe. Ficar sem atendimento é pior do que um deslocamento maior.
  const alvos = dentro.length > 0 ? dentro : comDistancia;

  return { veterinarios: ordenarPorDistancia(alvos), raioKm, totalOnline: comDistancia.length, fonte: 'memoria' };
}

/**
 * E-mail de chamado urgente para quem está mais perto.
 *
 * O template `vet/chamado-urgente` existia pronto e nada o chamava: o chamado
 * só saía por push e socket, e quem estava de plantão com o aplicativo fechado
 * dependia do push ter sido autorizado no aparelho.
 *
 * Só os cinco mais próximos, e só em emergência. É melhor esforço em todos os
 * sentidos: falhar aqui não pode atrapalhar o despacho, que já aconteceu.
 */
async function avisarPorEmailOsMaisProximos(
  { solicitacao, veterinarios }: { solicitacao: any; veterinarios: VeterinarioProximo[] }
) {
  const emailService = require('./email.service');
  const maisProximos = veterinarios.slice(0, 5);
  if (maisProximos.length === 0) return;

  const usuarios = await prisma.veterinario.findMany({
    where: { id: { in: maisProximos.map((vet: VeterinarioProximo) => vet.id) } },
    select: { id: true, usuario: { select: { nome: true, email: true } } }
  }).catch(() => []);

  const site = process.env.FRONTEND_URL || 'https://saudepet.app.br';
  const distanciaPorVet = new Map(maisProximos.map((vet: VeterinarioProximo) => [vet.id, vet.distancia_km]));

  type ComUsuario = { id: string; usuario?: { nome?: string | null; email?: string | null } | null };

  await Promise.allSettled((usuarios as ComUsuario[]).map((vet) => {
    if (!vet.usuario?.email) return Promise.resolve();
    const distancia = distanciaPorVet.get(vet.id);

    return emailService.enviarEmailChamadoUrgenteVet(vet.usuario.email, {
      nomeVet: vet.usuario.nome || 'Doutor(a)',
      bairroCidade: [solicitacao.tutor?.cidade, distancia != null ? `a ${distancia} km` : null]
        .filter(Boolean).join(' — ') || 'sua região',
      especiePet: solicitacao.pet?.especie || solicitacao.pet?.tipo || 'pet',
      queixa: (solicitacao.observacoes || 'Sem descrição informada').slice(0, 300),
      valorRepasse: null,
      aceitarUrl: `${site}/veterinario/home`
    });
  }));
}

/**
 * Despacha a solicitação recém-criada.
 *
 * @param {object} params
 * @param {object} params.io           Instância do Socket.IO (pode ser nula).
 * @param {object} params.solicitacao  Solicitação já criada, com tutor incluso.
 * @returns {Promise<{ notificados: number, raioKm: number, totalOnline: number }>}
 */
async function despacharSolicitacao({ io, solicitacao }: { io: any; solicitacao: any }) {
  // Chamado dirigido: o tutor escolheu o profissional, e só ele é avisado.
  // Mostrar a quem não pode aceitar é ruído que ensina o plantonista a ignorar
  // a fila.
  if (solicitacao.veterinario_id) {
    const escolhido = await prisma.veterinario.findUnique({
      where: { id: solicitacao.veterinario_id },
      select: { id: true, usuario_id: true }
    });

    // Escolher a si mesmo num chamado dirigido não é um caso de uso; é o
    // atalho para atender o próprio pet e faturar a comissão. Cai na fila
    // normal, onde o filtro abaixo já o exclui.
    if (escolhido && escolhido.usuario_id && escolhido.usuario_id !== solicitacao.tutor_id) {
      if (io) {
        io.to(`user:${escolhido.usuario_id}`).emit('solicitacao:nova', { ...solicitacao, dirigida: true });
      }
      const pushService = require('./push.service');
      if (pushService.estaConfigurado()) {
        await pushService.enviarParaUsuario(escolhido.usuario_id, {
          title: 'Pedido direto para você',
          body: `${solicitacao.tutor?.nome || 'Um tutor'} escolheu você para atender ${solicitacao.pet?.nome || 'o pet'}.`,
          url: '/veterinario/home',
          tag: `solicitacao-${solicitacao.id}`
        }).catch(() => {});
      }
      return { notificados: 1, raioKm: null, totalOnline: 1, fonte: 'dirigida' };
    }
  }

  const { veterinarios, raioKm, totalOnline, fonte } = await veterinariosElegiveis({
    tenantId: solicitacao.tenant_id,
    latitude: solicitacao.latitude,
    longitude: solicitacao.longitude,
    cidade: solicitacao.tutor?.cidade,
    excluirUsuarioId: solicitacao.tutor_id
  });

  if (io) {
    for (const vet of veterinarios as VeterinarioProximo[]) {
      // Sala pessoal do profissional: o chamado deixa de ser um megafone.
      io.to(`user:${vet.usuario_id}`).emit('solicitacao:nova', {
        ...solicitacao,
        distancia_km: vet.distancia_km,
        distancia_label: rotuloDistancia(vet.distancia_km)
      });
    }
  }

  // Push alcança quem está com o app fechado — o socket só fala com quem está
  // conectado agora, e chamado que ninguém vê é chamado perdido.
  try {
    // E-mail só em EMERGÊNCIA, e só para os mais próximos: é o único caso em
    // que vale insistir por um segundo canal — quem está de plantão pode estar
    // com o app fechado, e o chamado tem prazo curto. Fazer isso em consulta de
    // rotina seria transformar o plantão em caixa de spam.
    if (solicitacao.tipo_atendimento === 'emergencia') {
      void avisarPorEmailOsMaisProximos({ solicitacao, veterinarios });
    }

    const pushService = require('./push.service');
    for (const vet of (veterinarios as VeterinarioProximo[]).slice(0, 20)) {
      void pushService.enviarParaUsuario(vet.usuario_id, {
        title: '🐾 Novo chamado disponível',
        body: `${solicitacao.pet?.nome || 'Um pet'} precisa de atendimento${vet.distancia_km != null ? ` a ${rotuloDistancia(vet.distancia_km)} de você` : ''}.`,
        url: '/veterinario/home',
        tag: `solicitacao-${solicitacao.id}`
      });
    }
  } catch (erro: any) {
    console.error('⚠️  [DESPACHO] Push aos veterinários falhou (ignorado):', erro.message);
  }

  return { notificados: veterinarios.length, raioKm, totalOnline, fonte };
}

export {
  despacharSolicitacao,
  veterinariosElegiveis,
  raioDaCidade
};
