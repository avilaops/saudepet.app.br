import type { ApiPayload } from '../../types/api'
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import {
  CheckCircle2,
  Crown,
  Loader2,
  Pencil,
  Plus,
  Power,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { API_URL } from '../../services/api'

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  };
}

const dinheiro = (valor: any) =>
  Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ROTULO_ASSINATURA: Record<string, string[]> = {
  ativa: ['Ativa', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  pendente: ['Aguardando pagamento', 'bg-amber-50 text-amber-700 border-amber-200'],
  cancelada: ['Cancelada', 'bg-slate-100 text-slate-500 border-slate-200'],
  suspensa: ['Suspensa', 'bg-red-50 text-red-700 border-red-200'],
  expirada: ['Expirada', 'bg-slate-100 text-slate-500 border-slate-200'],
};

const editorVazio = () => ({
  nome: '',
  descricao: '',
  tipo_usuario: 'tutor',
  valor_mensal: '',
  desconto_pct: '',
  limite_atendimentos: '',
  beneficios: [''],
});

export default function AdminPlanos() {
  const [planos, setPlanos] = useState<ApiPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<ApiPayload | null>(null);
  const [editor, setEditor] = useState<ApiPayload | null>(null);
  const [salvando, setSalvando] = useState(false);

  const notify = (tone: string, text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/v1/billing/admin/planos`, { headers: authHeaders() });
      const d = await r.json();
      setPlanos(d.planos || []);
    } catch {
      notify('erro', 'Não foi possível carregar os planos.');
    } finally {
      setLoading(false);
    }
  };

  const [assinaturas, setAssinaturas] = useState<ApiPayload | null>(null);
  const [carregandoAssinaturas, setCarregandoAssinaturas] = useState(false);

  const abrirAssinantes = async (plano: ApiPayload) => {
    setCarregandoAssinaturas(true);
    setAssinaturas({ plano, itens: [], receita: 0 });
    try {
      const { data } = await api.get('/v1/billing/admin/assinaturas', {
        params: { plano_id: plano.id, status: 'todos' }
      });
      setAssinaturas({ plano, itens: data.assinaturas || [], receita: data.receita_mensal || 0 });
    } catch (err: any) {
      setAssinaturas(null);
      window.alert(err.response?.data?.error || 'Não foi possível carregar os assinantes.');
    } finally {
      setCarregandoAssinaturas(false);
    }
  };

  const cancelarAssinatura = async (assinatura: ApiPayload) => {
    const motivo = window.prompt(
      `Cancelar a assinatura de ${assinatura.assinante?.nome}?\n\nMotivo (fica na trilha e o assinante é avisado):`
    );
    if (!motivo) return;
    try {
      await api.post(`/v1/billing/admin/assinaturas/${assinatura.id}/cancelar`, { motivo });
      abrirAssinantes(assinaturas.plano);
      load();
    } catch (err: any) {
      window.alert(err.response?.data?.error || 'Não foi possível cancelar a assinatura.');
    }
  };

  useEffect(() => { load(); }, []);

  const salvar = async () => {
    if (!editor) return;
    setSalvando(true);
    try {
      const corpo: any = {
        nome: editor.nome.trim(),
        descricao: editor.descricao.trim() || undefined,
        valor_mensal: Number(editor.valor_mensal),
        beneficios: editor.beneficios.map((b: ApiPayload) => b.trim()).filter(Boolean),
      };
      if (editor.limite_atendimentos !== '' && editor.limite_atendimentos !== null) {
        corpo.limite_atendimentos = Number(editor.limite_atendimentos);
      }
      if (editor.desconto_pct !== '' && editor.desconto_pct !== null) {
        corpo.desconto_pct = Number(editor.desconto_pct);
      }
      if (!editor.id) corpo.tipo_usuario = editor.tipo_usuario;

      const url = editor.id ? `${API_URL}/v1/billing/planos/${editor.id}` : `${API_URL}/v1/billing/planos`;
      const r = await fetch(url, { method: editor.id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(corpo) });
      const d = await r.json();
      if (!r.ok) {
        notify('erro', d.error || d.message || 'Não foi possível salvar o plano.');
        return;
      }
      setEditor(null);
      await load();
      notify('ok', editor.id ? 'Plano atualizado.' : 'Plano criado — já aparece na vitrine.');
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (plano: ApiPayload) => {
    if (plano.ativo && plano.assinantes_ativos > 0 &&
      !window.confirm(`Este plano tem ${plano.assinantes_ativos} assinante(s) ativo(s). Desativar impede novas assinaturas, mas não cancela as existentes. Continuar?`)) {
      return;
    }
    const r = await fetch(`${API_URL}/v1/billing/planos/${plano.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ ativo: !plano.ativo }),
    });
    if (!r.ok) {
      notify('erro', 'Não foi possível alterar o plano.');
      return;
    }
    await load();
    notify('ok', `Plano ${plano.ativo ? 'desativado — sai da vitrine' : 'reativado'}.`);
  };

  const valido = editor &&
    editor.nome.trim().length >= 3 &&
    Number(editor.valor_mensal) > 0 &&
    editor.beneficios.some((b: ApiPayload) => b.trim());

  const grupos = [
    { tipo: 'tutor', titulo: 'Planos para tutores' },
    { tipo: 'veterinario', titulo: 'Planos para veterinários (Clube Vet)' },
  ];

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-600">Assinaturas</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Planos de assinatura</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              A vitrine pública mostra só os ativos; aqui aparecem todos, com o número de assinantes de cada um.
            </p>
          </div>
          <button onClick={() => setEditor(editorVazio())} className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Novo plano
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
          grupos.map((grupo) => {
            const doGrupo = planos.filter((p) => p.tipo_usuario === grupo.tipo);
            if (doGrupo.length === 0) return null;
            return (
              <div key={grupo.tipo} className="space-y-3">
                <h2 className="px-1 text-xs font-extrabold uppercase tracking-wider text-slate-400">{grupo.titulo}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {doGrupo.map((p) => (
                    <div key={p.id} className={`bg-white p-5 rounded-2xl border shadow-sm ${p.ativo ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-75'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-slate-900">{p.nome}</h3>
                            {!p.ativo && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-extrabold uppercase">inativo</span>}
                          </div>
                          <div className="mt-1 text-2xl font-black text-slate-900">
                            R$ {Number(p.valor_mensal).toFixed(2)}<span className="text-xs font-bold text-slate-400">/mês</span>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => setEditor({
                            id: p.id,
                            nome: p.nome,
                            descricao: p.descricao || '',
                            tipo_usuario: p.tipo_usuario,
                            valor_mensal: String(p.valor_mensal),
                            limite_atendimentos: p.limite_atendimentos ?? '',
                            desconto_pct: p.desconto_pct ?? '',
                            beneficios: p.beneficios?.length ? p.beneficios : [''],
                          })} className="p-2 rounded-xl bg-slate-100 text-slate-600" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => alternarAtivo(p)} className={`p-2 rounded-xl ${p.ativo ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-600'}`} title={p.ativo ? 'Desativar' : 'Reativar'}><Power className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      {p.descricao && <p className="mt-2 text-xs text-slate-500">{p.descricao}</p>}
                      <ul className="mt-3 space-y-1">
                        {(p.beneficios || []).map((b: ApiPayload, i: number) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" /> {b}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400">
                        <button
                          type="button"
                          onClick={() => abrirAssinantes(p)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 -ml-2 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Users className="w-3.5 h-3.5" /> {p.assinantes_ativos} assinante(s)
                        </button>
                        <span>
                          {Number(p.desconto_pct) > 0
                            ? `${Number(p.desconto_pct)}% de desconto · ${p.limite_atendimentos ? `${p.limite_atendimentos}/mês` : 'sem limite'}`
                            : 'Sem desconto configurado'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}

        {!loading && planos.length === 0 && (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center">
            <Crown className="w-8 h-8 mx-auto text-slate-300" />
            <p className="mt-2 text-xs font-bold text-slate-400">Nenhum plano criado ainda — a vitrine pública está vazia.</p>
          </div>
        )}
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
          <button className="fixed inset-0 bg-slate-900/50" onClick={() => setEditor(null)} aria-label="Fechar" />
          <div className="relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-slate-900">{editor.id ? 'Editar plano' : 'Novo plano'}</h2>
              <button onClick={() => setEditor(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500"><XCircle className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-slate-600">
                  Nome
                  <input value={editor.nome} onChange={(e) => setEditor({ ...editor, nome: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" placeholder="Clube Vet Pro" />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Público
                  <select value={editor.tipo_usuario} disabled={Boolean(editor.id)} onChange={(e) => setEditor({ ...editor, tipo_usuario: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm disabled:opacity-60">
                    <option value="tutor">Tutor</option>
                    <option value="veterinario">Veterinário</option>
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Valor mensal (R$)
                  <input type="number" min="0.01" step="0.01" value={editor.valor_mensal} onChange={(e) => setEditor({ ...editor, valor_mensal: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" placeholder="49.90" />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Desconto nos atendimentos (%)
                  <input type="number" min="0" max="100" step="1" value={editor.desconto_pct} onChange={(e) => setEditor({ ...editor, desconto_pct: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" placeholder="10" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold text-slate-600">
                  Atendimentos com desconto por mês
                  <input type="number" min="1" value={editor.limite_atendimentos} onChange={(e) => setEditor({ ...editor, limite_atendimentos: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" placeholder="vazio = todos" />
                  <span className="mt-1 block font-medium normal-case text-slate-400">
                    Limita só o benefício. Passando do número, o tutor continua chamando — paga o preço cheio.
                  </span>
                </label>
              </div>
              <label className="block text-xs font-bold text-slate-600">
                Descrição
                <input value={editor.descricao} onChange={(e) => setEditor({ ...editor, descricao: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" placeholder="Frase curta da vitrine" />
              </label>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-600">Benefícios</span>
                {editor.beneficios.map((b: ApiPayload, i: number) => (
                  <div key={i} className="flex gap-2">
                    <input value={b} onChange={(e) => setEditor({ ...editor, beneficios: editor.beneficios.map((x: ApiPayload, j: ApiPayload) => (j === i ? e.target.value : x)) })} className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" placeholder="Ex.: Teleorientação ilimitada" />
                    <button onClick={() => setEditor({ ...editor, beneficios: editor.beneficios.filter((_: ApiPayload, j: ApiPayload) => j !== i) })} disabled={editor.beneficios.length === 1} className="p-2 rounded-xl bg-slate-100 text-red-500 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button onClick={() => setEditor({ ...editor, beneficios: [...editor.beneficios, ''] })} className="w-full px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 hover:border-amber-400 hover:text-amber-600">
                  <Plus className="w-3.5 h-3.5" /> Adicionar benefício
                </button>
              </div>

              <button onClick={salvar} disabled={!valido || salvando} className="w-full px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {editor.id ? 'Salvar alterações' : 'Criar plano'}
              </button>
            </div>
          </div>
        </div>
      )}

      {assinaturas && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Assinantes de {assinaturas.plano.nome}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Receita mensal recorrente deste plano: <strong>{dinheiro(assinaturas.receita)}</strong>
                </p>
              </div>
              <button
                onClick={() => setAssinaturas(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {carregandoAssinaturas ? (
              <p className="py-10 text-center text-xs font-bold text-slate-400">Carregando…</p>
            ) : assinaturas.itens.length === 0 ? (
              <p className="py-10 text-center text-xs font-bold text-slate-400">
                Ninguém assinou este plano ainda.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {assinaturas.itens.map((item: ApiPayload) => (
                  <li key={item.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 text-sm">{item.assinante?.nome}</span>
                      <span className="block text-[11px] text-slate-500">{item.assinante?.email}</span>
                      <span className="block text-[11px] text-slate-400">
                        {dinheiro(item.valor_mensal)}/mês
                        {item.proxima_cobranca
                          ? ` · próxima cobrança em ${new Date(item.proxima_cobranca).toLocaleDateString('pt-BR')}`
                          : ''}
                      </span>
                      {item.pagamento && (
                        <span className="block text-[11px] text-slate-400">
                          Cobrança #{String(item.pagamento.id).slice(0, 8)} · {item.pagamento.status} · {dinheiro(item.pagamento.amount)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${(ROTULO_ASSINATURA[item.status] || ROTULO_ASSINATURA.cancelada)[1]}`}>
                        {(ROTULO_ASSINATURA[item.status] || ROTULO_ASSINATURA.cancelada)[0]}
                      </span>
                      {item.status !== 'cancelada' && (
                        <button
                          onClick={() => cancelarAssinatura(item)}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-bold rounded-lg border border-red-200 transition"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
