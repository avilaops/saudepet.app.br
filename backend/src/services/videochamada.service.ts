/**
 * A videochamada da teleorientação.
 *
 * A plataforma vendia "teleorientação por vídeo chamada instantânea", cobrava
 * por isso, e não tinha uma linha de vídeo. Era o único lugar do produto em que
 * alguém pagava por um recurso inexistente.
 *
 * O vídeo é WebRTC entre os dois aparelhos, direto — o servidor não vê nem
 * grava a consulta, que numa conversa clínica é o comportamento certo e não uma
 * economia. O que ele faz é apresentar um ao outro: recebe o "aqui estou" de
 * cada lado e repassa ao outro os pacotes de negociação. Isso se chama
 * sinalização, e roda no Socket.IO que já existe, com a mesma autorização das
 * outras salas do atendimento.
 *
 * O limite honesto: em redes muito fechadas (alguns 4G corporativos, Wi-Fi de
 * hospital), os dois aparelhos não conseguem se enxergar e a chamada precisa de
 * um servidor de retransmissão — TURN. `TURN_URL` existe para isso e está
 * vazio: sem ele, essas redes caem no chat. Está documentado no roadmap porque
 * é uma limitação real, não um detalhe.
 */

/** Sala da chamada — separada da sala do atendimento, que é de status e chat. */
export const salaDaChamada = (atendimentoId: string) => `chamada:${atendimentoId}`;

/** Só teleorientação, e só enquanto o atendimento está de pé. */
const STATUS_QUE_PERMITEM_CHAMADA = [
  'aceito',
  'veterinario_encontrado',
  'atendimento_em_andamento'
];

/**
 * Os servidores que ajudam dois aparelhos a se encontrarem.
 *
 * STUN só descobre o endereço público de cada um (é barato e o do Google
 * serve). TURN retransmite o vídeo quando o encontro direto não acontece — esse
 * custa banda, e por isso é configuração, não padrão.
 */
export function servidoresDeConexao() {
  const stun = process.env.STUN_URL || 'stun:stun.l.google.com:19302';
  const servidores: Array<Record<string, unknown>> = [{ urls: stun }];

  if (process.env.TURN_URL) {
    servidores.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD
    });
  }

  return {
    iceServers: servidores,
    // A tela avisa quando não há retransmissão configurada, em vez de deixar a
    // chamada falhar em silêncio numa rede fechada.
    tem_retransmissao: Boolean(process.env.TURN_URL)
  };
}

type Atendimento = {
  id: string;
  status: string;
  tipo_atendimento: string | null;
  /** Os dois lados da chamada — e quem toca o telefone do outro. */
  tutor_id?: string | null;
  veterinario?: { usuario_id?: string | null } | null;
};

export function podeAbrirChamada(atendimento: Atendimento | null): boolean {
  if (!atendimento) return false;
  if (atendimento.tipo_atendimento !== 'teleorientacao') return false;
  return STATUS_QUE_PERMITEM_CHAMADA.includes(atendimento.status);
}

type Socket = {
  id: string;
  join: (sala: string) => Promise<void> | void;
  leave: (sala: string) => Promise<void> | void;
  emit: (evento: string, dados: unknown) => void;
  to: (destino: string) => { emit: (evento: string, dados: unknown) => void };
  /** Preenchido pelo handshake do socket-security. */
  user?: { id: string; tipo_usuario: string } | null;
};

/**
 * Quem esta do OUTRO lado desta chamada.
 *
 * Pelo vinculo, nao pelo `tipo_usuario`: desde 26/08/2026 o veterinario
 * tambem pode ser tutor do proprio pet, e nesse atendimento ele entra pelo
 * `tutor_id`. Comparar papeis daria a resposta errada exatamente nesse caso.
 */
function outroParticipante(atendimento: Atendimento, quemEntrou: string): string | null {
  const tutor = atendimento.tutor_id || null;
  const vet = atendimento.veterinario?.usuario_id || null;

  if (quemEntrou === tutor) return vet;
  if (quemEntrou === vet) return tutor;
  // Admin em visita de suporte: assiste, nao toca o telefone de ninguem.
  return null;
}

/**
 * Toca o telefone do outro lado.
 *
 * Ate 27/08/2026 nao existia chamada, so sala: `chamada:entrou` era emitido
 * com `socket.to(sala)`, que alcanca APENAS quem ja estava na sala. Ou seja,
 * o veterinario so descobria que o tutor queria falar se ja estivesse com a
 * tela do atendimento aberta e tivesse tocado em "Entrar na chamada" por
 * conta propria. Uma videochamada em que ninguem consegue ser chamado nao e
 * uma videochamada — e uma sala de espera onde os dois tem que combinar
 * antes, por fora.
 *
 * O push e melhor esforco de proposito: se o aparelho nao autorizou
 * notificacao, a chamada continua funcionando para quem esta com a tela
 * aberta. Falhar aqui nao pode impedir a sala de abrir.
 */
async function tocarParaOOutro(atendimento: Atendimento, quemEntrou?: string | null) {
  if (!quemEntrou) return;

  const destino = outroParticipante(atendimento, quemEntrou);
  if (!destino) return;

  try {
    const push = require('./push.service');
    if (!push.estaConfigurado()) return;

    // Papel de QUEM RECEBE, decidido pelo vínculo — o mesmo critério de
    // `outroParticipante`. Mandar todo mundo para `/` obrigava a pessoa a
    // procurar o atendimento na mão justamente enquanto o outro lado espera.
    const paraOTutor = destino === atendimento.tutor_id;
    const tela = paraOTutor
      ? `/tutor/acompanhar/${atendimento.id}`
      : `/veterinario/atendimento/${atendimento.id}`;

    await push.enviarParaUsuario(destino, {
      title: 'Chamada de vídeo',
      body: 'A outra pessoa entrou na teleorientação e está esperando você.',
      url: tela,
      // 90 s: passou disso, quem chamou já desistiu ou já está em chamada.
      // Melhor não tocar do que tocar para uma chamada que não existe mais.
      ttlSegundos: 90,
      // A mesma `tag` faz o aparelho SUBSTITUIR o aviso anterior em vez de
      // empilhar. Quem toca em "entrar" tres vezes nao merece tres alertas.
      tag: `chamada-${atendimento.id}`
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('[CHAMADA] Aviso nao entregue (ignorado):', mensagem);
  }
}

/**
 * Liga os eventos de sinalização a um socket já autenticado.
 *
 * `buscarAtendimentoAutorizado` vem de fora porque a autorização das salas do
 * atendimento já existe e não deve ser reescrita aqui — chamada usa a mesma.
 */
export function registrarSinalizacao({
  socket,
  registrar,
  buscarAtendimentoAutorizado
}: {
  socket: Socket;
  /** O `safeHandler` do socket-security: limita taxa e engole erro como recusa. */
  registrar: (evento: string, handler: (payload: Record<string, unknown>) => Promise<void>) => void;
  buscarAtendimentoAutorizado: (id: string) => Promise<Atendimento | null>;
}) {
  registrar('chamada:entrar', async ({ atendimentoId }) => {
    const atendimento = await buscarAtendimentoAutorizado(String(atendimentoId || ''));
    if (!podeAbrirChamada(atendimento)) throw new Error('not allowed');

    const sala = salaDaChamada(atendimento!.id);
    await socket.join(sala);

    // Quem já estava na sala descobre que chegou alguém e faz a oferta. Quem
    // chega não oferece: assim os dois não negociam ao mesmo tempo, que é o
    // erro clássico de deixar a chamada presa em "conectando".
    socket.to(sala).emit('chamada:entrou', { socketId: socket.id });
    socket.emit('chamada:pronto', { sala });

    // Fora do caminho critico: a sala ja abriu, e o aviso e para quem NAO
    // esta olhando a tela. Por isso nao damos `await`.
    void tocarParaOOutro(atendimento!, socket.user?.id);
  });

  // Oferta, resposta e candidatos de rede passam pelo mesmo evento: são todos
  // "entregue este pacote àquele participante", e o conteúdo é assunto do
  // navegador. O servidor não interpreta nada disso.
  registrar('chamada:sinal', async ({ atendimentoId, para, dados }) => {
    const atendimento = await buscarAtendimentoAutorizado(String(atendimentoId || ''));
    if (!podeAbrirChamada(atendimento)) throw new Error('not allowed');
    if (!para || typeof para !== 'string') throw new Error('not allowed');

    socket.to(para).emit('chamada:sinal', { de: socket.id, dados });
  });

  registrar('chamada:sair', async ({ atendimentoId }) => {
    const id = String(atendimentoId || '');
    if (!id) return;
    const sala = salaDaChamada(id);
    socket.to(sala).emit('chamada:saiu', { socketId: socket.id });
    await socket.leave(sala);
  });
}

export { STATUS_QUE_PERMITEM_CHAMADA };
