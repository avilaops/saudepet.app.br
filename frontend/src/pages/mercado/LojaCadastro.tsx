import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import { minhaLoja, type Loja } from '../../services/mercado'

/**
 * Cadastro da loja no Saúde Pet Mercado — pela tela, do começo ao fim.
 *
 * Não existe caminho paralelo por e-mail: quem quer vender abre esta página na
 * própria conta, preenche, sobe o catálogo e envia para conferência. Serviço
 * sem fluxo completo na interface não está entregue.
 *
 * O que a tela deixa claro é o que costuma pegar as pessoas de surpresa: a loja
 * NÃO entra na vitrine ao salvar. Ela nasce rascunho, precisa de CNPJ e de pelo
 * menos um produto, e passa por conferência da equipe — como o veterinário
 * passa. Deixar isso implícito faria o lojista achar que já está vendendo.
 */

type Estado = { status?: string; motivo_recusa?: string | null }

const PASSOS: Record<string, { rotulo: string; tom: 'slate' | 'amber' | 'teal' | 'red'; explicacao: string }> = {
  rascunho: {
    rotulo: 'Rascunho',
    tom: 'slate',
    explicacao: 'Só você enxerga esta loja. Cadastre os produtos e envie para análise quando estiver pronta.'
  },
  pendente: {
    rotulo: 'Em análise',
    tom: 'amber',
    explicacao: 'A equipe está conferindo seus dados. Em geral responde em até dois dias úteis.'
  },
  aprovada: {
    rotulo: 'No ar',
    tom: 'teal',
    explicacao: 'Sua loja aparece na vitrine e pode receber pedidos.'
  },
  recusada: {
    rotulo: 'Precisa de ajustes',
    tom: 'red',
    explicacao: 'Corrija o que foi apontado e salve — o cadastro volta para a fila automaticamente.'
  },
  suspensa: {
    rotulo: 'Suspensa',
    tom: 'red',
    explicacao: 'Sua loja saiu da vitrine. Fale com o suporte para entender os próximos passos.'
  }
}

const VAZIO = {
  nome_fantasia: '',
  razao_social: '',
  cnpj: '',
  descricao: '',
  email: '',
  telefone: '',
  whatsapp: '',
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  aceita_retirada: true,
  aceita_combinar: true,
  prazo_preparo_min: 60,
  pedido_minimo: 0,
  aceita_entrega: false,
  entrega_raio_km: '',
  frete_base: '',
  frete_por_km: '',
  frete_gratis_acima: '',
  entrega_prazo_horas: '',
  aceita_transportadora: false,
  aceita_assinatura: false,
  assinatura_desconto_pct: '5',
  assinatura_frete_gratis: false,
  embalagem_altura_cm: '',
  embalagem_largura_cm: '',
  embalagem_comprimento_cm: ''
}

const numeroOuNulo = (valor: unknown): number | null =>
  valor === '' || valor === null || valor === undefined || !Number.isFinite(Number(valor)) ? null : Number(valor)

export default function LojaCadastro() {
  const navigate = useNavigate()

  const [loja, setLoja] = useState<(Loja & Estado) | null>(null)
  const [formulario, setFormulario] = useState<ApiPayload>({ ...VAZIO })
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const carregar = useCallback(async () => {
    try {
      const { loja: encontrada } = await minhaLoja.ver()
      setLoja(encontrada as Loja & Estado)
      if (encontrada) {
        setFormulario({
          ...VAZIO,
          ...Object.fromEntries(
            Object.keys(VAZIO).map((chave) => [
              chave,
              (encontrada as unknown as Record<string, unknown>)[chave] ?? VAZIO[chave as keyof typeof VAZIO]
            ])
          )
        } as typeof VAZIO)
      }
    } catch {
      setErro('Não foi possível carregar sua loja.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const mudar = (chave: string, valor: unknown) =>
    setFormulario((atual: ApiPayload) => ({ ...atual, [chave]: valor }))

  const salvar = async () => {
    setSalvando(true)
    setErro('')
    setSucesso('')
    try {
      const dados = {
        ...formulario,
        pedido_minimo: Number(formulario.pedido_minimo) || 0,
        entrega_raio_km: numeroOuNulo(formulario.entrega_raio_km),
        frete_base: numeroOuNulo(formulario.frete_base) ?? 0,
        frete_por_km: numeroOuNulo(formulario.frete_por_km) ?? 0,
        frete_gratis_acima: numeroOuNulo(formulario.frete_gratis_acima),
        entrega_prazo_horas: numeroOuNulo(formulario.entrega_prazo_horas),
        embalagem_altura_cm: numeroOuNulo(formulario.embalagem_altura_cm),
        embalagem_largura_cm: numeroOuNulo(formulario.embalagem_largura_cm),
        embalagem_comprimento_cm: numeroOuNulo(formulario.embalagem_comprimento_cm)
      }
      if (loja) await minhaLoja.atualizar(dados)
      else await minhaLoja.criar(dados)
      setSucesso('Cadastro salvo.')
      await carregar()
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível salvar o cadastro.')
    } finally {
      setSalvando(false)
    }
  }

  const enviar = async () => {
    setEnviando(true)
    setErro('')
    setSucesso('')
    try {
      const resposta = await minhaLoja.enviarParaAnalise()
      setSucesso(resposta.message)
      await carregar()
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível enviar para análise.')
    } finally {
      setEnviando(false)
    }
  }

  const campo =
    'w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.82rem] text-ink outline-none transition focus:border-primary'
  const rotulo = 'block text-[0.72rem] font-semibold text-slate-500'

  const passo = loja?.status ? PASSOS[loja.status] : null

  if (carregando) {
    return (
      <div className="container-app min-h-screen bg-surface-page">
        <PageHeader title="Minha loja" onBack={() => navigate('/tutor/home')} />
        <Panel className="mx-5 mt-5 px-4 py-8 text-center text-[0.78rem] text-slate-400">Carregando…</Panel>
      </div>
    )
  }

  return (
    <div className="container-app min-h-screen bg-surface-page pb-10">
      <PageHeader
        title={loja ? 'Minha loja' : 'Abrir loja'}
        subtitle="Saúde Pet Mercado"
        onBack={() => navigate(loja ? '/mercado/loja/painel' : '/tutor/home')}
        action={passo ? <Badge tone={passo.tom}>{passo.rotulo}</Badge> : undefined}
      />

      <div className="space-y-3.5 px-5 py-5">
        {!loja && (
          <Panel className="px-4 py-4">
            <h2 className="text-[0.92rem] font-semibold tracking-tight text-ink">Venda no Saúde Pet Mercado</h2>
            <p className="mt-1.5 text-[0.76rem] leading-relaxed text-slate-500">
              Cadastre sua empresa, monte o catálogo e receba pedidos dos tutores da sua cidade. O pagamento
              entra pela plataforma e o repasse sai por Pix, com a comissão descontada e à vista no seu painel.
            </p>
            <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[0.72rem] leading-relaxed text-slate-500">
              A loja passa por conferência antes de aparecer na vitrine — parte do catálogo do mercado é
              medicamento de uso animal, e isso é conferido.
            </p>
          </Panel>
        )}

        {passo && (
          <Panel
            className={`px-4 py-3.5 ${
              loja?.status === 'recusada' || loja?.status === 'suspensa' ? 'border-red-200 bg-red-50' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon name={loja?.status === 'aprovada' ? 'check' : 'clock'} size={15} className="text-primary" />
              <h2 className="text-[0.86rem] font-semibold text-ink">{passo.rotulo}</h2>
            </div>
            <p className="mt-1 text-[0.74rem] leading-relaxed text-slate-600">{passo.explicacao}</p>
            {loja?.motivo_recusa && (
              <p className="mt-2 rounded-xl bg-white px-3 py-2 text-[0.74rem] leading-relaxed text-red-700 ring-1 ring-red-200">
                {loja.motivo_recusa}
              </p>
            )}
          </Panel>
        )}

        {erro && <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>}
        {sucesso && (
          <Panel className="border-primary/25 bg-primary/5 px-4 py-3 text-[0.76rem] text-ink">{sucesso}</Panel>
        )}

        {/* ── Empresa ── */}
        <Panel className="space-y-3 px-4 py-4">
          <Eyebrow className="text-slate-400">A empresa</Eyebrow>

          <label className="block space-y-1">
            <span className={rotulo}>Nome fantasia *</span>
            <input
              className={campo}
              value={formulario.nome_fantasia}
              onChange={(evento) => mudar('nome_fantasia', evento.target.value)}
              placeholder="Como os clientes conhecem a loja"
            />
          </label>

          <label className="block space-y-1">
            <span className={rotulo}>Razão social</span>
            <input
              className={campo}
              value={formulario.razao_social}
              onChange={(evento) => mudar('razao_social', evento.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span className={rotulo}>CNPJ *</span>
            <input
              className={campo}
              inputMode="numeric"
              value={formulario.cnpj}
              onChange={(evento) => mudar('cnpj', evento.target.value)}
              placeholder="00.000.000/0000-00"
            />
            <span className="block text-[0.68rem] text-slate-400">
              Obrigatório para enviar a loja para análise.
            </span>
          </label>

          <label className="block space-y-1">
            <span className={rotulo}>Descrição</span>
            <textarea
              className={`${campo} resize-none`}
              rows={2}
              value={formulario.descricao}
              onChange={(evento) => mudar('descricao', evento.target.value)}
              placeholder="Em uma frase, o que sua loja tem de melhor"
            />
          </label>
        </Panel>

        {/* ── Contato ── */}
        <Panel className="space-y-3 px-4 py-4">
          <Eyebrow className="text-slate-400">Contato</Eyebrow>

          <label className="block space-y-1">
            <span className={rotulo}>E-mail *</span>
            <input
              className={campo}
              type="email"
              value={formulario.email}
              onChange={(evento) => mudar('email', evento.target.value)}
            />
            <span className="block text-[0.68rem] text-slate-400">
              É para cá que vai o aviso de cada pedido pago.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className={rotulo}>Telefone *</span>
              <input
                className={campo}
                value={formulario.telefone}
                onChange={(evento) => mudar('telefone', evento.target.value)}
                placeholder="(16) 90000-0000"
              />
            </label>
            <label className="block space-y-1">
              <span className={rotulo}>WhatsApp</span>
              <input
                className={campo}
                value={formulario.whatsapp}
                onChange={(evento) => mudar('whatsapp', evento.target.value)}
              />
            </label>
          </div>
        </Panel>

        {/* ── Endereço ── */}
        <Panel className="space-y-3 px-4 py-4">
          <Eyebrow className="text-slate-400">Onde fica</Eyebrow>
          <p className="text-[0.7rem] leading-relaxed text-slate-400">
            É o endereço que o tutor lê quando escolhe retirar no balcão.
          </p>

          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <label className="block space-y-1">
              <span className={rotulo}>Endereço *</span>
              <input className={campo} value={formulario.endereco}
                onChange={(evento) => mudar('endereco', evento.target.value)} placeholder="Rua ou avenida" />
            </label>
            <label className="block space-y-1">
              <span className={rotulo}>Número *</span>
              <input className={campo} value={formulario.numero}
                onChange={(evento) => mudar('numero', evento.target.value)} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className={rotulo}>Complemento</span>
              <input
                className={campo}
                value={formulario.complemento}
                onChange={(evento) => mudar('complemento', evento.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className={rotulo}>Bairro</span>
              <input
                className={campo}
                value={formulario.bairro}
                onChange={(evento) => mudar('bairro', evento.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <label className="block space-y-1">
              <span className={rotulo}>CEP</span>
              <input
                className={campo}
                inputMode="numeric"
                value={formulario.cep}
                onChange={(evento) => mudar('cep', evento.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className={rotulo}>Cidade *</span>
              <input
                className={campo}
                value={formulario.cidade}
                onChange={(evento) => mudar('cidade', evento.target.value)}
              />
            </label>
            <label className="block w-20 space-y-1">
              <span className={rotulo}>UF *</span>
              <input
                className={`${campo} uppercase`}
                maxLength={2}
                value={formulario.estado}
                onChange={(evento) => mudar('estado', evento.target.value.toUpperCase())}
              />
            </label>
          </div>
        </Panel>

        {/* ── Como entrega ── */}
        <Panel className="space-y-3 px-4 py-4">
          <Eyebrow className="text-slate-400">Como você entrega</Eyebrow>

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={formulario.aceita_retirada}
              onChange={(evento) => mudar('aceita_retirada', evento.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary"
            />
            <span className="text-[0.8rem] text-ink">O cliente retira no balcão</span>
          </label>

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={formulario.aceita_combinar}
              onChange={(evento) => mudar('aceita_combinar', evento.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary"
            />
            <span className="text-[0.8rem] text-ink">Eu combino a entrega com o cliente</span>
          </label>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={formulario.aceita_entrega}
              onChange={(evento) => mudar('aceita_entrega', evento.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary"
            />
            <span className="text-[0.8rem] leading-relaxed text-ink">
              Eu entrego em casa
              <span className="mt-0.5 block text-[0.68rem] text-slate-400">
                Dentro do raio abaixo, com o frete calculado pela distância antes de o cliente fechar. Fora do
                raio, ele nem consegue escolher.
              </span>
            </span>
          </label>

          {formulario.aceita_entrega && (
            <div className="space-y-2.5 rounded-xl bg-slate-50 px-3 py-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className={rotulo}>Até quantos km *</span>
                  <input
                    className={campo}
                    type="number"
                    min={0.5}
                    max={200}
                    step="0.5"
                    value={formulario.entrega_raio_km}
                    onChange={(evento) => mudar('entrega_raio_km', evento.target.value)}
                    placeholder="8"
                  />
                </label>
                <label className="block space-y-1">
                  <span className={rotulo}>Prazo (horas)</span>
                  <input
                    className={campo}
                    type="number"
                    min={1}
                    value={formulario.entrega_prazo_horas}
                    onChange={(evento) => mudar('entrega_prazo_horas', evento.target.value)}
                    placeholder="4"
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="block space-y-1">
                  <span className={rotulo}>Frete fixo (R$)</span>
                  <input
                    className={campo}
                    type="number"
                    min={0}
                    step="0.01"
                    value={formulario.frete_base}
                    onChange={(evento) => mudar('frete_base', evento.target.value)}
                    placeholder="5"
                  />
                </label>
                <label className="block space-y-1">
                  <span className={rotulo}>Por km (R$)</span>
                  <input
                    className={campo}
                    type="number"
                    min={0}
                    step="0.01"
                    value={formulario.frete_por_km}
                    onChange={(evento) => mudar('frete_por_km', evento.target.value)}
                    placeholder="1,50"
                  />
                </label>
                <label className="block space-y-1">
                  <span className={rotulo}>Grátis a partir de</span>
                  <input
                    className={campo}
                    type="number"
                    min={0}
                    step="0.01"
                    value={formulario.frete_gratis_acima}
                    onChange={(evento) => mudar('frete_gratis_acima', evento.target.value)}
                    placeholder="150"
                  />
                </label>
              </div>

              <p className="text-[0.68rem] leading-relaxed text-slate-400">
                Exemplo: fixo R$ 5 + R$ 1,50 por km → uma entrega a 4 km custa R$ 11. Deixe &quot;grátis a partir
                de&quot; vazio para o frete nunca zerar. Ração pesada só fecha conta em raio curto.
              </p>
              <p className="text-[0.68rem] leading-relaxed text-slate-500">
                {loja?.latitude != null
                  ? 'Localização da loja confirmada no mapa — é dela que a distância é medida.'
                  : 'Ao salvar, localizamos sua loja no mapa pelo endereço. Se não conseguirmos, avisamos.'}
              </p>
            </div>
          )}

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={formulario.aceita_assinatura}
              onChange={(evento) => mudar('aceita_assinatura', evento.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary"
            />
            <span className="text-[0.8rem] leading-relaxed text-ink">
              Vendo ração por assinatura
              <span className="mt-0.5 block text-[0.68rem] text-slate-400">
                O cliente programa a cada quantos dias quer receber. No dia, nasce um pedido com o desconto abaixo
                e ele recebe o aviso com o Pix pronto — sem cobrança automática.
              </span>
            </span>
          </label>

          {formulario.aceita_assinatura && (
            <div className="space-y-2.5 rounded-xl bg-slate-50 px-3 py-3">
              <label className="block space-y-1">
                <span className={rotulo}>Desconto de assinante (%)</span>
                <input
                  className={campo}
                  type="number"
                  min={0}
                  max={50}
                  step="0.5"
                  value={formulario.assinatura_desconto_pct}
                  onChange={(evento) => mudar('assinatura_desconto_pct', evento.target.value)}
                />
                <span className="block text-[0.66rem] text-slate-400">
                  Sobre os produtos de cada pedido da assinatura. A comissão da plataforma incide no valor já com desconto.
                </span>
              </label>
              {formulario.aceita_entrega && (
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={formulario.assinatura_frete_gratis}
                    onChange={(evento) => mudar('assinatura_frete_gratis', evento.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary"
                  />
                  <span className="text-[0.78rem] text-ink">Frete grátis para assinante na entrega em casa</span>
                </label>
              )}
            </div>
          )}

          <label className="flex items-start gap-2.5">
            <input type="checkbox" checked={formulario.aceita_transportadora}
              onChange={(evento) => mudar('aceita_transportadora', evento.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary" />
            <span className="text-[0.8rem] leading-relaxed text-ink">
              Envio nacional com CepCerto
              <span className="mt-0.5 block text-[0.68rem] text-slate-400">
                O cliente compara PAC, SEDEX, Jadlog e Loggi. A etiqueta sai no painel depois do pagamento.
              </span>
            </span>
          </label>

          {formulario.aceita_transportadora && (
            <div className="space-y-2.5 rounded-xl bg-primary/5 px-3 py-3 ring-1 ring-primary/20">
              <p className="text-[0.7rem] leading-relaxed text-slate-500">
                Informe a caixa padrão usada nos envios. Todo produto disponível para transportadora também precisa ter peso bruto no catálogo.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <label className="block space-y-1"><span className={rotulo}>Altura (cm)</span>
                  <input className={campo} type="number" min={2} max={100} step="0.1" value={formulario.embalagem_altura_cm}
                    onChange={(evento) => mudar('embalagem_altura_cm', evento.target.value)} /></label>
                <label className="block space-y-1"><span className={rotulo}>Largura (cm)</span>
                  <input className={campo} type="number" min={11} max={100} step="0.1" value={formulario.embalagem_largura_cm}
                    onChange={(evento) => mudar('embalagem_largura_cm', evento.target.value)} /></label>
                <label className="block space-y-1"><span className={rotulo}>Comprimento</span>
                  <input className={campo} type="number" min={16} max={100} step="0.1" value={formulario.embalagem_comprimento_cm}
                    onChange={(evento) => mudar('embalagem_comprimento_cm', evento.target.value)} /></label>
              </div>
            </div>
          )}

          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[0.7rem] leading-relaxed text-slate-500">
            Entrega local continua sendo feita por você. Para outras cidades, a CepCerto cuida da cotação e da etiqueta da transportadora.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className={rotulo}>Preparo (min)</span>
              <input
                className={campo}
                type="number"
                min={0}
                value={formulario.prazo_preparo_min}
                onChange={(evento) => mudar('prazo_preparo_min', Number(evento.target.value))}
              />
            </label>
            <label className="block space-y-1">
              <span className={rotulo}>Pedido mínimo (R$)</span>
              <input
                className={campo}
                type="number"
                min={0}
                step="0.01"
                value={formulario.pedido_minimo}
                onChange={(evento) => mudar('pedido_minimo', evento.target.value)}
              />
            </label>
          </div>
        </Panel>

        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="w-full rounded-xl bg-ink px-4 py-3.5 text-[0.85rem] font-semibold text-white transition hover:bg-[#0e262b] disabled:opacity-60"
        >
          {salvando ? 'Salvando…' : loja ? 'Salvar alterações' : 'Criar minha loja'}
        </button>

        {loja && (
          <>
            <button
              type="button"
              onClick={() => navigate('/mercado/loja/catalogo')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[0.82rem] font-semibold text-ink ring-1 ring-slate-200/80 transition hover:bg-slate-50"
            >
              <Icon name="inbox" size={15} />
              Cadastrar produtos
            </button>

            {(loja.status === 'rascunho' || loja.status === 'recusada') && (
              <button
                type="button"
                onClick={enviar}
                disabled={enviando}
                className="w-full rounded-xl bg-primary px-4 py-3.5 text-[0.85rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-60"
              >
                {enviando ? 'Enviando…' : 'Enviar para análise'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
