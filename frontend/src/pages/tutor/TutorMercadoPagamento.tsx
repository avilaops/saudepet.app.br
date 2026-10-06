import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSocket } from '../../contexts/SocketContext'
import api from '../../services/api'
import { tokenizarCartao, tokenizarCartaoSalvo, formatarNumeroCartao } from '../../lib/mercadopago'
import { Badge, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import { emReais, escreverUnidade, mercado, type Pagamento, type Pedido } from '../../services/mercado'

/**
 * Pagar um pedido do mercado.
 *
 * O valor NÃO é escolhido aqui e não sobe no corpo da requisição: ele é
 * `pedido.total`, calculado no fechamento a partir do catálogo. A tela só
 * escolhe COMO pagar.
 *
 * Cartão nunca toca o nosso servidor. Número e código de segurança vão do
 * navegador direto para o Mercado Pago pelo SDK dele, e o que chega à nossa API
 * é um token de uso único. É a mesma cadeia do checkout do atendimento, e pelo
 * mesmo motivo: dado de cartão que passa por um servidor pode parar num log.
 */

type CartaoSalvo = {
  id: string
  card_id: string
  bandeira: string | null
  ultimos_digitos: string
  principal: boolean
  apelido: string | null
}

export default function TutorMercadoPagamento() {
  const { id: pedidoId } = useParams()
  const navigate = useNavigate()
  const { socket } = useSocket()

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [pagamento, setPagamento] = useState<Pagamento | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [pago, setPago] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const [metodo, setMetodo] = useState<'PIX' | 'CREDIT_CARD'>('PIX')
  const [gateway, setGateway] = useState<{ public_key: string | null; cartao_disponivel: boolean }>({
    public_key: null,
    cartao_disponivel: false
  })

  const [cartoes, setCartoes] = useState<CartaoSalvo[]>([])
  const [cartaoEscolhido, setCartaoEscolhido] = useState<string | null>(null)
  const [cvvDoSalvo, setCvvDoSalvo] = useState('')
  const [novoCartao, setNovoCartao] = useState<ApiPayload>({ nome: '', numero: '', mes: '', ano: '', cvv: '' })

  const jaCarregou = useRef(false)

  const carregar = useCallback(async () => {
    if (!pedidoId) return
    try {
      const [{ pedido: dados }, situacao] = await Promise.all([
        mercado.pedido(pedidoId),
        mercado.statusDoPagamento(pedidoId)
      ])
      setPedido(dados)
      setPagamento(situacao.payment)
      if (situacao.payment?.status === 'PAID' || situacao.pedido_status !== 'aguardando_pagamento') {
        setPago(situacao.pedido_status !== 'aguardando_pagamento' && situacao.pedido_status !== 'pagamento_falhou')
      }
      if (situacao.payment?.method === 'CREDIT_CARD') setMetodo('CREDIT_CARD')
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível abrir este pedido.')
    } finally {
      setCarregando(false)
    }
  }, [pedidoId])

  useEffect(() => {
    if (jaCarregou.current) return
    jaCarregou.current = true
    carregar()
  }, [carregar])

  useEffect(() => {
    // Sem chave pública não há como tokenizar no navegador. A tela esconde o
    // cartão em vez de oferecer um caminho que falharia no fim.
    api
      .get('/v1/payments/chave-publica')
      .then(({ data }) => setGateway(data || { public_key: null, cartao_disponivel: false }))
      .catch(() => setGateway({ public_key: null, cartao_disponivel: false }))

    api
      .get('/v1/payments/cartoes')
      .then(({ data }) => {
        const lista: CartaoSalvo[] = data.cartoes || []
        setCartoes(lista)
        const principal = lista.find((item) => item.principal) || lista[0]
        if (principal) setCartaoEscolhido(principal.id)
      })
      .catch(() => setCartoes([]))
  }, [])

  useEffect(() => {
    if (!socket || !pedidoId) return
    const aoPagar = (evento: { pedidoId?: string }) => {
      if (evento?.pedidoId === pedidoId) {
        setPago(true)
        carregar()
      }
    }
    socket.on('mercado:pedido_pago', aoPagar)
    return () => { socket.off('mercado:pedido_pago', aoPagar) }
  }, [socket, pedidoId, carregar])

  // Rede de segurança do Pix: o socket pode cair, e ficar olhando um QR code já
  // pago é a pior espera possível.
  useEffect(() => {
    if (pago || !pedidoId || !pagamento?.pix_copy_paste) return
    const relogio = setInterval(() => {
      mercado
        .statusDoPagamento(pedidoId)
        .then((situacao) => {
          if (situacao.payment?.status === 'PAID' || situacao.pedido_status === 'pago') {
            setPago(true)
            clearInterval(relogio)
          }
        })
        .catch(() => {})
    }, 8000)
    return () => clearInterval(relogio)
  }, [pago, pedidoId, pagamento?.pix_copy_paste])

  const pagar = async () => {
    if (!pedidoId) return
    setProcessando(true)
    setErro('')

    try {
      let cardToken: string | undefined

      if (metodo === 'CREDIT_CARD') {
        if (!gateway.public_key) {
          throw new Error('Pagamento por cartão indisponível no momento.')
        }
        const salvo = cartoes.find((item) => item.id === cartaoEscolhido)
        if (salvo) {
          // Cartão guardado não é digitado de novo, mas o gateway exige token
          // novo a cada cobrança: ele sai do identificador mais o CVV de agora.
          cardToken = await tokenizarCartaoSalvo({
            chavePublica: gateway.public_key,
            cardId: salvo.card_id,
            cvv: cvvDoSalvo
          })
        } else {
          cardToken = await tokenizarCartao({
            chavePublica: gateway.public_key,
            numero: novoCartao.numero,
            nome: novoCartao.nome,
            mes: novoCartao.mes,
            ano: novoCartao.ano,
            cvv: novoCartao.cvv
          })
        }
      }

      const { payment } = await mercado.pagar(pedidoId, { method: metodo, cardToken })
      setPagamento(payment)

      // O cartão sai da memória assim que vira token.
      if (metodo === 'CREDIT_CARD') setNovoCartao({ nome: '', numero: '', mes: '', ano: '', cvv: '' })

      if (payment.status === 'PAID') setPago(true)
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } }; message?: string })
      setErro(resposta.response?.data?.error || resposta.message || 'Não foi possível gerar a cobrança.')
    } finally {
      setProcessando(false)
    }
  }

  const copiarPix = async () => {
    if (!pagamento?.pix_copy_paste) return
    try {
      await navigator.clipboard.writeText(pagamento.pix_copy_paste)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErro('Não foi possível copiar. Selecione o código manualmente.')
    }
  }

  const campo =
    'w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.82rem] text-ink outline-none transition focus:border-primary'

  if (carregando) {
    return (
      <div className="container-app bg-surface-page min-h-screen">
        <PageHeader title="Pagamento" onBack={() => navigate('/tutor/mercado/pedidos')} />
        <Panel className="mx-5 mt-5 px-4 py-8 text-center text-[0.78rem] text-slate-400">Abrindo o pedido…</Panel>
      </div>
    )
  }

  if (!pedido) {
    return (
      <div className="container-app bg-surface-page min-h-screen">
        <PageHeader title="Pagamento" onBack={() => navigate('/tutor/mercado/pedidos')} />
        <Panel className="mx-5 mt-5 border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700">
          {erro || 'Pedido não encontrado.'}
        </Panel>
      </div>
    )
  }

  if (pago) {
    return (
      <div className="container-app min-h-screen bg-surface-page pb-10">
        <PageHeader title="Pagamento" onBack={() => navigate('/tutor/mercado/pedidos')} />
        <div className="space-y-4 px-5 pb-6 pt-5">
          <Panel className="px-5 py-7 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon name="check" size={26} strokeWidth={2.2} />
            </span>
            <h2 className="mt-3 text-[1.05rem] font-semibold tracking-tight text-ink">Pagamento confirmado</h2>
            <p className="mx-auto mt-1.5 max-w-xs text-[0.78rem] leading-relaxed text-slate-500">
              A <strong className="font-semibold text-ink">{pedido.loja.nome_fantasia}</strong> já foi avisada e vai
              separar seu pedido em cerca de {pedido.loja.prazo_preparo_min} minutos.
            </p>
            <p className="mt-3 text-[0.8rem] font-semibold tabular-nums text-ink">Pedido {pedido.codigo}</p>
          </Panel>

          <button
            type="button"
            onClick={() => navigate(`/tutor/mercado/pedidos/${pedido.id}`)}
            className="w-full rounded-xl bg-primary px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:bg-[#127e82]"
          >
            Acompanhar pedido
          </button>
          <button
            type="button"
            onClick={() => navigate('/tutor/mercado')}
            className="w-full rounded-xl bg-white px-4 py-3 text-[0.82rem] font-semibold text-slate-600 ring-1 ring-slate-200/80 transition hover:text-ink"
          >
            Voltar ao mercado
          </button>
        </div>
      </div>
    )
  }

  const expiraEm = pedido.expira_em ? new Date(pedido.expira_em) : null

  return (
    <div className="container-app min-h-screen bg-surface-page pb-10">
      <PageHeader
        title="Pagamento"
        subtitle={`Pedido ${pedido.codigo}`}
        onBack={() => navigate('/tutor/mercado/carrinho')}
      />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {/* O que está sendo pago, antes de como pagar. */}
        <Panel className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="truncate text-[0.9rem] font-semibold text-ink">{pedido.loja.nome_fantasia}</h2>
            <p className="mt-0.5 text-[0.72rem] text-slate-400">
              {pedido.entrega_tipo === 'retirada'
                ? `Retirada em ${pedido.loja.endereco}`
                : pedido.entrega_tipo === 'loja'
                  ? `Entrega pela loja em ${pedido.entrega_endereco} · frete ${Number(pedido.frete) > 0 ? emReais(pedido.frete) : 'grátis'}`
                  : `Entrega combinada com a loja${pedido.entrega_endereco ? ` — ${pedido.entrega_endereco}` : ''}`}
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {pedido.itens.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[0.8rem] text-ink">{item.nome}</span>
                  <span className="text-[0.7rem] text-slate-400">
                    {escreverUnidade(item.quantidade, item.unidade)}
                    {item.variacao ? ` · ${item.variacao}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[0.8rem] font-semibold tabular-nums text-ink">
                  {emReais(item.subtotal)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-[0.82rem] text-slate-500">Total</span>
            <span className="text-[1.15rem] font-semibold tabular-nums text-ink">{emReais(pedido.total)}</span>
          </div>
          {pedido.exige_receita && (
            <p className="border-t border-slate-100 bg-amber-50 px-4 py-2.5 text-[0.72rem] leading-relaxed text-amber-800">
              Há item sob prescrição veterinária neste pedido. A loja confere a receita antes de separar.
            </p>
          )}
        </Panel>

        {expiraEm && !pagamento && (
          <p className="px-1 text-[0.72rem] text-slate-500">
            Reservamos estes itens até{' '}
            <strong className="font-semibold text-ink">
              {expiraEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </strong>
            . Depois disso eles voltam para a prateleira da loja.
          </p>
        )}

        {erro && <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>}

        {/* Pix gerado: o QR e o copia-e-cola tomam a tela. */}
        {pagamento?.pix_copy_paste ? (
          <Panel className="px-4 py-4">
            <div className="flex items-center gap-2">
              <Icon name="spark" size={16} className="text-primary" />
              <h3 className="text-[0.88rem] font-semibold text-ink">Pix gerado</h3>
              <Badge tone="amber">aguardando</Badge>
            </div>
            <p className="mt-1.5 text-[0.74rem] leading-relaxed text-slate-500">
              Abra o aplicativo do seu banco, escolha Pix copia-e-cola e cole o código abaixo. A confirmação
              aparece aqui sozinha.
            </p>

            <div className="mt-3 break-all rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-3 font-mono text-[0.66rem] leading-relaxed text-slate-600">
              {pagamento.pix_copy_paste}
            </div>

            <button
              type="button"
              onClick={copiarPix}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:bg-[#0e262b]"
            >
              <Icon name={copiado ? 'check' : 'clipboard'} size={15} />
              {copiado ? 'Código copiado' : 'Copiar código Pix'}
            </button>
          </Panel>
        ) : (
          <>
            <Panel className="px-4 py-4">
              <h3 className="text-[0.88rem] font-semibold text-ink">Como pagar</h3>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMetodo('PIX')}
                  className={`flex-1 rounded-xl px-3 py-3 text-[0.78rem] font-semibold transition ${
                    metodo === 'PIX' ? 'bg-ink text-white' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200/80'
                  }`}
                >
                  Pix
                </button>
                {gateway.cartao_disponivel && (
                  <button
                    type="button"
                    onClick={() => setMetodo('CREDIT_CARD')}
                    className={`flex-1 rounded-xl px-3 py-3 text-[0.78rem] font-semibold transition ${
                      metodo === 'CREDIT_CARD'
                        ? 'bg-ink text-white'
                        : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200/80'
                    }`}
                  >
                    Cartão
                  </button>
                )}
              </div>

              {metodo === 'CREDIT_CARD' && (
                <div className="mt-3 space-y-2.5">
                  {cartoes.length > 0 && (
                    <div className="space-y-1.5">
                      {cartoes.map((cartao) => (
                        <button
                          key={cartao.id}
                          type="button"
                          onClick={() => setCartaoEscolhido(cartao.id)}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[0.78rem] transition ${
                            cartaoEscolhido === cartao.id
                              ? 'bg-primary/5 ring-1 ring-primary/40'
                              : 'bg-slate-50 ring-1 ring-slate-200/80'
                          }`}
                        >
                          <Icon name="card" size={16} className="text-slate-400" />
                          <span className="flex-1 truncate text-ink">
                            {cartao.bandeira || 'Cartão'} ····{cartao.ultimos_digitos}
                          </span>
                          {cartao.principal && <Badge tone="teal">principal</Badge>}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCartaoEscolhido(null)}
                        className={`w-full rounded-xl px-3 py-2.5 text-left text-[0.78rem] transition ${
                          cartaoEscolhido === null
                            ? 'bg-primary/5 text-ink ring-1 ring-primary/40'
                            : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200/80'
                        }`}
                      >
                        Usar outro cartão
                      </button>
                    </div>
                  )}

                  {cartaoEscolhido ? (
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={cvvDoSalvo}
                      onChange={(evento) => setCvvDoSalvo(evento.target.value.replace(/\D/g, ''))}
                      placeholder="Código de segurança"
                      className={campo}
                    />
                  ) : (
                    <>
                      <input
                        type="text"
                        value={novoCartao.nome}
                        onChange={(evento) => setNovoCartao((atual: ApiPayload) => ({ ...atual, nome: evento.target.value }))}
                        placeholder="Nome como está no cartão"
                        className={campo}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatarNumeroCartao(novoCartao.numero)}
                        onChange={(evento) =>
                          setNovoCartao((atual: ApiPayload) => ({ ...atual, numero: evento.target.value.replace(/\D/g, '') }))
                        }
                        placeholder="Número do cartão"
                        className={campo}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          value={novoCartao.mes}
                          onChange={(evento) =>
                            setNovoCartao((atual: ApiPayload) => ({ ...atual, mes: evento.target.value.replace(/\D/g, '') }))
                          }
                          placeholder="MM"
                          className={campo}
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          value={novoCartao.ano}
                          onChange={(evento) =>
                            setNovoCartao((atual: ApiPayload) => ({ ...atual, ano: evento.target.value.replace(/\D/g, '') }))
                          }
                          placeholder="AAAA"
                          className={campo}
                        />
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          value={novoCartao.cvv}
                          onChange={(evento) =>
                            setNovoCartao((atual: ApiPayload) => ({ ...atual, cvv: evento.target.value.replace(/\D/g, '') }))
                          }
                          placeholder="CVV"
                          className={campo}
                        />
                      </div>
                    </>
                  )}

                  <p className="flex items-start gap-1.5 text-[0.68rem] leading-relaxed text-slate-400">
                    <Icon name="shield" size={13} className="mt-px shrink-0 text-primary" />
                    Número e código de segurança vão do seu aparelho direto para o Mercado Pago. Eles não passam
                    pelos servidores do Saúde Pet.
                  </p>
                </div>
              )}
            </Panel>

            <button
              type="button"
              onClick={pagar}
              disabled={processando}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-[0.85rem] font-semibold text-white transition hover:bg-[#127e82] disabled:bg-slate-200 disabled:text-slate-400"
            >
              {processando
                ? 'Processando…'
                : metodo === 'PIX'
                  ? `Gerar Pix de ${emReais(pedido.total)}`
                  : `Pagar ${emReais(pedido.total)}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
