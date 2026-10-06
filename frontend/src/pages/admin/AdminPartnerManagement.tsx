import type { ApiPayload } from '../../types/api'
import React, { useState, useEffect } from 'react';
import { Building2, CheckCircle, XCircle, DollarSign, ShieldAlert, Plus, Percent, Filter, RefreshCw, FileText, MapPin, Stethoscope, Calculator, Ban } from 'lucide-react';
import api from '../../services/api';

// Períodos prontos para o fechamento — mês passado é o caso de sempre.
function periodoDoMes(deslocamento = 0) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento + 1, 0);
  const iso = (data: any) => data.toISOString().slice(0, 10);
  return { periodStart: iso(inicio), periodEnd: iso(fim) };
}

const dinheiro = (valor: any) =>
  Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ROTULO_SETTLEMENT: Record<string, string> = {
  OPEN: 'Em aberto',
  PENDING_REVIEW: 'Em revisão',
  APPROVED: 'Aprovado',
  DUE: 'A vencer',
  PAID: 'Pago',
  OVERDUE: 'Vencido',
  CANCELLED: 'Cancelado',
  DISPUTED: 'Em disputa'
};

const TIPOS_DE_PARCEIRO = [
  ['CLINIC', 'Clínica'],
  ['HOSPITAL', 'Hospital'],
  ['LABORATORY', 'Laboratório'],
  ['DIAGNOSTIC_CENTER', 'Centro de diagnóstico'],
  ['PHARMACY', 'Farmácia'],
  ['PET_SHOP', 'Pet shop'],
  ['REHABILITATION', 'Reabilitação'],
  ['OTHER', 'Outro']
];

const ROTULO_APROVACAO: Record<string, string[]> = {
  APPROVED: ['Aprovado', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  PENDING: ['Aguardando análise', 'bg-amber-50 text-amber-700 border-amber-200'],
  REJECTED: ['Rejeitado', 'bg-red-50 text-red-700 border-red-200']
};

export default function AdminPartnerManagement() {
  const [activeTab, setActiveTab] = useState('partners');
  const [partners, setPartners] = useState<ApiPayload[]>([]);
  const [rules, setRules] = useState<ApiPayload[]>([]);
  const [settlements, setSettlements] = useState<ApiPayload[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal nova regra de comissão
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [feedback, setFeedback] = useState<ApiPayload | null>(null);
  const notify = (tone: string, text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };

  const ruleFormVazio = () => ({
    name: '',
    calculationType: 'PERCENTAGE',
    percentage: '10',
    fixedAmount: '0'
  });
  const [ruleForm, setRuleForm] = useState(ruleFormVazio());

  // Cadastro de parceiro: as rotas `POST /partners`, `/:id/units` e
  // `/:id/services` existiam e não havia NENHUMA tela que as usasse. O painel só
  // sabia aprovar o que não se conseguia criar — a rede de parceiros só podia
  // ser semeada por script.
  const parceiroVazio = () => ({
    legalName: '', tradeName: '', documentNumber: '', partnerType: 'CLINIC',
    email: '', phone: '', whatsapp: '', website: '', description: ''
  });
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [partnerForm, setPartnerForm] = useState(parceiroVazio());
  const [salvandoParceiro, setSalvandoParceiro] = useState(false);

  // Gestão de um parceiro: unidades e serviços.
  const [detalhe, setDetalhe] = useState<ApiPayload | null>(null); // { partner, units, services }
  const [categorias, setCategorias] = useState<ApiPayload[]>([]);
  const unidadeVazia = () => ({
    name: '', phone: '', whatsapp: '', addressLine: '', addressNumber: '',
    complement: '', district: '', city: '', state: '', postalCode: '', emergencyService: false
  });
  const servicoVazio = () => ({ name: '', categoryId: '', publicPrice: '', priceType: 'FIXED', estimatedDuration: '30' });
  const [unidadeForm, setUnidadeForm] = useState(unidadeVazia());
  const [servicoForm, setServicoForm] = useState(servicoVazio());
  const [salvandoFilho, setSalvandoFilho] = useState('');

  // Fechamento de comissão: `CommissionSettlement` nunca era criado por
  // ninguém, então a aba de liquidações era estruturalmente vazia.
  const [periodo, setPeriodo] = useState(periodoDoMes(-1));
  const [gerando, setGerando] = useState(false);
  const [totalAReceber, setTotalAReceber] = useState(0);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);

      if (activeTab === 'partners') {
        // Fila administrativa: lista todos os parceiros do tenant, em qualquer status.
        const { data } = await api.get('/v1/partners', { params: { limit: 50 } });
        if (data.success) setPartners(data.partners || []);
      } else if (activeTab === 'rules') {
        const { data } = await api.get('/v1/commissions/rules');
        if (data.success) setRules(data.rules || []);
      } else if (activeTab === 'settlements') {
        const { data } = await api.get('/v1/commissions/settlements', { params: { status: 'todos' } });
        if (data.success) {
          setSettlements(data.settlements || []);
          setTotalAReceber(data.total_a_receber || 0);
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados administrativos:', err);
      notify('erro', 'Não foi possível carregar os dados administrativos.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePartner = async (partnerId: ApiPayload, approve: ApiPayload) => {
    try {
      const { data } = await api.post(`/v1/partners/${partnerId}/approve`, { approve });
      if (data.success) {
        notify('ok', approve ? 'Parceiro aprovado e ativado com sucesso!' : 'Cadastro de parceiro rejeitado.');
        loadData();
      } else {
        notify('erro', data.message || data.error || 'Não foi possível processar a aprovação.');
      }
    } catch (err: any) {
      console.error('Erro ao aprovar parceiro:', err);
      notify('erro', err.response?.data?.message || err.response?.data?.error || 'Falha ao processar a aprovação do parceiro.');
    }
  };

  const criarParceiro = async (event: any) => {
    event.preventDefault();
    setSalvandoParceiro(true);
    try {
      const { data } = await api.post('/v1/partners', partnerForm);
      if (data.success) {
        notify('ok', 'Parceiro cadastrado. Ele entra na fila de análise.');
        setShowPartnerModal(false);
        setPartnerForm(parceiroVazio());
        loadData();
        abrirDetalhe(data.partner.id);
      }
    } catch (err: any) {
      notify('erro', err.response?.data?.error || err.response?.data?.message || 'Não foi possível cadastrar o parceiro.');
    } finally {
      setSalvandoParceiro(false);
    }
  };

  const abrirDetalhe = async (partnerId: ApiPayload) => {
    try {
      const [detalheResposta, categoriasResposta] = await Promise.all([
        api.get(`/v1/partners/${partnerId}`),
        api.get('/v1/partners/categories')
      ]);
      setDetalhe(detalheResposta.data.partner);
      setCategorias(categoriasResposta.data.categories || []);
      setUnidadeForm(unidadeVazia());
      setServicoForm(servicoVazio());
    } catch (err: any) {
      notify('erro', err.response?.data?.error || 'Não foi possível abrir o parceiro.');
    }
  };

  const adicionarUnidade = async (event: any) => {
    event.preventDefault();
    setSalvandoFilho('unidade');
    try {
      await api.post(`/v1/partners/${detalhe.id}/units`, unidadeForm);
      notify('ok', 'Unidade cadastrada.');
      abrirDetalhe(detalhe.id);
    } catch (err: any) {
      notify('erro', err.response?.data?.error || err.response?.data?.message || 'Não foi possível cadastrar a unidade.');
    } finally {
      setSalvandoFilho('');
    }
  };

  const adicionarServico = async (event: any) => {
    event.preventDefault();
    setSalvandoFilho('servico');
    try {
      await api.post(`/v1/partners/${detalhe.id}/services`, {
        ...servicoForm,
        publicPrice: Number(String(servicoForm.publicPrice).replace(',', '.'))
      });
      notify('ok', 'Serviço cadastrado.');
      abrirDetalhe(detalhe.id);
    } catch (err: any) {
      notify('erro', err.response?.data?.error || err.response?.data?.message || 'Não foi possível cadastrar o serviço.');
    } finally {
      setSalvandoFilho('');
    }
  };

  const gerarFechamentos = async () => {
    setGerando(true);
    try {
      const { data } = await api.post('/v1/commissions/settlements/generate', periodo);
      notify('ok', data.message);
      loadData();
    } catch (err: any) {
      notify('erro', err.response?.data?.error || err.response?.data?.message || 'Não foi possível gerar os fechamentos.');
    } finally {
      setGerando(false);
    }
  };

  const quitarFechamento = async (settlement: ApiPayload) => {
    const referencia = window.prompt(`Confirmar recebimento de ${dinheiro(settlement.commissionAmount)} de ${settlement.partner?.tradeName}?\n\nReferência do pagamento (opcional):`);
    if (referencia === null) return;
    try {
      await api.post(`/v1/commissions/settlements/${settlement.id}/pay`, { paymentReference: referencia || undefined });
      notify('ok', 'Fechamento quitado.');
      loadData();
    } catch (err: any) {
      notify('erro', err.response?.data?.error || err.response?.data?.message || 'Não foi possível quitar o fechamento.');
    }
  };

  const cancelarFechamento = async (settlement: ApiPayload) => {
    const motivo = window.prompt('Motivo do cancelamento (os atendimentos voltam para a fila):');
    if (!motivo) return;
    try {
      await api.post(`/v1/commissions/settlements/${settlement.id}/cancel`, { motivo });
      notify('ok', 'Fechamento cancelado e atendimentos devolvidos à fila.');
      loadData();
    } catch (err: any) {
      notify('erro', err.response?.data?.error || err.response?.data?.message || 'Não foi possível cancelar o fechamento.');
    }
  };

  const handleCreateRule = async (e: any) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/v1/commissions/rules', ruleForm);
      if (data.success) {
        notify('ok', 'Regra de comissão criada com sucesso!');
        setShowRuleModal(false);
        setRuleForm(ruleFormVazio());
        loadData();
      } else {
        notify('erro', data.error || 'Não foi possível criar a regra.');
      }
    } catch (err: any) {
      console.error('Erro ao criar regra de comissão:', err);
      notify('erro', err.response?.data?.error || err.response?.data?.message || 'Falha ao criar a regra de comissão.');
    }
  };

  return (
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


      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-7 h-7 text-emerald-600" />
            Rede de Parceiros & Monetização Dinâmica
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestão de credenciados, regras flexíveis de comissionamento e liquidações financeiras.
          </p>
        </div>

        {/* Abas */}
        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-start">
          <button
            onClick={() => setActiveTab('partners')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeTab === 'partners' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Parceiros Credenciados
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeTab === 'rules' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Regras de Comissão
          </button>
          <button
            onClick={() => setActiveTab('settlements')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${activeTab === 'settlements' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Liquidações & Repasses
          </button>
        </div>
      </div>

      {/* Conteúdo Aba Parceiros */}
      {activeTab === 'partners' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Parceiros Registrados</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPartnerModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> Novo parceiro
                </button>
                <button onClick={loadData} className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg transition">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs animate-pulse">Carregando parceiros...</div>
            ) : partners.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">Nenhum parceiro cadastrado no momento.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {partners.map((partner) => (
                  <div key={partner.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-base">{partner.tradeName}</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-md text-[10px] font-bold uppercase">
                          {TIPOS_DE_PARCEIRO.find(([valor]) => valor === partner.partnerType)?.[1] || partner.partnerType}
                        </span>
                        {/* O estado do cadastro não aparecia em lugar nenhum: os
                            dois botões aparecendo sempre faziam parecer que
                            nenhum parceiro tinha sido analisado ainda. */}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${(ROTULO_APROVACAO[partner.approvalStatus] || ROTULO_APROVACAO.PENDING)[1]}`}>
                          {(ROTULO_APROVACAO[partner.approvalStatus] || ROTULO_APROVACAO.PENDING)[0]}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">CNPJ/CPF: {partner.documentNumber || 'Não especificado'}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => abrirDetalhe(partner.id)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 transition flex items-center gap-1"
                      >
                        <MapPin className="w-3.5 h-3.5" /> Unidades e serviços
                      </button>
                      {partner.approvalStatus !== 'APPROVED' && (
                        <button
                          onClick={() => handleApprovePartner(partner.id, true)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 shadow-sm"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Aprovar
                        </button>
                      )}
                      {partner.approvalStatus !== 'REJECTED' && (
                        <button
                          onClick={() => handleApprovePartner(partner.id, false)}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-lg border border-red-200 transition flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Rejeitar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo Aba Regras de Comissão */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">Motor de Comissionamento Dinâmico</h2>
            <button
              onClick={() => setShowRuleModal(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-md shadow-emerald-600/20"
            >
              <Plus className="w-4 h-4" /> Nova Regra de Comissão
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs animate-pulse">Carregando regras...</div>
            ) : rules.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs space-y-2">
                <Percent className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-bold text-slate-700">Nenhuma regra personalizada cadastrada</p>
                <p className="text-slate-400 max-w-sm mx-auto">
                  A comissão sobre atendimentos convertidos é aplicada conforme a regra configurada. Crie regras customizadas acima.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {rules.map((rule) => (
                  <div key={rule.id} className="p-4 sm:p-6 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{rule.name}</h3>
                      <p className="text-xs text-slate-500">
                        Tipo: <span className="font-semibold text-slate-700">{rule.calculationType}</span> | Comissão: {' '}
                        <span className="font-bold text-emerald-700">
                          {rule.calculationType === 'PERCENTAGE' ? `${rule.percentage}%` : `R$ ${rule.fixedAmount}`}
                        </span>
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${rule.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {rule.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo Aba Liquidações & Repasses */}
      {activeTab === 'settlements' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Fechamentos Financeiros</span>
                <button onClick={loadData} className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg transition">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Geração do fechamento — o elo que faltava. Sem esta ação nada no
                  sistema criava um `CommissionSettlement` e a aba era vazia por
                  construção, não por falta de movimento. */}
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Início do período</span>
                  <input
                    type="date"
                    value={periodo.periodStart}
                    onChange={(e) => setPeriodo({ ...periodo, periodStart: e.target.value })}
                    className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fim do período</span>
                  <input
                    type="date"
                    value={periodo.periodEnd}
                    onChange={(e) => setPeriodo({ ...periodo, periodEnd: e.target.value })}
                    className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  />
                </label>
                <button
                  onClick={gerarFechamentos}
                  disabled={gerando}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 disabled:opacity-50"
                >
                  <Calculator className="w-4 h-4" /> {gerando ? 'Gerando…' : 'Gerar fechamentos do período'}
                </button>
                <p className="text-[11px] font-bold text-slate-400">
                  A receber: <span className="text-slate-700">{dinheiro(totalAReceber)}</span>
                </p>
              </div>
              <p className="text-[11px] text-slate-400">
                Entram só os atendimentos confirmados que ainda não foram fechados — rodar de novo não cobra duas vezes.
              </p>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs animate-pulse">Carregando liquidações...</div>
            ) : settlements.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs space-y-2">
                <DollarSign className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-bold text-slate-700">Nenhuma liquidação registrada</p>
                <p className="text-slate-400 max-w-sm mx-auto">
                  Escolha o período acima e gere os fechamentos: entram os atendimentos que os parceiros
                  confirmaram e que ainda não foram cobrados.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <th className="p-4">Parceiro</th>
                      <th className="p-4">Período</th>
                      <th className="p-4">Movimento</th>
                      <th className="p-4">Comissão a receber</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {settlements.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition">
                        <td className="p-4">
                          <span className="font-bold text-slate-900">{s.partner?.tradeName || '—'}</span>
                          <span className="block text-[11px] font-medium text-slate-400">
                            {s.atendimentos} atendimento{s.atendimentos !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-[11px]">
                          {new Date(s.periodStart).toLocaleDateString('pt-BR')} – {new Date(s.periodEnd).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="p-4">{dinheiro(s.grossAmount)}</td>
                        <td className="p-4 font-extrabold text-slate-900">{dinheiro(s.commissionAmount)}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${
                            s.status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : s.status === 'CANCELLED'
                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {ROTULO_SETTLEMENT[s.status] || s.status}
                          </span>
                        </td>
                        <td className="p-4">
                          {!['PAID', 'CANCELLED'].includes(s.status) && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => quitarFechamento(s)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition flex items-center gap-1"
                              >
                                <CheckCircle className="w-3 h-3" /> Recebido
                              </button>
                              <button
                                onClick={() => cancelarFechamento(s)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold rounded-lg border border-slate-200 transition flex items-center gap-1"
                              >
                                <Ban className="w-3 h-3" /> Cancelar
                              </button>
                            </div>
                          )}
                          {s.paymentReference && s.status === 'PAID' && (
                            <span className="text-[11px] font-medium text-slate-400">{s.paymentReference}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Novo Parceiro
          `POST /partners` existia e nenhuma tela o chamava: o painel só sabia
          aprovar parceiro que ninguém conseguia criar. */}
      {showPartnerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Cadastrar parceiro</h3>
              <p className="text-xs text-slate-500 mt-1">
                O parceiro entra como <strong>aguardando análise</strong> e só aparece para os tutores depois de aprovado.
              </p>
            </div>

            <form onSubmit={criarParceiro} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Nome fantasia *</span>
                  <input required value={partnerForm.tradeName} onChange={(e) => setPartnerForm({ ...partnerForm, tradeName: e.target.value })} placeholder="Clínica Vida Animal" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Razão social *</span>
                  <input required value={partnerForm.legalName} onChange={(e) => setPartnerForm({ ...partnerForm, legalName: e.target.value })} placeholder="Vida Animal Serviços Veterinários LTDA" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">CNPJ ou CPF *</span>
                  <input required value={partnerForm.documentNumber} onChange={(e) => setPartnerForm({ ...partnerForm, documentNumber: e.target.value })} placeholder="00.000.000/0001-00" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tipo</span>
                  <select value={partnerForm.partnerType} onChange={(e) => setPartnerForm({ ...partnerForm, partnerType: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white">
                    {TIPOS_DE_PARCEIRO.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">E-mail *</span>
                  <input required type="email" value={partnerForm.email} onChange={(e) => setPartnerForm({ ...partnerForm, email: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Telefone *</span>
                  <input required value={partnerForm.phone} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} placeholder="(11) 3000-0000" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">WhatsApp</span>
                  <input value={partnerForm.whatsapp} onChange={(e) => setPartnerForm({ ...partnerForm, whatsapp: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Site</span>
                  <input value={partnerForm.website} onChange={(e) => setPartnerForm({ ...partnerForm, website: e.target.value })} placeholder="https://" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Descrição</span>
                <textarea rows={3} value={partnerForm.description} onChange={(e) => setPartnerForm({ ...partnerForm, description: e.target.value })} placeholder="O que este parceiro faz e o que o diferencia — o tutor lê isto na busca." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowPartnerModal(false)} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition">
                  Cancelar
                </button>
                <button type="submit" disabled={salvandoParceiro} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition disabled:opacity-50">
                  {salvandoParceiro ? 'Cadastrando…' : 'Cadastrar e continuar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Unidades e Serviços
          `POST /:id/units` e `/:id/services` também não tinham tela. Sem unidade
          o parceiro não aparece em nenhuma busca por cidade; sem serviço não há
          o que indicar nem sobre o que calcular comissão. */}
      {detalhe && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{detalhe.tradeName}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Unidades de atendimento e serviços oferecidos</p>
              </div>
              <button onClick={() => setDetalhe(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Unidades */}
            <section className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Unidades ({detalhe.units?.length || 0})
              </h4>

              {detalhe.units?.length > 0 ? (
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {detalhe.units.map((unidade: ApiPayload) => (
                    <li key={unidade.id} className="p-3 text-xs">
                      <span className="font-bold text-slate-900">{unidade.name}</span>
                      <span className="block text-slate-500">
                        {unidade.addressLine}, {unidade.addressNumber} — {unidade.district}, {unidade.city}/{unidade.state}
                      </span>
                      {unidade.emergencyService && (
                        <span className="mt-1 inline-block px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-md text-[10px] font-bold uppercase">
                          Atende emergência
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-800">
                  Sem unidade cadastrada este parceiro não aparece em nenhuma busca por cidade.
                </p>
              )}

              <form onSubmit={adicionarUnidade} className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-4">
                <input required placeholder="Nome da unidade" value={unidadeForm.name} onChange={(e) => setUnidadeForm({ ...unidadeForm, name: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                <input placeholder="Telefone" value={unidadeForm.phone} onChange={(e) => setUnidadeForm({ ...unidadeForm, phone: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                <input placeholder="WhatsApp" value={unidadeForm.whatsapp} onChange={(e) => setUnidadeForm({ ...unidadeForm, whatsapp: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                <input required placeholder="Logradouro" value={unidadeForm.addressLine} onChange={(e) => setUnidadeForm({ ...unidadeForm, addressLine: e.target.value })} className="sm:col-span-2 w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400" />
                <input required placeholder="Número" value={unidadeForm.addressNumber} onChange={(e) => setUnidadeForm({ ...unidadeForm, addressNumber: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                <input required placeholder="Bairro" value={unidadeForm.district} onChange={(e) => setUnidadeForm({ ...unidadeForm, district: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                <input required placeholder="Cidade" value={unidadeForm.city} onChange={(e) => setUnidadeForm({ ...unidadeForm, city: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                <input required placeholder="UF" maxLength={2} value={unidadeForm.state} onChange={(e) => setUnidadeForm({ ...unidadeForm, state: e.target.value.toUpperCase() })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                <input required placeholder="CEP" value={unidadeForm.postalCode} onChange={(e) => setUnidadeForm({ ...unidadeForm, postalCode: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <input type="checkbox" checked={unidadeForm.emergencyService} onChange={(e) => setUnidadeForm({ ...unidadeForm, emergencyService: e.target.checked })} />
                  Atende emergência
                </label>
                <button type="submit" disabled={salvandoFilho === 'unidade'} className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition disabled:opacity-50">
                  {salvandoFilho === 'unidade' ? 'Salvando…' : 'Adicionar unidade'}
                </button>
              </form>
            </section>

            {/* Serviços */}
            <section className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5" /> Serviços ({detalhe.services?.length || 0})
              </h4>

              {detalhe.services?.length > 0 ? (
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {detalhe.services.map((servico: ApiPayload) => (
                    <li key={servico.id} className="p-3 text-xs flex items-center justify-between gap-3">
                      <span>
                        <span className="font-bold text-slate-900">{servico.name}</span>
                        <span className="block text-slate-500">{servico.category?.name}</span>
                      </span>
                      <span className="font-extrabold text-slate-900">{dinheiro(servico.publicPrice)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-[11px] font-bold text-slate-400">
                  Sem serviço cadastrado não há o que indicar nem sobre o que calcular comissão.
                </p>
              )}

              <form onSubmit={adicionarServico} className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-4">
                <input required placeholder="Nome do serviço" value={servicoForm.name} onChange={(e) => setServicoForm({ ...servicoForm, name: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                <select required value={servicoForm.categoryId} onChange={(e) => setServicoForm({ ...servicoForm, categoryId: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white">
                  <option value="">Categoria…</option>
                  {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.name}</option>)}
                </select>
                <input required placeholder="Preço ao público" value={servicoForm.publicPrice} onChange={(e) => setServicoForm({ ...servicoForm, publicPrice: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                <select value={servicoForm.priceType} onChange={(e) => setServicoForm({ ...servicoForm, priceType: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white">
                  <option value="FIXED">Preço fixo</option>
                  <option value="STARTING_FROM">A partir de</option>
                  <option value="ESTIMATE">Sob orçamento</option>
                </select>
                <input placeholder="Duração (min)" value={servicoForm.estimatedDuration} onChange={(e) => setServicoForm({ ...servicoForm, estimatedDuration: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-emerald-400 focus:bg-white" />
                <button type="submit" disabled={salvandoFilho === 'servico'} className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition disabled:opacity-50">
                  {salvandoFilho === 'servico' ? 'Salvando…' : 'Adicionar serviço'}
                </button>
              </form>
            </section>
          </div>
        </div>
      )}

      {/* Modal Nova Regra */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Nova Regra de Comissão Dinâmica</h3>

            <form onSubmit={handleCreateRule} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome da Regra *</label>
                <input
                  type="text"
                  placeholder="Ex: Comissão Padrão Clínicas 12%"
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Cálculo *</label>
                <select
                  value={ruleForm.calculationType}
                  onChange={(e) => setRuleForm({ ...ruleForm, calculationType: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                >
                  <option value="PERCENTAGE">Porcentagem (%)</option>
                  <option value="FIXED">Valor Fixo (R$)</option>
                  <option value="PERCENTAGE_PLUS_FIXED">Porcentagem + Valor Fixo</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Porcentagem (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={ruleForm.percentage}
                    onChange={(e) => setRuleForm({ ...ruleForm, percentage: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Valor Fixo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ruleForm.fixedAmount}
                    onChange={(e) => setRuleForm({ ...ruleForm, fixedAmount: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl"
                >
                  Salvar Regra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
