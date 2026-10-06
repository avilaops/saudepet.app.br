import type { ApiPayload } from '../../types/api'
import React, { useState, useEffect } from 'react';
import { DollarSign, ShieldCheck, RefreshCw, Search, Filter, RotateCcw, Activity, ArrowUpRight, CheckCircle2, XCircle, Clock } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function AdminFinanceiroAudit() {
  const [activeTab, setActiveTab] = useState('payments'); // 'payments' | 'webhooks'
  const [payments, setPayments] = useState<ApiPayload[]>([]);
  const [webhooks, setWebhooks] = useState<ApiPayload[]>([]);
  const [resumo, setResumo] = useState<ApiPayload>({ totalAprovados: 0, faturamentoTotalBruto: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  // Refund Modal State
  const [selectedPayment, setSelectedPayment] = useState<ApiPayload | null>(null);
  const [refundReason, setRefundReason] = useState('');
  // Estorno parcial: o backend e o gateway aceitam `amount` desde sempre e a
  // tela nunca mandava — todo estorno era total, mesmo quando só parte do
  // serviço tinha sido prestada.
  const [refundAmount, setRefundAmount] = useState('');
  const [reprocessando, setReprocessando] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [feedback, setFeedback] = useState<ApiPayload | null>(null); // { tone: 'ok'|'erro', text }
  const notify = (tone: string, text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };


  useEffect(() => {
    if (activeTab === 'payments') {
      fetchPayments();
    } else {
      fetchWebhooks();
    }
  }, [activeTab, statusFilter]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const queryParams = new URLSearchParams();
      if (statusFilter) queryParams.append('status', statusFilter);
      if (search) queryParams.append('search', search);

      const res = await fetch(`${API_URL}/v1/admin/financeiro/transacoes?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setPayments(data.payments || []);
      setResumo(data.resumo || { totalAprovados: 0, faturamentoTotalBruto: 0 });
    } catch (err: any) {
      console.error('Erro ao carregar auditoria de pagamentos:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/financeiro/webhooks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setWebhooks(data.webhooks || []);
    } catch (err: any) {
      console.error('Erro ao carregar log de webhooks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteRefund = async () => {
    if (!selectedPayment) return;
    try {
      setSubmittingRefund(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/financeiro/estorno/${selectedPayment.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          reason: refundReason,
          amount: refundAmount.trim() ? Number(refundAmount.replace(',', '.')) : undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        notify('ok', 'Estorno executado no gateway de pagamento e registrado no banco!');
        setSelectedPayment(null);
        setRefundReason('');
        setRefundAmount('');
        fetchPayments();
      } else {
        notify('erro', data.error || data.message || 'Não foi possível executar o estorno.');
      }
    } catch (err: any) {
      console.error('Erro ao solicitar estorno:', err);
      notify('erro', 'Falha de conexão ao solicitar o estorno. Tente novamente.');
    } finally {
      setSubmittingRefund(false);
    }
  };

  // Webhook perdido travava o pagamento até alguém abrir o banco: o gateway
  // confirmava, a nossa ponta falhava, e o tutor via "aguardando pagamento" de
  // algo que ele já tinha pago. A aba só sabia mostrar a falha.
  const reprocessarWebhook = async (evento: any) => {
    setReprocessando(evento.id);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/financeiro/webhooks/${evento.id}/reprocessar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        notify('ok', `Webhook reprocessado: ${data.resultado?.status || 'concluído'}.`);
        fetchWebhooks();
      } else {
        notify('erro', data.error || data.message || 'Não foi possível reprocessar o evento.');
      }
    } catch (err: any) {
      console.error('Erro ao reprocessar webhook:', err);
      notify('erro', 'Falha de conexão ao reprocessar o evento.');
    } finally {
      setReprocessando('');
    }
  };

  // Somas reais dos splits registrados nas transações listadas.
  // Nada é estimado no cliente: quando não há split gravado, o valor não entra na soma.
  const somaSplits = payments.reduce(
    (acc, p) => {
      const splits = p.splits || [];
      const plat = splits.find((s: ApiPayload) => s.recipient_type === 'PLATFORM');
      const vet = splits.find((s: ApiPayload) => s.recipient_type === 'VETERINARIAN');
      if (plat && plat.platform_fee != null) {
        acc.plataforma += Number(plat.platform_fee) || 0;
        acc.temSplitPlataforma = true;
      }
      if (vet && vet.recipient_amount != null) {
        acc.veterinarios += Number(vet.recipient_amount) || 0;
        acc.temSplitVet = true;
      }
      return acc;
    },
    { plataforma: 0, veterinarios: 0, temSplitPlataforma: false, temSplitVet: false }
  );

  return (
    <>
      <div className="space-y-8">
        {feedback && (
          <div
            className={`p-4 rounded-2xl border text-xs font-bold ${
              feedback.tone === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
            role="status"
          >
            {feedback.text}
          </div>
        )}


        
        {/* Header Superior */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600">Torre de Controle Financeira</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Conciliação, Splits & Auditoria de Pagamentos</h1>
            <p className="text-xs text-slate-500 mt-0.5">Monitore receita bruta, comissão da plataforma Saúde PET, splits de veterinários e eventos de webhooks.</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition ${activeTab === 'payments' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}
            >
              Transações & Splits
            </button>
            <button
              onClick={() => setActiveTab('webhooks')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition ${activeTab === 'webhooks' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}
            >
              Logs de Webhooks de Pagamento
            </button>
          </div>
        </div>

        {/* Métricas Consolidadas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Faturamento Total Bruto</span>
            <div className="text-3xl font-black text-slate-900">
              R$ {Number(resumo.faturamentoTotalBruto || 0).toFixed(2)}
            </div>
            <span className="text-[11px] text-slate-500 block">Total transacionado na plataforma</span>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Receita da Plataforma</span>
            <div className="text-3xl font-black text-emerald-600">
              {somaSplits.temSplitPlataforma ? `R$ ${somaSplits.plataforma.toFixed(2)}` : '—'}
            </div>
            <span className="text-[11px] text-emerald-700 block">
              {somaSplits.temSplitPlataforma ? 'Soma das comissões registradas nos splits listados' : 'sem split registrado'}
            </span>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-teal-600 uppercase tracking-wider">Repasses a Veterinários</span>
            <div className="text-3xl font-black text-teal-600">
              {somaSplits.temSplitVet ? `R$ ${somaSplits.veterinarios.toFixed(2)}` : '—'}
            </div>
            <span className="text-[11px] text-teal-700 block">
              {somaSplits.temSplitVet ? 'Soma dos repasses registrados nos splits listados' : 'sem split registrado'}
            </span>
          </div>
        </div>

        {/* TAB 1: TRANSAÇÕES E SPLITS */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            
            {/* Filtros */}
            <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: '', label: 'Todos' },
                  { id: 'PAID', label: 'Aprovados' },
                  { id: 'PENDING', label: 'Pendentes' },
                  { id: 'EXPIRED', label: 'Expirados' },
                  { id: 'REFUNDED', label: 'Estornados' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    className={`px-4 py-2 rounded-xl font-bold text-xs transition ${statusFilter === f.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); fetchPayments(); }}
                className="flex gap-2 w-full sm:w-auto items-center"
              >
                <input
                  type="text"
                  placeholder="Buscar por ID do pagamento..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 w-full sm:w-56"
                />
                <button type="submit" className="p-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0">
                  <Search className="w-4 h-4" /> Buscar
                </button>
                <button type="button" onClick={fetchPayments} className="p-2.5 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0">
                  <RefreshCw className="w-4 h-4" /> Atualizar
                </button>
              </form>
            </div>

            {/* Tabela de Transações */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-12 text-center text-xs font-bold text-slate-400">Carregando conciliação financeira...</div>
              ) : payments.length === 0 ? (
                <div className="p-12 text-center text-xs font-bold text-slate-400">Nenhuma transação encontrada nesta categoria.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                        <th className="p-4">Pagamento ID</th>
                        <th className="p-4">Método</th>
                        <th className="p-4">Valor Bruto</th>
                        <th className="p-4">Split Plataforma</th>
                        <th className="p-4">Split Vet</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                      {payments.map((p) => {
                        const splitPlataforma = (p.splits || []).find((s: ApiPayload) => s.recipient_type === 'PLATFORM');
                        const splitVet = (p.splits || []).find((s: ApiPayload) => s.recipient_type === 'VETERINARIAN');

                        return (
                          <tr key={p.id} className="hover:bg-slate-50 transition">
                            <td className="p-4 font-mono font-bold text-slate-900">
                              #{p.id.slice(0, 8)}
                              <div className="text-[10px] text-slate-400 font-sans">{new Date(p.criado_em).toLocaleDateString('pt-BR')}</div>
                            </td>
                            <td className="p-4 font-bold text-slate-800">{p.method}</td>
                            <td className="p-4 font-extrabold text-slate-900">R$ {Number(p.amount).toFixed(2)}</td>
                            <td className="p-4 text-emerald-600 font-bold">
                              {splitPlataforma && splitPlataforma.platform_fee != null ? `R$ ${Number(splitPlataforma.platform_fee).toFixed(2)}` : '—'}
                            </td>
                            <td className="p-4 text-teal-600 font-bold">
                              {splitVet && splitVet.recipient_amount != null ? `R$ ${Number(splitVet.recipient_amount).toFixed(2)}` : '—'}
                            </td>
                            <td className="p-4">
                              <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${p.status === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : p.status === 'REFUNDED' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                {p.status}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              {p.status === 'PAID' && (
                                <button
                                  onClick={() => setSelectedPayment(p)}
                                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl border border-red-200 transition"
                                >
                                  Estornar
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: LOGS DE WEBHOOKS */}
        {activeTab === 'webhooks' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Logs de Eventos Recebidos do Gateway</h3>
                <p className="text-xs text-slate-500">Histórico de idempotência e processamento de webhooks em tempo real.</p>
              </div>
              <button onClick={fetchWebhooks} className="p-2.5 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" /> Atualizar Logs
              </button>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs font-bold text-slate-400">Carregando logs de eventos...</div>
            ) : webhooks.length === 0 ? (
              <div className="py-12 text-center text-xs font-bold text-slate-400">Nenhum evento de webhook registrado.</div>
            ) : (
              <div className="space-y-3">
                {webhooks.map((w) => (
                  <div key={w.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-slate-900">{w.event_type}</span>
                      <span className={`px-2.5 py-0.5 font-bold text-[10px] rounded-full border ${w.processing_status === 'PROCESSED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {w.processing_status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">Event ID: {w.external_event_id} • Recebido em: {new Date(w.received_at).toLocaleString('pt-BR')}</p>
                    {w.last_error && (
                      <p className="text-[11px] font-medium text-red-600">Erro: {w.last_error}</p>
                    )}
                    {w.processing_status !== 'PROCESSED' && (
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          onClick={() => reprocessarWebhook(w)}
                          disabled={reprocessando === w.id}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {reprocessando === w.id ? 'Reprocessando…' : 'Reprocessar'}
                        </button>
                        <span className="text-[10px] font-bold text-slate-400">
                          {w.attempts || 0} tentativa{(w.attempts || 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* MODAL DE ESTORNO ADMINISTRATIVO */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Solicitar Estorno do Pagamento</h3>
              <button onClick={() => setSelectedPayment(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p>Pagamento: <strong className="font-mono">#{selectedPayment.id.slice(0, 8)}</strong></p>
              <p>Valor Total: <strong>R$ {Number(selectedPayment.amount).toFixed(2)}</strong></p>
              
              <div>
                <label className="block font-bold text-slate-700 mb-1">Valor a estornar</label>
                <input
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder={`Total (R$ ${Number(selectedPayment.amount).toFixed(2)})`}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
                <p className="mt-1 text-[10px] font-medium text-slate-400">
                  Deixe em branco para devolver tudo. Estornos parciais somados nunca passam do valor pago.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motivo do Estorno</label>
                <textarea
                  rows={3}
                  placeholder="Informe a justificativa técnica ou comercial do estorno..."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="py-3 px-4 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteRefund}
                disabled={submittingRefund || refundReason.trim().length < 5}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50"
              >
                {submittingRefund ? 'Executando Estorno...' : 'Confirmar Estorno no Gateway'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
