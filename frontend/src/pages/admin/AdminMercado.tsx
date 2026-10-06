import { useCallback, useEffect, useState } from 'react'
import { Aviso, botaoPerigo, botaoPrimario, botaoSecundario, Campo, entrada, Painel, Vazio } from '../../components/admin/AdminUI'
import { adminMercado, emReais, type Categoria, type Loja } from '../../services/mercado'

/**
 * O Saúde Pet Mercado pela torre de controle.
 *
 * Duas responsabilidades, e as duas pesam. A primeira é decidir QUEM vende aqui
 * dentro — parte do catálogo é medicamento de uso animal, então a fila de
 * aprovação abre primeiro e mostra o número de pendentes sem que ninguém
 * precise procurar.
 *
 * A segunda é enxergar o dinheiro com as três linhas separadas: o que os
 * tutores pagaram, o que fica com a plataforma e o que pertence às lojas.
 * Mostrar só o faturado dá a impressão errada de receita — a maior parte dele é
 * de outra pessoa.
 */

type Financeiro = {
  mes: { pedidos: number; faturado: number; comissao: number; a_repassar: number }
  acumulado: { pedidos: number; faturado: number; comissao: number }
  lojas_ativas: number
  por_loja: Array<{
    loja_id: string
    nome: string
    pedidos: number
    faturado: number
    a_repassar: number
    comissao: number
  }>
}

type LojaAdmin = Loja & {
  status: string
  /** Criada por seed para testar o Mercado: nunca vai para a vitrine. */
  demonstracao?: boolean
  cnpj?: string | null
  razao_social?: string | null
  email?: string
  motivo_recusa?: string | null
  enviada_em?: string | null
  comissao_pct?: number | string | null
  responsavel?: { id: string; nome: string; email: string }
  _count?: { produtos: number; pedidos: number }
}

const FILTROS = [
  ['pendente', 'Aguardando análise'],
  ['aprovada', 'No ar'],
  ['rascunho', 'Rascunho'],
  ['recusada', 'Recusadas'],
  ['suspensa', 'Suspensas'],
  ['', 'Todas']
]

const TOM_DO_STATUS: Record<string, string> = {
  aprovada: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pendente: 'bg-amber-50 text-amber-700 ring-amber-200',
  rascunho: 'bg-slate-100 text-slate-600 ring-slate-200',
  recusada: 'bg-red-50 text-red-700 ring-red-200',
  suspensa: 'bg-red-50 text-red-700 ring-red-200'
}

export default function AdminMercado() {
  const [aba, setAba] = useState<'lojas' | 'financeiro' | 'categorias'>('lojas')

  // Prateleiras e a margem padrão de cada uma — o "por categoria em vez de 40%
  // fixo" mora aqui, como configuração.
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [novaCategoria, setNovaCategoria] = useState({ nome: '', margem: '' })
  const [margens, setMargens] = useState<Record<string, string>>({})
  const [filtro, setFiltro] = useState('pendente')

  const [lojas, setLojas] = useState<LojaAdmin[]>([])
  const [pendentes, setPendentes] = useState(0)
  const [financeiro, setFinanceiro] = useState<Financeiro | null>(null)

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  const [decidindo, setDecidindo] = useState<{ id: string; decisao: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [comissao, setComissao] = useState('')

  const carregarLojas = useCallback(async () => {
    setCarregando(true)
    try {
      const dados = await adminMercado.lojas(filtro || undefined)
      setLojas(dados.lojas as LojaAdmin[])
      setPendentes(dados.pendentes)
      setErro('')
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível carregar as lojas.')
    } finally {
      setCarregando(false)
    }
  }, [filtro])

  useEffect(() => {
    if (aba === 'lojas') carregarLojas()
  }, [aba, carregarLojas])

  const carregarCategorias = useCallback(async () => {
    setCarregando(true)
    try {
      const dados = await adminMercado.categorias()
      setCategorias(dados.categorias)
      setMargens(
        Object.fromEntries(
          dados.categorias.map((categoria) => [
            categoria.id,
            categoria.margem_padrao_pct != null && categoria.margem_padrao_pct !== ''
              ? String(Math.round(Number(categoria.margem_padrao_pct) * 10000) / 100)
              : ''
          ])
        )
      )
      setErro('')
    } catch {
      setErro('Não foi possível carregar as categorias.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (aba === 'categorias') carregarCategorias()
  }, [aba, carregarCategorias])

  const salvarMargem = async (categoria: Categoria) => {
    const texto = (margens[categoria.id] ?? '').trim()
    const pct = texto === '' ? null : Number(texto.replace(',', '.'))
    if (pct !== null && (!Number.isFinite(pct) || pct < 0)) {
      setErro('A margem precisa ser um percentual igual ou maior que zero.')
      return
    }
    setOcupado(categoria.id)
    setErro('')
    try {
      await adminMercado.editarCategoria(categoria.id, { margem_padrao_pct: pct === null ? null : pct / 100 })
      await carregarCategorias()
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível salvar a margem.')
    } finally {
      setOcupado(null)
    }
  }

  const alternarCategoria = async (categoria: Categoria) => {
    setOcupado(categoria.id)
    try {
      await adminMercado.editarCategoria(categoria.id, { ativo: !(categoria.ativo !== false) })
      await carregarCategorias()
    } catch {
      setErro('Não foi possível alterar a categoria.')
    } finally {
      setOcupado(null)
    }
  }

  const criarCategoria = async () => {
    if (novaCategoria.nome.trim().length < 2) {
      setErro('Informe o nome da categoria.')
      return
    }
    const pct = novaCategoria.margem.trim() === '' ? null : Number(novaCategoria.margem.replace(',', '.'))
    setOcupado('nova')
    setErro('')
    try {
      await adminMercado.criarCategoria({
        nome: novaCategoria.nome.trim(),
        margem_padrao_pct: pct === null || !Number.isFinite(pct) ? null : pct / 100
      })
      setNovaCategoria({ nome: '', margem: '' })
      await carregarCategorias()
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível criar a categoria.')
    } finally {
      setOcupado(null)
    }
  }

  useEffect(() => {
    if (aba !== 'financeiro') return
    setCarregando(true)
    adminMercado
      .financeiro()
      .then((dados) => setFinanceiro(dados))
      .catch(() => setErro('Não foi possível carregar o financeiro do mercado.'))
      .finally(() => setCarregando(false))
  }, [aba])

  const decidir = async () => {
    if (!decidindo) return
    if (decidindo.decisao !== 'aprovada' && motivo.trim().length < 3) {
      setErro('Escreva o motivo — a loja precisa saber o que corrigir.')
      return
    }

    setOcupado(decidindo.id)
    setErro('')
    try {
      await adminMercado.decidir(decidindo.id, {
        decisao: decidindo.decisao,
        motivo: motivo.trim() || undefined,
        comissao_pct: comissao === '' ? undefined : Number(comissao)
      })
      setDecidindo(null)
      setMotivo('')
      setComissao('')
      await carregarLojas()
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível registrar a decisão.')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAba('lojas')}
          className={aba === 'lojas' ? botaoPrimario : botaoSecundario}
        >
          Lojas
          {pendentes > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-black text-amber-950">
              {pendentes}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setAba('financeiro')}
          className={aba === 'financeiro' ? botaoPrimario : botaoSecundario}
        >
          Financeiro
        </button>
        <button
          type="button"
          onClick={() => setAba('categorias')}
          className={aba === 'categorias' ? botaoPrimario : botaoSecundario}
        >
          Categorias e margens
        </button>
      </div>

      {erro && <Aviso>{erro}</Aviso>}

      {aba === 'lojas' && (
        <>
          <Painel titulo="Credenciamento de lojas">
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              Aprovar uma loja é decidir quem pode vender medicamento de uso animal dentro do aplicativo.
              Conferir CNPJ, endereço e catálogo antes de liberar não é burocracia — é a mesma régua que o
              credenciamento de veterinário usa. Toda decisão fica na auditoria com estado anterior e posterior.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {FILTROS.map(([valor, texto]) => (
                <button
                  key={valor || 'todas'}
                  type="button"
                  onClick={() => setFiltro(valor)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                    filtro === valor
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>
          </Painel>

          {carregando && <Vazio>Carregando…</Vazio>}

          {!carregando && lojas.length === 0 && (
            <Vazio>Nenhuma loja neste filtro.</Vazio>
          )}

          <div className="space-y-4">
            {lojas.map((loja) => (
              <Painel key={loja.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black tracking-tight text-slate-900">{loja.nome_fantasia}</h3>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${
                          TOM_DO_STATUS[loja.status] || 'bg-slate-100 text-slate-600 ring-slate-200'
                        }`}
                      >
                        {loja.status}
                      </span>
                      {loja.demonstracao && (
                        <span
                          className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200"
                          title="Loja de demonstração: não aparece na vitrine e não pode ser aprovada"
                        >
                          demonstração
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {loja.razao_social || 'Sem razão social'} · CNPJ {loja.cnpj || 'não informado'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {loja.endereco}
                      {loja.bairro ? `, ${loja.bairro}` : ''} — {loja.cidade}/{loja.estado}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Responsável: {loja.responsavel?.nome} &lt;{loja.responsavel?.email}&gt; · {loja.telefone}
                    </p>
                  </div>

                  <div className="text-right text-xs text-slate-500">
                    <p className="font-bold tabular-nums text-slate-900">
                      {loja._count?.produtos ?? 0} produtos
                    </p>
                    <p className="tabular-nums">{loja._count?.pedidos ?? 0} pedidos</p>
                    <p className="mt-1 tabular-nums">
                      comissão {loja.comissao_pct != null ? `${Number(loja.comissao_pct)}%` : 'padrão do tenant'}
                    </p>
                    {loja.enviada_em && (
                      <p className="mt-1">
                        enviada em {new Date(loja.enviada_em).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>

                {loja.motivo_recusa && (
                  <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700">
                    {loja.motivo_recusa}
                  </p>
                )}

                {decidindo?.id === loja.id ? (
                  <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold text-slate-700">
                      {decidindo.decisao === 'aprovada' && 'Aprovar e colocar na vitrine'}
                      {decidindo.decisao === 'recusada' && 'Recusar e pedir correções'}
                      {decidindo.decisao === 'suspensa' && 'Suspender e tirar da vitrine'}
                    </p>

                    {decidindo.decisao !== 'aprovada' && (
                      <Campo rotulo="Motivo (a loja lê)">
                        <textarea
                          className={entrada}
                          rows={2}
                          value={motivo}
                          onChange={(evento) => setMotivo(evento.target.value)}
                          placeholder="O que precisa ser corrigido"
                        />
                      </Campo>
                    )}

                    {decidindo.decisao === 'aprovada' && (
                      <Campo rotulo="Comissão desta loja (%) — vazio usa a do tenant">
                        <input
                          className={entrada}
                          type="number"
                          min="0"
                          max="50"
                          step="0.5"
                          value={comissao}
                          onChange={(evento) => setComissao(evento.target.value)}
                          placeholder="15"
                        />
                      </Campo>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setDecidindo(null); setMotivo(''); setComissao('') }}
                        className={botaoSecundario}
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        onClick={decidir}
                        disabled={ocupado === loja.id}
                        className={decidindo.decisao === 'aprovada' ? botaoPrimario : botaoPerigo}
                      >
                        {ocupado === loja.id ? 'Registrando…' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {loja.status !== 'aprovada' && !loja.demonstracao && (
                      <button
                        type="button"
                        onClick={() => setDecidindo({ id: loja.id, decisao: 'aprovada' })}
                        className={botaoPrimario}
                      >
                        Aprovar
                      </button>
                    )}
                    {loja.status === 'pendente' && (
                      <button
                        type="button"
                        onClick={() => setDecidindo({ id: loja.id, decisao: 'recusada' })}
                        className={botaoPerigo}
                      >
                        Recusar
                      </button>
                    )}
                    {loja.status === 'aprovada' && (
                      <button
                        type="button"
                        onClick={() => setDecidindo({ id: loja.id, decisao: 'suspensa' })}
                        className={botaoPerigo}
                      >
                        Suspender
                      </button>
                    )}
                  </div>
                )}
              </Painel>
            ))}
          </div>
        </>
      )}

      {aba === 'categorias' && (
        <>
          <Painel titulo="Prateleiras e margem padrão">
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              A categoria é curada pela plataforma — se cada loja inventasse a própria, a busca do tutor viraria
              um amontoado de sinônimos. A <strong>margem padrão</strong> é a sugestão de preço que o produto da
              prateleira herda quando o lojista não digita a dele: ração premium suporta 18–30%; acessório,
              cosmético e brinquedo, bem mais. Sem margem na categoria, vale o padrão da casa (40%).
            </p>

            <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
              <Campo rotulo="Nova categoria">
                <input
                  className={entrada}
                  value={novaCategoria.nome}
                  onChange={(evento) => setNovaCategoria((atual) => ({ ...atual, nome: evento.target.value }))}
                  placeholder="Ração, Higiene e banho, Brinquedos…"
                />
              </Campo>
              <Campo rotulo="Margem padrão (%)">
                <input
                  className={entrada}
                  inputMode="decimal"
                  value={novaCategoria.margem}
                  onChange={(evento) => setNovaCategoria((atual) => ({ ...atual, margem: evento.target.value }))}
                  placeholder="25"
                />
              </Campo>
              <div className="flex items-end">
                <button type="button" onClick={criarCategoria} disabled={ocupado === 'nova'} className={botaoPrimario}>
                  {ocupado === 'nova' ? 'Criando…' : 'Criar'}
                </button>
              </div>
            </div>
          </Painel>

          {carregando && <Vazio>Carregando…</Vazio>}

          {!carregando && categorias.length === 0 && <Vazio>Nenhuma categoria ainda.</Vazio>}

          {categorias.length > 0 && (
            <Painel>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="pb-2 font-bold">Categoria</th>
                      <th className="pb-2 text-right font-bold">Produtos</th>
                      <th className="pb-2 text-right font-bold">Margem padrão</th>
                      <th className="pb-2 text-right font-bold">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {categorias.map((categoria) => (
                      <tr key={categoria.id} className={categoria.ativo === false ? 'opacity-60' : ''}>
                        <td className="py-2.5 font-bold text-slate-800">
                          {categoria.nome}
                          <span className="ml-2 font-normal text-slate-400">/{categoria.slug}</span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-slate-600">{categoria.total_produtos ?? 0}</td>
                        <td className="py-2.5 text-right">
                          <span className="inline-flex items-center gap-1.5">
                            <input
                              className={`${entrada} w-20 text-right`}
                              inputMode="decimal"
                              value={margens[categoria.id] ?? ''}
                              onChange={(evento) => setMargens((atual) => ({ ...atual, [categoria.id]: evento.target.value }))}
                              placeholder="40"
                            />
                            <span className="text-slate-400">%</span>
                            <button
                              type="button"
                              onClick={() => salvarMargem(categoria)}
                              disabled={ocupado === categoria.id}
                              className={botaoSecundario}
                            >
                              Salvar
                            </button>
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => alternarCategoria(categoria)}
                            disabled={ocupado === categoria.id}
                            className={categoria.ativo === false ? botaoPrimario : botaoPerigo}
                          >
                            {categoria.ativo === false ? 'Reativar' : 'Desativar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Painel>
          )}
        </>
      )}

      {aba === 'financeiro' && (
        <>
          {carregando && <Vazio>Carregando…</Vazio>}

          {financeiro && (
            <>
              <Painel titulo="Este mês">
                <div className="grid gap-4 sm:grid-cols-4">
                  {[
                    ['Pedidos pagos', String(financeiro.mes.pedidos), 'text-slate-900'],
                    ['Faturado', emReais(financeiro.mes.faturado), 'text-slate-900'],
                    ['Comissão da plataforma', emReais(financeiro.mes.comissao), 'text-teal-600'],
                    ['A repassar às lojas', emReais(financeiro.mes.a_repassar), 'text-amber-600']
                  ].map(([rotulo, valor, cor]) => (
                    <div key={rotulo}>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{rotulo}</p>
                      <p className={`mt-1 text-2xl font-black tabular-nums ${cor}`}>{valor}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-relaxed text-slate-500">
                  <strong className="text-slate-700">Faturado</strong> é o que os tutores pagaram — a maior parte
                  pertence às lojas. A receita da plataforma é a coluna de comissão. O repasse sai por Pix
                  enquanto as lojas não tiverem subconta no gateway, pela mesma razão registrada em 19/08 para o
                  veterinário: split real exigiria onboarding de marketplace no Mercado Pago.
                </p>
              </Painel>

              <Painel titulo={`Por loja · ${financeiro.lojas_ativas} aprovadas`}>
                {financeiro.por_loja.length === 0 ? (
                  <Vazio>Nenhum pedido pago neste mês.</Vazio>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400">
                          <th className="pb-2 font-bold">Loja</th>
                          <th className="pb-2 text-right font-bold">Pedidos</th>
                          <th className="pb-2 text-right font-bold">Faturado</th>
                          <th className="pb-2 text-right font-bold">A repassar</th>
                          <th className="pb-2 text-right font-bold">Comissão</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {financeiro.por_loja.map((linha) => (
                          <tr key={linha.loja_id}>
                            <td className="py-2.5 font-bold text-slate-800">{linha.nome}</td>
                            <td className="py-2.5 text-right tabular-nums text-slate-600">{linha.pedidos}</td>
                            <td className="py-2.5 text-right tabular-nums text-slate-600">
                              {emReais(linha.faturado)}
                            </td>
                            <td className="py-2.5 text-right font-bold tabular-nums text-amber-600">
                              {emReais(linha.a_repassar)}
                            </td>
                            <td className="py-2.5 text-right font-bold tabular-nums text-teal-600">
                              {emReais(linha.comissao)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Painel>

              <Painel titulo="Acumulado">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pedidos pagos</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
                      {financeiro.acumulado.pedidos}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Faturado</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
                      {emReais(financeiro.acumulado.faturado)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Comissão</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-teal-600">
                      {emReais(financeiro.acumulado.comissao)}
                    </p>
                  </div>
                </div>
              </Painel>
            </>
          )}
        </>
      )}
    </div>
  )
}
