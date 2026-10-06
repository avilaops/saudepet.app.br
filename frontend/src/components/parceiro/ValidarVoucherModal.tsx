import { useState, useEffect, type FormEvent } from 'react'
import type { ApiPayload } from '../../types/api'
import api from '../../services/api'
import {
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  DollarSign,
  Receipt,
  FileCheck,
  User,
  Phone,
  Sparkles,
  ArrowRight
} from 'lucide-react'

interface ValidarVoucherModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId?: string
  initialCode?: string
  onConversionSuccess?: () => void
}

export default function ValidarVoucherModal({
  isOpen,
  onClose,
  partnerId,
  initialCode = '',
  onConversionSuccess
}: ValidarVoucherModalProps) {
  const [codigo, setCodigo] = useState(initialCode)
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState('')
  const [referralData, setReferralData] = useState<ApiPayload | null>(null)

  // Formulário de Conversão
  const [valorBruto, setValorBruto] = useState('')
  const [desconto, setDesconto] = useState('0')
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')
  const [sucesso, setSucesso] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSucesso(false)
      setErroSalvar('')
      setErroBusca('')
      if (initialCode) {
        setCodigo(initialCode)
        validarCodigo(initialCode)
      } else {
        setReferralData(null)
        setValorBruto('')
      }
    }
  }, [isOpen, initialCode])

  const validarCodigo = async (cod: string) => {
    const limpo = cod.trim().toUpperCase()
    if (!limpo) return

    setBuscando(true)
    setErroBusca('')
    setReferralData(null)
    setSucesso(false)

    try {
      // Extrair código se colou o JSON completo do QR Code
      let codFinal = limpo
      if (limpo.startsWith('{') && limpo.includes('"code"')) {
        try {
          const parsed = JSON.parse(limpo)
          if (parsed.code) codFinal = parsed.code
        } catch {
          // ignora
        }
      }

      const { data } = await api.get(`/v1/referrals/validate/${encodeURIComponent(codFinal)}`, {
        params: { partnerId }
      })

      if (data.success && data.referral) {
        setReferralData(data.referral)
        // Sugerir preço de tabela se houver
        if (data.referral.service?.publicPrice) {
          setValorBruto(String(data.referral.service.publicPrice))
        }
      } else {
        setErroBusca('Voucher não encontrado.')
      }
    } catch (requestError: any) {
      setErroBusca(requestError.response?.data?.error || 'Não foi possível validar o código.')
    } finally {
      setBuscando(false)
    }
  }

  const handleBuscar = (e: FormEvent) => {
    e.preventDefault()
    validarCodigo(codigo)
  }

  // Cálculos dinâmicos em tela
  const brutoNum = parseFloat(valorBruto.replace(',', '.')) || 0
  const descontoNum = parseFloat(desconto.replace(',', '.')) || 0
  const elegivelNum = Math.max(0, brutoNum - descontoNum)

  const previewRegra = referralData?.commissionPreview || { type: 'PERCENTAGE', percentage: 10, fixed: 0 }
  let comissaoCalculada = 0
  if (previewRegra.type === 'PERCENTAGE') {
    comissaoCalculada = (elegivelNum * previewRegra.percentage) / 100
  } else if (previewRegra.type === 'FIXED') {
    comissaoCalculada = previewRegra.fixed
  } else {
    comissaoCalculada = (elegivelNum * previewRegra.percentage) / 100 + previewRegra.fixed
  }

  const liquidoParceiro = Math.max(0, elegivelNum - comissaoCalculada)

  const handleConfirmarAtendimento = async (e: FormEvent) => {
    e.preventDefault()
    if (!referralData?.id) return
    if (brutoNum <= 0) {
      setErroSalvar('Informe o valor bruto total do serviço realizado.')
      return
    }

    setSalvando(true)
    setErroSalvar('')

    try {
      const { data } = await api.post(`/v1/referrals/${referralData.id}/register-conversion`, {
        grossAmount: brutoNum,
        discountAmount: descontoNum
      })

      if (data.success) {
        setSucesso(true)
        onConversionSuccess?.()
      }
    } catch (requestError: any) {
      setErroSalvar(requestError.response?.data?.error || 'Erro ao registrar atendimento.')
    } finally {
      setSalvando(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#121b24] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <Receipt size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-white">Validador de Voucher & Balcão</h2>
              <p className="text-xs text-slate-400">Verifique a indicação e registre o faturamento do atendimento</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Input de Busca do Código */}
          <form onSubmit={handleBuscar} className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
              Código do Voucher ou Leitor QR
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  placeholder="Ex: SP-2026-X89A"
                  className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-mono font-bold text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={buscando || !codigo.trim()}
                className="flex items-center gap-2 rounded-2xl bg-teal-500 px-5 py-3 text-xs font-black text-slate-950 hover:bg-teal-400 disabled:opacity-50 transition shadow-lg shadow-teal-500/20"
              >
                {buscando ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                ) : (
                  <>
                    <Search size={16} />
                    <span>Verificar</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {erroBusca && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300 flex items-start gap-3">
              <AlertTriangle size={18} className="shrink-0 text-red-400" />
              <span>{erroBusca}</span>
            </div>
          )}

          {/* Resultado da Validação */}
          {referralData && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
              {/* Card de Identificação */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Voucher</span>
                    <p className="font-mono text-base font-black text-teal-300">{referralData.referralCode}</p>
                  </div>

                  {referralData.isConverted ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-300">
                      <CheckCircle2 size={13} />
                      Já Atendido
                    </span>
                  ) : referralData.isExpired ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-red-500/20 border border-red-500/30 px-3 py-1 text-xs font-bold text-red-300">
                      <Clock size={13} />
                      Expirado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-full bg-teal-500/20 border border-teal-500/30 px-3 py-1 text-xs font-bold text-teal-300 animate-pulse">
                      <Sparkles size={13} />
                      Válido para Atendimento
                    </span>
                  )}
                </div>

                {/* Pet & Tutor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-300 text-lg font-bold border border-teal-500/20">
                      🐾
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{referralData.pet?.nome || 'Pet'}</p>
                      <p className="text-[11px] text-slate-400 capitalize truncate">
                        {referralData.pet?.especie || 'Pet'} {referralData.pet?.raca ? `· ${referralData.pet.raca}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-300 border border-white/10">
                      <User size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{referralData.tutor?.nome || 'Tutor'}</p>
                      <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                        <Phone size={10} /> {referralData.tutor?.telefone || 'Sem telefone'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Serviço Indicado & Motivo */}
                <div className="rounded-xl bg-black/20 p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Serviço Indicado:</span>
                    <span className="font-bold text-slate-200">{referralData.service?.name || 'Consulta Geral / Exame'}</span>
                  </div>
                  {referralData.reason && (
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Queixa/Motivo:</span>
                      <span className="italic text-slate-300 max-w-[280px] text-right truncate">{referralData.reason}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Formulário de Registro de Atendimento */}
              {referralData.canConvert && !sucesso && (
                <form onSubmit={handleConfirmarAtendimento} className="space-y-4 pt-2">
                  <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4 space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-teal-400 flex items-center gap-2">
                      <DollarSign size={15} />
                      Registro de Faturamento do Balcão
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          Valor Bruto Cobrado (R$) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          required
                          value={valorBruto}
                          onChange={(e) => setValorBruto(e.target.value)}
                          placeholder="0,00"
                          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-bold text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          Desconto Aplicado (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={desconto}
                          onChange={(e) => setDesconto(e.target.value)}
                          placeholder="0,00"
                          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-bold text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Simulação Transparente da Comissão */}
                    <div className="rounded-xl bg-black/40 p-3.5 border border-white/5 space-y-2">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Base de Cálculo (Bruto − Desconto):</span>
                        <span className="font-semibold text-slate-200">
                          {elegivelNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-amber-400/90">
                        <span>Taxa de Comissão Saúde Pet ({previewRegra.percentage}%):</span>
                        <span className="font-bold">
                          - {comissaoCalculada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                      <div className="border-t border-white/10 pt-2 flex justify-between text-sm">
                        <span className="font-bold text-emerald-400">Líquido do Estabelecimento:</span>
                        <span className="font-black text-emerald-300 text-base">
                          {liquidoParceiro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    </div>

                    {erroSalvar && (
                      <p className="text-xs text-red-400 font-semibold">{erroSalvar}</p>
                    )}

                    <button
                      type="submit"
                      disabled={salvando || brutoNum <= 0}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl bg-teal-500 py-3.5 text-sm font-black text-slate-950 hover:bg-teal-400 disabled:opacity-50 transition shadow-lg shadow-teal-500/20 active:scale-[0.99]"
                    >
                      {salvando ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                      ) : (
                        <>
                          <FileCheck size={18} />
                          <span>Confirmar Atendimento & Registrar Faturamento</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Mensagem de Sucesso */}
              {sucesso && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-3 animate-in zoom-in-95">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 size={28} />
                  </div>
                  <h3 className="text-base font-black text-white">Atendimento Confirmado com Sucesso!</h3>
                  <p className="text-xs text-slate-300 max-w-sm mx-auto">
                    A conversão foi registrada e a comissão de{' '}
                    <strong className="text-white">
                      {comissaoCalculada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </strong>{' '}
                    foi adicionada ao fechamento do período.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl bg-white/10 hover:bg-white/15 px-6 py-2 text-xs font-bold text-white transition"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

