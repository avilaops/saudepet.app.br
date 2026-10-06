import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import { Badge, EmptyState, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import {
  emReais,
  enderecos,
  escreverUnidade,
  mercado,
  quilometros,
  type Carrinho,
  type CotacaoDeEntrega,
  type EnderecoSalvo,
  type OpcaoTransportadora
} from '../../services/mercado'

/**
 * O carrinho — um por loja.
 *
 * Cada loja separa, embala e entrega o que é dela. Um carrinho único com itens
 * de três vendedores viraria três pedidos, três prazos e três repasses
 * escondidos atrás de um botão só de "finalizar". Aqui a pessoa vê exatamente
 * o que vai acontecer: uma compra por loja, um pagamento por compra.
 *
 * A tela nunca corrige em silêncio. Preço que mudou, item que saiu do catálogo,
 * quantidade acima do que a loja tem — tudo vira `alerta` (não impede) ou
 * `impedimento` (impede e diz por quê), calculado pelo servidor a cada leitura.
 * O pior desenho possível seria descobrir isso na tela de pagamento.
 *
 * Entrega em casa (desde 27/08/2026): a loja define raio e frete; a distância
 * é medida do endereço salvo do tutor até a loja, e o frete aparece AQUI, antes
 * de a pessoa escolher. Fora do raio não é frete caro — é a opção que não fecha.
 */

type TipoDeEntrega = 'retirada' | 'combinar' | 'loja' | 'transportadora'

type Candidato = { endereco: string | null; cidade: string | null; latitude: number; longitude: number }

export default function TutorMercadoCarrinho() {
  const navigate = useNavigate()

  const [carrinhos, setCarrinhos] = useState<Carrinho[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Escolhas do fechamento, por loja: a pessoa pode ter carrinho em duas e
  // querer retirar numa e receber em casa da outra.
  const [entrega, setEntrega] = useState<Record<string, TipoDeEntrega>>({})
  const [endereco, setEndereco] = useState<Record<string, string>>({})
  const [observacao, setObservacao] = useState<Record<string, string>>({})
  const [fechando, setFechando] = useState<string | null>(null)
  const [erroDoFechamento, setErroDoFechamento] = useState<Record<string, string>>({})

  // Entrega em casa: endereços salvos, o escolhido por loja e a cotação de cada um.
  const [salvos, setSalvos] = useState<EnderecoSalvo[]>([])
  const [escolhido, setEscolhido] = useState<Record<string, EnderecoSalvo | null>>({})
  const [cotacoes, setCotacoes] = useState<Record<string, CotacaoDeEntrega | null>>({})
  const [cotando, setCotando] = useState<string | null>(null)
  const [novoEndereco, setNovoEndereco] = useState<Record<string, string>>({})
  const [candidatos, setCandidatos] = useState<Record<string, Candidato[]>>({})
  const [localizando, setLocalizando] = useState<string | null>(null)
  const [erroDoEndereco, setErroDoEndereco] = useState<Record<string, string>>({})

  const [destinoTransportadora, setDestinoTransportadora] = useState<Record<string, {
    cep: string
    numero: string
    endereco: string
    complemento: string
    cidade: string
  }>>({})
  const [opcoesTransportadora, setOpcoesTransportadora] = useState<Record<string, OpcaoTransportadora[]>>({})
  const [servicoTransportadora, setServicoTransportadora] = useState<Record<string, string>>({})
  const [cotandoTransportadora, setCotandoTransportadora] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const { carrinhos: lista } = await mercado.carrinhos()
      setCarrinhos(lista)
      setEntrega((atual) => {
        const proximo = { ...atual }
        lista.forEach((carrinho) => {
          if (!proximo[carrinho.loja.id]) {
            // O padrão é o que a loja aceita, na ordem em que custa menos
            // surpresa: balcão, depois entrega em casa, depois combinar.
            proximo[carrinho.loja.id] = carrinho.loja.aceita_retirada
              ? 'retirada'
              : carrinho.loja.aceita_entrega
                ? 'loja'
                : 'combinar'
          }
        })
        return proximo
      })
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível abrir seus carrinhos.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Endereços salvos vêm uma vez. O principal já entra escolhido para toda
  // loja: "Casa" em um toque é o motivo de o endereço salvo existir.
  useEffect(() => {
    enderecos
      .listar()
      .then(({ enderecos: lista }) => {
        setSalvos(lista)
        const principal = lista.find((item) => item.principal) || lista[0] || null
        if (principal) {
          setEscolhido((atual) => {
            const proximo = { ...atual }
            carrinhos.forEach((carrinho) => {
              if (proximo[carrinho.loja.id] === undefined) proximo[carrinho.loja.id] = principal
            })
            return proximo
          })
        }
      })
      .catch(() => setSalvos([]))
    // Só na primeira carga dos carrinhos: recarregar depois não deve desfazer
    // uma escolha que a pessoa acabou de fazer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrinhos.length > 0])

  // Cotação: sempre que a loja está em "entrega em casa" e há endereço escolhido.
  useEffect(() => {
    carrinhos.forEach((carrinho) => {
      const lojaId = carrinho.loja.id
      const ponto = escolhido[lojaId]
      if (entrega[lojaId] !== 'loja' || !ponto) return

      setCotando(lojaId)
      mercado
        .cotarEntrega(lojaId, { latitude: ponto.latitude, longitude: ponto.longitude })
        .then(({ cotacao }) => setCotacoes((atual) => ({ ...atual, [lojaId]: cotacao })))
        .catch(() => setCotacoes((atual) => ({ ...atual, [lojaId]: null })))
        .finally(() => setCotando((atual) => (atual === lojaId ? null : atual)))
    })
  }, [carrinhos, entrega, escolhido])

  const mudarQuantidade = async (produtoId: string, quantidade: number) => {
    setOcupado(produtoId)
    try {
      await mercado.mudarQuantidade(produtoId, quantidade)
      await carregar()
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível mudar a quantidade.')
    } finally {
      setOcupado(null)
    }
  }

  const esvaziar = async (lojaId: string) => {
    setOcupado(lojaId)
    try {
      await mercado.esvaziar(lojaId)
      await carregar()
    } catch {
      setErro('Não foi possível esvaziar este carrinho.')
    } finally {
      setOcupado(null)
    }
  }

  /** Endereço digitado → candidatos com coordenada, para a pessoa confirmar. */
  const localizar = async (lojaId: string) => {
    const termo = (novoEndereco[lojaId] || '').trim()
    if (termo.length < 5) {
      setErroDoEndereco((atual) => ({ ...atual, [lojaId]: 'Digite rua, número e cidade.' }))
      return
    }
    setLocalizando(lojaId)
    setErroDoEndereco((atual) => ({ ...atual, [lojaId]: '' }))
    try {
      const { locais } = await enderecos.localizar(termo)
      setCandidatos((atual) => ({ ...atual, [lojaId]: locais }))
      if (locais.length === 0) {
        setErroDoEndereco((atual) => ({ ...atual, [lojaId]: 'Não achamos esse endereço. Tente com o bairro e a cidade.' }))
      }
    } catch {
      setErroDoEndereco((atual) => ({ ...atual, [lojaId]: 'Não foi possível localizar agora. Tente de novo.' }))
    } finally {
      setLocalizando(null)
    }
  }

  /** O candidato confirmado vira endereço salvo — e já entra escolhido. */
  const confirmarCandidato = async (lojaId: string, candidato: Candidato) => {
    setLocalizando(lojaId)
    try {
      const { endereco: criado } = await enderecos.criar({
        rotulo: salvos.length === 0 ? 'Casa' : 'Endereço',
        endereco: candidato.endereco || novoEndereco[lojaId].trim(),
        cidade: candidato.cidade || undefined,
        latitude: candidato.latitude,
        longitude: candidato.longitude
      })
      setSalvos((atual) => [criado, ...atual])
      setEscolhido((atual) => ({ ...atual, [lojaId]: criado }))
      setCandidatos((atual) => ({ ...atual, [lojaId]: [] }))
      setNovoEndereco((atual) => ({ ...atual, [lojaId]: '' }))
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErroDoEndereco((atual) => ({ ...atual, [lojaId]: resposta?.data?.error || 'Não foi possível salvar o endereço.' }))
    } finally {
      setLocalizando(null)
    }
  }

  const mudarDestino = (lojaId: string, campo: string, valor: string) => {
    setDestinoTransportadora((atual) => {
      const anterior = atual[lojaId] || { cep: '', numero: '', endereco: '', complemento: '', cidade: '' }
      return { ...atual, [lojaId]: { ...anterior, [campo]: valor } }
    })
    if (campo === 'cep') {
      setOpcoesTransportadora((atual) => ({ ...atual, [lojaId]: [] }))
      setServicoTransportadora((atual) => ({ ...atual, [lojaId]: '' }))
    }
  }

  const cotarTransportadora = async (lojaId: string) => {
    const destino = destinoTransportadora[lojaId]
    if (!destino || destino.cep.replace(/\D/g, '').length !== 8) {
      setErroDoFechamento((atual) => ({ ...atual, [lojaId]: 'Informe um CEP com 8 dígitos.' }))
      return
    }
    setCotandoTransportadora(lojaId)
    setErroDoFechamento((atual) => ({ ...atual, [lojaId]: '' }))
    try {
      const { opcoes } = await mercado.cotarTransportadoras(lojaId, destino.cep)
      setOpcoesTransportadora((atual) => ({ ...atual, [lojaId]: opcoes }))
      if (opcoes.length > 0) setServicoTransportadora((atual) => ({ ...atual, [lojaId]: opcoes[0].servico }))
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErroDoFechamento((atual) => ({
        ...atual,
        [lojaId]: resposta?.data?.error || 'Não foi possível cotar as transportadoras agora.'
      }))
    } finally {
      setCotandoTransportadora(null)
    }
  }

  const fechar = async (carrinho: Carrinho) => {
    const lojaId = carrinho.loja.id
    const tipo = entrega[lojaId] || 'retirada'

    setErroDoFechamento((atual) => ({ ...atual, [lojaId]: '' }))

    if (tipo === 'combinar' && (endereco[lojaId] || '').trim().length < 5) {
      setErroDoFechamento((atual) => ({ ...atual, [lojaId]: 'Informe o endereço para a loja combinar a entrega.' }))
      return
    }

    const ponto = escolhido[lojaId]
    if (tipo === 'loja' && !ponto) {
      setErroDoFechamento((atual) => ({ ...atual, [lojaId]: 'Escolha o endereço de entrega.' }))
      return
    }

    const destino = destinoTransportadora[lojaId]
    if (tipo === 'transportadora') {
      if (!destino || destino.cep.replace(/\D/g, '').length !== 8 || !destino.numero.trim() || destino.endereco.trim().length < 5) {
        setErroDoFechamento((atual) => ({ ...atual, [lojaId]: 'Complete CEP, endereço e número para receber o pedido.' }))
        return
      }
      if (!servicoTransportadora[lojaId]) {
        setErroDoFechamento((atual) => ({ ...atual, [lojaId]: 'Calcule e escolha uma transportadora.' }))
        return
      }
    }

    setFechando(lojaId)
    try {
      const { pedido } = await mercado.fechar({
        loja_id: lojaId,
        entrega_tipo: tipo,
        endereco:
          tipo === 'combinar'
            ? { endereco: endereco[lojaId].trim(), cidade: carrinho.loja.cidade }
            : tipo === 'loja' && ponto
              ? {
                  endereco: ponto.endereco,
                  complemento: ponto.complemento || undefined,
                  cidade: ponto.cidade || carrinho.loja.cidade,
                  latitude: ponto.latitude,
                  longitude: ponto.longitude
                }
              : tipo === 'transportadora' && destino
                ? {
                    endereco: destino.endereco.trim(),
                    cep: destino.cep,
                    numero: destino.numero.trim(),
                    complemento: destino.complemento.trim() || undefined,
                    cidade: destino.cidade.trim() || undefined
                  }
                : undefined,
        frete_servico: tipo === 'transportadora' ? servicoTransportadora[lojaId] : undefined,
        observacao: observacao[lojaId]?.trim() || undefined
      })
      // O pedido nasce reservando estoque e esperando pagamento. A pessoa vai
      // direto para a cobrança, mas o pedido fica de pé se ela fechar o app.
      navigate(`/tutor/mercado/pedidos/${pedido.id}/pagamento`)
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErroDoFechamento((atual) => ({
        ...atual,
        [lojaId]: resposta?.data?.error || 'Não foi possível fechar este pedido.'
      }))
      await carregar()
    } finally {
      setFechando(null)
    }
  }

  const campo =
    'w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary'

  const opcao = (ativa: boolean) =>
    `flex-1 rounded-xl px-3 py-2.5 text-[0.76rem] font-semibold transition ${
      ativa ? 'bg-ink text-white' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200/80'
    }`

  const blocoDeEntregaEmCasa = (carrinho: Carrinho) => {
    const lojaId = carrinho.loja.id
    const ponto = escolhido[lojaId] || null
    const cotacao = cotacoes[lojaId]
    const lista = candidatos[lojaId] || []

    return (
      <div className="space-y-2.5">
        {salvos.length > 0 && (
          <div className="space-y-1.5">
            {salvos.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setEscolhido((atual) => ({ ...atual, [lojaId]: item }))}
                className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
                  ponto?.id === item.id ? 'bg-primary/5 ring-1 ring-primary/40' : 'bg-slate-50 ring-1 ring-slate-200/80'
                }`}
              >
                <Icon name="pin" size={15} className={`mt-0.5 shrink-0 ${ponto?.id === item.id ? 'text-primary' : 'text-slate-300'}`} />
                <span className="min-w-0">
                  <span className="block text-[0.76rem] font-semibold text-ink">{item.rotulo}</span>
                  <span className="block truncate text-[0.7rem] text-slate-500">
                    {item.endereco}
                    {item.complemento ? `, ${item.complemento}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={novoEndereco[lojaId] || ''}
              onChange={(evento) => setNovoEndereco((atual) => ({ ...atual, [lojaId]: evento.target.value }))}
              placeholder={salvos.length ? 'Outro endereço: rua, número, cidade' : 'Rua, número, bairro, cidade'}
              className={campo}
            />
            <button
              type="button"
              onClick={() => localizar(lojaId)}
              disabled={localizando === lojaId}
              className="shrink-0 rounded-xl bg-ink px-3 text-[0.74rem] font-semibold text-white transition hover:bg-[#0e262b] disabled:opacity-60"
            >
              {localizando === lojaId ? '…' : 'Localizar'}
            </button>
          </div>
          {erroDoEndereco[lojaId] && <p className="text-[0.7rem] text-red-700">{erroDoEndereco[lojaId]}</p>}
          {lista.length > 0 && (
            <ul className="space-y-1">
              {lista.map((candidato, indice) => (
                <li key={`${candidato.latitude}-${candidato.longitude}-${indice}`}>
                  <button
                    type="button"
                    onClick={() => confirmarCandidato(lojaId, candidato)}
                    className="flex w-full items-start gap-2 rounded-xl bg-white px-3 py-2 text-left text-[0.72rem] text-ink ring-1 ring-slate-200/80 transition hover:bg-slate-50"
                  >
                    <Icon name="check" size={13} className="mt-0.5 shrink-0 text-primary" />
                    <span>{candidato.endereco || `${candidato.latitude.toFixed(5)}, ${candidato.longitude.toFixed(5)}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {ponto && (
          <div
            className={`rounded-xl px-3 py-2.5 text-[0.72rem] leading-relaxed ${
              cotando === lojaId || cotacao === undefined
                ? 'bg-slate-50 text-slate-500'
                : cotacao?.disponivel
                  ? 'bg-primary/5 text-ink'
                  : 'bg-red-50 text-red-700'
            }`}
          >
            {cotando === lojaId || cotacao === undefined ? (
              'Calculando o frete…'
            ) : cotacao === null ? (
              'Não foi possível calcular o frete agora.'
            ) : cotacao.disponivel ? (
              <>
                <strong className="font-semibold">
                  {cotacao.frete_gratis ? 'Frete grátis' : `Frete ${emReais(cotacao.frete)}`}
                </strong>
                {cotacao.distancia_km != null ? ` · ${quilometros(cotacao.distancia_km)} da loja` : ''}
                {cotacao.prazo_horas ? ` · entrega em até ${cotacao.prazo_horas} h` : ''}
                {cotacao.falta_para_frete_gratis != null && cotacao.falta_para_frete_gratis > 0 && (
                  <span className="mt-0.5 block text-slate-500">
                    Faltam {emReais(cotacao.falta_para_frete_gratis)} para o frete grátis.
                  </span>
                )}
              </>
            ) : (
              cotacao.motivo
            )}
          </div>
        )}
      </div>
    )
  }

  const cartaoDoCarrinho = (carrinho: Carrinho) => {
    const lojaId = carrinho.loja.id
    const tipo = entrega[lojaId] || 'retirada'
    const cotacao = cotacoes[lojaId]
    const opcaoDeFrete = (opcoesTransportadora[lojaId] || []).find((item) => item.servico === servicoTransportadora[lojaId])
    const entregaFecha = tipo === 'loja'
      ? Boolean(escolhido[lojaId]) && Boolean(cotacao?.disponivel)
      : tipo === 'transportadora'
        ? Boolean(opcaoDeFrete)
        : true
    const podeFechar = carrinho.impedimentos.length === 0 && entregaFecha
    const pedidoMinimo = Number(carrinho.loja.pedido_minimo || 0)
    const frete = tipo === 'loja' && cotacao?.disponivel ? cotacao.frete : tipo === 'transportadora' ? (opcaoDeFrete?.valor || 0) : 0
    const total = Math.round((carrinho.subtotal + frete) * 100) / 100

    return (
      <Panel key={carrinho.id} className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
          <div className="min-w-0">
            <Eyebrow className="text-slate-400">Loja</Eyebrow>
            <h2 className="truncate text-[0.92rem] font-semibold tracking-tight text-ink">
              {carrinho.loja.nome_fantasia}
            </h2>
            <p className="mt-0.5 text-[0.72rem] text-slate-400">
              {carrinho.loja.cidade} · pronto em cerca de {carrinho.loja.prazo_preparo_min} min
            </p>
          </div>
          <button
            type="button"
            onClick={() => esvaziar(lojaId)}
            disabled={ocupado === lojaId}
            className="shrink-0 rounded-xl p-2 text-slate-300 transition hover:text-red-500 disabled:opacity-50"
            aria-label={`Esvaziar carrinho da ${carrinho.loja.nome_fantasia}`}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>

        <ul className="divide-y divide-slate-100">
          {carrinho.itens.map((item) => (
            <li key={item.id} className="flex gap-3 px-4 py-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 text-slate-300">
                {item.imagem_url
                  ? <img src={item.imagem_url} alt="" className="h-full w-full object-cover" />
                  : <Icon name="inbox" size={20} />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className={`truncate text-[0.82rem] font-semibold text-ink ${!item.disponivel ? 'line-through opacity-60' : ''}`}>
                      {item.nome}
                    </h3>
                    {item.variacao && <p className="truncate text-[0.7rem] text-slate-400">{item.variacao}</p>}
                  </div>
                  {item.exige_receita && <Badge tone="amber">Receita</Badge>}
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[0.85rem] font-semibold tabular-nums text-ink">{emReais(item.subtotal)}</span>
                  {item.em_promocao && (
                    <span className="text-[0.68rem] text-slate-400 line-through tabular-nums">
                      {emReais(item.preco_cheio * item.quantidade_disponivel)}
                    </span>
                  )}
                  <span className="text-[0.68rem] text-slate-400">
                    {emReais(item.preco)} / {escreverUnidade(1, item.unidade).replace('1 ', '')}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => mudarQuantidade(item.produto_id, item.quantidade - 1)}
                    disabled={ocupado === item.produto_id}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 text-ink transition hover:bg-slate-50 disabled:opacity-50"
                    aria-label="Diminuir"
                  >
                    <Icon name="close" size={13} className="rotate-45" />
                  </button>
                  <span className="min-w-14 text-center text-[0.78rem] font-semibold tabular-nums text-ink">
                    {escreverUnidade(item.quantidade, item.unidade)}
                  </span>
                  <button
                    type="button"
                    onClick={() => mudarQuantidade(item.produto_id, item.quantidade + 1)}
                    disabled={ocupado === item.produto_id}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 text-ink transition hover:bg-slate-50 disabled:opacity-50"
                    aria-label="Aumentar"
                  >
                    <Icon name="plus" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => mudarQuantidade(item.produto_id, 0)}
                    disabled={ocupado === item.produto_id}
                    className="ml-auto text-[0.7rem] font-semibold text-slate-400 transition hover:text-red-500"
                  >
                    remover
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {(carrinho.alertas.length > 0 || carrinho.impedimentos.length > 0) && (
          <div className="space-y-1.5 border-t border-slate-100 px-4 py-3">
            {carrinho.impedimentos.map((texto) => (
              <p key={texto} className="flex items-start gap-1.5 text-[0.72rem] leading-relaxed text-red-700">
                <Icon name="alert" size={13} className="mt-px shrink-0" />
                {texto}
              </p>
            ))}
            {carrinho.alertas.map((texto) => (
              <p key={texto} className="flex items-start gap-1.5 text-[0.72rem] leading-relaxed text-amber-700">
                <Icon name="alert" size={13} className="mt-px shrink-0" />
                {texto}
              </p>
            ))}
          </div>
        )}

        <div className="space-y-3 border-t border-slate-100 px-4 py-3.5">
          <Eyebrow className="text-slate-400">Como você recebe</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {carrinho.loja.aceita_retirada && (
              <button type="button" onClick={() => setEntrega((atual) => ({ ...atual, [lojaId]: 'retirada' }))} className={opcao(tipo === 'retirada')}>
                Retiro na loja
              </button>
            )}
            {carrinho.loja.aceita_entrega && (
              <button type="button" onClick={() => setEntrega((atual) => ({ ...atual, [lojaId]: 'loja' }))} className={opcao(tipo === 'loja')}>
                Entrega em casa
              </button>
            )}
            {carrinho.loja.aceita_combinar && (
              <button type="button" onClick={() => setEntrega((atual) => ({ ...atual, [lojaId]: 'combinar' }))} className={opcao(tipo === 'combinar')}>
                Combinar
              </button>
            )}
            {carrinho.loja.aceita_transportadora && (
              <button type="button" onClick={() => setEntrega((atual) => ({ ...atual, [lojaId]: 'transportadora' }))} className={opcao(tipo === 'transportadora')}>
                Transportadora
              </button>
            )}
          </div>

          {tipo === 'retirada' && (
            <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[0.72rem] leading-relaxed text-slate-500">
              Você busca em <strong className="font-semibold text-ink">{carrinho.loja.endereco}</strong>
              {carrinho.loja.bairro ? `, ${carrinho.loja.bairro}` : ''}. A loja avisa quando estiver separado.
            </p>
          )}

          {tipo === 'loja' && (
            <>
              <p className="text-[0.68rem] leading-relaxed text-slate-400">
                A própria loja leva
                {carrinho.loja.entrega_raio_km ? ` até ${quilometros(carrinho.loja.entrega_raio_km)}` : ''}
                {carrinho.loja.frete_gratis_acima
                  ? `, com frete grátis a partir de ${emReais(carrinho.loja.frete_gratis_acima)}`
                  : ''}
                . O frete é calculado pela distância até o seu endereço.
              </p>
              {blocoDeEntregaEmCasa(carrinho)}
            </>
          )}

          {tipo === 'combinar' && (
            <>
              <input
                type="text"
                value={endereco[lojaId] || ''}
                onChange={(evento) => setEndereco((atual) => ({ ...atual, [lojaId]: evento.target.value }))}
                placeholder="Rua, número, bairro"
                className={campo}
              />
              <p className="text-[0.68rem] leading-relaxed text-slate-400">
                A loja combina prazo e valor de entrega com você depois do pagamento.
              </p>
            </>
          )}

          {tipo === 'transportadora' && (
            <div className="space-y-2.5 rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-[0.7rem] leading-relaxed text-slate-500">
                PAC, SEDEX, Jadlog e Loggi aparecem conforme o seu CEP e o peso real dos produtos.
              </p>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <input className={campo} inputMode="numeric" placeholder="CEP" value={destinoTransportadora[lojaId]?.cep || ''}
                  onChange={(evento) => mudarDestino(lojaId, 'cep', evento.target.value)} />
                <input className={campo} placeholder="Número" value={destinoTransportadora[lojaId]?.numero || ''}
                  onChange={(evento) => mudarDestino(lojaId, 'numero', evento.target.value)} />
              </div>
              <input className={campo} placeholder="Rua e bairro" value={destinoTransportadora[lojaId]?.endereco || ''}
                onChange={(evento) => mudarDestino(lojaId, 'endereco', evento.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={campo} placeholder="Complemento" value={destinoTransportadora[lojaId]?.complemento || ''}
                  onChange={(evento) => mudarDestino(lojaId, 'complemento', evento.target.value)} />
                <input className={campo} placeholder="Cidade" value={destinoTransportadora[lojaId]?.cidade || ''}
                  onChange={(evento) => mudarDestino(lojaId, 'cidade', evento.target.value)} />
              </div>
              <button type="button" onClick={() => cotarTransportadora(lojaId)} disabled={cotandoTransportadora === lojaId}
                className="w-full rounded-xl bg-ink px-4 py-2.5 text-[0.76rem] font-semibold text-white disabled:opacity-60">
                {cotandoTransportadora === lojaId ? 'Consultando transportadoras…' : 'Calcular frete'}
              </button>
              {(opcoesTransportadora[lojaId] || []).map((item) => (
                <button key={item.servico} type="button"
                  onClick={() => setServicoTransportadora((atual) => ({ ...atual, [lojaId]: item.servico }))}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ring-1 ${
                    servicoTransportadora[lojaId] === item.servico ? 'bg-primary/5 ring-primary/40' : 'bg-white ring-slate-200/80'
                  }`}>
                  <span><strong className="block text-[0.76rem] text-ink">{item.transportadora} {item.nome}</strong><span className="text-[0.68rem] text-slate-400">{item.prazo}</span></span>
                  <strong className="text-[0.8rem] tabular-nums text-ink">{emReais(item.valor)}</strong>
                </button>
              ))}
            </div>
          )}

          <textarea
            value={observacao[lojaId] || ''}
            onChange={(evento) => setObservacao((atual) => ({ ...atual, [lojaId]: evento.target.value }))}
            placeholder="Observação para a loja (opcional)"
            rows={2}
            className={`${campo} resize-none`}
          />
        </div>

        <div className="border-t border-slate-100 px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.8rem] text-slate-500">Subtotal</span>
            <span className="text-[0.95rem] font-semibold tabular-nums text-ink">{emReais(carrinho.subtotal)}</span>
          </div>
          {((tipo === 'loja' && cotacao?.disponivel) || (tipo === 'transportadora' && opcaoDeFrete)) && (
            <>
              <div className="mt-0.5 flex items-center justify-between">
                <span className="text-[0.8rem] text-slate-500">Entrega</span>
                <span className="text-[0.85rem] tabular-nums text-ink">{tipo === 'loja' && cotacao?.frete_gratis ? 'grátis' : emReais(frete)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between">
                <span className="text-[0.8rem] text-slate-500">Total</span>
                <span className="text-[1.05rem] font-semibold tabular-nums text-ink">{emReais(total)}</span>
              </div>
            </>
          )}
          {pedidoMinimo > 0 && (
            <p className="mt-0.5 text-right text-[0.68rem] text-slate-400">
              pedido mínimo desta loja: {emReais(pedidoMinimo)}
            </p>
          )}
          {carrinho.prazo_encomenda_dias && (
            <p className="mt-1 text-[0.7rem] text-amber-700">
              Há item sob encomenda: prazo de até {carrinho.prazo_encomenda_dias} dia(s).
            </p>
          )}

          {erroDoFechamento[lojaId] && (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[0.72rem] text-red-700">{erroDoFechamento[lojaId]}</p>
          )}

          <button
            type="button"
            onClick={() => fechar(carrinho)}
            disabled={!podeFechar || fechando === lojaId}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:bg-[#127e82] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {fechando === lojaId ? 'Fechando…' : `Fechar pedido · ${emReais(total)}`}
            {podeFechar && fechando !== lojaId && <Icon name="chevron" size={15} />}
          </button>
        </div>
      </Panel>
    )
  }

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader
        title="Carrinho"
        subtitle={carrinhos.length > 1 ? `${carrinhos.length} lojas` : undefined}
        onBack={() => navigate('/tutor/mercado')}
      />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {erro && <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>}

        {carregando && (
          <Panel className="px-4 py-8 text-center text-[0.78rem] text-slate-400">Abrindo seus carrinhos…</Panel>
        )}

        {!carregando && carrinhos.length === 0 && (
          <>
            <EmptyState
              icon="inbox"
              title="Seu carrinho está vazio"
              description="Ração, antipulgas, areia e o que mais a loja da sua cidade tiver."
            />
            <button
              type="button"
              onClick={() => navigate('/tutor/mercado')}
              className="w-full rounded-xl bg-primary px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:bg-[#127e82]"
            >
              Ver o mercado
            </button>
          </>
        )}

        {carrinhos.length > 1 && (
          <p className="px-1 text-[0.72rem] leading-relaxed text-slate-500">
            Você tem carrinho aberto em {carrinhos.length} lojas. Cada uma separa e entrega o que é dela, então
            cada carrinho vira um pedido e um pagamento.
          </p>
        )}

        {carrinhos.map(cartaoDoCarrinho)}
      </div>

      <TutorBottomNav />
    </div>
  )
}
