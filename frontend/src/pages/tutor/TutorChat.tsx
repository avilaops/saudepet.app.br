import type { ApiPayload } from '../../types/api'
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useSocket } from '../../contexts/SocketContext';
import { useAuth } from '../../contexts/AuthContext';
import { Icon, PageHeader } from '../../components/ui/AppKit';
import {
  TIPOS_ANEXO_ACEITOS,
  editarMensagem,
  enviarAnexo,
  enviarLocalizacaoAtual,
  enviarTexto,
  erroLegivel,
  excluirMensagem,
  formatarTamanho,
  mapaDaLocalizacao
} from '../../services/chat';

const TIPOS_DE_ATENDIMENTO: Record<string, string> = {
  consulta_domiciliar: 'Consulta Domiciliar',
  emergencia: 'Emergência',
  teleorientacao: 'Teleorientação'
};

function TutorChat() {
  const navigate = useNavigate();
  const { veterinarioId } = useParams();
  const [searchParams] = useSearchParams();
  const atendimentoId = searchParams.get('atendimento');
  const { user } = useAuth();
  const { socket } = useSocket();
  const [mensagens, setMensagens] = useState<ApiPayload[]>([]);
  const [paginacao, setPaginacao] = useState<ApiPayload | null>(null);
  const [carregandoAnteriores, setCarregandoAnteriores] = useState(false);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [veterinario, setVeterinario] = useState<ApiPayload | null>(null);
  const [atendimento, setAtendimento] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<ApiPayload | null>(null);
  const [erroEnvio, setErroEnvio] = useState('');
  // Vídeo pode chegar a 25MB: sem o nome e o percentual em tela o envio parece
  // travado e o tutor tenta de novo, duplicando a mensagem.
  const [envioDeArquivo, setEnvioDeArquivo] = useState<ApiPayload | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    carregarDados();
  }, [veterinarioId, atendimentoId]);

  useEffect(() => {
    const veterinarioUsuarioId = veterinario?.usuario?.id;
    if (socket && veterinarioUsuarioId) {
      socket.on('nova:mensagem', (mensagem) => {
        if (mensagem.remetente_id === veterinarioUsuarioId ||
            mensagem.destinatario_id === veterinarioUsuarioId) {
          setMensagens(prev => prev.some(item => item.id === mensagem.id) ? prev : [...prev, mensagem]);
          marcarComoLida(mensagem.id);
        }
      });

      // Edição e exclusão do outro lado precisam refletir aqui, senão a conversa
      // continua exibindo um texto que já foi corrigido ou apagado.
      const aoAlterar = (mensagem: ApiPayload) => {
        if (mensagem.remetente_id === veterinarioUsuarioId ||
            mensagem.destinatario_id === veterinarioUsuarioId) {
          setMensagens(prev => prev.map(item => item.id === mensagem.id ? mensagem : item));
        }
      };
      const aoLer = () => {
        setMensagens(prev => prev.map(item => item.remetente_id === user?.id ? { ...item, lida: true } : item));
      };

      socket.on('mensagem:editada', aoAlterar);
      socket.on('mensagem:excluida', aoAlterar);
      socket.on('mensagens:lidas', aoLer);

      if (atendimentoId) {
        socket.emit('atendimento:join', { atendimentoId });
      }

      return () => {
        socket.off('nova:mensagem');
        socket.off('mensagem:editada', aoAlterar);
        socket.off('mensagem:excluida', aoAlterar);
        socket.off('mensagens:lidas', aoLer);
      };
    }
  }, [socket, veterinario?.usuario?.id, atendimentoId, user?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [mensagens]);

  const carregarDados = async () => {
    try {
      // Perfil do veterinário em melhor esforço: se falhar, o chat continua —
      // antes o 404 daqui abortava o carregamento das mensagens junto.
      try {
        const vetRes = await api.get(`/veterinarios/${veterinarioId}`);
        setVeterinario(vetRes.data);
      } catch {
        setVeterinario(null);
      }

      // Carregar mensagens. Buscar a conversa já marca como lidas as recebidas —
      // havia aqui uma chamada extra a `PUT /mensagens/marcar-lidas/:id`, rota que
      // não existe: o 404 abortava o resto desta função e os dados do atendimento
      // nunca chegavam a ser carregados.
      const msgRes = await api.get(`/mensagens/conversa/${veterinarioId}`);
      // A rota passou a paginar e devolve `{ mensagens, paginacao }`; o formato
      // antigo (lista crua) segue aceito para não depender da ordem do deploy.
      setMensagens(Array.isArray(msgRes.data) ? msgRes.data : (msgRes.data?.mensagens || []));
      setPaginacao(Array.isArray(msgRes.data) ? null : msgRes.data?.paginacao || null);

      // Se tiver atendimentoId, carregar dados do atendimento
      if (atendimentoId) {
        const atendRes = await api.get(`/solicitacoes/${atendimentoId}`);
        setAtendimento(atendRes.data);
      }

      setLoading(false);
    } catch (error: any) {
      console.error('Erro ao carregar dados:', error);
      setLoading(false);
    }
  };

  const marcarComoLida = async (mensagemId: ApiPayload) => {
    try {
      await api.put(`/mensagens/${mensagemId}/lida`);
    } catch (error: any) {
      console.error('Erro ao marcar mensagem como lida:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const alvoDaConversa = () => ({
    destinatarioId: veterinario?.usuario?.id,
    atendimentoId: atendimentoId || undefined
  });

  const registrar = (mensagem: ApiPayload) => {
    if (!mensagem) return;
    setMensagens(prev => prev.some(item => item.id === mensagem.id)
      ? prev.map(item => item.id === mensagem.id ? mensagem : item)
      : [...prev, mensagem]);
  };

  const executar = async (acao: ApiPayload) => {
    setEnviando(true);
    setErroEnvio('');
    try {
      registrar(await acao());
      return true;
    } catch (error: any) {
      setErroEnvio(erroLegivel(error, 'Erro ao enviar mensagem'));
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const enviarMensagem = async (e: any) => {
    e.preventDefault();
    if (!novaMensagem.trim() || enviando) return;

    if (editando) {
      const ok = await executar(() => editarMensagem(editando.id, novaMensagem.trim()));
      if (ok) { setEditando(null); setNovaMensagem(''); }
      return;
    }

    const ok = await executar(() => enviarTexto({ ...alvoDaConversa(), conteudo: novaMensagem.trim() }));
    if (ok) setNovaMensagem('');
  };

  const escolherArquivo = async (e: any) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;

    setEnvioDeArquivo({ nome: arquivo.name, tamanho: arquivo.size, progresso: 0 });
    try {
      const ok = await executar(() => enviarAnexo({
        ...alvoDaConversa(),
        arquivo,
        legenda: novaMensagem.trim() || undefined,
        aoProgredir: (progresso) => setEnvioDeArquivo((atual: ApiPayload) => atual && { ...atual, progresso })
      }));
      if (ok) setNovaMensagem('');
    } finally {
      setEnvioDeArquivo(null);
    }
  };

  const apagarMensagem = async (mensagem: ApiPayload) => {
    if (!window.confirm('Apagar esta mensagem? O registro fica guardado para auditoria do atendimento.')) return;
    await executar(() => excluirMensagem(mensagem.id));
  };

  const formatarHorario = (data: ApiPayload) => {
    const date = new Date(data);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatarData = (data: ApiPayload) => {
    const date = new Date(data);
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    if (date.toDateString() === hoje.toDateString()) {
      return 'Hoje';
    } else if (date.toDateString() === ontem.toDateString()) {
      return 'Ontem';
    } else {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  };

  const carregarAnteriores = async () => {
    if (!paginacao?.proximo_cursor || carregandoAnteriores) return;
    setCarregandoAnteriores(true);
    try {
      const { data } = await api.get(`/mensagens/conversa/${veterinarioId}`, {
        params: { cursor: paginacao.proximo_cursor }
      });
      const anteriores = Array.isArray(data) ? data : (data?.mensagens || []);
      // As antigas entram acima, sem tocar no que já está em tela — quem estava
      // lendo não perde a posição.
      setMensagens((atuais) => [...anteriores, ...atuais]);
      setPaginacao(Array.isArray(data) ? null : data?.paginacao || null);
    } catch (error: any) {
      console.error('Erro ao carregar mensagens anteriores:', error);
    } finally {
      setCarregandoAnteriores(false);
    }
  };

  const agruparMensagensPorData = () => {
    const grupos: Record<string, any[]> = {};
    mensagens.forEach((msg: any) => {
      const data = formatarData(msg.criado_em);
      if (!grupos[data]) {
        grupos[data] = [];
      }
      grupos[data].push(msg);
    });
    return grupos;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <div className="text-slate-500">Carregando...</div>
      </div>
    );
  }

  const gruposMensagens = agruparMensagensPorData();

  // Mesma linha de antes, montada fora do JSX para caber no subtítulo do cabeçalho.
  const subtituloDoAtendimento = atendimento
    ? `${TIPOS_DE_ATENDIMENTO[atendimento.tipo_atendimento] || ''}${
        atendimento.criado_em ? ` - ${new Date(atendimento.criado_em).toLocaleDateString('pt-BR')}` : ''
      }`
    : '';

  return (
    <div className="flex h-screen flex-col bg-surface-page">
      <div className="mx-auto flex h-full w-full max-w-md flex-col bg-white">
        {/* Header */}
        <div className="flex-shrink-0">
          <PageHeader
            title={veterinario?.usuario?.nome || 'Veterinário'}
            subtitle={subtituloDoAtendimento || undefined}
            onBack={() => navigate(-1)}
          />
        </div>

        {/* Mensagens */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-20">
          {/* A conversa abre nas mensagens recentes; o resto vem por aqui, sob
              demanda, em vez de a tela baixar tudo e assinar uma URL por anexo. */}
          {paginacao?.tem_mais && (
            <button
              type="button"
              onClick={carregarAnteriores}
              disabled={carregandoAnteriores}
              className="mx-auto block rounded-full border border-slate-200/80 bg-white px-4 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {carregandoAnteriores ? 'Carregando…' : 'Ver mensagens anteriores'}
            </button>
          )}
          {Object.keys(gruposMensagens).length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-400">
              <Icon name="message" size={64} className="mb-4" strokeWidth={1.2} />
              <p>Nenhuma mensagem ainda</p>
              <p className="text-sm mt-2">Envie a primeira mensagem!</p>
            </div>
          ) : (
            Object.keys(gruposMensagens).map(data => (
              <div key={data}>
                {/* Separador de data */}
                <div className="flex justify-center my-4">
                  <span className="bg-slate-100 text-slate-600 text-xs px-3 py-1 rounded-full">
                    {data}
                  </span>
                </div>

                {/* Mensagens do grupo */}
                {gruposMensagens[data].map((msg: ApiPayload) => {
                  // `user` pode ainda não ter hidratado: sem o `?.` a conversa
                  // inteira quebra no primeiro render.
                  const isMinhaMsg = msg.remetente_id === user?.id;

                  return (
                    <div
                      key={msg.id}
                      className={`flex mb-3 ${isMinhaMsg ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[75%] ${isMinhaMsg ? 'order-2' : 'order-1'}`}>
                        {!isMinhaMsg && (
                          <p className="text-xs text-primary font-semibold mb-1 ml-2">
                            {msg.remetente?.nome || 'Veterinário'}
                          </p>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2 ${
                            isMinhaMsg
                              ? 'bg-primary text-white rounded-br-none'
                              : 'bg-slate-100 text-ink rounded-bl-none'
                          } ${msg.excluida ? 'opacity-75' : ''}`}
                        >
                          {msg.excluida ? (
                            <p className="text-sm italic opacity-80">Mensagem apagada</p>
                          ) : (
                            <>
                              {/* Passado o prazo de retencao o binario sai do R2 e a API devolve
                                  url nula com `arquivo_removido`. Sem este ramo a bolha mostraria
                                  uma imagem quebrada em vez de dizer o que houve. */}
                              {msg.anexos?.[0]?.arquivo_removido && (
                                <p className={`mb-1.5 flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] italic opacity-80 ${isMinhaMsg ? 'bg-white/20' : 'bg-white'}`}>
                                  <span className="text-lg">🗑️</span>
                                  <span className="min-w-0">Arquivo removido por política de retenção</span>
                                </p>
                              )}

                              {msg.tipo === 'imagem' && msg.anexos?.[0] && !msg.anexos[0].arquivo_removido && (
                                <a href={msg.anexos[0].url} target="_blank" rel="noreferrer" className="block mb-1.5 overflow-hidden rounded-xl">
                                  <img src={msg.anexos[0].url} alt={msg.conteudo || msg.anexos[0].nome_original} loading="lazy" className="max-h-64 w-full object-cover" />
                                </a>
                              )}

                              {/* Sem transcodificacao nem thumbnail no servidor: o arquivo vai
                                  como veio e o player nativo cuida do resto. `preload="metadata"`
                                  baixa so o cabecalho — abrir a conversa nao pode puxar 25MB. */}
                              {msg.tipo === 'video' && msg.anexos?.[0] && !msg.anexos[0].arquivo_removido && (
                                <div className="mb-1.5 overflow-hidden rounded-xl bg-black/5">
                                  <video
                                    src={msg.anexos[0].url}
                                    controls
                                    preload="metadata"
                                    playsInline
                                    className="max-h-64 w-full bg-black"
                                  >
                                    Seu navegador não reproduz este vídeo.
                                  </video>
                                  <small className={`block px-2.5 py-1 text-[11px] ${isMinhaMsg ? 'text-white/80' : 'text-slate-500'}`}>
                                    {msg.anexos[0].nome_original} · {formatarTamanho(msg.anexos[0].tamanho_bytes)}
                                  </small>
                                </div>
                              )}

                              {msg.tipo === 'documento' && msg.anexos?.[0] && !msg.anexos[0].arquivo_removido && (
                                <a href={msg.anexos[0].url} target="_blank" rel="noreferrer" className={`mb-1.5 flex items-center gap-2 rounded-xl px-2.5 py-2 ${isMinhaMsg ? 'bg-white/20' : 'bg-white'}`}>
                                  <span className="text-lg">📄</span>
                                  <span className="min-w-0">
                                    <strong className="block truncate text-xs">{msg.anexos[0].nome_original}</strong>
                                    <small className="text-[11px] opacity-80">{formatarTamanho(msg.anexos[0].tamanho_bytes)} · abrir</small>
                                  </span>
                                </a>
                              )}

                              {msg.tipo === 'localizacao' && (
                                <a href={mapaDaLocalizacao(msg)} target="_blank" rel="noreferrer" className={`mb-1.5 flex items-center gap-2 rounded-xl px-2.5 py-2 ${isMinhaMsg ? 'bg-white/20' : 'bg-white'}`}>
                                  <span className="text-lg">📍</span>
                                  <span className="min-w-0">
                                    <strong className="block text-xs">Localização compartilhada</strong>
                                    <small className="text-[11px] opacity-80">{msg.endereco || `${msg.latitude?.toFixed(5)}, ${msg.longitude?.toFixed(5)}`}</small>
                                  </span>
                                </a>
                              )}

                              {msg.conteudo && <p className="text-sm break-words">{msg.conteudo}</p>}
                            </>
                          )}

                          <p className={`text-xs mt-1 ${isMinhaMsg ? 'text-white/70' : 'text-slate-500'}`}>
                            {formatarHorario(msg.criado_em)}
                            {msg.editada_em && !msg.excluida && ' · editada'}
                            {isMinhaMsg && !msg.excluida && (msg.lida ? ' · lida' : ' · enviada')}
                          </p>
                        </div>

                        {isMinhaMsg && !msg.excluida && (
                          <div className="mt-1 flex justify-end gap-3 pr-1 text-[11px] text-slate-400">
                            {msg.tipo === 'texto' && (
                              <button type="button" onClick={() => { setEditando(msg); setNovaMensagem(msg.conteudo || ''); }} className="hover:text-primary">
                                Editar
                              </button>
                            )}
                            <button type="button" onClick={() => apagarMensagem(msg)} className="hover:text-red-500">
                              Apagar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input de Mensagem */}
        <div className="border-t border-slate-200/80 p-4 bg-white flex-shrink-0">
          {envioDeArquivo && (
            <div className="mb-2 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800" role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">Enviando {envioDeArquivo.nome} · {formatarTamanho(envioDeArquivo.tamanho)}</span>
                <span className="font-semibold">{envioDeArquivo.progresso}%</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-teal-100">
                <div className="h-full bg-primary transition-all" style={{ width: `${envioDeArquivo.progresso}%` }} />
              </div>
            </div>
          )}
          {erroEnvio && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              <span>{erroEnvio}</span>
              <button type="button" onClick={() => setErroEnvio('')} className="font-bold" aria-label="Dispensar erro">✕</button>
            </div>
          )}
          {editando && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span>Editando mensagem — a versão original fica registrada.</span>
              <button type="button" onClick={() => { setEditando(null); setNovaMensagem(''); }} className="font-bold text-primary">
                Cancelar
              </button>
            </div>
          )}

          <form onSubmit={enviarMensagem} className="flex items-center gap-1.5 sm:gap-2">
            <input ref={arquivoRef} type="file" accept={TIPOS_ANEXO_ACEITOS} onChange={escolherArquivo} hidden />

            <button
              type="button"
              onClick={() => arquivoRef.current?.click()}
              disabled={enviando || Boolean(editando)}
              aria-label="Enviar foto, vídeo ou documento"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition active:scale-95 disabled:opacity-40"
            >
              <Icon name="image" size={19} strokeWidth={1.7} />
            </button>

            <button
              type="button"
              onClick={() => executar(() => enviarLocalizacaoAtual(alvoDaConversa()))}
              disabled={enviando || Boolean(editando)}
              aria-label="Enviar minha localização"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition active:scale-95 disabled:opacity-40"
            >
              <Icon name="pin" size={19} strokeWidth={1.7} />
            </button>

            <div className="relative flex flex-1 items-center bg-slate-100/90 rounded-2xl border border-slate-200/70 focus-within:border-primary/50 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 transition-all pl-3.5 pr-1.5 py-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={novaMensagem}
                onChange={(e) => setNovaMensagem(e.target.value)}
                placeholder={editando ? 'Corrija a mensagem...' : 'Digite uma mensagem...'}
                maxLength={2000}
                className="w-full bg-transparent py-1.5 text-[0.88rem] text-ink placeholder:text-slate-400 outline-none min-w-0 pr-2"
              />

              <button
                type="submit"
                disabled={!novaMensagem.trim() || enviando}
                aria-label={editando ? 'Salvar edição' : 'Enviar mensagem'}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all ${
                  novaMensagem.trim() && !enviando
                    ? 'bg-primary text-white shadow-sm hover:bg-[#127e82] active:scale-95 cursor-pointer'
                    : 'text-slate-300 cursor-not-allowed opacity-50'
                }`}
              >
                <Icon name={editando ? 'check' : 'send'} size={16} strokeWidth={2} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default TutorChat;
