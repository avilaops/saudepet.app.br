import type { ApiPayload } from '../../types/api'
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import SeletorDeLocal from '../../components/tutor/SeletorDeLocal';
import EscolherProfissional from '../../components/tutor/EscolherProfissional';
import TutorBottomNav from '../../components/tutor/TutorBottomNav';
import { Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit';

/**
 * Chamar veterinário, em três passos.
 *
 * É o fluxo principal do produto e era o único que ainda falava outra língua:
 * verde-esmeralda, largura de página web e cabeçalho próprio. Aqui ele passa a
 * usar o mesmo vocabulário das outras telas do tutor — largura de app, cabeçalho
 * em tinta, teal como única cor de ação — sem mexer no que a tela faz.
 */

const TIPOS = [
  {
    valor: 'emergencia',
    icone: 'ambulance',
    titulo: 'Emergência 24h',
    descricao: 'Atendimento prioritário de urgência médica.'
  },
  {
    valor: 'consulta_domiciliar',
    icone: 'vet',
    titulo: 'Consulta Domiciliar',
    descricao: 'Veterinário vai até a sua residência.'
  },
  {
    valor: 'teleorientacao',
    icone: 'camera',
    titulo: 'Teleorientação',
    descricao: 'Atendimento por vídeo chamada instantânea.'
  },
  // Os três preventivos. Não são emergência: quem escolhe aqui está cuidando
  // antes, e a tela trata isso como decisão calma, não como socorro.
  {
    valor: 'consulta_rotina',
    icone: 'vet',
    titulo: 'Consulta de Rotina',
    descricao: 'Check-up preventivo ou acompanhamento, com hora marcada.'
  },
  {
    valor: 'vacinacao',
    icone: 'check',
    titulo: 'Vacinação',
    descricao: 'Aplicação em casa, lançada na carteira digital do pet.'
  },
  {
    valor: 'avaliacao',
    icone: 'clipboard',
    titulo: 'Avaliação Clínica',
    descricao: 'Exame clínico do animal, sem urgência.'
  }
];

const emojiDoPet = (tipo: string) => (tipo === 'gato' ? '🐈' : tipo === 'cachorro' ? '🐶' : '🐾');

export default function TutorSolicitarAtendimentoStepFlow() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [pets, setPets] = useState<ApiPayload[]>([]);
  const [loadingPets, setLoadingPets] = useState(true);

  // Form State
  const [tipoAtendimento, setTipoAtendimento] = useState('emergencia');
  const [selectedPet, setSelectedPet] = useState('');
  const [sintomas, setSintomas] = useState('');
  // O local deixou de ser texto solto: coordenada e endereço andam juntos,
  // confirmados pelo tutor no mapa. Antes o GPS entrava em silêncio no fundo e,
  // se a permissão fosse negada, o chamado nascia sem coordenada — o despacho
  // por proximidade ficava sem ponto de partida e voltava a avisar todo mundo.
  const [local, setLocal] = useState<ApiPayload>({ latitude: null, longitude: null, endereco: '', carregando: false });
  const [complemento, setComplemento] = useState('');
  // Endereços salvos: escolher o local do zero a cada chamado é atrito no pior
  // momento possível — o pet passando mal e a pessoa procurando a própria casa
  // no mapa.
  const [enderecosSalvos, setEnderecosSalvos] = useState<ApiPayload[]>([]);
  const [enderecoEscolhido, setEnderecoEscolhido] = useState<ApiPayload | null>(null);
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const [salvarEndereco, setSalvarEndereco] = useState(false);
  const [rotuloNovo, setRotuloNovo] = useState('Casa');
  const [submitting, setSubmitting] = useState(false);
  // O que a descrição não mostra. Ficam em memória até o chamado existir: só
  // então há um atendimento a que prendê-los.
  const [anexos, setAnexos] = useState<ApiPayload[]>([]);
  // Escolha do profissional: só aparece nos tipos sem pressa, e "qualquer um"
  // continua sendo o padrão.
  const [profissionalEscolhido, setProfissionalEscolhido] = useState<ApiPayload | null>(null);
  const [error, setError] = useState('');
  // Sem sinal, o pedido não pode simplesmente sumir: numa emergência em
  // elevador, garagem ou zona rural, a pessoa não sabe se enviou.
  const [semSinal, setSemSinal] = useState(false);

  useEffect(() => {
    fetchPets();
    carregarEnderecos();
  }, []);

  const carregarEnderecos = async () => {
    try {
      const { data } = await api.get('/v1/enderecos');
      const lista = data.enderecos || [];
      setEnderecosSalvos(lista);

      // O principal já vem escolhido: em emergência, um toque a menos conta.
      const principal = lista.find((item: ApiPayload) => item.principal) || lista[0];
      if (principal) {
        usarEnderecoSalvo(principal);
      } else {
        setMostrarMapa(true);
      }
    } catch {
      setMostrarMapa(true);
    }
  };

  const usarEnderecoSalvo = (item: ApiPayload) => {
    setEnderecoEscolhido(item.id);
    setMostrarMapa(false);
    setSalvarEndereco(false);
    setComplemento(item.complemento || '');
    setLocal({
      latitude: item.latitude,
      longitude: item.longitude,
      endereco: item.endereco,
      cidade: item.cidade,
      carregando: false
    });
  };

  const escolherOutroLocal = () => {
    setEnderecoEscolhido(null);
    setMostrarMapa(true);
    setComplemento('');
    setLocal({ latitude: null, longitude: null, endereco: '', carregando: false });
  };

  const fetchPets = async () => {
    try {
      setLoadingPets(true);
      // A rota real é GET /pets (responde { pets: [...] }); /v1/pets/meus-pets
      // nunca existiu e o 404 virava um objeto de erro dentro de `pets`,
      // derrubando a tela inteira no primeiro .map.
      const { data } = await api.get('/pets');
      const petList = Array.isArray(data?.pets) ? data.pets : [];
      setPets(petList);
      if (petList.length > 0) setSelectedPet(petList[0].id);
    } catch (err: any) {
      console.error('Erro ao buscar pets:', err);
    } finally {
      setLoadingPets(false);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!selectedPet) {
      setError('Selecione o pet para atendimento');
      return;
    }

    // Sem coordenada o chamado sai cego: o servidor recusa, e é melhor dizer
    // aqui, com a tela do mapa à vista, do que devolver erro depois do envio.
    if (local.latitude == null || local.longitude == null) {
      setError('Confirme no mapa onde o veterinário deve chegar.');
      return;
    }

    try {
      setSubmitting(true);

      // Salvar antes de abrir o chamado: se o envio falhar, o endereço que a
      // pessoa acabou de marcar no mapa não se perde junto.
      if (salvarEndereco && !enderecoEscolhido && local.latitude != null) {
        await api.post('/v1/enderecos', {
          rotulo: rotuloNovo.trim() || 'Meu endereço',
          endereco: local.endereco,
          complemento: complemento.trim() || undefined,
          cidade: local.cidade || undefined,
          latitude: local.latitude,
          longitude: local.longitude
        }).catch(() => {
          // Não travamos o atendimento por causa do favorito.
        });
      }
      setError('');

      // Falha de REDE ganha nova tentativa; falha de regra, não. O servidor
      // recusar o pedido é resposta — insistir nela só repetiria o mesmo erro.
      // O prazo é curto de propósito: pedido de socorro não pode sair
      // silenciosamente meia hora depois, quando a pessoa já resolveu de outro
      // jeito.
      const enviarComTentativas = async (corpo: ApiPayload, tentativa = 1) => {
        try {
          const resposta = await api.post('/v1/solicitacoes', corpo);
          setSemSinal(false);
          return resposta;
        } catch (falha: any) {
          const semResposta = !falha.response;
          if (semResposta && tentativa < 4) {
            setSemSinal(true);
            await new Promise((resolve) => setTimeout(resolve, tentativa * 2000));
            return enviarComTentativas(corpo, tentativa + 1);
          }
          setSemSinal(false);
          throw falha;
        }
      };

      // Pelo cliente `api`: o token vem do interceptor e o 401 de sessão
      // expirada desloga em vez de virar "Falha ao criar solicitação".
      const { data } = await enviarComTentativas({
        pet_id: selectedPet,
        tipo_atendimento: tipoAtendimento,
        // Complemento vai junto do endereço: apartamento, bloco e ponto de
        // referência não existem em mapa nenhum e são o que faz o veterinário
        // bater na porta certa.
        localizacao_cliente: [local.endereco, complemento.trim()].filter(Boolean).join(' — '),
        endereco_id: enderecoEscolhido || undefined,
        latitude: local.latitude,
        longitude: local.longitude,
        observacoes: sintomas,
        veterinario_escolhido: profissionalEscolhido || undefined
      });

      if (data?.solicitacao || data?.id) {
        const solId = data.solicitacao?.id || data.id;

        // Os arquivos sobem depois porque só agora existe um atendimento a que
        // prendê-los. Falha aqui não derruba o chamado: quem está pedindo
        // socorro não pode perder o pedido porque uma foto não subiu — o
        // veterinário ainda tem sintomas, endereço e o chat.
        for (const arquivo of anexos) {
          const corpo = new FormData();
          corpo.append('arquivo', arquivo);
          await api.post(`/v1/solicitacoes/${solId}/midias`, corpo, {
            headers: { 'Content-Type': 'multipart/form-data' }
          }).catch(() => {});
        }

        navigate(`/tutor/acompanhar/${solId}`);
      } else {
        setError(data?.error || data?.message || 'Falha ao criar solicitação');
      }
    } catch (err: any) {
      console.error('Erro ao enviar solicitação:', err);
      const resposta = err.response?.data;
      setError(resposta
        ? (resposta.error || resposta.message || 'Falha ao criar solicitação')
        : 'Erro de conexão com o servidor');
    } finally {
      setSubmitting(false);
    }
  };

  const passos = ['Tipo de atendimento', 'Pet & sintomas', 'Endereço'];

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader
        title="Chamar veterinário"
        subtitle={`Passo ${step} de 3 · ${passos[step - 1]}`}
        onBack={() => navigate('/tutor/home')}
      />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {/* Progresso de Passos */}
        <Panel className="space-y-2.5 px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            {passos.map((rotulo, indice) => (
              <Eyebrow key={rotulo} className={step >= indice + 1 ? 'text-primary' : 'text-slate-300'}>
                {indice + 1}. {rotulo}
              </Eyebrow>
            ))}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </Panel>

        {error && (
          <p
            className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700"
            role="alert"
          >
            <Icon name="alert" size={16} className="shrink-0" />
            {error}
          </p>
        )}

        {/* PASSO 1: Escolha do Serviço */}
        {step === 1 && (
          <Panel className="space-y-4 px-4 py-4">
            <div>
              <Eyebrow className="text-primary">Passo 1 de 3</Eyebrow>
              <h2 className="mt-1 text-[1.05rem] font-semibold leading-tight tracking-tight text-ink">
                Qual o tipo de atendimento necessário?
              </h2>
              <p className="mt-1 text-[0.75rem] leading-relaxed text-slate-400">
                Selecione a modalidade de cuidado para o seu Pet.
              </p>
            </div>

            <div className="space-y-2">
              {TIPOS.map((tipo) => {
                const escolhido = tipoAtendimento === tipo.valor;
                return (
                  <button
                    type="button"
                    key={tipo.valor}
                    onClick={() => setTipoAtendimento(tipo.valor)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
                      escolhido ? 'border-primary bg-primary/5' : 'border-slate-200/80 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                      escolhido ? 'border-primary/30 bg-primary/10 text-primary' : 'border-slate-200/80 bg-slate-50 text-ink'
                    }`}>
                      <Icon name={tipo.icone} size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.85rem] font-semibold text-ink">{tipo.titulo}</span>
                      <span className="mt-0.5 block text-[0.72rem] leading-relaxed text-slate-400">{tipo.descricao}</span>
                    </span>
                    {escolhido && <Icon name="check" size={16} className="shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>

            {/* O que o atendimento domiciliar não faz. Dizer isso aqui, antes de
                a pessoa descrever o caso, evita a frustração de esperar por algo
                que precisa de estrutura hospitalar — e prepara o desfecho de
                encaminhamento, que existe e é legítimo. */}
            <p className="rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-3 text-[0.72rem] leading-relaxed text-slate-500">
              O veterinário leva o que cabe numa maleta. <strong className="text-slate-600">Cirurgia
              complexa, internação e exame de imagem</strong> precisam de estrutura hospitalar e não
              são feitos em casa — se for o caso do seu pet, o profissional avalia no local e
              encaminha para um serviço de emergência.
            </p>

            <button
              onClick={() => setStep(2)}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82]"
            >
              Avançar para Pet & Sintomas
              <Icon name="chevron" size={15} />
            </button>
          </Panel>
        )}

        {/* PASSO 2: Seleção do Pet & Sintomas */}
        {step === 2 && (
          <Panel className="space-y-4 px-4 py-4">
            <div>
              <Eyebrow className="text-primary">Passo 2 de 3</Eyebrow>
              <h2 className="mt-1 text-[1.05rem] font-semibold leading-tight tracking-tight text-ink">
                Selecione o Pet e descreva os sintomas
              </h2>
            </div>

            <div className="space-y-3">
              <div>
                <Eyebrow className="text-slate-400">Selecione o Pet *</Eyebrow>
                {loadingPets ? (
                  <div className="mt-1.5 animate-pulse rounded-xl bg-slate-100 px-3.5 py-2.5 text-[0.78rem] text-slate-400">
                    Carregando pets...
                  </div>
                ) : pets.length === 0 ? (
                  <div className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[0.75rem] leading-relaxed text-amber-800">
                    Você não possui pets cadastrados. Cadastre seu pet antes de solicitar.
                  </div>
                ) : (
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {pets.map((pet) => {
                      const escolhido = selectedPet === pet.id;
                      return (
                        <button
                          type="button"
                          key={pet.id}
                          onClick={() => setSelectedPet(pet.id)}
                          className={`rounded-2xl border px-3.5 py-3 text-left transition ${
                            escolhido ? 'border-primary bg-primary/5' : 'border-slate-200/80 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <span className="block truncate text-[0.82rem] font-semibold text-ink">
                            {emojiDoPet(pet.tipo)} {pet.nome}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.7rem] text-slate-400">
                            {pet.tipo || 'Pet'} ({pet.raca || 'S/R'})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <label className="block">
                <Eyebrow className="text-slate-400">Sintomas / Ocorrência</Eyebrow>
                <textarea
                  rows={4}
                  placeholder="Descreva o que o pet está sentindo, comportamento recente ou motivo da urgência..."
                  value={sintomas}
                  onChange={(e) => setSintomas(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary"
                />
              </label>

              {/* Foto, vídeo e áudio junto do pedido. Antes, o único caminho
                  para arquivo era o chat — que só abre DEPOIS que alguém
                  aceita: quem tinha a foto da ferida na mão não conseguia
                  mandar na hora, e o veterinário decidia aceitar sem ver. */}
              <div className="rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-3">
                <Eyebrow className="text-slate-400">Fotos, vídeo ou áudio (opcional)</Eyebrow>
                <p className="mt-1 text-[0.72rem] leading-relaxed text-slate-500">
                  Mostre o que é difícil escrever — a ferida, o jeito de andar, o som da
                  respiração. O veterinário vê antes de aceitar o chamado.
                </p>
                <input
                  type="file"
                  accept="image/*,video/*,audio/*"
                  multiple
                  onChange={(e) => {
                    const escolhidos = Array.from(e.target.files || []);
                    // Teto local para não travar o envio do chamado numa fila
                    // de uploads no pior momento possível.
                    setAnexos((atuais) => [...atuais, ...escolhidos].slice(0, 5));
                    e.target.value = '';
                  }}
                  className="mt-2 block w-full text-[0.72rem] text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-white file:px-3.5 file:py-2 file:text-[0.75rem] file:font-semibold file:text-primary file:shadow-sm"
                />
                {anexos.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {anexos.map((arquivo, indice) => (
                      <li key={`${arquivo.name}-${indice}`} className="flex items-center justify-between gap-2 text-[0.72rem] text-slate-600">
                        <span className="min-w-0 truncate">{arquivo.name}</span>
                        <button
                          type="button"
                          onClick={() => setAnexos((atuais) => atuais.filter((_, i) => i !== indice))}
                          className="shrink-0 font-semibold text-red-600 hover:underline"
                        >
                          remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 rounded-2xl border border-slate-200/80 px-4 py-3 text-[0.8rem] font-semibold text-slate-500 transition hover:bg-slate-50"
              >
                <Icon name="chevron" size={15} className="rotate-180" />
                Voltar
              </button>
              <button
                onClick={() => selectedPet ? setStep(3) : setError('Escolha o pet que será atendido para continuar.')}
                disabled={pets.length === 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-50"
              >
                Avançar para o endereço
                <Icon name="chevron" size={15} />
              </button>
            </div>
          </Panel>
        )}

        {/* PASSO 3: Endereço & Confirmar */}
        {step === 3 && (
          <Panel as="form" onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
            <div>
              <Eyebrow className="text-primary">Passo 3 de 3</Eyebrow>
              <h2 className="mt-1 text-[1.05rem] font-semibold leading-tight tracking-tight text-ink">
                Endereço do atendimento
              </h2>
            </div>

            {enderecosSalvos.length > 0 && (
              <div className="space-y-2">
                <Eyebrow className="text-slate-400">Meus endereços</Eyebrow>
                {enderecosSalvos.map((item) => {
                  const ativo = enderecoEscolhido === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => usarEnderecoSalvo(item)}
                      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${ativo ? 'border-primary bg-primary/5' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${ativo ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                        <Icon name={ativo ? 'check' : 'pin'} size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.85rem] font-semibold text-ink">{item.rotulo}</span>
                        <span className="mt-0.5 block text-[0.72rem] leading-relaxed text-slate-500">{item.endereco}</span>
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={escolherOutroLocal}
                  className={`w-full rounded-2xl border border-dashed px-4 py-3 text-[0.8rem] font-semibold transition ${mostrarMapa ? 'border-primary text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}
                >
                  Atender em outro lugar
                </button>
              </div>
            )}

            {mostrarMapa && (
              <>
                <p className="text-[0.78rem] leading-relaxed text-slate-500">
                  Confirme no mapa onde o veterinário deve chegar. É por este ponto que
                  encontramos quem está mais perto de você.
                </p>

                <SeletorDeLocal valor={local} onChange={setLocal} />

                {local.latitude != null && (
                  <div className="rounded-2xl border border-slate-200 px-4 py-3">
                    <label className="flex items-start gap-2.5 text-[0.78rem] leading-relaxed text-slate-600">
                      <input
                        type="checkbox"
                        checked={salvarEndereco}
                        onChange={(e) => setSalvarEndereco(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      Salvar este endereço para os próximos chamados
                    </label>
                    {salvarEndereco && (
                      <input
                        value={rotuloNovo}
                        onChange={(e) => setRotuloNovo(e.target.value)}
                        maxLength={40}
                        placeholder="Casa, Trabalho, Sítio…"
                        className="mt-2 w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary"
                      />
                    )}
                  </div>
                )}
              </>
            )}

            <label className="block">
              <Eyebrow className="text-slate-400">Complemento e referência</Eyebrow>
              <input
                type="text"
                placeholder="Apto, bloco, portão azul, ao lado da padaria…"
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                maxLength={200}
                className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary"
              />
            </label>

            {/* O pagamento é combinado após o atendimento (cobrança do vet ou
                tabela da cidade) — o seletor que existia aqui coletava uma
                preferência que nunca era enviada. */}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 rounded-2xl border border-slate-200/80 px-4 py-3 text-[0.8rem] font-semibold text-slate-500 transition hover:bg-slate-50"
              >
                <Icon name="chevron" size={15} className="rotate-180" />
                Voltar
              </button>
              <button
                type="submit"
                disabled={submitting || local.latitude == null || local.carregando}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-50"
              >
                {/* "Sem sinal, tentando de novo" em vez de um botão travado em
                    "Solicitando…": a pessoa precisa saber que o problema é a
                    rede dela, e que ainda estamos tentando. */}
                {semSinal ? 'Sem sinal — tentando de novo…' : submitting ? 'Solicitando...' : 'Confirmar & Iniciar Busca'}
                <Icon name="check" size={15} />
              </button>
            </div>
          </Panel>
        )}
      </div>

      <TutorBottomNav />
    </div>
  );
}
