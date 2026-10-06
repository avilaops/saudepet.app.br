import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { ApiPayload } from '../../types/api'
import api from '../../services/api'
import ParceiroShell from '../../components/parceiro/ParceiroShell'
import ValidarVoucherModal from '../../components/parceiro/ValidarVoucherModal'
import {
  QrCode,
  Search,
  CheckCircle2,
  Clock,
  DollarSign,
  TrendingUp,
  Users,
  Building2,
  FileCheck,
  Filter,
  ArrowUpRight,
  Sparkles,
  Phone
} from 'lucide-react'

export default function ParceiroPainel() {
  const [partners, setPartners] = useState<ApiPayload[]>([])
  const [selectedPartner, setSelectedPartner] = useState<ApiPayload | null>(null)
  const [referrals, setReferrals] = useState<ApiPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filtros
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CREATED' | 'CONVERTED' | 'EXPIRED'>('ALL')
  const [search, setSearch] = useState('')

  // Modal de Validação
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedCode, setSelectedCode] = useState('')

  const carregarParceiros = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/v1/partners/my')
      const lista = Array.isArray(data?.partners) ? data.partners : []
      setPartners(lista)
      if (lista.length > 0) {
        setSelectedPartner((prev: ApiPayload | null) => prev || lista[0])
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Não foi possível carregar os estabelecimentos parceiros.')
    } finally {
      setLoading(false)
    }
  }, [])

  const carregarIndicacoes = useCallback(async (partnerId: string) => {
    try {
      const { data } = await api.get(`/v1/referrals/partner/${partnerId}`)
      setReferrals(Array.isArray(data?.referrals) ? data.referrals : [])
    } catch (err: any) {
      console.error('Erro ao carregar indicações:', err)
      setReferrals([])
    }
  }, [])

  useEffect(() => {
    carregarParceiros()
  }, [carregarParceiros])

  useEffect(() => {
    if (selectedPartner?.id) {
      carregarIndicacoes(selectedPartner.id)
    }
  }, [selectedPartner, carregarIndicacoes])

  const abrirModalComCodigo = (code: string = '') => {
    setSelectedCode(code)
    setModalOpen(true)
  }

  // Métricas calculadas
  const totalRecebidas = referrals.length
  const totalConvertidas = referrals.filter((r) => r.status === 'CONVERTED' || r.conversions?.length > 0)
  const totalAguardando = referrals.filter((r) => r.status === 'CREATED' && new Date(r.expiresAt) >= new Date())

  const faturamentoBruto = totalConvertidas.reduce((acc, r) => {
    const conv = r.conversions?.[0]
    return acc + Number(conv?.grossAmount || 0)
  }, 0)

  const comissaoPlataforma = totalConvertidas.reduce((acc, r) => {
    const conv = r.conversions?.[0]
    return acc + Number(conv?.commissionAmount || 0)
  }, 0)

  const liquidoEstabelecimento = faturamentoBruto - comissaoPlataforma

  // Filtro de lista
  const referralsFiltrados = referrals.filter((r) => {
    const isConv = r.status === 'CONVERTED' || r.conversions?.length > 0
    const isExp = new Date(r.expiresAt) < new Date() && !isConv

    if (statusFilter === 'CREATED' && (!r.status || r.status !== 'CREATED' || isExp || isConv)) return false
    if (statusFilter === 'CONVERTED' && !isConv) return false
    if (statusFilter === 'EXPIRED' && !isExp) return false

    if (search.trim()) {
      const q = search.toLowerCase()
      const matchCode = r.referralCode?.toLowerCase().includes(q)
      const matchTutor = r.tutor?.nome?.toLowerCase().includes(q)
      const matchPet = r.pet?.nome?.toLowerCase().includes(q)
      const matchServico = r.service?.name?.toLowerCase().includes(q)
      if (!matchCode && !matchTutor && !matchPet && !matchServico) return false
    }

    return true
  })

  return (
    <ParceiroShell
      partners={partners}
      selectedPartner={selectedPartner}
      onSelectPartner={(p) => setSelectedPartner(p)}
      onOpenScanner={() => abrirModalComCodigo('')}
    >
      <div className="space-y-8">
        {/* Banner de Boas-Vindas & Ação Rápida */}
        <div className="relative overflow-hidden rounded-3xl border border-teal-500/30 bg-gradient-to-br from-teal-950/40 via-[#121f29] to-[#0d141b] p-6 sm:p-8 shadow-2xl">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-black text-teal-300 border border-teal-500/30">
                <Sparkles size={13} />
                <span>Painel de Balcão & Faturamento</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {selectedPartner?.tradeName || 'Estabelecimento Parceiro'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Valide os vouchers de tutores e veterinários do Saúde Pet no balcão e registre o atendimento em segundos.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => abrirModalComCodigo('')}
                className="flex items-center justify-center gap-2.5 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 px-6 py-4 text-sm font-black shadow-xl shadow-teal-500/25 active:scale-95 transition"
              >
                <QrCode size={20} />
                <span>Validar Voucher / Scanner</span>
              </button>
            </div>
          </div>
        </div>

        {/* Grade de Métricas Comerciais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-3xl border border-white/10 bg-[#121b24] p-6 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-extrabold uppercase tracking-wider">Aguardando Balcão</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
                <Clock size={18} />
              </div>
            </div>
            <p className="text-3xl font-black text-white">{totalAguardando.length}</p>
            <p className="text-xs text-slate-400">Vouchers ativos no sistema</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#121b24] p-6 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-extrabold uppercase tracking-wider">Faturado pela Rede</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300">
                <TrendingUp size={18} />
              </div>
            </div>
            <p className="text-3xl font-black text-white">
              {faturamentoBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-[11px] text-teal-400/90 font-medium">
              {totalConvertidas.length} atendimentos realizados
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#121b24] p-6 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-extrabold uppercase tracking-wider">Líquido da Clínica</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                <DollarSign size={18} />
              </div>
            </div>
            <p className="text-2xl font-black text-emerald-300">
              {liquidoEstabelecimento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-slate-400">Receita retida pelo parceiro</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#121b24] p-6 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-extrabold uppercase tracking-wider">Comissão Saúde Pet</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300">
                <FileCheck size={18} />
              </div>
            </div>
            <p className="text-2xl font-black text-purple-300">
              {comissaoPlataforma.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-slate-400">Calculada por indicação</p>
          </div>
        </div>

        {/* Fila Operacional de Indicações */}
        <div className="rounded-3xl border border-white/10 bg-[#121b24] shadow-2xl overflow-hidden">
          {/* Barra de Filtros e Busca */}
          <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === 'ALL'
                    ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                Todas ({totalRecebidas})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('CREATED')}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === 'CREATED'
                    ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                Aguardando Atendimento ({totalAguardando.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('CONVERTED')}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === 'CONVERTED'
                    ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                Faturadas ({totalConvertidas.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('EXPIRED')}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === 'EXPIRED'
                    ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                Expiradas
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar voucher, pet ou tutor..."
                className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Tabela de Indicações */}
          {loading ? (
            <div className="p-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent mx-auto" />
              <p className="mt-3 text-xs text-slate-400">Carregando indicações do estabelecimento...</p>
            </div>
          ) : referralsFiltrados.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-slate-500">
                <Users size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-300">Nenhuma indicação encontrada</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Quando tutores ou veterinários emitirem encaminhamentos para seu estabelecimento, eles aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-slate-400 uppercase tracking-wider font-extrabold text-[10px]">
                    <th className="px-5 py-3.5">Voucher</th>
                    <th className="px-5 py-3.5">Paciente & Tutor</th>
                    <th className="px-5 py-3.5">Serviço Indicado</th>
                    <th className="px-5 py-3.5">Unidade</th>
                    <th className="px-5 py-3.5">Status & Validade</th>
                    <th className="px-5 py-3.5 text-right">Faturamento / Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {referralsFiltrados.map((ref) => {
                    const isConv = ref.status === 'CONVERTED' || ref.conversions?.length > 0
                    const isExp = new Date(ref.expiresAt) < new Date() && !isConv
                    const conv = ref.conversions?.[0]

                    return (
                      <tr key={ref.id} className="hover:bg-white/[0.02] transition">
                        <td className="px-5 py-4 font-mono font-bold text-teal-300">
                          {ref.referralCode}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">🐾</span>
                            <div>
                              <p className="font-bold text-white">{ref.pet?.nome || 'Pet'}</p>
                              <p className="text-xs text-slate-400">{ref.tutor?.nome || 'Tutor'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-200">{ref.service?.name || 'Consulta / Procedimento'}</p>
                          {ref.reason && <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{ref.reason}</p>}
                        </td>
                        <td className="px-5 py-4 text-slate-300 font-medium">
                          {ref.unit?.name || 'Principal'}
                        </td>
                        <td className="px-5 py-4">
                          {isConv ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                              <CheckCircle2 size={12} />
                              Atendido
                            </span>
                          ) : isExp ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 border border-red-500/30 px-2.5 py-1 text-[11px] font-bold text-red-300">
                              <Clock size={12} />
                              Expirado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[11px] font-bold text-amber-300">
                              <Clock size={12} />
                              Válido até {new Date(ref.expiresAt).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {isConv && conv ? (
                            <div>
                              <span className="font-bold text-emerald-400">
                                {Number(conv.grossAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                              <p className="text-[10px] text-slate-400">
                                Comis: {Number(conv.commissionAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                            </div>
                          ) : !isExp ? (
                            <button
                              type="button"
                              onClick={() => abrirModalComCodigo(ref.referralCode)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 px-3 py-1.5 text-xs font-black transition shadow-sm"
                            >
                              <span>Atender & Faturar</span>
                              <ArrowUpRight size={13} />
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Validação de Voucher */}
      <ValidarVoucherModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setSelectedCode('')
        }}
        partnerId={selectedPartner?.id}
        initialCode={selectedCode}
        onConversionSuccess={() => {
          if (selectedPartner?.id) {
            carregarIndicacoes(selectedPartner.id)
          }
        }}
      />
    </ParceiroShell>
  )
}
