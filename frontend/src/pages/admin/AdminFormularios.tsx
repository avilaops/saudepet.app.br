import type { ApiPayload } from '../../types/api'
import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { API_URL } from '../../services/api'

const TIPOS: Record<string, string> = {
  pre_consulta: 'Pré-consulta',
  anamnese: 'Anamnese',
  pos_consulta: 'Pós-consulta',
  cadastro_pet: 'Cadastro de pet',
  termo_consentimento: 'Termo de consentimento',
  custom: 'Personalizado',
};

const TIPOS_CAMPO: Record<string, string> = {
  texto: 'Texto curto',
  textarea: 'Texto longo',
  numero: 'Número',
  data: 'Data',
  select: 'Lista suspensa',
  checkbox: 'Múltipla escolha',
  radio: 'Escolha única',
  arquivo: 'Arquivo',
};

const COM_OPCOES = ['select', 'checkbox', 'radio'];

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  };
}

const campoVazio = () => ({
  id: `campo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  tipo: 'texto',
  label: '',
  placeholder: '',
  obrigatorio: false,
  opcoes: [],
});

export default function AdminFormularios() {
  const [formularios, setFormularios] = useState<ApiPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<ApiPayload | null>(null);
  const [editor, setEditor] = useState<ApiPayload | null>(null); // { id?, titulo, descricao, tipo, obrigatorio, campos[] }
  const [respostas, setRespostas] = useState<ApiPayload | null>(null); // { formulario, itens, carregando }
  const [salvando, setSalvando] = useState(false);

  const notify = (tone: string, text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/v1/formularios`, { headers: authHeaders() });
      const d = await r.json();
      setFormularios(d.formularios || []);
    } catch {
      notify('erro', 'Não foi possível carregar os formulários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const abrirNovo = () =>
    setEditor({ titulo: '', descricao: '', tipo: 'anamnese', obrigatorio: false, campos: [campoVazio()] });

  const abrirEdicao = (form: ApiPayload) =>
    setEditor({
      id: form.id,
      titulo: form.titulo,
      descricao: form.descricao || '',
      tipo: form.tipo,
      obrigatorio: form.obrigatorio,
      campos: (form.campos || []).map((c: ApiPayload) => ({ ...c, opcoes: c.opcoes || [] })),
    });

  const salvar = async () => {
    setSalvando(true);
    try {
      const corpo: any = {
        titulo: editor.titulo.trim(),
        descricao: editor.descricao.trim() || undefined,
        obrigatorio: editor.obrigatorio,
        campos: editor.campos.map((c: ApiPayload) => ({
          id: c.id,
          tipo: c.tipo,
          label: c.label.trim(),
          placeholder: c.placeholder?.trim() || undefined,
          obrigatorio: Boolean(c.obrigatorio),
          opcoes: COM_OPCOES.includes(c.tipo) ? (c.opcoes || []).filter(Boolean) : undefined,
        })),
      };
      const url = editor.id ? `${API_URL}/v1/formularios/${editor.id}` : `${API_URL}/v1/formularios`;
      const metodo = editor.id ? 'PUT' : 'POST';
      if (!editor.id) corpo.tipo = editor.tipo;
      const r = await fetch(url, { method: metodo, headers: authHeaders(), body: JSON.stringify(corpo) });
      const d = await r.json();
      if (!r.ok) {
        notify('erro', d.error || d.message || 'Não foi possível salvar o formulário.');
        return;
      }
      setEditor(null);
      await load();
      notify('ok', editor.id ? 'Formulário atualizado.' : 'Formulário criado.');
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatus = async (form: ApiPayload) => {
    const novo = form.status === 'ativo' ? 'inativo' : 'ativo';
    const r = await fetch(`${API_URL}/v1/formularios/${form.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status: novo }),
    });
    if (!r.ok) {
      notify('erro', 'Não foi possível alterar o status.');
      return;
    }
    await load();
    notify('ok', `Formulário ${novo === 'ativo' ? 'ativado' : 'inativado'}.`);
  };

  const excluir = async (form: ApiPayload) => {
    // O texto anterior prometia o contrário do que o banco fazia: a relação tem
    // `onDelete: Cascade` e a exclusão levava junto todas as respostas. O
    // backend agora recusa excluir formulário com resposta — aqui o aviso
    // apenas deixou de mentir.
    if (!window.confirm(`Excluir o formulário “${form.titulo}”? Só é possível excluir formulários sem nenhuma resposta registrada. Para tirar de circulação preservando o histórico, use “Inativar”.`)) return;
    const r = await fetch(`${API_URL}/v1/formularios/${form.id}`, { method: 'DELETE', headers: authHeaders() });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      notify('erro', d.error || 'Não foi possível excluir.');
      return;
    }
    await load();
    notify('ok', 'Formulário excluído.');
  };

  const verRespostas = async (form: ApiPayload) => {
    setRespostas({ formulario: form, itens: [], carregando: true });
    try {
      const r = await fetch(`${API_URL}/v1/formularios/${form.id}/respostas`, { headers: authHeaders() });
      const d = await r.json();
      setRespostas({ formulario: form, itens: d.respostas || [], carregando: false, total: d.paginacao?.total });
    } catch {
      setRespostas(null);
      notify('erro', 'Não foi possível carregar as respostas.');
    }
  };

  const atualizarCampo = (indice: number, mudancas: ApiPayload) =>
    setEditor((e: any) => ({
      ...e,
      campos: e.campos.map((c: ApiPayload, i: number) => (i === indice ? { ...c, ...mudancas } : c)),
    }));

  const moverCampo = (indice: number, direcao: number) =>
    setEditor((e: any) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= e.campos.length) return e;
      const campos = [...e.campos];
      ;[campos[indice], campos[destino]] = [campos[destino], campos[indice]];
      return { ...e, campos };
    });

  const editorValido =
    editor &&
    editor.titulo.trim().length >= 3 &&
    editor.campos.length >= 1 &&
    editor.campos.every((c: ApiPayload) => c.label.trim().length > 0 && (!COM_OPCOES.includes(c.tipo) || (c.opcoes || []).filter(Boolean).length > 0));

  const labelPorCampoId = respostas
    ? Object.fromEntries((respostas.formulario.campos || []).map((c: ApiPayload) => [c.id, c.label]))
    : {};

  return (
    <>
      {/* Coluna estreita de propósito: lista + editor de formulários é leitura em coluna. */}
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-violet-600" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-violet-600">Formulários dinâmicos</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Anamneses, termos e questionários</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Monte formulários por tipo de uso, com campos configuráveis; as respostas ficam vinculadas ao atendimento e ao pet.
            </p>
          </div>
          <button onClick={abrirNovo} className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Novo formulário
          </button>
        </div>

        {feedback && (
          <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2 ${feedback.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`} role="status">
            {feedback.tone === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {feedback.text}
          </div>
        )}

        <div className="space-y-3">
          {loading ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs font-bold text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Carregando…
            </div>
          ) : formularios.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center">
              <FileText className="w-8 h-8 mx-auto text-slate-300" />
              <p className="mt-2 text-xs font-bold text-slate-400">Nenhum formulário criado ainda.</p>
            </div>
          ) : (
            formularios.map((f) => (
              <div key={f.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-black text-slate-900">{f.titulo}</h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-extrabold uppercase tracking-wider">{TIPOS[f.tipo] || f.tipo}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${f.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{f.status}</span>
                    {f.obrigatorio && <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-extrabold uppercase tracking-wider">obrigatório</span>}
                  </div>
                  {f.descricao && <p className="mt-1 text-xs text-slate-500">{f.descricao}</p>}
                  <p className="mt-1 text-[10px] text-slate-400">{(f.campos || []).length} campo(s)</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => verRespostas(f)} className="px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">Respostas</button>
                  <button onClick={() => alternarStatus(f)} className="px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">{f.status === 'ativo' ? 'Inativar' : 'Ativar'}</button>
                  <button onClick={() => abrirEdicao(f)} className="p-2.5 rounded-xl bg-slate-100 text-slate-700" title="Editar"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => excluir(f)} className="p-2.5 rounded-xl bg-red-50 text-red-600" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      {editor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
          <button className="fixed inset-0 bg-slate-900/50" onClick={() => setEditor(null)} aria-label="Fechar" />
          <div className="relative w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-slate-900">{editor.id ? 'Editar formulário' : 'Novo formulário'}</h2>
              <button onClick={() => setEditor(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500"><XCircle className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-slate-600">
                  Título
                  <input value={editor.titulo} onChange={(e) => setEditor({ ...editor, titulo: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" placeholder="Anamnese pré-consulta" />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Tipo
                  <select value={editor.tipo} disabled={Boolean(editor.id)} onChange={(e) => setEditor({ ...editor, tipo: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm disabled:opacity-60">
                    {Object.entries(TIPOS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-xs font-bold text-slate-600">
                Descrição
                <input value={editor.descricao} onChange={(e) => setEditor({ ...editor, descricao: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" placeholder="Aparece para quem responde" />
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <input type="checkbox" checked={editor.obrigatorio} onChange={(e) => setEditor({ ...editor, obrigatorio: e.target.checked })} className="rounded" />
                Resposta obrigatória no fluxo do atendimento
              </label>

              <div className="space-y-3 border-t border-slate-100 pt-3">
                {editor.campos.map((campo: any, i: number) => (
                  <div key={campo.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Campo {i + 1}</span>
                      <div className="flex gap-1">
                        <button onClick={() => moverCampo(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => moverCampo(i, 1)} disabled={i === editor.campos.length - 1} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditor((e: any) => ({ ...e, campos: e.campos.filter((_: ApiPayload, j: ApiPayload) => j !== i) }))} disabled={editor.campos.length === 1} className="p-1.5 rounded-lg bg-white border border-slate-200 text-red-500 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={campo.label} onChange={(e) => atualizarCampo(i, { label: e.target.value })} placeholder="Pergunta / rótulo" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                      <select value={campo.tipo} onChange={(e) => atualizarCampo(i, { tipo: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                        {Object.entries(TIPOS_CAMPO).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                      <input value={campo.placeholder || ''} onChange={(e) => atualizarCampo(i, { placeholder: e.target.value })} placeholder="Placeholder (opcional)" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-600 px-1">
                        <input type="checkbox" checked={campo.obrigatorio} onChange={(e) => atualizarCampo(i, { obrigatorio: e.target.checked })} className="rounded" />
                        Obrigatório
                      </label>
                    </div>
                    {COM_OPCOES.includes(campo.tipo) && (
                      <input
                        value={(campo.opcoes || []).join(', ')}
                        onChange={(e) => atualizarCampo(i, { opcoes: e.target.value.split(',').map((o) => o.trim()) })}
                        placeholder="Opções separadas por vírgula: Sim, Não, Não sei"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                ))}
                <button onClick={() => setEditor((e: any) => ({ ...e, campos: [...e.campos, campoVazio()] }))} className="w-full px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 hover:border-violet-400 hover:text-violet-600">
                  <Plus className="w-4 h-4" /> Adicionar campo
                </button>
              </div>

              <button onClick={salvar} disabled={!editorValido || salvando} className="w-full px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {editor.id ? 'Salvar alterações' : 'Criar formulário'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Respostas */}
      {respostas && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
          <button className="fixed inset-0 bg-slate-900/50" onClick={() => setRespostas(null)} aria-label="Fechar" />
          <div className="relative w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-slate-900">
                Respostas — {respostas.formulario.titulo}
                {typeof respostas.total === 'number' && <span className="ml-2 text-slate-400 font-bold">({respostas.total})</span>}
              </h2>
              <button onClick={() => setRespostas(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500"><XCircle className="w-4 h-4" /></button>
            </div>
            {respostas.carregando ? (
              <div className="p-8 text-center text-xs font-bold text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Carregando…</div>
            ) : respostas.itens.length === 0 ? (
              <p className="p-8 text-center text-xs font-bold text-slate-400">Nenhuma resposta registrada ainda.</p>
            ) : (
              <div className="space-y-3">
                {respostas.itens.map((r: ApiPayload) => (
                  <div key={r.id} className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-[10px] text-slate-400 font-bold">{new Date(r.criado_em).toLocaleString('pt-BR')}</p>
                    <dl className="mt-2 space-y-1.5">
                      {Object.entries(r.respostas || {}).map(([campoId, valor]) => (
                        <div key={campoId} className="text-xs">
                          <dt className="font-bold text-slate-600">{labelPorCampoId[campoId] || campoId}</dt>
                          <dd className="text-slate-700">{Array.isArray(valor) ? valor.join(', ') : String(valor)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
