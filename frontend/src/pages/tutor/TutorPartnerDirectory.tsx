import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Phone, QrCode, Search } from 'lucide-react'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import { Badge, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'

/**
 * Rede credenciada.
 *
 * A tela mostrava nota 5,0 com estrela cheia para todo parceiro (o banco tem
 * 5.0 como valor inicial) e uma descrição inventada quando o parceiro não
 * escreveu nenhuma — leitura bonita e falsa. Agora só aparece o que existe: a
 * nota sai quando há avaliação de verdade, e o parágrafo some quando não há
 * texto do parceiro.
 */

const CATEGORIAS = [
  ['', 'Todos'],
  ['clinica', 'Clínicas'],
  ['hospital', 'Hospitais 24h'],
  ['laboratorio', 'Exames & Labs']
]

const emojiDoPet = (pet: ApiPayload) => {
  const tipo = String(pet?.tipo || pet?.especie || '').toLowerCase()
  if (tipo.includes('gat')) return '🐈'
  if (tipo.includes('cach') || tipo.includes('cao') || tipo.includes('cão')) return '🐶'
  return '🐾'
}

// A nota só é real quando alguém avaliou: o campo nasce com 5.0 no banco.
const notaReal = (partner: ApiPayload) => {
  if (partner?.rating == null) return null
  if (!Number(partner?.totalReviews)) return null
  const valor = Number(partner.rating)
  return Number.isFinite(valor) ? valor.toFixed(1) : null
}

export default function TutorPartnerDirectory() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [partners, setPartners] = useState<ApiPayload[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [emergency, setEmergency] = useState(false)
  const [selectedPartner, setSelectedPartner] = useState<ApiPayload | null>(null)

  const [tabAtiva, setTabAtiva] = useState<'rede' | 'vouchers'>('rede')
  const [meusVouchers, setMeusVouchers] = useState<ApiPayload[]>([])
  const [carregandoVouchers, setCarregandoVouchers] = useState(false)

  // Modal de solicitação de indicação
  const [pets, setPets] = useState<ApiPayload[]>([])
  const [selectedPet, setSelectedPet] = useState('')
  const [selectedService, setSelectedService] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [erroIndicacao, setErroIndicacao] = useState('')
  const [generatedReferral, setGeneratedReferral] = useState<ApiPayload | null>(null)

  const carregarMeusVouchers = useCallback(async () => {
    try {
      setCarregandoVouchers(true)
      const { data } = await api.get('/v1/referrals/my')
      setMeusVouchers(Array.isArray(data?.referrals) ? data.referrals : [])
    } catch (err) {
      console.error('Erro ao carregar vouchers do tutor:', err)
      setMeusVouchers([])
    } finally {
      setCarregandoVouchers(false)
    }
  }, [])

  useEffect(() => {
    if (tabAtiva === 'vouchers') {
      carregarMeusVouchers()
    }
  }, [tabAtiva, carregarMeusVouchers])

  const carregarParceiros = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const params: Record<string, any> = { limit: 30 }
      if (category) params.category = category
      if (emergency) params.emergency = true
      if (search.trim()) params.search = search.trim()

      const { data } = await api.get('/v1/partners/public', { params })
      setPartners(Array.isArray(data?.partners) ? data.partners : [])
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar a rede credenciada.')
      setPartners([])
    } finally {
      setCarregando(false)
    }
    // A busca só roda no submit do formulário; categoria e emergência disparam sozinhas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, emergency])

  useEffect(() => { carregarParceiros() }, [carregarParceiros])

  const carregarPets = useCallback(async () => {
    try {
      // A rota real é GET /pets (responde { pets: [...] }); /v1/pets/meus-pets
      // nunca existiu e deixava o voucher permanentemente desabilitado.
      const { data } = await api.get('/pets')
      const lista = Array.isArray(data?.pets) ? data.pets : []
      setPets(lista)
      if (lista.length > 0) setSelectedPet(lista[0].id)
    } catch (requestError: any) {
      console.error('Erro ao carregar pets:', requestError)
      setPets([])
    }
  }, [])

  useEffect(() => { if (user) carregarPets() }, [user, carregarPets])

  const buscar = (event: any) => {
    event.preventDefault()
    carregarParceiros()
  }

  const limparFiltros = () => {
    setSearch('')
    setCategory('')
    setEmergency(false)
  }

  const abrirIndicacao = (partner: ApiPayload) => {
    setSelectedPartner(partner)
    setSelectedService('')
    setReason('')
    setErroIndicacao('')
    setGeneratedReferral(null)
  }

  const gerarIndicacao = async (event: any) => {
    event.preventDefault()
    if (!selectedPet || !selectedPartner) return

    setSubmitting(true)
    setErroIndicacao('')
    try {
      const unidade = Array.isArray(selectedPartner.units) ? selectedPartner.units[0] : null
      const { data } = await api.post('/v1/referrals', {
        petId: selectedPet,
        partnerId: selectedPartner.id,
        partnerUnitId: unidade ? unidade.id : '',
        partnerServiceId: selectedService || null,
        reason
      })
      if (data?.referral) setGeneratedReferral(data.referral)
      else setErroIndicacao(data?.error || data?.message || 'Não foi possível gerar a indicação.')
    } catch (requestError: any) {
      const resposta = requestError.response?.data
      setErroIndicacao(resposta?.error || resposta?.message || 'Não foi possível gerar a indicação. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const cartao = (partner: ApiPayload) => {
    const unidade = Array.isArray(partner.units) ? partner.units[0] : null
    const nota = notaReal(partner)

    return (
      <Panel key={partner.id} className="overflow-hidden">
        <div className="space-y-3 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 text-[0.95rem] font-bold text-primary">
              {partner.logoUrl
                ? <img src={partner.logoUrl} alt="" className="h-full w-full object-contain" />
                : (partner.tradeName || '?').charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[0.9rem] font-semibold tracking-tight text-ink">{partner.tradeName}</h3>
              {nota && (
                <span className="mt-0.5 flex items-center gap-1 text-[0.72rem] font-semibold text-amber-600">
                  <Icon name="star" size={13} />
                  {nota}
                  <span className="font-medium text-slate-400">· {partner.totalReviews} avaliações</span>
                </span>
              )}
            </div>
            {unidade?.emergencyService && <Badge tone="red">24h</Badge>}
          </div>

          {partner.description && (
            <p className="line-clamp-2 text-[0.74rem] leading-relaxed text-slate-500">{partner.description}</p>
          )}

          {unidade && (
            <div className="space-y-1 border-t border-slate-100 pt-3 text-[0.72rem] text-slate-500">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">
                  {[unidade.city, unidade.state].filter(Boolean).join(' - ')}
                  {unidade.district ? ` (${unidade.district})` : ''}
                </span>
              </span>
              {unidade.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {unidade.phone}
                </span>
              )}
            </div>
          )}

          <button
            onClick={() => abrirIndicacao(partner)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[0.78rem] font-semibold text-white transition hover:bg-[#127e82]"
          >
            <QrCode className="h-4 w-4" />
            Solicitar indicação
          </button>
        </div>
      </Panel>
    )
  }

  const campo = 'w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary'

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader
        title="Rede credenciada"
        subtitle="Clínicas, hospitais e exames parceiros"
        onBack={() => navigate('/tutor/home')}
      />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {/* Seletor de Abas */}
        <div className="flex rounded-2xl bg-slate-200/70 p-1">
          <button
            type="button"
            onClick={() => setTabAtiva('rede')}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
              tabAtiva === 'rede' ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Rede Credenciada
          </button>
          <button
            type="button"
            onClick={() => setTabAtiva('vouchers')}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              tabAtiva === 'vouchers' ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <QrCode size={14} />
            <span>Meus Vouchers</span>
          </button>
        </div>

        {tabAtiva === 'rede' ? (
          <>
            <Panel className="space-y-3.5 p-4">
              <p className="text-[0.76rem] leading-relaxed text-slate-500">
                Escolha um parceiro e receba seu <strong className="font-semibold text-ink">código de indicação</strong> para
                apresentar na recepção.
              </p>

              <form onSubmit={buscar} className="flex gap-2">
            <span className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Clínica, hospital ou serviço"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${campo} pl-9`}
              />
            </span>
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-ink px-4 py-2.5 text-[0.78rem] font-semibold text-white transition hover:bg-[#0e262b]"
            >
              Buscar
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS.map(([valor, rotulo]) => (
              <button
                key={valor || 'todos'}
                onClick={() => setCategory(valor)}
                className={`rounded-xl px-3 py-1.5 text-[0.72rem] font-semibold transition ${
                  category === valor
                    ? 'bg-primary text-white'
                    : 'border border-slate-200/80 bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                {rotulo}
              </button>
            ))}
            <button
              onClick={() => setEmergency((atual) => !atual)}
              className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-[0.72rem] font-semibold transition ${
                emergency ? 'bg-red-600 text-white' : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              <Icon name="clock" size={13} />
              24h
            </button>
          </div>
        </Panel>

        {carregando ? (
          <div className="py-14 text-center">
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
          </div>
        ) : erro ? (
          <Panel className="space-y-3 px-6 py-10 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-600">
              <Icon name="alert" size={20} />
            </span>
            <h3 className="text-[0.9rem] font-semibold text-ink">Não deu para carregar a rede</h3>
            <p className="mx-auto max-w-xs text-[0.75rem] leading-relaxed text-slate-400">{erro}</p>
            <button
              onClick={carregarParceiros}
              className="rounded-xl bg-primary px-4 py-2.5 text-[0.78rem] font-semibold text-white transition hover:bg-[#127e82]"
            >
              Tentar novamente
            </button>
          </Panel>
        ) : partners.length === 0 ? (
          <Panel className="space-y-3 px-6 py-10 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-400">
              <Icon name="shield" size={20} />
            </span>
            <h3 className="text-[0.9rem] font-semibold text-ink">Nenhum parceiro com esses filtros</h3>
            <p className="mx-auto max-w-xs text-[0.75rem] leading-relaxed text-slate-400">
              Tente outra categoria ou limpe a busca para ver toda a rede credenciada.
            </p>
            <button
              onClick={limparFiltros}
              className="rounded-xl border border-slate-200/80 px-4 py-2.5 text-[0.78rem] font-semibold text-slate-500 transition hover:bg-slate-50"
            >
              Limpar filtros
            </button>
          </Panel>
        ) : (
            <section className="space-y-2">
              <Eyebrow className="px-1 text-slate-400">
                {partners.length === 1 ? '1 parceiro' : `${partners.length} parceiros`}
              </Eyebrow>
              <div className="space-y-2.5">{partners.map(cartao)}</div>
            </section>
          )}
        </>
      ) : (
        /* Aba Meus Vouchers */
        <div className="space-y-3">
          {carregandoVouchers ? (
            <div className="py-14 text-center">
              <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
            </div>
          ) : meusVouchers.length === 0 ? (
            <Panel className="space-y-3 px-6 py-10 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-400">
                <QrCode size={20} />
              </span>
              <h3 className="text-[0.9rem] font-semibold text-ink">Nenhum voucher ativo</h3>
              <p className="mx-auto max-w-xs text-[0.75rem] leading-relaxed text-slate-400">
                Você ainda não gerou indicações para clínicas ou laboratórios parceiros.
              </p>
              <button
                type="button"
                onClick={() => setTabAtiva('rede')}
                className="rounded-xl bg-primary px-4 py-2.5 text-[0.78rem] font-semibold text-white transition hover:bg-[#127e82]"
              >
                Ver Rede Credenciada
              </button>
            </Panel>
          ) : (
            meusVouchers.map((voucher) => {
              const isConv = voucher.status === 'CONVERTED' || (voucher.conversions && voucher.conversions.length > 0)
              const isExp = new Date(voucher.expiresAt) < new Date() && !isConv

              return (
                <Panel key={voucher.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        {voucher.partner?.tradeName || 'Estabelecimento Parceiro'}
                      </span>
                      <h4 className="text-sm font-bold text-ink">{voucher.service?.name || 'Consulta / Procedimento'}</h4>
                      <p className="text-xs text-slate-500">{voucher.unit?.name || 'Unidade Principal'}</p>
                    </div>

                    {isConv ? (
                      <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold">
                        Atendido
                      </span>
                    ) : isExp ? (
                      <span className="rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-[11px] font-bold">
                        Expirado
                      </span>
                    ) : (
                      <span className="rounded-full bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-0.5 text-[11px] font-bold">
                        Válido
                      </span>
                    )}
                  </div>

                  <div className="rounded-2xl bg-ink p-4 text-center text-white space-y-1">
                    <p className="text-[10px] uppercase font-bold tracking-widest text-white/50">Código do Balcão</p>
                    <p className="font-mono text-xl font-black text-primary tracking-widest">{voucher.referralCode}</p>
                    <p className="text-[10px] text-white/60">
                      Válido até {new Date(voucher.expiresAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </Panel>
              )
            })
          )}
        </div>
      )}
    </div>

      {selectedPartner && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            {generatedReferral ? (
              <div className="space-y-4 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon name="check" size={22} />
                </span>
                <div>
                  <h3 className="text-[1rem] font-semibold tracking-tight text-ink">Indicação gerada</h3>
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-slate-500">
                    Apresente este código na recepção do parceiro <strong className="font-semibold text-ink">{selectedPartner.tradeName}</strong>.
                  </p>
                </div>

                <div className="rounded-2xl bg-ink px-4 py-5 text-white">
                  <Eyebrow className="text-white/50">Código de atendimento</Eyebrow>
                  <p className="mt-1.5 font-mono text-[1.6rem] font-bold tracking-[0.2em] text-primary">
                    {generatedReferral.referralCode}
                  </p>
                  {generatedReferral.expiresAt && (
                    <p className="mt-1 text-[0.7rem] text-white/50">
                      Válido até {new Date(generatedReferral.expiresAt).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>

                <div className="space-y-1 rounded-2xl bg-slate-50 px-4 py-3 text-left text-[0.72rem] leading-relaxed text-slate-500">
                  <p className="font-semibold text-ink">Próximos passos</p>
                  <p>1. O parceiro já foi avisado da sua solicitação.</p>
                  <p>2. Depois do atendimento, o repasse é processado pela plataforma.</p>
                </div>

                <button
                  onClick={() => setSelectedPartner(null)}
                  className="w-full rounded-xl bg-primary px-4 py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82]"
                >
                  Concluir
                </button>
              </div>
            ) : (
              <form onSubmit={gerarIndicacao} className="space-y-3.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Eyebrow className="text-primary">Indicação direta</Eyebrow>
                    <h3 className="truncate text-[1rem] font-semibold tracking-tight text-ink">{selectedPartner.tradeName}</h3>
                    <p className="mt-0.5 text-[0.72rem] text-slate-400">Escolha o pet para gerar o código de atendimento.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPartner(null)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 text-slate-400 transition hover:bg-slate-50"
                    aria-label="Fechar"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>

                <label className="block">
                  <Eyebrow className="text-slate-400">Pet</Eyebrow>
                  {pets.length === 0 ? (
                    <p className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[0.74rem] leading-relaxed text-amber-800">
                      Nenhum pet cadastrado. Cadastre seu pet antes de solicitar uma indicação.
                    </p>
                  ) : (
                    <select
                      value={selectedPet}
                      onChange={(event) => setSelectedPet(event.target.value)}
                      className={`mt-1.5 ${campo}`}
                    >
                      {pets.map((pet) => (
                        <option key={pet.id} value={pet.id}>
                          {emojiDoPet(pet)} {pet.nome}{pet.especie ? ` (${pet.especie})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </label>

                {Array.isArray(selectedPartner.services) && selectedPartner.services.length > 0 && (
                  <label className="block">
                    <Eyebrow className="text-slate-400">Serviço (opcional)</Eyebrow>
                    <select
                      value={selectedService}
                      onChange={(event) => setSelectedService(event.target.value)}
                      className={`mt-1.5 ${campo}`}
                    >
                      <option value="">Definir na recepção</option>
                      {selectedPartner.services.map((servico: ApiPayload) => (
                        <option key={servico.id} value={servico.id}>
                          {servico.name}
                          {servico.publicPrice != null ? ` — R$ ${Number(servico.publicPrice).toFixed(2)}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="block">
                  <Eyebrow className="text-slate-400">Motivo / observações</Eyebrow>
                  <textarea
                    rows={3}
                    placeholder="Ex.: consulta de rotina, exame de sangue…"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className={`mt-1.5 ${campo}`}
                  />
                </label>

                {erroIndicacao && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[0.74rem] text-red-700" role="alert">
                    {erroIndicacao}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedPartner(null)}
                    className="flex-1 rounded-xl border border-slate-200/80 px-4 py-3 text-[0.78rem] font-semibold text-slate-500 transition hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || pets.length === 0}
                    className="flex-1 rounded-xl bg-primary px-4 py-3 text-[0.78rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-50"
                  >
                    {submitting ? 'Gerando…' : 'Gerar código'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <TutorBottomNav />
    </div>
  )
}
