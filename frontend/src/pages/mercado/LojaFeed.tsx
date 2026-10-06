import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import { minhaLoja } from '../../services/mercado'

/**
 * O catálogo da loja no WhatsApp e no Google — sem cadastrar de novo.
 *
 * O plano comercial de 27/08/2026 põe o catálogo do WhatsApp Business como o
 * canal principal da fase 1 e o Google Merchant Center (listagem gratuita) na
 * fase 2. Os dois leem o mesmo feed, por URL programada. Esta tela entrega o
 * link, diz quantos itens entram e — o que importa — quantos ficam de fora e
 * por quê: os dois recusam item sem foto.
 */

type Situacao = {
  no_ar: boolean
  status: string
  vitrine: string
  feed: { xml: string; csv: string }
  itens_no_feed: number
  produtos_ativos: number
  com_foto: number
  sem_foto: number
}

export default function LojaFeed() {
  const navigate = useNavigate()
  const [situacao, setSituacao] = useState<Situacao | null>(null)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState<string | null>(null)

  useEffect(() => {
    minhaLoja
      .feed()
      .then(setSituacao)
      .catch((requestError) => {
        const resposta = (requestError as { response?: { status?: number; data?: { error?: string } } }).response
        if (resposta?.status === 403 || resposta?.status === 404) navigate('/mercado/loja')
        else setErro(resposta?.data?.error || 'Não foi possível carregar o catálogo.')
      })
  }, [navigate])

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(texto)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      setErro('Não foi possível copiar. Selecione o link e copie manualmente.')
    }
  }

  const linha = (rotulo: string, url: string) => (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <span className="block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</span>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-[0.74rem] text-ink">{url}</code>
        <button
          type="button"
          onClick={() => copiar(url)}
          className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[0.7rem] font-semibold text-primary ring-1 ring-slate-200/80"
        >
          {copiado === url ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="container-app min-h-screen bg-surface-page pb-10">
      <PageHeader
        title="Catálogo no WhatsApp e no Google"
        subtitle="Saúde Pet Mercado"
        onBack={() => navigate('/mercado/loja/painel')}
        action={situacao ? <Badge tone={situacao.no_ar ? 'teal' : 'amber'}>{situacao.no_ar ? 'No ar' : 'Aguardando aprovação'}</Badge> : undefined}
      />

      <div className="space-y-3.5 px-5 py-5">
        {erro && <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>}

        {!situacao && !erro && (
          <Panel className="px-4 py-8 text-center text-[0.78rem] text-slate-400">Carregando…</Panel>
        )}

        {situacao && (
          <>
            <Panel className="px-4 py-4">
              <h2 className="text-[0.92rem] font-semibold tracking-tight text-ink">Cadastre uma vez, apareça nos três</h2>
              <p className="mt-1.5 text-[0.76rem] leading-relaxed text-slate-500">
                Seu catálogo daqui vira um <strong>feed de produtos</strong> que o WhatsApp Business, o Google
                Shopping e o Google Merchant leem sozinhos, por link. Mudou preço ou foto aqui, muda lá em
                algumas horas — sem digitar de novo.
              </p>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
                  <p className="text-[1.3rem] font-semibold tabular-nums text-ink">{situacao.itens_no_feed}</p>
                  <p className="text-[0.66rem] text-slate-400">no feed</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
                  <p className="text-[1.3rem] font-semibold tabular-nums text-ink">{situacao.com_foto}</p>
                  <p className="text-[0.66rem] text-slate-400">com foto</p>
                </div>
                <div className={`rounded-xl px-3 py-2.5 text-center ${situacao.sem_foto > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                  <p className={`text-[1.3rem] font-semibold tabular-nums ${situacao.sem_foto > 0 ? 'text-amber-800' : 'text-ink'}`}>
                    {situacao.sem_foto}
                  </p>
                  <p className="text-[0.66rem] text-slate-400">sem foto</p>
                </div>
              </div>

              {situacao.sem_foto > 0 && (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[0.72rem] leading-relaxed text-amber-800">
                  O WhatsApp e o Google <strong>recusam produto sem foto</strong>. {situacao.sem_foto} item(ns) do
                  seu catálogo ficam de fora do feed até ganhar uma.{' '}
                  <button type="button" onClick={() => navigate('/mercado/loja/catalogo')} className="font-semibold underline">
                    Subir fotos no catálogo
                  </button>
                </p>
              )}

              {!situacao.no_ar && (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[0.72rem] leading-relaxed text-slate-500">
                  O feed só publica depois que a loja é aprovada. Os links já são os definitivos — pode deixar
                  cadastrados no WhatsApp e no Google que eles passam a receber os produtos na aprovação.
                </p>
              )}
            </Panel>

            <Panel className="space-y-2.5 px-4 py-4">
              <Eyebrow className="text-slate-400">Seus links</Eyebrow>
              {linha('Feed para WhatsApp e Google (XML)', situacao.feed.xml)}
              {linha('Mesmo catálogo em planilha (CSV)', situacao.feed.csv)}
              {linha('Sua vitrine pública', situacao.vitrine)}
            </Panel>

            <Panel className="space-y-3 px-4 py-4">
              <Eyebrow className="text-slate-400">WhatsApp Business</Eyebrow>
              <ol className="list-decimal space-y-1.5 pl-4 text-[0.76rem] leading-relaxed text-slate-600">
                <li>
                  Abra o <strong>Gerenciador de Comércio</strong> da Meta (business.facebook.com/commerce) e crie um
                  catálogo do tipo <em>E-commerce</em>.
                </li>
                <li>
                  Em <strong>Fontes de dados → Adicionar itens → Feed de dados</strong>, escolha{' '}
                  <em>URL programada</em> e cole o link XML acima. Deixe atualizar diariamente.
                </li>
                <li>
                  No WhatsApp Business, em <strong>Ferramentas comerciais → Catálogo</strong>, conecte esse catálogo.
                  Pronto: os produtos aparecem no seu perfil e dá para mandar item na conversa.
                </li>
              </ol>
            </Panel>

            <Panel className="space-y-3 px-4 py-4">
              <Eyebrow className="text-slate-400">Google Shopping (listagem gratuita)</Eyebrow>
              <ol className="list-decimal space-y-1.5 pl-4 text-[0.76rem] leading-relaxed text-slate-600">
                <li>
                  Abra o <strong>Google Merchant Center</strong> (merchants.google.com) e confirme o site{' '}
                  <code>{situacao.vitrine.replace(/\/mercado\/.*$/, '')}</code> como sua loja.
                </li>
                <li>
                  Em <strong>Produtos → Feeds → Adicionar feed</strong>, escolha <em>Busca programada</em> e cole o link
                  XML acima. Frequência diária.
                </li>
                <li>
                  Ative as <strong>listagens gratuitas</strong>. Não custa mídia: os produtos passam a aparecer na
                  aba Shopping e no Google Business Profile da loja.
                </li>
              </ol>
              <p className="text-[0.68rem] leading-relaxed text-slate-400">
                Dica: no Google Business Profile, use a vitrine pública acima como &quot;site&quot; da loja. É o link
                que faz &quot;ração perto de mim&quot; chegar em você.
              </p>
            </Panel>

            <button
              type="button"
              onClick={() => window.open(situacao.vitrine, '_blank', 'noopener')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[0.82rem] font-semibold text-ink ring-1 ring-slate-200/80 transition hover:bg-slate-50"
            >
              <Icon name="chevron" size={15} />
              Abrir minha vitrine pública
            </button>
          </>
        )}
      </div>
    </div>
  )
}
