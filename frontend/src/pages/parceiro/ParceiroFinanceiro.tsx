import { useState, useEffect, useCallback } from 'react'
import type { ApiPayload } from '../../types/api'
import api from '../../services/api'
import ParceiroShell from '../../components/parceiro/ParceiroShell'
import {
  Receipt,
  DollarSign,
  TrendingUp,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Download,
  Calendar,
  Layers,
  ArrowDownRight
} from 'lucide-react'

export default function ParceiroFinanceiro() {
  const [partners, setPartners] = useState<ApiPayload[]>([])
  const [selectedPartner, setSelectedPartner] = useState<ApiPayload | null>(null)
  const [referrals, setReferrals] = useState<ApiPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [pixCopiado, setPixCopiado] = useState(false)

  const carregarParceiros = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/v1/partners/my')
      const lista = Array.isArray(data?.partners) ? data.partners : []
      setPartners(lista)
      if (lista.length > 0) {
        setSelectedPartner((prev: ApiPayload | null) => prev || lista[0])
      }
    } catch (err) {
      console.error('Erro ao carregar parceiros:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const carregarDadosFinanceiros = useCallback(async (partnerId: string) => {
    try {
      const { data } = await api.get(`/v1/referrals/partner/${partnerId}?status=CONVERTED`)
      setReferrals(Array.isArray(data?.referrals) ? data.referrals : [])
    } catch (err) {
      console.error('Erro ao carregar financeiro:', err)
      setReferrals([])
    }
  }, [])

  useEffect(() => {
    carregarParceiros()
  }, [carregarParceiros])

  useEffect(() => {
    if (selectedPartner?.id) {
      carregarDadosFinanceiros(selectedPartner.id)
    }
  }, [selectedPartner, carregarDadosFinanceiros])

  // Cálculos financeiros
  const conversions = referrals
    .filter((r) => r.conversions && r.conversions.length > 0)
    .map((r) => ({
      ...r.conversions[0],
      referralCode: r.referralCode,
      pet: r.pet,
      tutor: r.tutor,
      service: r.service,
      unit: r.unit
    }))

  const totalBruto = conversions.reduce((acc, c) => acc + Number(c.grossAmount || 0), 0)
  const totalComissoes = conversions.reduce((acc, c) => acc + Number(c.commissionAmount || 0), 0)
  const totalLiquido = totalBruto - totalComissoes

  const copiarChavePix = () => {
    navigator.clipboard.writeText('financeiro@saudepet.app.br')
    setPixCopiado(true)
    setTimeout(() => setPixCopiado(false), 3000)
  }

  return (
    <ParceiroShell
      partners={partners}
      selectedPartner={selectedPartner}
      onSelectPartner={(p) => setSelectedPartner(p)}
    >
      <div className="space-y-8">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Extrato Financeiro & Fechamentos</h1>
            <p className="text-xs text-slate-400">
              Acompanhe o faturamento gerado por indicações e a prestação de contas mensal da plataforma.
            </p>
          </div>
        </div>

        {/* Resumo Consolidado */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-3xl border border-white/10 bg-[#121b24] p-6 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-extrabold uppercase tracking-wider">Total Faturado no Balcão</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300">
                <TrendingUp size={18} />
              </div>
            </div>
            <p className="text-3xl font-black text-white">
              {totalBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-slate-400">Recebido diretamente pelo estabelecimento</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#121b24] p-6 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-extrabold uppercase tracking-wider">Líquido do Estabelecimento</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                <DollarSign size={18} />
              </div>
            </div>
            <p className="text-3xl font-black text-emerald-300">
              {totalLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-slate-400">Receita retida pelo parceiro</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#121b24] p-6 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-extrabold uppercase tracking-wider">Comissão Devida à Plataforma</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300">
                <FileCheck size={18} />
              </div>
            </div>
            <p className="text-3xl font-black text-purple-300">
              {totalComissoes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-slate-400">Consolidado para o fechamento mensal</p>
          </div>
        </div>

        {/* Card de Liquidação & Pix da Plataforma */}
        <div className="rounded-3xl border border-teal-500/30 bg-gradient-to-r from-teal-950/30 via-[#121b24] to-[#121b24] p-6 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2 text-teal-400 text-xs font-black uppercase tracking-wider">
              <Receipt size={16} />
              <span>Como funciona a liquidação mensal</span>
            </div>
            <h3 className="text-base font-bold text-white">Prestação de Contas & Repasse de Comissão</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Como o tutor paga diretamente na sua recepção, os fechamentos de comissão são consolidados no final de cada mês. Você recebe o espelho detalhado e pode quitar o repasse via Pix.
            </p>
          </div>

          <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="rounded-2xl border border-white/15 bg-black/40 px-4 py-2.5 text-xs font-mono text-slate-300 flex items-center justify-between gap-3">
              <span className="truncate">financeiro@saudepet.app.br</span>
              <button
                type="button"
                onClick={copiarChavePix}
                className="text-teal-400 hover:text-teal-300 font-sans font-bold text-xs shrink-0 flex items-center gap-1"
              >
                {pixCopiado ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{pixCopiado ? 'Copiado!' : 'Copiar Pix'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Extrato Detalhado de Conversões */}
        <div className="rounded-3xl border border-white/10 bg-[#121b24] shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-white">Histórico de Atendimentos Faturados</h3>
              <p className="text-xs text-slate-400">Detalhamento de cada indicação convertida e comissão apurada</p>
            </div>
            <span className="rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300">
              {conversions.length} atendimentos
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent mx-auto" />
            </div>
          ) : conversions.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-bold text-slate-300">Nenhum faturamento registrado ainda</p>
              <p className="text-xs text-slate-500">
                Os atendimentos confirmados no balcão aparecerão neste extrato.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-slate-400 uppercase tracking-wider font-extrabold text-[10px]">
                    <th className="px-5 py-3.5">Data / Voucher</th>
                    <th className="px-5 py-3.5">Paciente & Tutor</th>
                    <th className="px-5 py-3.5">Serviço Realizado</th>
                    <th className="px-5 py-3.5 text-right">Valor Bruto</th>
                    <th className="px-5 py-3.5 text-right">Comissão Saúde Pet</th>
                    <th className="px-5 py-3.5 text-right">Líquido do Parceiro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {conversions.map((conv: any) => (
                    <tr key={conv.id} className="hover:bg-white/[0.02] transition">
                      <td className="px-5 py-4">
                        <p className="font-mono font-bold text-teal-300">{conv.referralCode}</p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(conv.confirmedAt).toLocaleString('pt-BR')}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold text-white">{conv.pet?.nome || 'Pet'}</p>
                        <p className="text-[11px] text-slate-400">{conv.tutor?.nome || 'Tutor'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-200">{conv.service?.name || 'Consulta / Exame'}</p>
                        <p className="text-[10px] text-slate-400">{conv.unit?.name || 'Unidade Principal'}</p>
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-white">
                        {Number(conv.grossAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-purple-300">
                        {Number(conv.commissionAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-5 py-4 text-right font-black text-emerald-300">
                        {Number(conv.partnerNetAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ParceiroShell>
  )
}
