import type { ApiPayload } from '../../types/api'
import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Users,
  XCircle,
} from 'lucide-react';
import { API_URL } from '../../services/api'

const STATUS: Record<string, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'bg-emerald-100 text-emerald-700' },
  trial: { label: 'Trial', cls: 'bg-sky-100 text-sky-700' },
  suspenso: { label: 'Suspenso', cls: 'bg-amber-100 text-amber-700' },
  cancelado: { label: 'Cancelado', cls: 'bg-red-100 text-red-700' },
};

const PLANOS = ['free', 'basic', 'premium', 'enterprise'];

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  };
}

const novoVazio = () => ({
  nome: '', slug: '', email: '', telefone: '', cidade: '', estado: '', cnpj: '', plano: 'free',
});

export default function AdminTenants() {
  const [tenants, setTenants] = useState<ApiPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<ApiPayload | null>(null);
  const [novo, setNovo] = useState<ApiPayload | null>(null);
  const [gerir, setGerir] = useState<ApiPayload | null>(null); // tenant sendo gerido
  const [salvando, setSalvando] = useState(false);

  const notify = (tone: string, text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/v1/tenants?limit=100`, { headers: authHeaders() });
      const d = await r.json();
      setTenants(d.tenants || []);
    } catch {
      notify('erro', 'Não foi possível carregar as organizações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const criar = async () => {
    setSalvando(true);
    try {
      const corpo = { ...novo };
      if (!corpo.cnpj) delete corpo.cnpj;
      const r = await fetch(`${API_URL}/v1/tenants`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(corpo) });
      const d = await r.json();
      if (!r.ok) {
        notify('erro', d.error || d.message || 'Não foi possível criar a organização.');
        return;
      }
      setNovo(null);
      await load();
      notify('ok', `Organização ${d.tenant?.nome || corpo.nome} criada.`);
    } catch {
      notify('erro', 'Falha de conexão ao criar a organização. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const mudarStatus = async (tenant: ApiPayload, status: string) => {
    if (
      (status === 'suspenso' || status === 'cancelado') &&
      !window.confirm(`Tem certeza que deseja marcar a organização ${tenant.nome} como "${status}"? Isso bloqueia o acesso de todos os usuários desta organização.`)
    ) {
      return;
    }
    try {
      const r = await fetch(`${API_URL}/v1/tenants/${tenant.id}/status`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status }),
      });
      const d = await r.json();
      if (!r.ok) {
        notify('erro', d.error || 'Não foi possível alterar o status.');
        return;
      }
      await load();
      setGerir(null);
      notify('ok', `Status de ${tenant.nome} alterado para ${status}.`);
    } catch {
      notify('erro', 'Falha de conexão ao alterar o status. Tente novamente.');
    }
  };

  const mudarPlano = async (tenant: ApiPayload, plano: ApiPayload) => {
    try {
      const r = await fetch(`${API_URL}/v1/tenants/${tenant.id}/plano`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ plano }),
      });
      const d = await r.json();
      if (!r.ok) {
        notify('erro', d.error || 'Não foi possível alterar o plano.');
        return;
      }
      await load();
      setGerir(null);
      notify('ok', `Plano de ${tenant.nome} alterado para ${plano}.`);
    } catch {
      notify('erro', 'Falha de conexão ao alterar o plano. Tente novamente.');
    }
  };

  const valido = novo &&
    novo.nome.trim().length >= 3 &&
    /^[a-z0-9-]{3,}$/.test(novo.slug) &&
    /\S+@\S+\.\S+/.test(novo.email) &&
    novo.telefone.trim() &&
    novo.cidade.trim().length >= 2 &&
    novo.estado.trim().length === 2;

  return (
    <>
      {/* Coluna estreita de propósito: cadastro de organizações é formulário longo. */}
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-600">Multi-tenant</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Organizações (tenants)</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Cada organização tem usuários, catálogo e configurações isolados. Área exclusiva do super admin.
            </p>
          </div>
          <button onClick={() => setNovo(novoVazio())} className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Nova organização
          </button>
        </div>

        {feedback && (
          <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2 ${feedback.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`} role="status">
            {feedback.tone === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {feedback.text}
          </div>
        )}

        {loading ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs font-bold text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Carregando…
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="p-4">Organização</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Plano</th>
                    <th className="p-4">Usuários</th>
                    <th className="p-4">Cidade</th>
                    <th className="p-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {tenants.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center font-bold text-slate-400">
                        Nenhuma organização cadastrada.
                      </td>
                    </tr>
                  )}
                  {tenants.map((t) => {
                    const st = STATUS[t.status] || { label: t.status, cls: 'bg-slate-100 text-slate-500' };
                    return (
                      <tr key={t.id} className="hover:bg-slate-50 transition">
                        <td className="p-4">
                          <span className="font-bold text-slate-900">{t.nome}</span>
                          <div className="text-[10px] text-slate-400 font-mono">/{t.slug}</div>
                        </td>
                        <td className="p-4"><span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${st.cls}`}>{st.label}</span></td>
                        <td className="p-4 uppercase font-bold">{t.plano}</td>
                        <td className="p-4"><span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5 text-slate-400" /> {t._count?.usuarios ?? '—'}</span></td>
                        <td className="p-4">{t.cidade}{t.estado ? `/${t.estado}` : ''}</td>
                        <td className="p-4 text-right">
                          <button onClick={() => setGerir(t)} className="px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs inline-flex items-center gap-1.5">
                            <Pencil className="w-3.5 h-3.5" /> Gerir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Nova organização */}
      {novo && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
          <button className="fixed inset-0 bg-slate-900/50" onClick={() => setNovo(null)} aria-label="Fechar" />
          <div className="relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-slate-900">Nova organização</h2>
              <button onClick={() => setNovo(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500"><XCircle className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['nome', 'Nome', 'Clínica Vida Animal'],
                ['slug', 'Slug (URL)', 'vida-animal'],
                ['email', 'E-mail', 'contato@clinica.com.br'],
                ['telefone', 'Telefone', '(17) 99999-9999'],
                ['cidade', 'Cidade', 'São José do Rio Preto'],
                ['estado', 'UF', 'SP'],
                ['cnpj', 'CNPJ (só dígitos, opcional)', '00000000000000'],
              ].map(([campo, rotulo, ph]) => (
                <label key={campo} className="block text-xs font-bold text-slate-600">
                  {rotulo}
                  <input value={novo[campo]} onChange={(e) => setNovo({ ...novo, [campo]: campo === 'slug' ? e.target.value.toLowerCase() : e.target.value })} placeholder={ph} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                </label>
              ))}
              <label className="block text-xs font-bold text-slate-600">
                Plano
                <select value={novo.plano} onChange={(e) => setNovo({ ...novo, plano: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm uppercase">
                  {PLANOS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
            <button onClick={criar} disabled={!valido || salvando} className="mt-4 w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Criar organização
            </button>
          </div>
        </div>
      )}

      {/* Gerir tenant */}
      {gerir && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
          <button className="fixed inset-0 bg-slate-900/50" onClick={() => setGerir(null)} aria-label="Fechar" />
          <div className="relative w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 my-8">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-black text-slate-900">{gerir.nome}</h2>
              <button onClick={() => setGerir(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500"><XCircle className="w-4 h-4" /></button>
            </div>
            <p className="text-[10px] font-mono text-slate-400 mb-4">/{gerir.slug} · {gerir.email}</p>

            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-slate-600">Status</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {Object.entries(STATUS).map(([id, s]) => (
                    <button key={id} onClick={() => id !== gerir.status && mudarStatus(gerir, id)} className={`px-3.5 py-2 rounded-xl font-bold text-xs transition ${gerir.status === id ? `${s.cls} ring-2 ring-offset-1 ring-slate-300` : 'bg-slate-100 text-slate-600'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400">Suspender ou cancelar bloqueia o acesso de todos os usuários da organização.</p>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-600">Plano</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {PLANOS.map((p) => (
                    <button key={p} onClick={() => p !== gerir.plano && mudarPlano(gerir, p)} className={`px-3.5 py-2 rounded-xl font-bold text-xs uppercase transition ${gerir.plano === p ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
