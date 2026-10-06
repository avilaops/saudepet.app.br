import type { ApiPayload } from '../../types/api'
import React, { useState, useEffect } from 'react';
import { MapPin, DollarSign, Plus, Save, RefreshCw, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function AdminCidadesCobertura() {
  const navigate = useNavigate();
  const [cidades, setCidades] = useState<ApiPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCidade, setSelectedCidade] = useState<ApiPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState<ApiPayload>({
    id: '',
    nome: '',
    estado: 'SP',
    raio_atendimento_km: 20,
    preco_emergencia: 150.00,
    preco_domiciliar: 150.00,
    preco_teleorientacao: 80.00,
    preco_vacinacao: 120.00,
    preco_avaliacao: 120.00,
    preco_consulta_rotina: 130.00,
    percentual_plataforma: 20,
    ativo: true
  });

  // Regras comerciais do tenant (comissão da plataforma e cidade padrão),
  // antes fixas em código/env, agora configuráveis por aqui.
  const [tenantId, setTenantId] = useState<ApiPayload | null>(null);
  const [regras, setRegras] = useState<ApiPayload | null>(null);
  const [salvandoRegras, setSalvandoRegras] = useState(false);
  const [feedback, setFeedback] = useState<ApiPayload | null>(null); // { tone: 'ok'|'erro', text }
  const notify = (tone: string, text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };

  const [regrasSalvas, setRegrasSalvas] = useState(false);

  useEffect(() => {
    fetchCidades();
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/v1/tenants`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Seleciona o tenant do usuário logado (guardado no login) em vez de
        // pegar um tenant arbitrário da lista; cai no primeiro só como fallback.
        let user = null;
        try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch { /* JSON inválido no storage */ }
        const meu = d?.tenants?.find((t: ApiPayload) => t.id === user?.tenant_id) || d?.tenants?.[0];
        if (!meu) return;
        setTenantId(meu.id);
        setRegras({
          comissao_plataforma_pct: meu.configuracoes?.comissao_plataforma_pct != null ? Number(meu.configuracoes.comissao_plataforma_pct) : 15,
          cidade_padrao: meu.configuracoes?.cidade_padrao || '',
        });
      })
      .catch(() => {});
  }, []);

  const salvarRegras = async () => {
    setSalvandoRegras(true);
    setRegrasSalvas(false);
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API_URL}/v1/tenants/${tenantId}/config`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comissao_plataforma_pct: Number(regras.comissao_plataforma_pct),
          cidade_padrao: regras.cidade_padrao.trim() || null,
        }),
      });
      if (r.ok) {
        setRegrasSalvas(true);
        notify('ok', 'Regras comerciais salvas com sucesso!');
        window.setTimeout(() => setRegrasSalvas(false), 4000);
      } else {
        let d = null;
        try { d = await r.json(); } catch { /* resposta sem corpo JSON */ }
        notify('erro', d?.message || d?.error || 'Não foi possível salvar as regras comerciais.');
      }
    } catch {
      notify('erro', 'Falha de conexão ao salvar as regras comerciais. Tente novamente.');
    } finally {
      setSalvandoRegras(false);
    }
  };

  const fetchCidades = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/cidades`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setCidades(data.cidades || []);
    } catch (err: any) {
      console.error('Erro ao carregar cidades de cobertura:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cidade: ApiPayload) => {
    setSelectedCidade(cidade);
    setFormData({
      id: cidade.id,
      nome: cidade.nome,
      estado: cidade.estado,
      raio_atendimento_km: cidade.raio_atendimento_km,
      preco_emergencia: Number(cidade.preco_emergencia),
      preco_domiciliar: Number(cidade.preco_domiciliar),
      preco_teleorientacao: Number(cidade.preco_teleorientacao),
      preco_vacinacao: Number(cidade.preco_vacinacao ?? 120),
      preco_avaliacao: Number(cidade.preco_avaliacao ?? 120),
      preco_consulta_rotina: Number(cidade.preco_consulta_rotina ?? 130),
      percentual_plataforma: Number(cidade.percentual_plataforma ?? 20),
      ativo: cidade.ativo
    });
  };

  const handleNew = () => {
    setSelectedCidade({ id: null });
    setFormData({
      id: '',
      nome: '',
      estado: 'SP',
      raio_atendimento_km: 20,
      preco_emergencia: 150.00,
      preco_domiciliar: 150.00,
      preco_vacinacao: 120.00,
      preco_avaliacao: 120.00,
      preco_consulta_rotina: 130.00,
      percentual_plataforma: 20,
      preco_teleorientacao: 80.00,
      ativo: true
    });
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/cidades`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (res.ok) {
        notify('ok', 'Cidade e tabela de preços salvas com sucesso!');
        setSelectedCidade(null);
        fetchCidades();
      } else {
        notify('erro', data.message || 'Não foi possível salvar a cidade.');
      }
    } catch (err: any) {
      console.error('Erro ao salvar cidade:', err);
      notify('erro', 'Falha de conexão ao salvar a cidade. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Coluna estreita de propósito: tabela de preços por cidade fica ilegível em 7xl. */}
      <div className="mx-auto max-w-6xl space-y-8">
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


        
        {/* Top Header */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 text-emerald-600">
              <MapPin className="w-5 h-5" />
              <span className="text-xs font-extrabold uppercase tracking-wider">Expansão & Tabela Dinâmica de Preços</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Cidades Ativas, Raios & Preços</h1>
            <p className="text-xs text-slate-500 mt-0.5">Cadastre novas praças, configure raios de atendimento em km e altere os preços base das consultas.</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleNew}
              className="py-3 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Nova Cidade
            </button>
            <button
              onClick={() => navigate('/admin')}
              className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Regras comerciais do tenant */}
        {regras && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Regras comerciais da operação</span>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <label className="block text-xs font-bold text-slate-600">
                Comissão da plataforma (%)
                <input
                  type="number" min="0" max="100" step="0.5"
                  value={regras.comissao_plataforma_pct}
                  onChange={(e) => setRegras({ ...regras, comissao_plataforma_pct: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                />
                <span className="mt-1 block text-[10px] font-medium text-slate-400">Aplicada no split de cada pagamento; o restante vai ao veterinário.</span>
              </label>
              <label className="block text-xs font-bold text-slate-600">
                Cidade padrão da operação
                <input
                  value={regras.cidade_padrao}
                  onChange={(e) => setRegras({ ...regras, cidade_padrao: e.target.value })}
                  placeholder="Ex.: São José do Rio Preto"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                />
                <span className="mt-1 block text-[10px] font-medium text-slate-400">Usada como padrão em cadastros e na busca de veterinários online.</span>
              </label>
              <button
                onClick={salvarRegras}
                disabled={salvandoRegras || Number(regras.comissao_plataforma_pct) < 0 || Number(regras.comissao_plataforma_pct) > 100}
                className="py-3 px-5 bg-slate-900 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {regrasSalvas ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : salvandoRegras ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {regrasSalvas ? 'Salvo' : 'Salvar regras'}
              </button>
            </div>
          </div>
        )}

        {/* Tabela de Cidades */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-extrabold text-slate-900 text-base">Praças de Atendimento Habilitadas</h3>
            <button onClick={fetchCidades} className="p-2 text-slate-400 hover:text-slate-600"><RefreshCw className="w-4 h-4" /></button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs font-bold text-slate-400">Carregando cidades de cobertura...</div>
          ) : cidades.length === 0 ? (
            <div className="p-12 text-center text-xs font-bold text-slate-400">Nenhuma cidade cadastrada ainda. Clique em Nova Cidade.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="p-4">Cidade / UF</th>
                    <th className="p-4">Raio de Atendimento</th>
                    <th className="p-4">Emergência</th>
                    <th className="p-4">Domiciliar</th>
                    <th className="p-4">Teleorientação</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {cidades.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 transition">
                      <td className="p-4 font-bold text-slate-900">{c.nome} / {c.estado}</td>
                      <td className="p-4 font-mono">{c.raio_atendimento_km} km</td>
                      <td className="p-4 font-bold text-slate-900">R$ {Number(c.preco_emergencia).toFixed(2)}</td>
                      <td className="p-4 font-bold text-slate-900">R$ {Number(c.preco_domiciliar).toFixed(2)}</td>
                      <td className="p-4 font-bold text-slate-900">R$ {Number(c.preco_teleorientacao).toFixed(2)}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${c.ativo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {c.ativo ? 'ATIVA' : 'INATIVA'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleEdit(c)}
                          className="px-3 py-1.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* MODAL DE CADASTRO/EDIÇÃO */}
      {selectedCidade && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">{formData.id ? 'Editar Cidade & Preços' : 'Nova Cidade de Cobertura'}</h3>
              <button type="button" onClick={() => setSelectedCidade(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Nome da Cidade *</label>
                  <input
                    type="text"
                    placeholder="Ex: São Paulo"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">UF *</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="SP"
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value.toUpperCase() })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 uppercase"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Raio de Atendimento Padrão (km)</label>
                <input
                  type="number"
                  value={formData.raio_atendimento_km}
                  onChange={(e) => setFormData({ ...formData, raio_atendimento_km: e.target.value })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preço Emergência (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.preco_emergencia}
                    onChange={(e) => setFormData({ ...formData, preco_emergencia: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preço Domiciliar (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.preco_domiciliar}
                    onChange={(e) => setFormData({ ...formData, preco_domiciliar: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preço Tele (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.preco_teleorientacao}
                    onChange={(e) => setFormData({ ...formData, preco_teleorientacao: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preço Vacinação (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.preco_vacinacao}
                    onChange={(e) => setFormData({ ...formData, preco_vacinacao: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preço Avaliação (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.preco_avaliacao}
                    onChange={(e) => setFormData({ ...formData, preco_avaliacao: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preço Rotina (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.preco_consulta_rotina}
                    onChange={(e) => setFormData({ ...formData, preco_consulta_rotina: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  />
                </div>

                {/* A comissão era constante no código. Cinco pontos sobre todo o
                    faturamento não podem depender de um deploy para mudar. */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Comissão da plataforma (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.percentual_plataforma}
                    onChange={(e) => setFormData({ ...formData, percentual_plataforma: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  />
                  <p className="mt-1 text-[0.65rem] text-slate-400">
                    O restante vai para o veterinário. O plano do produto prevê 20%.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="ativoCidade"
                  checked={formData.ativo}
                  onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <label htmlFor="ativoCidade" className="font-bold text-slate-700 cursor-pointer">Cidade Ativa para Seleção de Tutores</label>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedCidade(null)}
                className="py-3 px-4 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {submitting ? 'Salvando...' : 'Salvar Tabela de Preços'}
              </button>
            </div>
          </form>
        </div>
      )}

    </>
  );
}
