import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { emReais, enderecos, mercado, type EnderecoSalvo, type Produto } from '../../services/mercado'
import { Badge, Icon } from '../../components/ui/AppKit'

/**
 * A folha "Assinar" do produto.
 *
 * Quatro decisões, nessa ordem, porque é a ordem em que a pessoa pensa: para
 * qual pet (dá a frequência sugerida), quantos sacos por vez, a cada quantos
 * dias, e como recebe. O primeiro pedido nasce na hora, com o desconto de
 * assinante, e a tela vai direto para o pagamento — assinar sem comprar nada
 * hoje é um caso raro e tem o botão secundário.
 *
 * Nenhum preço é calculado aqui além do que a tela mostra como prévia: o
 * servidor refaz a conta no fechamento.
 */

type Pet = { id: string; nome: string; porte: string | null; tipo: string | null }

const campo =
  'w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary'

export default function AssinarProduto({ produto, aoFechar }: { produto: Produto; aoFechar: () => void }) {
  const navigate = useNavigate()
  const loja = produto.loja
  const descontoPct = Number(loja?.assinatura_desconto_pct || 0)

  const [pets, setPets] = useState<Pet[]>([])
  const [petId, setPetId] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [frequencia, setFrequencia] = useState(30)
  const [sugestao, setSugestao] = useState<{ dias: number; consumo_diario_gramas: number | null } | null>(null)
  const [entrega, setEntrega] = useState<'retirada' | 'combinar' | 'loja'>(
    loja?.aceita_retirada ? 'retirada' : loja?.aceita_entrega ? 'loja' : 'combinar'
  )
  const [salvos, setSalvos] = useState<EnderecoSalvo[]>([])
  const [enderecoId, setEnderecoId] = useState('')
  const [enderecoTexto, setEnderecoTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.get('/pets').then((r) => setPets(r.data?.pets || [])).catch(() => setPets([]))
    enderecos
      .listar()
      .then(({ enderecos: lista }) => {
        setSalvos(lista)
        const principal = lista.find((item) => item.principal) || lista[0]
        if (principal) setEnderecoId(principal.id)
      })
      .catch(() => setSalvos([]))
  }, [])

  // A sugestão muda com o pet e com a quantidade; o campo de frequência segue
  // a sugestão até a pessoa mexer nele.
  useEffect(() => {
    let cancelado = false
    mercado
      .sugerirFrequencia(produto.id, { pet_id: petId || undefined, quantidade })
      .then(({ sugestao: nova }) => {
        if (cancelado) return
        setSugestao(nova)
        setFrequencia(nova.dias)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [produto.id, petId, quantidade])

  const precoUnitario = Number(produto.preco_vigente)
  const subtotal = precoUnitario * quantidade
  const comDesconto = subtotal * (1 - descontoPct / 100)

  const assinar = async (gerarAgora: boolean) => {
    setErro('')
    const escolhido = salvos.find((item) => item.id === enderecoId) || null
    let endereco: Record<string, unknown> | undefined
    if (entrega === 'loja') {
      if (!escolhido) {
        setErro('Escolha um endereço salvo para a loja entregar. Você cadastra endereços no carrinho ou no perfil.')
        return
      }
      endereco = {
        endereco: escolhido.endereco,
        complemento: escolhido.complemento || undefined,
        cidade: escolhido.cidade || undefined,
        latitude: escolhido.latitude,
        longitude: escolhido.longitude
      }
    } else if (entrega === 'combinar') {
      const texto = (escolhido ? `${escolhido.endereco}${escolhido.complemento ? `, ${escolhido.complemento}` : ''}` : enderecoTexto).trim()
      if (texto.length < 5) {
        setErro('Informe o endereço para a loja combinar a entrega.')
        return
      }
      endereco = { endereco: texto, cidade: escolhido?.cidade || undefined }
    }

    setEnviando(true)
    try {
      const { pedido } = await mercado.assinar({
        itens: [{ produto_id: produto.id, quantidade }],
        frequencia_dias: frequencia,
        pet_id: petId || undefined,
        entrega_tipo: entrega,
        endereco,
        gerar_primeiro_ciclo: gerarAgora
      })
      if (pedido) navigate(`/tutor/mercado/pedidos/${pedido.id}/pagamento`, { replace: true })
      else navigate('/tutor/mercado/assinaturas', { replace: true, state: { aviso: 'Assinatura criada. O primeiro pedido vem no próximo ciclo.' } })
    } catch (requestError) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível criar a assinatura.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px]" onClick={aoFechar}>
      <div
        role="dialog"
        aria-label="Assinar entrega programada"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-5 pb-6 pt-4 shadow-2xl"
        onClick={(evento) => evento.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[1rem] font-semibold text-ink">Assinar {produto.nome}</h2>
            <p className="mt-0.5 text-[0.72rem] text-slate-500">
              A cada ciclo nasce um pedido com o Pix pronto. Você paga quando quiser e cancela quando quiser.
            </p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-lg p-1 text-slate-400 hover:bg-slate-50">
            <Icon name="close" size={16} />
          </button>
        </div>

        {descontoPct > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <Badge tone="teal">{descontoPct}% de desconto de assinante</Badge>
            {loja?.assinatura_frete_gratis && loja.aceita_entrega && <Badge tone="teal">frete grátis na entrega da loja</Badge>}
          </div>
        )}

        {/* Pet */}
        {pets.length > 0 && (
          <label className="mt-4 block space-y-1">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">Para qual pet</span>
            <select className={campo} value={petId} onChange={(evento) => setPetId(evento.target.value)}>
              <option value="">Não vincular</option>
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.nome}
                  {pet.porte ? ` · porte ${pet.porte}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Quantidade e frequência */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">Por ciclo</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setQuantidade((q) => Math.max(1, q - 1))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80" aria-label="Diminuir">
                <Icon name="close" size={13} className="rotate-45" />
              </button>
              <span className="min-w-8 text-center text-[0.9rem] font-semibold tabular-nums">{quantidade}</span>
              <button type="button" onClick={() => setQuantidade((q) => Math.min(10, q + 1))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80" aria-label="Aumentar">
                <Icon name="plus" size={13} />
              </button>
            </div>
          </label>
          <label className="block space-y-1">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">A cada (dias)</span>
            <input
              type="number"
              min={7}
              max={90}
              className={campo}
              value={frequencia}
              onChange={(evento) => setFrequencia(Math.max(7, Math.min(90, Number(evento.target.value) || 7)))}
            />
          </label>
        </div>
        {sugestao && (
          <p className="mt-1.5 text-[0.7rem] text-slate-500">
            {sugestao.consumo_diario_gramas
              ? `Sugestão: ${sugestao.dias} dias — ${sugestao.consumo_diario_gramas} g por dia para o porte do pet e ${quantidade} × ${
                  produto.peso_gramas ? `${(produto.peso_gramas / 1000).toFixed(1)} kg` : 'este saco'
                }.`
              : 'Sem o porte do pet (ou o peso do saco) a sugestão é 30 dias. Ajuste como preferir.'}
          </p>
        )}

        {/* Entrega */}
        <div className="mt-4 space-y-1.5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">Como recebe</span>
          {(
            [
              ['retirada', 'Retiro na loja', loja?.aceita_retirada],
              ['loja', loja?.assinatura_frete_gratis ? 'A loja entrega em casa (frete grátis)' : 'A loja entrega em casa', loja?.aceita_entrega],
              ['combinar', 'Combino a entrega com a loja', loja?.aceita_combinar]
            ] as const
          )
            .filter(([, , aceita]) => aceita)
            .map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setEntrega(valor)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[0.78rem] transition ${
                  entrega === valor ? 'bg-primary/5 ring-1 ring-primary/40 text-ink' : 'bg-slate-50 ring-1 ring-slate-200/80 text-slate-600'
                }`}
              >
                <Icon name={entrega === valor ? 'check' : 'pin'} size={14} className={entrega === valor ? 'text-primary' : 'text-slate-300'} />
                {rotulo}
              </button>
            ))}
        </div>

        {entrega !== 'retirada' && (
          <div className="mt-3 space-y-1.5">
            {salvos.length > 0 ? (
              <select className={campo} value={enderecoId} onChange={(evento) => setEnderecoId(evento.target.value)}>
                {entrega === 'combinar' && <option value="">Digitar outro endereço</option>}
                {salvos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.rotulo} — {item.endereco}
                  </option>
                ))}
              </select>
            ) : entrega === 'loja' ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-[0.72rem] text-amber-800">
                Para a loja entregar, salve um endereço com localização no carrinho ou no perfil primeiro.
              </p>
            ) : null}
            {entrega === 'combinar' && !enderecoId && (
              <input className={campo} placeholder="Rua, número, bairro" value={enderecoTexto} onChange={(evento) => setEnderecoTexto(evento.target.value)} />
            )}
          </div>
        )}

        {erro && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[0.74rem] text-red-700">{erro}</p>}

        {/* Prévia e ação */}
        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-[0.78rem]">
          <div className="flex justify-between text-slate-500">
            <span>{quantidade} × {emReais(precoUnitario)}</span>
            <span className={descontoPct > 0 ? 'line-through' : 'font-semibold text-ink'}>{emReais(subtotal)}</span>
          </div>
          {descontoPct > 0 && (
            <div className="mt-1 flex justify-between font-semibold text-ink">
              <span>Por ciclo, como assinante</span>
              <span>{emReais(comDesconto)}</span>
            </div>
          )}
          <p className="mt-1 text-[0.68rem] text-slate-400">Frete, quando houver, é calculado no pedido de cada ciclo.</p>
        </div>

        <button
          type="button"
          onClick={() => assinar(true)}
          disabled={enviando}
          className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-60"
        >
          {enviando ? 'Criando…' : 'Assinar e pagar o primeiro pedido'}
        </button>
        <button
          type="button"
          onClick={() => assinar(false)}
          disabled={enviando}
          className="mt-2 w-full rounded-xl px-4 py-2.5 text-[0.76rem] font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-60"
        >
          Já tenho ração — só programar o próximo em {frequencia} dias
        </button>
      </div>
    </div>
  )
}
