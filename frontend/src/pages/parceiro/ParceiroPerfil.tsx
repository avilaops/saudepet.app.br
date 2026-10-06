import { useState, useEffect, useCallback } from 'react'
import type { ApiPayload } from '../../types/api'
import api from '../../services/api'
import ParceiroShell from '../../components/parceiro/ParceiroShell'
import {
  Building2,
  MapPin,
  Phone,
  Clock,
  Stethoscope,
  CheckCircle2,
  Plus,
  ShieldCheck,
  AlertCircle
} from 'lucide-react'

export default function ParceiroPerfil() {
  const [partners, setPartners] = useState<ApiPayload[]>([])
  const [selectedPartner, setSelectedPartner] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)

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
      console.error('Erro ao carregar perfil:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregarParceiros()
  }, [carregarParceiros])

  return (
    <ParceiroShell
      partners={partners}
      selectedPartner={selectedPartner}
      onSelectPartner={(p) => setSelectedPartner(p)}
    >
      <div className="space-y-8 max-w-4xl">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Meu Estabelecimento & Unidades</h1>
          <p className="text-xs text-slate-400">
            Gerencie os dados cadastrais, unidades de atendimento e tabela de serviços do seu credenciamento.
          </p>
        </div>

        {selectedPartner && (
          <div className="space-y-6">
            {/* Card Principal */}
            <div className="rounded-3xl border border-white/10 bg-[#121b24] p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-300 font-black text-xl">
                    {selectedPartner.tradeName?.slice(0, 2).toUpperCase() || 'SP'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-white">{selectedPartner.tradeName}</h2>
                      <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                        Credenciado
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{selectedPartner.legalName}</p>
                    <p className="text-[11px] font-mono text-slate-500">CNPJ: {selectedPartner.documentNumber}</p>
                  </div>
                </div>
              </div>

              {/* Informações de Contato */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">E-mail</span>
                  <p className="text-xs font-semibold text-slate-200 mt-1 truncate">{selectedPartner.email}</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Telefone</span>
                  <p className="text-xs font-semibold text-slate-200 mt-1">{selectedPartner.phone}</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">WhatsApp Plantão</span>
                  <p className="text-xs font-semibold text-teal-400 mt-1">{selectedPartner.whatsapp || 'Não cadastrado'}</p>
                </div>
              </div>
            </div>

            {/* Unidades de Atendimento */}
            <div className="rounded-3xl border border-white/10 bg-[#121b24] p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-teal-400" />
                  <h3 className="text-sm font-black text-white">Unidades de Atendimento</h3>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {selectedPartner.units?.length || 0} unidades
                </span>
              </div>

              <div className="space-y-3">
                {selectedPartner.units?.map((unit: any) => (
                  <div key={unit.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-white">{unit.name}</p>
                        {unit.emergencyService && (
                          <span className="rounded-full bg-red-500/20 border border-red-500/30 px-2 py-0.5 text-[10px] font-black text-red-300">
                            Plantão 24h
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <MapPin size={12} className="text-slate-500" />
                        {unit.addressLine}, {unit.addressNumber} {unit.complement ? `· ${unit.complement}` : ''} — {unit.district}, {unit.city}/{unit.state}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Serviços & Procedimentos Cadastrados */}
            <div className="rounded-3xl border border-white/10 bg-[#121b24] p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Stethoscope size={18} className="text-teal-400" />
                  <h3 className="text-sm font-black text-white">Serviços & Procedimentos Ativos</h3>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {selectedPartner.services?.length || 0} serviços
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedPartner.services?.map((srv: any) => (
                  <div key={srv.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-white">{srv.name}</p>
                      <p className="text-[11px] text-slate-400">{srv.category?.name || 'Geral'}</p>
                    </div>
                    <span className="text-xs font-black text-teal-400">
                      {Number(srv.publicPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </ParceiroShell>
  )
}
