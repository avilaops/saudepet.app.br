/**
 * A videochamada, do lado do navegador.
 *
 * O vídeo vai direto de um aparelho ao outro (WebRTC). O nosso servidor só
 * apresenta os dois: repassa os pacotes de negociação pelo Socket.IO que já
 * existe. Consulta clínica não passa nem fica gravada no servidor, e isso é
 * decisão de projeto, não economia.
 *
 * Duas armadilhas clássicas do WebRTC ficam resolvidas aqui, para que a tela
 * não precise saber delas:
 *
 * 1. **Quem faz a oferta.** Se os dois oferecem ao mesmo tempo, a negociação
 *    trava em "conectando" para sempre. Regra: quem JÁ ESTAVA na sala oferece a
 *    quem chega. Quem chega apenas responde.
 *
 * 2. **Candidatos que chegam cedo demais.** Os pacotes de rede começam a vir
 *    antes de a descrição remota estar aplicada, e o navegador os recusa. Ficam
 *    numa fila e entram quando é possível.
 */

type Sinal =
  | { tipo: 'oferta' | 'resposta'; descricao: RTCSessionDescriptionInit }
  | { tipo: 'rede'; candidato: RTCIceCandidateInit };

type Socket = {
  id?: string;
  emit: (evento: string, dados: unknown) => void;
  on: (evento: string, ouvinte: (dados: never) => void) => void;
  off: (evento: string, ouvinte?: (dados: never) => void) => void;
};

export type EstadoDaChamada =
  | 'ocioso'
  | 'chamando'
  | 'conectando'
  | 'em_chamada'
  /** Caiu e está rediscando sozinho. A pessoa não faz nada. */
  | 'reconectando'
  | 'encerrada'
  | 'falhou';

/**
 * Quantas vezes redisca antes de desistir.
 *
 * Rede de celular oscila: um tunel, um elevador, a troca de torre. Cair e
 * ficar caido obrigaria as duas pessoas a recomecar a consulta do zero. Mas
 * tentar para sempre e pior — a tela ficaria mentindo "reconectando" enquanto
 * a outra pessoa ja foi embora.
 */
const MAXIMO_DE_TENTATIVAS = 5;

/**
 * Espera antes de cada tentativa: 1s, 2s, 4s, 8s, 8s.
 *
 * Crescente porque a causa mais comum e transitoria e se resolve sozinha em
 * segundos; rediscar de imediato cinco vezes gastaria as tentativas todas no
 * primeiro segundo de instabilidade, que e justamente quando nada adianta.
 */
const esperaDaTentativa = (n: number) => Math.min(8000, 1000 * 2 ** (n - 1));

/**
 * `disconnected` costuma se resolver sozinho — o proprio WebRTC reconecta o
 * caminho em poucos segundos. So depois deste prazo vale rediscar; agir na
 * hora derrubaria chamadas que iam voltar por conta propria.
 */
const PACIENCIA_ANTES_DE_REDISCAR_MS = 4000;

export type Chamada = {
  encerrar: () => void;
  alternarMicrofone: () => boolean;
  alternarCamera: () => boolean;
  alternarCameraDispositivo: () => Promise<'user' | 'environment'>;
  obterModoCamera: () => 'user' | 'environment';
};

export type Opcoes = {
  socket: Socket;
  atendimentoId: string;
  iceServers: RTCIceServer[];
  aoMudarEstado: (estado: EstadoDaChamada) => void;
  aoReceberVideo: (fluxo: MediaStream) => void;
  aoObterVideoLocal: (fluxo: MediaStream) => void;
  aoFalhar: (mensagem: string) => void;
};

async function obterFluxoMidia(facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream> {
  const restricoesIdeais = {
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  };

  try {
    return await navigator.mediaDevices.getUserMedia(restricoesIdeais);
  } catch (err1) {
    console.warn('Tentativa com restrições ideais falhou, tentando fallback simples:', err1);
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode },
        audio: true
      });
    } catch (err2) {
      console.warn('Tentativa com facingMode falhou, tentando permissão básica:', err2);
      try {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (err3) {
        console.warn('Tentativa com áudio falhou, tentando apenas vídeo:', err3);
        // Fallback apenas vídeo (caso microfone esteja bloqueado ou com defeito)
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
    }
  }
}

export async function abrirChamada({
  socket,
  atendimentoId,
  iceServers,
  aoMudarEstado,
  aoReceberVideo,
  aoObterVideoLocal,
  aoFalhar
}: Opcoes): Promise<Chamada> {
  let fluxoLocal: MediaStream;
  let modoCameraAtual: 'user' | 'environment' = 'user';

  if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    const msg = 'Seu navegador não oferece suporte ao acesso de câmera/microfone ou a página não está sendo executada em conexão segura (HTTPS).';
    aoFalhar(msg);
    aoMudarEstado('falhou');
    throw new Error(msg);
  }

  try {
    fluxoLocal = await obterFluxoMidia(modoCameraAtual);
  } catch (err: any) {
    console.error('Falha ao obter mídia:', err);
    const erroNome = err?.name || '';
    if (erroNome === 'NotAllowedError' || erroNome === 'PermissionDeniedError') {
      aoFalhar('Permissão de câmera/microfone negada. Toque no ícone de ajustes/cadeado na barra do navegador (ao lado de saudepet.app.br) e permita o uso da Câmera e Microfone.');
    } else if (erroNome === 'NotFoundError' || erroNome === 'DevicesNotFoundError') {
      aoFalhar('Nenhuma câmera ou microfone foi detectado no seu aparelho.');
    } else if (erroNome === 'NotReadableError' || erroNome === 'TrackStartError') {
      aoFalhar('A câmera ou o microfone já está em uso por outro aplicativo.');
    } else if (erroNome === 'OverconstrainedError') {
      aoFalhar('As configurações de vídeo não são suportadas pela câmera do aparelho.');
    } else {
      aoFalhar(`Erro ao acessar câmera/microfone: ${err?.message || 'Verifique as permissões do dispositivo'}.`);
    }
    aoMudarEstado('falhou');
    throw err;
  }

  aoObterVideoLocal(fluxoLocal);
  aoMudarEstado('chamando');

  const conexao = new RTCPeerConnection({ iceServers });
  fluxoLocal.getTracks().forEach((faixa) => conexao.addTrack(faixa, fluxoLocal));

  const fluxoRemoto = new MediaStream();
  let outroLado: string | null = null;
  const candidatosNaFila: RTCIceCandidateInit[] = [];
  let encerrada = false;

  let tentativas = 0;
  let rediscando: ReturnType<typeof setTimeout> | null = null;

  const cancelarRediscagem = () => {
    if (rediscando) clearTimeout(rediscando);
    rediscando = null;
  };

  const enviar = (para: string, dados: Sinal) => {
    socket.emit('chamada:sinal', { atendimentoId, para, dados });
  };

  const drenarCandidatos = async () => {
    while (candidatosNaFila.length) {
      const candidato = candidatosNaFila.shift();
      if (candidato) await conexao.addIceCandidate(candidato).catch(() => {});
    }
  };

  conexao.ontrack = (evento) => {
    evento.streams[0]?.getTracks().forEach((faixa) => fluxoRemoto.addTrack(faixa));
    aoReceberVideo(fluxoRemoto);
    aoMudarEstado('em_chamada');
  };

  conexao.onicecandidate = (evento) => {
    if (evento.candidate && outroLado) {
      enviar(outroLado, { tipo: 'rede', candidato: evento.candidate.toJSON() });
    }
  };

  /**
   * Redisca sozinho: `iceRestart` renegocia o caminho de rede SEM derrubar a
   * chamada — as faixas de áudio e vídeo continuam as mesmas, a gravação
   * continua correndo, e a pessoa não precisa tocar em nada.
   *
   * **Só um lado redisca.** Se os dois mandarem oferta ao mesmo tempo, as
   * duas negociações colidem e a chamada trava — o mesmo motivo que faz
   * `chamada:entrou` ter dono. O critério é o id do socket: quem tem o menor
   * assume. É arbitrário de propósito; o que importa é que os dois cheguem à
   * mesma conclusão sem combinar nada.
   */
  const rediscar = async () => {
    if (encerrada || !outroLado) return;

    if (tentativas >= MAXIMO_DE_TENTATIVAS) {
      aoFalhar('A conexão caiu e não voltou. Toque para chamar de novo, ou use o chat.');
      aoMudarEstado('falhou');
      return;
    }

    tentativas += 1;
    aoMudarEstado('reconectando');

    // Quem não oferece fica esperando a oferta do outro — sem isso, os dois
    // esperariam e ninguém rediscaria.
    if (socket.id && outroLado && socket.id > outroLado) return;

    try {
      const oferta = await conexao.createOffer({ iceRestart: true });
      await conexao.setLocalDescription(oferta);
      enviar(outroLado, { tipo: 'oferta', descricao: oferta });
    } catch {
      // Falhou a renegociação: a próxima mudança de estado agenda outra.
    }
  };

  /**
   * Agenda a próxima tentativa — e se reagenda sozinha.
   *
   * Isto tinha um buraco na primeira versão: o gatilho era só a mudança de
   * estado da conexão, e uma conexão que ENTRA em `failed` e FICA em `failed`
   * não gera novo evento. Ou seja, rediscava uma vez e desistia em silêncio,
   * com a tela dizendo "reconectando" para sempre. Agora cada tentativa marca
   * a seguinte, e só a volta da conexão (ou o teto de tentativas) para o
   * ciclo.
   */
  const agendarRediscagem = () => {
    if (encerrada || rediscando) return;

    const espera = tentativas === 0 ? PACIENCIA_ANTES_DE_REDISCAR_MS : esperaDaTentativa(tentativas);

    rediscando = setTimeout(async () => {
      rediscando = null;
      if (encerrada) return;

      // Voltou sozinho enquanto esperávamos — o caso mais comum, e o motivo de
      // a primeira espera existir.
      if (conexao.connectionState === 'connected') {
        tentativas = 0;
        return;
      }

      await rediscar();

      // A renegociação assíncrona pode ter mudado o estado desde a leitura
      // anterior. O cast desfaz apenas o estreitamento obsoleto do TypeScript;
      // o valor continua sendo o estado real exposto pelo navegador.
      const estadoDepoisDaTentativa = conexao.connectionState as RTCPeerConnectionState;
      if (!encerrada && estadoDepoisDaTentativa !== 'connected' && tentativas < MAXIMO_DE_TENTATIVAS) {
        agendarRediscagem();
      }
    }, espera);
  };

  conexao.onconnectionstatechange = () => {
    if (encerrada) return;
    const estado = conexao.connectionState;

    if (estado === 'connected') {
      // Voltou: zera o contador para que a PRÓXIMA queda tenha as cinco
      // tentativas de novo. Sem isso, uma chamada longa numa rede ruim
      // esgotaria o orçamento e desistiria na quinta oscilação do dia.
      tentativas = 0;
      cancelarRediscagem();
      aoMudarEstado('em_chamada');
      return;
    }

    if (estado === 'connecting') {
      aoMudarEstado(tentativas > 0 ? 'reconectando' : 'conectando');
      return;
    }

    // `failed` é definitivo para este caminho de rede, `disconnected` costuma
    // voltar sozinho. Os dois levam a rediscar — a diferença é a espera, que
    // `agendarRediscagem` já faz.
    if (estado === 'failed' || estado === 'disconnected') {
      agendarRediscagem();
    }
  };

  // Alguém entrou na sala: quem já estava faz a oferta. Sem essa regra, os dois
  // ofereceriam ao mesmo tempo e a chamada travaria.
  const aoEntrarAlguem = async ({ socketId }: { socketId: string }) => {
    outroLado = socketId;
    aoMudarEstado('conectando');
    const oferta = await conexao.createOffer();
    await conexao.setLocalDescription(oferta);
    enviar(socketId, { tipo: 'oferta', descricao: oferta });
  };

  const aoReceberSinal = async (mensagem: { de: string; dados: Sinal }) => {
    const { de, dados } = mensagem;
    outroLado = de;

    if (dados.tipo === 'rede') {
      // Candidato de rede: só entra depois da descrição remota. Antes disso, fila.
      if (conexao.remoteDescription) {
        await conexao.addIceCandidate(dados.candidato).catch(() => {});
      } else {
        candidatosNaFila.push(dados.candidato);
      }
      return;
    }

    if (dados.tipo === 'oferta') {
      await conexao.setRemoteDescription(dados.descricao);
      await drenarCandidatos();
      const resposta = await conexao.createAnswer();
      await conexao.setLocalDescription(resposta);
      enviar(de, { tipo: 'resposta', descricao: resposta });
      return;
    }

    await conexao.setRemoteDescription(dados.descricao);
    await drenarCandidatos();
  };

  const aoSairAlguem = () => {
    // Desligou de propósito: não é queda, e rediscar aqui seria perseguir
    // quem acabou de encerrar.
    cancelarRediscagem();
    outroLado = null;
    aoMudarEstado('encerrada');
  };

  socket.on('chamada:entrou', aoEntrarAlguem as never);
  socket.on('chamada:sinal', aoReceberSinal as never);
  socket.on('chamada:saiu', aoSairAlguem as never);

  socket.emit('chamada:entrar', { atendimentoId });

  return {
    encerrar() {
      if (encerrada) return;
      encerrada = true;
      cancelarRediscagem();
      socket.emit('chamada:sair', { atendimentoId });
      socket.off('chamada:entrou', aoEntrarAlguem as never);
      socket.off('chamada:sinal', aoReceberSinal as never);
      socket.off('chamada:saiu', aoSairAlguem as never);
      // Soltar as faixas apaga a luz da câmera. Deixar ligada depois de
      // desligar a chamada é o tipo de descuido que assusta com razão.
      fluxoLocal.getTracks().forEach((faixa) => faixa.stop());
      conexao.close();
      aoMudarEstado('encerrada');
    },

    alternarMicrofone() {
      const faixa = fluxoLocal.getAudioTracks()[0];
      if (!faixa) return false;
      faixa.enabled = !faixa.enabled;
      return faixa.enabled;
    },

    alternarCamera() {
      const faixa = fluxoLocal.getVideoTracks()[0];
      if (!faixa) return false;
      faixa.enabled = !faixa.enabled;
      return faixa.enabled;
    },

    async alternarCameraDispositivo() {
      const proximoModo: 'user' | 'environment' = modoCameraAtual === 'user' ? 'environment' : 'user';
      try {
        const novoFluxo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: proximoModo } }
        }).catch(async () => {
          return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: proximoModo }
          });
        });

        const novaFaixa = novoFluxo.getVideoTracks()[0];
        if (novaFaixa) {
          const faixaAntiga = fluxoLocal.getVideoTracks()[0];
          if (faixaAntiga) {
            faixaAntiga.stop();
            fluxoLocal.removeTrack(faixaAntiga);
          }
          fluxoLocal.addTrack(novaFaixa);

          // Atualiza o sender WebRTC sem interromper a conexão
          const sender = conexao.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(novaFaixa);
          }

          modoCameraAtual = proximoModo;
          aoObterVideoLocal(fluxoLocal);
        }
      } catch (erroTroca) {
        console.warn('Não foi possível alternar dispositivo de câmera:', erroTroca);
      }
      return modoCameraAtual;
    },

    obterModoCamera() {
      return modoCameraAtual;
    }
  };
}
