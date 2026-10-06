import api from './api'

/**
 * O Saúde Pet Mercado visto do navegador.
 *
 * Um arquivo só com as chamadas para as telas não repetirem caminho de rota —
 * foi assim que `/v1/pets/meus-pets` (que nunca existiu) ficou escrito numa
 * tela e deixou um botão permanentemente desabilitado sem ninguém notar.
 *
 * Nenhuma função daqui manda preço. O valor é sempre decidido no servidor, a
 * partir do catálogo; o que sobe é o que a pessoa escolheu.
 */

export type Categoria = {
  id: string
  nome: string
  slug: string
  icone: string | null
  ordem: number
  ativo?: boolean
  /** Margem que o produto da prateleira herda quando não tem a própria. 0.25 = 25%. */
  margem_padrao_pct?: number | string | null
  total_produtos?: number
}

export type Loja = {
  id: string
  nome_fantasia: string
  slug: string
  descricao: string | null
  logo_url: string | null
  telefone: string
  whatsapp: string | null
  endereco: string
  numero?: string | null
  complemento: string | null
  bairro: string | null
  cidade: string
  estado: string
  aceita_retirada: boolean
  aceita_combinar: boolean
  prazo_preparo_min: number
  pedido_minimo: number | string
  /** Entrega pela própria loja, dentro do raio dela. */
  aceita_entrega?: boolean
  aceita_transportadora?: boolean
  entrega_raio_km?: number | string | null
  frete_base?: number | string | null
  frete_por_km?: number | string | null
  frete_gratis_acima?: number | string | null
  entrega_prazo_horas?: number | null
  /** Assinatura de ração: a loja decide se vende e quanto abre mão. */
  aceita_assinatura?: boolean
  assinatura_desconto_pct?: number | string | null
  assinatura_frete_gratis?: boolean
  latitude?: number | null
  longitude?: number | null
  total_produtos?: number
  status?: string
}

export type Produto = {
  id: string
  nome: string
  slug: string
  descricao: string | null
  marca: string | null
  variacao: string | null
  tamanho: string | null
  preco: number | string
  preco_promocional: number | string | null
  preco_vigente: number
  unidade: string
  peso_gramas: number | null
  estoque: number
  controla_estoque: boolean
  granel: boolean
  sob_encomenda: boolean
  prazo_reposicao_dias: number | null
  exige_receita: boolean
  especie_alvo: string | null
  imagem_url: string | null
  /** `alt` da capa. Nulo → a tela usa o nome completo. */
  imagem_alt?: string | null
  /** Só o lojista vê: 'aprovada' | 'revisar' | 'rejeitada'; nulo sem capa. */
  imagem_status?: string | null
  /** Etiqueta de preço do balcão aparece na capa (fila de troca). */
  imagem_tem_etiqueta?: boolean
  /** Todas as fotos, em ordem. A capa é `imagem_url`. */
  imagens?: string[] | null
  categoria: { id: string; nome: string; slug: string } | null
  loja?: Pick<Loja, 'id' | 'nome_fantasia' | 'slug' | 'cidade' | 'prazo_preparo_min'> &
    Partial<Pick<Loja, 'aceita_retirada' | 'aceita_combinar' | 'aceita_entrega' | 'entrega_raio_km' | 'frete_gratis_acima' | 'entrega_prazo_horas' | 'aceita_assinatura' | 'assinatura_desconto_pct' | 'assinatura_frete_gratis'>>
  /** Só no painel do lojista. */
  ativo?: boolean
  disponivel?: boolean
  sku?: string | null
  ean?: string | null
  custo?: number | string | null
  margem_pct?: number | string | null
  nota_interna?: string | null
  categoria_id?: string | null
}

export type ItemDoCarrinho = {
  id: string
  produto_id: string
  quantidade: number
  quantidade_disponivel: number
  nome: string
  marca: string | null
  variacao: string | null
  tamanho: string | null
  imagem_url: string | null
  unidade: string
  granel: boolean
  preco: number
  preco_cheio: number
  em_promocao: boolean
  exige_receita: boolean
  sob_encomenda: boolean
  prazo_reposicao_dias: number | null
  peso_gramas: number | null
  disponivel: boolean
  subtotal: number
}

export type Carrinho = {
  id: string
  loja: Loja & { status: string }
  itens: ItemDoCarrinho[]
  subtotal: number
  total_itens: number
  exige_receita: boolean
  prazo_encomenda_dias: number | null
  impedimentos: string[]
  alertas: string[]
}

export type ItemDoPedido = {
  id: string
  nome: string
  variacao: string | null
  unidade: string
  preco_unitario: number | string
  quantidade: number
  subtotal: number | string
  exige_receita: boolean
  prazo_encomenda_dias: number | null
}

export type CotacaoDeEntrega = {
  disponivel: boolean
  motivo: string | null
  distancia_km: number | null
  raio_km: number | null
  frete: number
  frete_gratis: boolean
  falta_para_frete_gratis: number | null
  prazo_horas: number | null
}

export type OpcaoTransportadora = {
  servico: 'pac' | 'sedex' | 'jadlog-package' | 'jadlog-dotcom' | 'loggi'
  transportadora: string
  nome: string
  valor: number
  prazo: string
}

export type EnderecoSalvo = {
  id: string
  rotulo: string
  endereco: string
  complemento: string | null
  cidade: string | null
  latitude: number
  longitude: number
  principal: boolean
}

export type Pedido = {
  id: string
  codigo: string
  status: string
  entrega_tipo: string
  entrega_endereco: string | null
  entrega_cep?: string | null
  entrega_numero?: string | null
  entrega_complemento: string | null
  entrega_cidade: string | null
  entrega_distancia_km?: number | string | null
  frete_servico?: string | null
  frete_transportadora?: string | null
  frete_prazo?: string | null
  rastreio_codigo?: string | null
  etiqueta_url?: string | null
  declaracao_url?: string | null
  etiqueta_emitida_em?: string | null
  subtotal: number | string
  desconto: number | string
  frete: number | string
  total: number | string
  comissao_pct: number | string
  comissao_valor: number | string
  repasse_loja: number | string
  payment_id: string | null
  /** Pedido gerado por um ciclo de assinatura. */
  assinatura_id?: string | null
  exige_receita: boolean
  observacao: string | null
  cancelado_motivo: string | null
  expira_em: string | null
  pago_em: string | null
  separado_em: string | null
  pronto_em: string | null
  concluido_em: string | null
  cancelado_em: string | null
  criado_em: string
  loja: Loja
  itens: ItemDoPedido[]
  tutor?: { id: string; nome: string; telefone: string | null; email?: string }
}

export type ItemDaAssinatura = {
  id: string
  produto_id: string
  quantidade: number
  produto: {
    id: string
    nome: string
    variacao: string | null
    tamanho: string | null
    unidade: string
    peso_gramas: number | null
    preco: number | string
    preco_promocional: number | string | null
    imagem_url: string | null
    ativo: boolean
  }
}

export type Assinatura = {
  id: string
  status: 'ativa' | 'pausada' | 'cancelada'
  frequencia_dias: number
  proximo_ciclo_em: string
  entrega_tipo: string
  entrega_endereco: string | null
  entrega_cidade: string | null
  desconto_pct: number | string
  frete_gratis: boolean
  ciclos_gerados: number
  ciclos_pagos: number
  ciclos_perdidos_seguidos: number
  ultimo_pedido_id: string | null
  ultimo_erro: string | null
  observacao: string | null
  pausada_em: string | null
  cancelada_em: string | null
  cancelado_motivo: string | null
  criado_em: string
  loja: Pick<Loja, 'id' | 'nome_fantasia' | 'slug' | 'cidade' | 'telefone' | 'whatsapp' | 'aceita_assinatura'>
  pet: { id: string; nome: string; porte: string | null; tipo: string | null; especie: string | null } | null
  itens: ItemDaAssinatura[]
  /** Só na lista da loja. */
  tutor?: { id: string; nome: string; telefone: string | null }
}

export type EventoDoPedido = {
  id: string
  status: string
  status_anterior: string | null
  origem: string | null
  motivo: string | null
  criado_em: string
}

export type Pagamento = {
  id: string
  status: string
  method: string
  amount: number | string
  pix_copy_paste: string | null
  pix_qr_code_ref: string | null
  expires_at: string | null
  paid_at: string | null
}

const BASE = '/v1/mercado'

// ── Vitrine ───────────────────────────────────────────────────────────────────

export const mercado = {
  resumo: () => api.get(`${BASE}/resumo`).then((r) => r.data),

  categorias: (): Promise<{ categorias: Categoria[] }> =>
    api.get(`${BASE}/categorias`).then((r) => r.data),

  lojas: (params?: { cidade?: string; busca?: string }): Promise<{ lojas: Loja[] }> =>
    api.get(`${BASE}/lojas`, { params }).then((r) => r.data),

  loja: (slug: string): Promise<{ loja: Loja }> =>
    api.get(`${BASE}/lojas/${slug}`).then((r) => r.data),

  produtos: (params?: {
    busca?: string
    categoria?: string
    loja?: string
    especie?: string
    pagina?: number
    limite?: number
  }): Promise<{ produtos: Produto[]; total: number; pagina: number; paginas: number }> =>
    api.get(`${BASE}/produtos`, { params }).then((r) => r.data),

  produto: (id: string): Promise<{ produto: Produto }> =>
    api.get(`${BASE}/produtos/${id}`).then((r) => r.data),

  // ── Carrinho ────────────────────────────────────────────────────────────────

  carrinhos: (): Promise<{ carrinhos: Carrinho[]; total_itens: number }> =>
    api.get(`${BASE}/carrinhos`).then((r) => r.data),

  carrinhoDaLoja: (lojaId: string): Promise<{ carrinho: Carrinho | null }> =>
    api.get(`${BASE}/carrinhos/${lojaId}`).then((r) => r.data),

  adicionar: (produtoId: string, quantidade = 1): Promise<{ carrinho: Carrinho }> =>
    api.post(`${BASE}/carrinhos/itens`, { produto_id: produtoId, quantidade }).then((r) => r.data),

  mudarQuantidade: (produtoId: string, quantidade: number): Promise<{ carrinho: Carrinho | null }> =>
    api.put(`${BASE}/carrinhos/itens/${produtoId}`, { quantidade }).then((r) => r.data),

  esvaziar: (lojaId: string) => api.delete(`${BASE}/carrinhos/${lojaId}`).then((r) => r.data),

  // ── Pedido ──────────────────────────────────────────────────────────────────

  /** Quanto custa a loja levar até este ponto — antes de a pessoa escolher. */
  cotarEntrega: (
    lojaId: string,
    ponto: { latitude: number; longitude: number }
  ): Promise<{ cotacao: CotacaoDeEntrega; subtotal: number }> =>
    api.post(`${BASE}/carrinhos/${lojaId}/entrega`, ponto).then((r) => r.data),

  cotarTransportadoras: (
    lojaId: string,
    cep: string
  ): Promise<{ opcoes: OpcaoTransportadora[]; pacote: { pesoGramas: number; alturaCm: number; larguraCm: number; comprimentoCm: number } }> =>
    api.post(`${BASE}/carrinhos/${lojaId}/transportadoras`, { cep }).then((r) => r.data),

  fechar: (dados: {
    loja_id: string
    entrega_tipo: 'retirada' | 'combinar' | 'loja' | 'transportadora'
    endereco?: { endereco: string; cep?: string; numero?: string; complemento?: string; cidade?: string; latitude?: number; longitude?: number }
    frete_servico?: string
    observacao?: string
  }): Promise<{ pedido: Pedido }> => api.post(`${BASE}/pedidos`, dados).then((r) => r.data),

  pedidos: (): Promise<{ pedidos: Pedido[] }> => api.get(`${BASE}/pedidos`).then((r) => r.data),

  pedido: (id: string): Promise<{ pedido: Pedido; eventos: EventoDoPedido[] }> =>
    api.get(`${BASE}/pedidos/${id}`).then((r) => r.data),

  cancelar: (id: string, motivo: string) =>
    api.post(`${BASE}/pedidos/${id}/cancelar`, { motivo }).then((r) => r.data),

  pagar: (id: string, dados: { method: string; cardToken?: string; parcelas?: number }): Promise<{ payment: Pagamento }> =>
    api.post(`${BASE}/pedidos/${id}/pagamento`, dados).then((r) => r.data),

  statusDoPagamento: (id: string): Promise<{ pedido_status: string; payment: Pagamento | null }> =>
    api.get(`${BASE}/pedidos/${id}/pagamento`).then((r) => r.data),

  // ── Assinatura de ração ─────────────────────────────────────────────────────

  sugerirFrequencia: (
    produtoId: string,
    params?: { pet_id?: string; quantidade?: number }
  ): Promise<{ sugestao: { dias: number; consumo_diario_gramas: number | null } }> =>
    api.get(`${BASE}/assinaturas/sugestao`, { params: { produto_id: produtoId, ...params } }).then((r) => r.data),

  assinar: (dados: {
    itens: Array<{ produto_id: string; quantidade: number }>
    frequencia_dias?: number
    pet_id?: string
    entrega_tipo: 'retirada' | 'combinar' | 'loja'
    endereco?: Record<string, unknown>
    observacao?: string
    gerar_primeiro_ciclo?: boolean
  }): Promise<{ assinatura: Assinatura; pedido: Pedido | null }> =>
    api.post(`${BASE}/assinaturas`, dados).then((r) => r.data),

  assinaturas: (): Promise<{ assinaturas: Assinatura[] }> => api.get(`${BASE}/assinaturas`).then((r) => r.data),

  assinatura: (id: string): Promise<{ assinatura: Assinatura; pedidos: Pick<Pedido, 'id' | 'codigo' | 'status' | 'total' | 'criado_em' | 'pago_em' | 'expira_em'>[] }> =>
    api.get(`${BASE}/assinaturas/${id}`).then((r) => r.data),

  alterarAssinatura: (
    id: string,
    dados: { frequencia_dias?: number; itens?: Array<{ produto_id: string; quantidade: number }> }
  ): Promise<{ assinatura: Assinatura }> => api.put(`${BASE}/assinaturas/${id}`, dados).then((r) => r.data),

  pausarAssinatura: (id: string): Promise<{ assinatura: Assinatura }> =>
    api.post(`${BASE}/assinaturas/${id}/pausar`).then((r) => r.data),

  retomarAssinatura: (id: string): Promise<{ assinatura: Assinatura }> =>
    api.post(`${BASE}/assinaturas/${id}/retomar`).then((r) => r.data),

  cancelarAssinatura: (id: string, motivo?: string): Promise<{ assinatura: Assinatura }> =>
    api.post(`${BASE}/assinaturas/${id}/cancelar`, { motivo }).then((r) => r.data),

  pedirAgoraDaAssinatura: (id: string): Promise<{ assinatura: Assinatura; pedido: Pedido | null }> =>
    api.post(`${BASE}/assinaturas/${id}/pedir-agora`).then((r) => r.data)
}

// ── Endereços do tutor e geocodificação (as rotas já existiam para o atendimento) ──

export const enderecos = {
  listar: (): Promise<{ enderecos: EnderecoSalvo[] }> => api.get('/v1/enderecos').then((r) => r.data),
  criar: (dados: {
    rotulo?: string
    endereco: string
    complemento?: string
    cidade?: string
    latitude: number
    longitude: number
  }): Promise<{ endereco: EnderecoSalvo }> => api.post('/v1/enderecos', dados).then((r) => r.data),
  /** Endereço digitado → candidatos com coordenada (Nominatim, pelo backend). */
  localizar: (
    termo: string
  ): Promise<{ locais: Array<{ endereco: string | null; cidade: string | null; latitude: number; longitude: number }> }> =>
    api.get('/v1/geo/buscar', { params: { q: termo } }).then((r) => r.data)
}

// ── Painel do lojista ─────────────────────────────────────────────────────────

const LOJA = '/v1/mercado/loja'

export const minhaLoja = {
  ver: (): Promise<{ loja: Loja | null }> => api.get(LOJA).then((r) => r.data),
  criar: (dados: Record<string, unknown>) => api.post(LOJA, dados).then((r) => r.data),
  atualizar: (dados: Record<string, unknown>) => api.put(LOJA, dados).then((r) => r.data),
  enviarParaAnalise: () => api.post(`${LOJA}/enviar`).then((r) => r.data),
  painel: () => api.get(`${LOJA}/painel`).then((r) => r.data),

  /** Quem assinou nesta loja e quando vem o próximo pedido. */
  assinaturas: (): Promise<{ assinaturas: Assinatura[] }> => api.get(`${LOJA}/assinaturas`).then((r) => r.data),

  categorias: (): Promise<{ categorias: Categoria[] }> =>
    api.get(`${LOJA}/categorias`).then((r) => r.data),

  produtos: (
    busca?: string
  ): Promise<{
    produtos: Produto[]
    resumo: { total: number; publicados: number; sem_preco: number; com_pendencia: number }
  }> => api.get(`${LOJA}/produtos`, { params: busca ? { busca } : undefined }).then((r) => r.data),

  criarProduto: (dados: Record<string, unknown>) => api.post(`${LOJA}/produtos`, dados).then((r) => r.data),
  editarProduto: (id: string, dados: Record<string, unknown>) =>
    api.put(`${LOJA}/produtos/${id}`, dados).then((r) => r.data),
  removerProduto: (id: string) => api.delete(`${LOJA}/produtos/${id}`).then((r) => r.data),

  precoSugerido: (
    custo: number,
    margem: number | null,
    categoriaId?: string | null
  ): Promise<{ preco_sugerido: number | null; margem_aplicada: number; origem: 'produto' | 'categoria' | 'padrao'; categoria: string | null }> =>
    api
      .get(`${LOJA}/preco-sugerido`, {
        params: { custo, margem: margem ?? undefined, categoria_id: categoriaId || undefined }
      })
      .then((r) => r.data),

  // ── Fotos ───────────────────────────────────────────────────────────────────
  subirFoto: (produtoId: string, arquivo: File): Promise<{ produto: { id: string; imagem_url: string | null; imagens: string[] }; maximo: number }> => {
    const corpo = new FormData()
    corpo.append('foto', arquivo)
    return api
      .post(`${LOJA}/produtos/${produtoId}/fotos`, corpo, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data)
  },
  removerFoto: (produtoId: string, url: string): Promise<{ produto: { id: string; imagem_url: string | null; imagens: string[] } }> =>
    api.delete(`${LOJA}/produtos/${produtoId}/fotos`, { data: { url } }).then((r) => r.data),
  definirCapa: (produtoId: string, url: string): Promise<{ produto: { id: string; imagem_url: string | null; imagens: string[] } }> =>
    api.put(`${LOJA}/produtos/${produtoId}/fotos/capa`, { url }).then((r) => r.data),

  // ── Catálogo para WhatsApp e Google ─────────────────────────────────────────
  feed: (): Promise<{
    no_ar: boolean
    status: string
    vitrine: string
    feed: { xml: string; csv: string }
    itens_no_feed: number
    produtos_ativos: number
    com_foto: number
    sem_foto: number
  }> => api.get(`${LOJA}/feed`).then((r) => r.data),

  pedidos: (status = 'abertos'): Promise<{ pedidos: Pedido[]; loja: { id: string; nome_fantasia: string } }> =>
    api.get(`${LOJA}/pedidos`, { params: { status } }).then((r) => r.data),

  pedido: (id: string): Promise<{ pedido: Pedido; eventos: EventoDoPedido[] }> =>
    api.get(`${LOJA}/pedidos/${id}`).then((r) => r.data),

  avancar: (id: string) => api.post(`${LOJA}/pedidos/${id}/avancar`).then((r) => r.data),
  emitirEtiqueta: (id: string): Promise<{ pedido: Pedido }> =>
    api.post(`${LOJA}/pedidos/${id}/etiqueta`).then((r) => r.data),
  cancelar: (id: string, motivo: string) =>
    api.post(`${LOJA}/pedidos/${id}/cancelar`, { motivo }).then((r) => r.data)
}

// ── Painel da plataforma ──────────────────────────────────────────────────────

const ADMIN = '/v1/admin/mercado'

export const adminMercado = {
  lojas: (status?: string): Promise<{ lojas: Loja[]; pendentes: number }> =>
    api.get(`${ADMIN}/lojas`, { params: status ? { status } : undefined }).then((r) => r.data),

  decidir: (id: string, dados: { decisao: string; motivo?: string; comissao_pct?: number }) =>
    api.post(`${ADMIN}/lojas/${id}/decisao`, dados).then((r) => r.data),

  categorias: (): Promise<{ categorias: Categoria[] }> => api.get(`${ADMIN}/categorias`).then((r) => r.data),
  criarCategoria: (dados: { nome: string; ordem?: number; margem_padrao_pct?: number | null }) =>
    api.post(`${ADMIN}/categorias`, dados).then((r) => r.data),
  editarCategoria: (
    id: string,
    dados: { nome?: string; ordem?: number; ativo?: boolean; margem_padrao_pct?: number | null }
  ): Promise<{ categoria: Categoria }> => api.put(`${ADMIN}/categorias/${id}`, dados).then((r) => r.data),

  pedidos: (params?: { status?: string; loja?: string }) =>
    api.get(`${ADMIN}/pedidos`, { params }).then((r) => r.data),

  financeiro: () => api.get(`${ADMIN}/financeiro`).then((r) => r.data)
}

// ── Vitrine pública (sem sessão) ──────────────────────────────────────────────

const PUBLICO = '/public/mercado'

export const mercadoPublico = {
  lojas: (): Promise<{ lojas: Loja[] }> => api.get(`${PUBLICO}/lojas`).then((r) => r.data),
  loja: (slug: string): Promise<{ loja: Loja; categorias: Categoria[] }> =>
    api.get(`${PUBLICO}/lojas/${slug}`).then((r) => r.data),
  produtos: (
    slug: string,
    params?: { busca?: string; categoria?: string; especie?: string; pagina?: number; limite?: number }
  ): Promise<{ produtos: Produto[]; total: number; pagina: number; paginas: number }> =>
    api.get(`${PUBLICO}/lojas/${slug}/produtos`, { params }).then((r) => r.data),
  produto: (slug: string, produtoSlug: string): Promise<{ produto: Produto & { loja: Loja; disponivel: boolean } }> =>
    api.get(`${PUBLICO}/lojas/${slug}/produtos/${produtoSlug}`).then((r) => r.data)
}

// ── Formatação ────────────────────────────────────────────────────────────────

export const emReais = (valor: unknown): string =>
  Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Como escrever a unidade ao lado do número.
 *
 * "2 un" para dois sacos de ração de quinze quilos é a diferença entre a pessoa
 * entender e não entender o que vai buscar no balcão.
 */
const UNIDADES: Record<string, [string, string]> = {
  un: ['un', 'un'],
  kg: ['kg', 'kg'],
  g: ['g', 'g'],
  l: ['L', 'L'],
  ml: ['ml', 'ml'],
  saco: ['saco', 'sacos'],
  pacote: ['pacote', 'pacotes'],
  caixa: ['caixa', 'caixas'],
  frasco: ['frasco', 'frascos'],
  lata: ['lata', 'latas'],
  sache: ['sachê', 'sachês'],
  pote: ['pote', 'potes'],
  kit: ['kit', 'kits'],
  conjunto: ['conjunto', 'conjuntos'],
  par: ['par', 'pares'],
  rolo: ['rolo', 'rolos']
}

export const escreverUnidade = (quantidade: number, unidade: string): string => {
  const [singular, plural] = UNIDADES[unidade] || [unidade, unidade]
  return `${quantidade} ${quantidade === 1 ? singular : plural}`
}

/** Como o pedido chega, no texto que as duas pontas leem. */
export const ENTREGA: Record<string, string> = {
  retirada: 'Retirada no balcão',
  combinar: 'Entrega combinada com a loja',
  loja: 'Entrega pela loja',
  transportadora: 'Envio por transportadora',
  entregador: 'Entrega por entregador'
}

export const quilometros = (valor: unknown): string => `${Number(valor || 0).toFixed(1).replace('.', ',')} km`

/** Os estados do pedido, com o texto que o tutor lê e o tom do selo. */
export const ESTADO_DO_PEDIDO: Record<string, { rotulo: string; tom: 'slate' | 'teal' | 'amber' | 'red' }> = {
  aguardando_pagamento: { rotulo: 'Aguardando pagamento', tom: 'amber' },
  pagamento_falhou: { rotulo: 'Pagamento não aprovado', tom: 'red' },
  pago: { rotulo: 'Pago', tom: 'teal' },
  em_separacao: { rotulo: 'Em separação', tom: 'teal' },
  pronto: { rotulo: 'Pronto', tom: 'teal' },
  concluido: { rotulo: 'Concluído', tom: 'slate' },
  cancelado: { rotulo: 'Cancelado', tom: 'red' },
  reembolsado: { rotulo: 'Reembolsado', tom: 'slate' }
}
