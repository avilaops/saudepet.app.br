import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, EmptyState, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import { emReais, minhaLoja, type Categoria, type Produto } from '../../services/mercado'

/** Margem padrão da casa, só quando nem o produto nem a prateleira decidiram. */
const MARGEM_PADRAO = 0.4

/**
 * O catálogo pelo lado do lojista.
 *
 * A diferença para a vitrine não é cosmética: aqui aparece o que NÃO está à
 * venda, e por quê. Produto sem preço, produto desativado, pendência do
 * levantamento — tudo à vista, porque é exatamente o que ele precisa resolver.
 *
 * Custo e margem existem neste formulário e não saem daqui: a seleção de campos
 * públicos do catálogo não inclui nenhum dos dois. O preço sugerido é calculado
 * na hora (custo × (1 + margem)) como conveniência — quem manda no preço
 * continua sendo a loja.
 */

const UNIDADES = [
  ['un', 'unidade'], ['saco', 'saco'], ['pacote', 'pacote'], ['kg', 'quilo'], ['g', 'grama'],
  ['sache', 'sachê'], ['lata', 'lata'], ['pote', 'pote'], ['caixa', 'caixa'], ['frasco', 'frasco'],
  ['l', 'litro'], ['ml', 'mililitro'], ['kit', 'kit'], ['conjunto', 'conjunto'], ['par', 'par'], ['rolo', 'rolo']
]

const ESPECIES = [
  ['', 'Não se aplica'], ['cao', 'Cães'], ['gato', 'Gatos'], ['passaro', 'Pássaros'],
  ['ambos', 'Cães e gatos'], ['outros', 'Outros animais']
]

const VAZIO = {
  nome: '',
  marca: '',
  variacao: '',
  tamanho: '',
  descricao: '',
  categoria_id: '',
  sku: '',
  ean: '',
  fornecedor: '',
  custo: '',
  margem_pct: '',
  preco: '',
  preco_promocional: '',
  unidade: 'un',
  peso_gramas: '',
  estoque: '0',
  controla_estoque: false,
  granel: false,
  sob_encomenda: false,
  prazo_reposicao_dias: '',
  exige_receita: false,
  especie_alvo: '',
  imagem_url: '',
  imagem_alt: '',
  imagem_tem_etiqueta: false,
  nota_interna: '',
  ativo: true
}

export default function LojaCatalogo() {
  const navigate = useNavigate()

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [resumo, setResumo] = useState<ApiPayload>({ total: 0, publicados: 0, sem_preco: 0, com_pendencia: 0 })
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [formularioAberto, setFormularioAberto] = useState(false)
  const [formulario, setFormulario] = useState<ApiPayload>({ ...VAZIO })

  // Fotos do produto em edição. Vivem fora do formulário porque sobem na hora,
  // por upload — não esperam o "salvar".
  const [fotos, setFotos] = useState<string[]>([])
  const [capa, setCapa] = useState<string | null>(null)
  const [subindoFoto, setSubindoFoto] = useState(false)
  const [erroDaFoto, setErroDaFoto] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const dados = await minhaLoja.produtos(buscaAplicada || undefined)
      setProdutos(dados.produtos)
      setResumo(dados.resumo)
      setErro('')
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { status?: number; data?: { error?: string } } }).response
      if (resposta?.status === 404) navigate('/mercado/loja')
      else setErro(resposta?.data?.error || 'Não foi possível carregar o catálogo.')
    } finally {
      setCarregando(false)
    }
  }, [buscaAplicada, navigate])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    minhaLoja.categorias().then(({ categorias: lista }) => setCategorias(lista)).catch(() => setCategorias([]))
  }, [])

  const mudar = (chave: string, valor: unknown) => setFormulario((atual: ApiPayload) => ({ ...atual, [chave]: valor }))

  const abrirNovo = () => {
    setEditandoId(null)
    setFormulario({ ...VAZIO })
    setFotos([])
    setCapa(null)
    setErroDaFoto('')
    setFormularioAberto(true)
  }

  const aplicarFotos = (produto: { imagem_url: string | null; imagens: string[] }) => {
    setFotos(produto.imagens)
    setCapa(produto.imagem_url)
    // O formulário guarda a capa também: salvar o produto depois do upload não
    // pode devolver a capa antiga.
    mudar('imagem_url', produto.imagem_url || '')
  }

  const subirFoto = async (arquivo: File | undefined) => {
    if (!arquivo || !editandoId) return
    setSubindoFoto(true)
    setErroDaFoto('')
    try {
      const { produto } = await minhaLoja.subirFoto(editandoId, arquivo)
      aplicarFotos(produto)
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErroDaFoto(resposta?.data?.error || 'Não foi possível subir esta foto.')
    } finally {
      setSubindoFoto(false)
    }
  }

  const removerFoto = async (url: string) => {
    if (!editandoId) return
    setErroDaFoto('')
    try {
      const { produto } = await minhaLoja.removerFoto(editandoId, url)
      aplicarFotos(produto)
    } catch {
      setErroDaFoto('Não foi possível remover esta foto.')
    }
  }

  const tornarCapa = async (url: string) => {
    if (!editandoId) return
    setErroDaFoto('')
    try {
      const { produto } = await minhaLoja.definirCapa(editandoId, url)
      aplicarFotos(produto)
    } catch {
      setErroDaFoto('Não foi possível trocar a capa.')
    }
  }

  const abrirEdicao = (produto: Produto) => {
    setEditandoId(produto.id)
    setFormulario({
      ...VAZIO,
      nome: produto.nome,
      marca: produto.marca || '',
      variacao: produto.variacao || '',
      tamanho: produto.tamanho || '',
      descricao: produto.descricao || '',
      categoria_id: produto.categoria_id || produto.categoria?.id || '',
      sku: produto.sku || '',
      ean: produto.ean || '',
      custo: produto.custo != null ? String(produto.custo) : '',
      margem_pct: produto.margem_pct != null ? String(produto.margem_pct) : '',
      preco: String(produto.preco ?? ''),
      preco_promocional: produto.preco_promocional != null ? String(produto.preco_promocional) : '',
      unidade: produto.unidade,
      peso_gramas: produto.peso_gramas != null ? String(produto.peso_gramas) : '',
      estoque: String(produto.estoque ?? 0),
      controla_estoque: Boolean(produto.controla_estoque),
      granel: Boolean(produto.granel),
      sob_encomenda: Boolean(produto.sob_encomenda),
      prazo_reposicao_dias: produto.prazo_reposicao_dias != null ? String(produto.prazo_reposicao_dias) : '',
      exige_receita: Boolean(produto.exige_receita),
      especie_alvo: produto.especie_alvo || '',
      imagem_url: produto.imagem_url || '',
      imagem_alt: produto.imagem_alt || '',
      imagem_tem_etiqueta: Boolean(produto.imagem_tem_etiqueta),
      nota_interna: produto.nota_interna || '',
      ativo: produto.ativo !== false
    })
    setFotos(produto.imagens || (produto.imagem_url ? [produto.imagem_url] : []))
    setCapa(produto.imagem_url || null)
    setErroDaFoto('')
    setFormularioAberto(true)
  }

  const salvar = async () => {
    setSalvando(true)
    setErro('')
    try {
      const dados = {
        ...formulario,
        categoria_id: formulario.categoria_id || null,
        custo: formulario.custo === '' ? null : Number(formulario.custo),
        margem_pct: formulario.margem_pct === '' ? null : Number(formulario.margem_pct),
        preco: Number(formulario.preco),
        preco_promocional: formulario.preco_promocional === '' ? null : Number(formulario.preco_promocional),
        peso_gramas: formulario.peso_gramas === '' ? null : Number(formulario.peso_gramas),
        estoque: Number(formulario.estoque) || 0,
        prazo_reposicao_dias:
          formulario.prazo_reposicao_dias === '' ? null : Number(formulario.prazo_reposicao_dias),
        especie_alvo: formulario.especie_alvo || null
      }

      if (editandoId) await minhaLoja.editarProduto(editandoId, dados)
      else await minhaLoja.criarProduto(dados)

      setFormularioAberto(false)
      setEditandoId(null)
      await carregar()
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível salvar o produto.')
    } finally {
      setSalvando(false)
    }
  }

  const remover = async (produto: Produto) => {
    setErro('')
    try {
      await minhaLoja.removerProduto(produto.id)
      await carregar()
    } catch {
      setErro('Não foi possível tirar este produto da vitrine.')
    }
  }

  const campo =
    'w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.82rem] text-ink outline-none transition focus:border-primary'
  const rotulo = 'block text-[0.72rem] font-semibold text-slate-500'

  // A margem que vale: a digitada no produto; senão a da prateleira escolhida;
  // senão a padrão da casa. É a decisão de 27/08/2026 — "margem por categoria
  // em vez de 40% fixo" — e a tela diz de onde o número veio.
  const categoriaEscolhida = categorias.find((categoria) => categoria.id === formulario.categoria_id)
  const margemDaCategoria =
    categoriaEscolhida?.margem_padrao_pct != null && categoriaEscolhida.margem_padrao_pct !== ''
      ? Number(categoriaEscolhida.margem_padrao_pct)
      : null
  const margemDigitada = formulario.margem_pct === '' ? null : Number(formulario.margem_pct)
  const margemAplicada = margemDigitada ?? margemDaCategoria ?? MARGEM_PADRAO
  const origemDaMargem =
    margemDigitada !== null ? 'a margem deste produto' : margemDaCategoria !== null ? `a margem padrão de ${categoriaEscolhida?.nome}` : 'a margem padrão da casa'
  const sugerido =
    Number(formulario.custo) > 0 && Number.isFinite(margemAplicada) && margemAplicada >= 0
      ? Number(formulario.custo) * (1 + margemAplicada)
      : null

  if (formularioAberto) {
    return (
      <div className="container-app min-h-screen bg-surface-page pb-10">
        <PageHeader
          title={editandoId ? 'Editar produto' : 'Novo produto'}
          onBack={() => { setFormularioAberto(false); setEditandoId(null) }}
        />

        <div className="space-y-3.5 px-5 py-5">
          {erro && <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>}

          <Panel className="space-y-3 px-4 py-4">
            <Eyebrow className="text-slate-400">O que é</Eyebrow>

            <label className="block space-y-1">
              <span className={rotulo}>Nome *</span>
              <input className={campo} value={formulario.nome} onChange={(e) => mudar('nome', e.target.value)}
                placeholder="Golden Formula Cães Adultos 15 kg" />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className={rotulo}>Marca</span>
                <input className={campo} value={formulario.marca} onChange={(e) => mudar('marca', e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className={rotulo}>Tamanho / peso</span>
                <input className={campo} value={formulario.tamanho} onChange={(e) => mudar('tamanho', e.target.value)}
                  placeholder="15 kg" />
              </label>
            </div>

            <label className="block space-y-1">
              <span className={rotulo}>Sabor / variação</span>
              <input className={campo} value={formulario.variacao} onChange={(e) => mudar('variacao', e.target.value)}
                placeholder="Frango e arroz — porte pequeno" />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className={rotulo}>Categoria</span>
                <select className={campo} value={formulario.categoria_id}
                  onChange={(e) => mudar('categoria_id', e.target.value)}>
                  <option value="">Sem categoria</option>
                  {categorias.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className={rotulo}>Para qual animal</span>
                <select className={campo} value={formulario.especie_alvo}
                  onChange={(e) => mudar('especie_alvo', e.target.value)}>
                  {ESPECIES.map(([valor, texto]) => (
                    <option key={valor} value={valor}>{texto}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className={rotulo}>Descrição</span>
              <textarea className={`${campo} resize-none`} rows={3} value={formulario.descricao}
                onChange={(e) => mudar('descricao', e.target.value)}
                placeholder="Público (filhote, adulto, castrado), porte, benefícios da embalagem" />
            </label>

          </Panel>

          <Panel className="space-y-3 px-4 py-4">
            <Eyebrow className="text-slate-400">Fotos</Eyebrow>
            <p className="text-[0.68rem] leading-relaxed text-slate-400">
              A primeira vira a capa. O catálogo do WhatsApp e o Google Shopping <strong>recusam</strong> produto
              sem foto — sem ela, o item fica de fora dos dois.
            </p>

            {!editandoId && (
              <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[0.72rem] leading-relaxed text-slate-500">
                Cadastre o produto primeiro; as fotos sobem em seguida, nesta mesma tela.
              </p>
            )}

            {editandoId && (
              <>
                {fotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {fotos.map((foto) => (
                      <div key={foto} className="space-y-1">
                        <span className="relative block overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50">
                          <img src={foto} alt="" className="aspect-square w-full object-cover" />
                          {foto === capa && (
                            <span className="absolute left-1.5 top-1.5 rounded-md bg-ink/80 px-1.5 py-0.5 text-[0.6rem] font-semibold text-white">
                              capa
                            </span>
                          )}
                        </span>
                        <div className="flex justify-between text-[0.66rem] font-semibold">
                          {foto !== capa ? (
                            <button type="button" onClick={() => tornarCapa(foto)} className="text-primary">
                              usar como capa
                            </button>
                          ) : <span />}
                          <button type="button" onClick={() => removerFoto(foto)} className="text-slate-400 hover:text-red-600">
                            remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {fotos.length < 6 && (
                  <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-[#fafbfb] px-3 py-3 text-[0.78rem] font-semibold text-primary ${subindoFoto ? 'opacity-60' : ''}`}>
                    <Icon name="camera" size={16} />
                    {subindoFoto ? 'Enviando…' : fotos.length === 0 ? 'Tirar ou escolher foto' : 'Adicionar outra foto'}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={subindoFoto}
                      onChange={(e) => { subirFoto(e.target.files?.[0]); e.target.value = '' }}
                    />
                  </label>
                )}

                {erroDaFoto && <p className="text-[0.72rem] text-red-700">{erroDaFoto}</p>}
              </>
            )}
          </Panel>

          <Panel className="space-y-3 px-4 py-4">
            <Eyebrow className="text-slate-400">Preço</Eyebrow>
            <p className="text-[0.68rem] leading-relaxed text-slate-400">
              Custo e margem são seus: não aparecem para o cliente em lugar nenhum.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className={rotulo}>Custo (R$)</span>
                <input className={campo} type="number" step="0.01" min="0" value={formulario.custo}
                  onChange={(e) => mudar('custo', e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className={rotulo}>Margem deste produto (0,4 = 40%)</span>
                <input className={campo} type="number" step="0.01" min="0" value={formulario.margem_pct}
                  onChange={(e) => mudar('margem_pct', e.target.value)}
                  placeholder={margemDaCategoria !== null ? `${margemDaCategoria} (da categoria)` : String(MARGEM_PADRAO)} />
              </label>
            </div>

            {sugerido !== null && (
              <button type="button" onClick={() => mudar('preco', sugerido.toFixed(2))}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-primary/5 px-3 py-2.5 text-left text-[0.76rem] text-ink ring-1 ring-primary/20">
                <span>
                  Preço sugerido
                  <span className="block text-[0.66rem] text-slate-500">
                    custo × (1 + {String(margemAplicada).replace('.', ',')}), usando {origemDaMargem}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-primary">{emReais(sugerido)}</span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className={rotulo}>Preço de venda (R$) *</span>
                <input className={campo} type="number" step="0.01" min="0" value={formulario.preco}
                  onChange={(e) => mudar('preco', e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className={rotulo}>Promoção (R$)</span>
                <input className={campo} type="number" step="0.01" min="0" value={formulario.preco_promocional}
                  onChange={(e) => mudar('preco_promocional', e.target.value)} />
              </label>
            </div>
          </Panel>

          <Panel className="space-y-3 px-4 py-4">
            <Eyebrow className="text-slate-400">Como você vende</Eyebrow>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className={rotulo}>Unidade de venda</span>
                <select className={campo} value={formulario.unidade} onChange={(e) => mudar('unidade', e.target.value)}>
                  {UNIDADES.map(([valor, texto]) => (
                    <option key={valor} value={valor}>{texto}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className={rotulo}>Peso bruto (g)</span>
                <input className={campo} type="number" min="0" value={formulario.peso_gramas}
                  onChange={(e) => mudar('peso_gramas', e.target.value)} placeholder="15000" />
              </label>
            </div>

            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={formulario.controla_estoque}
                onChange={(e) => mudar('controla_estoque', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary" />
              <span className="text-[0.78rem] leading-relaxed text-ink">
                Eu controlo a quantidade deste item
                <span className="mt-0.5 block text-[0.68rem] text-slate-400">
                  Marcado, cada pedido baixa o estoque e o último item só é vendido uma vez. Desmarcado, o
                  produto vende sempre e você confere na separação — que é como a maioria das lojas trabalha.
                </span>
              </span>
            </label>

            {formulario.controla_estoque && (
              <label className="block space-y-1">
                <span className={rotulo}>Quantidade em estoque</span>
                <input className={campo} type="number" min="0" value={formulario.estoque}
                  onChange={(e) => mudar('estoque', e.target.value)} />
              </label>
            )}

            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={formulario.granel} onChange={(e) => mudar('granel', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary" />
              <span className="text-[0.78rem] text-ink">Vendido a granel, por quilo</span>
            </label>

            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={formulario.sob_encomenda}
                onChange={(e) => mudar('sob_encomenda', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary" />
              <span className="text-[0.78rem] text-ink">Não tenho na loja — busco sob encomenda</span>
            </label>

            {formulario.sob_encomenda && (
              <label className="block space-y-1">
                <span className={rotulo}>Prazo para conseguir (dias) *</span>
                <input className={campo} type="number" min="1" value={formulario.prazo_reposicao_dias}
                  onChange={(e) => mudar('prazo_reposicao_dias', e.target.value)} />
                <span className="block text-[0.68rem] text-slate-400">
                  O cliente lê este prazo antes de pagar.
                </span>
              </label>
            )}

            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={formulario.exige_receita}
                onChange={(e) => mudar('exige_receita', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary" />
              <span className="text-[0.78rem] leading-relaxed text-ink">
                Exige receita veterinária
                <span className="mt-0.5 block text-[0.68rem] text-slate-400">
                  O pedido chega marcado para você conferir a prescrição antes de separar.
                </span>
              </span>
            </label>
          </Panel>

          <Panel className="space-y-3 px-4 py-4">
            <Eyebrow className="text-slate-400">Controle interno</Eyebrow>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className={rotulo}>SKU</span>
                <input className={campo} value={formulario.sku} onChange={(e) => mudar('sku', e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className={rotulo}>Código de barras</span>
                <input className={campo} inputMode="numeric" value={formulario.ean}
                  onChange={(e) => mudar('ean', e.target.value)} />
              </label>
            </div>
            <label className="block space-y-1">
              <span className={rotulo}>Descrição da foto (alt)</span>
              <input className={campo} value={formulario.imagem_alt} maxLength={160}
                onChange={(e) => mudar('imagem_alt', e.target.value)}
                placeholder="Ex.: Ração Golden Formula para cães adultos, saco de 15 kg" />
              <span className="text-xs text-muted-foreground">Vai no <code>alt</code> da capa: leitor de tela e Google leem isso. Vazio usa o nome do produto.</span>
            </label>
            <label className="block space-y-1">
              <span className={rotulo}>Anotação interna</span>
              <input className={campo} value={formulario.nota_interna}
                onChange={(e) => mudar('nota_interna', e.target.value)}
                placeholder="Conferir gramatura na embalagem" />
            </label>

            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={formulario.imagem_tem_etiqueta} onChange={(e) => mudar('imagem_tem_etiqueta', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary" />
              <span className="text-[0.78rem] text-ink">A etiqueta de preço aparece na foto <span className="text-slate-400">(lembrete para trocar por foto de catálogo)</span></span>
            </label>

            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={formulario.ativo} onChange={(e) => mudar('ativo', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary" />
              <span className="text-[0.78rem] text-ink">Mostrar na vitrine</span>
            </label>
          </Panel>

          <button type="button" onClick={salvar} disabled={salvando}
            className="w-full rounded-xl bg-primary px-4 py-3.5 text-[0.85rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-60">
            {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Cadastrar produto'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container-app min-h-screen bg-surface-page pb-10">
      <PageHeader
        title="Catálogo"
        subtitle={`${resumo.publicados} na vitrine · ${resumo.total} cadastrados`}
        onBack={() => navigate('/mercado/loja/painel')}
        action={
          <button type="button" onClick={abrirNovo}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-[0.74rem] font-semibold text-white/85 transition hover:bg-white/10">
            <Icon name="plus" size={14} />
            Novo
          </button>
        }
      />

      <div className="space-y-3 px-5 py-5">
        {erro && <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>}

        {resumo.sem_preco > 0 && (
          <Panel className="border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[0.76rem] leading-relaxed text-amber-800">
              <strong>{resumo.sem_preco}</strong> produto(s) estão fora da vitrine esperando cadastro — em
              geral falta o preço. Eles ficam guardados aqui até você completar.
            </p>
          </Panel>
        )}

        <form
          onSubmit={(evento) => { evento.preventDefault(); setBuscaAplicada(busca.trim()) }}
          className="flex gap-2"
        >
          <input className={campo} type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, marca, SKU ou código de barras" />
          <button type="submit"
            className="shrink-0 rounded-xl bg-ink px-4 text-[0.78rem] font-semibold text-white transition hover:bg-[#0e262b]">
            Buscar
          </button>
        </form>

        {carregando && (
          <Panel className="px-4 py-8 text-center text-[0.78rem] text-slate-400">Carregando…</Panel>
        )}

        {!carregando && produtos.length === 0 && (
          <EmptyState
            icon="inbox"
            title="Catálogo vazio"
            description="Cadastre o primeiro produto — sua loja precisa de pelo menos um para ir à análise."
          />
        )}

        {produtos.map((produto) => (
          <Panel key={produto.id} className="overflow-hidden">
            <div className="flex gap-3 px-4 py-3.5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 text-slate-300">
                {produto.imagem_url
                  ? <img src={produto.imagem_url} alt="" className="h-full w-full object-cover" />
                  : <Icon name="inbox" size={20} />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {produto.marca && <Eyebrow className="text-slate-400">{produto.marca}</Eyebrow>}
                    <h3 className="truncate text-[0.84rem] font-semibold text-ink">{produto.nome}</h3>
                    {produto.variacao && (
                      <p className="truncate text-[0.7rem] text-slate-400">{produto.variacao}</p>
                    )}
                  </div>
                  {!produto.ativo
                    ? <Badge tone="slate">fora da vitrine</Badge>
                    : produto.disponivel
                      ? <Badge tone="teal">à venda</Badge>
                      : <Badge tone="red">esgotado</Badge>}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.72rem]">
                  <span className="font-semibold tabular-nums text-ink">{emReais(produto.preco_vigente ?? produto.preco)}</span>
                  {produto.custo != null && (
                    <span className="text-slate-400">custo {emReais(produto.custo)}</span>
                  )}
                  {produto.exige_receita && <Badge tone="amber">receita</Badge>}
                  {produto.sob_encomenda && <Badge tone="amber">encomenda</Badge>}
                  {produto.granel && <Badge tone="slate">granel</Badge>}
                  {produto.imagem_status === 'revisar' && <Badge tone="amber">foto a revisar</Badge>}
                  {produto.imagem_tem_etiqueta && <Badge tone="amber">etiqueta na foto</Badge>}
                </div>

                {produto.nota_interna && (
                  <p className="mt-1 line-clamp-2 text-[0.68rem] leading-relaxed text-amber-700">
                    {produto.nota_interna}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 border-t border-slate-100 px-4 py-2">
              <button type="button" onClick={() => abrirEdicao(produto)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.74rem] font-semibold text-primary transition hover:bg-primary/5">
                <Icon name="pencil" size={13} />
                Editar
              </button>
              {produto.ativo && (
                <button type="button" onClick={() => remover(produto)}
                  className="ml-auto rounded-lg px-2 py-1.5 text-[0.74rem] font-semibold text-slate-400 transition hover:text-red-600">
                  Tirar da vitrine
                </button>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
