import type { ApiPayload } from '../../types/api'
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Gavel,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Undo2,
  XCircle,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const TIPO_VIOLACAO: Record<string, string> = {
  spam: 'Spam',
  abuso_verbal: 'Abuso verbal',
  assedio: 'Assédio',
  conteudo_inapropriado: 'Conteúdo inapropriado',
  fraude: 'Fraude',
  informacao_falsa: 'Informação falsa',
  violacao_termos: 'Violação dos termos',
  other: 'Outro',
};

const STATUS_VIOLACAO: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700' },
  em_analise: { label: 'Em análise', cls: 'bg-sky-100 text-sky-700' },
  confirmada: { label: 'Confirmada', cls: 'bg-red-100 text-red-700' },
  rejeitada: { label: 'Rejeitada', cls: 'bg-slate-100 text-slate-500' },
  resolvida: { label: 'Resolvida', cls: 'bg-emerald-100 text-emerald-700' },
};

const TIPO_PUNICAO: Record<string, string> = {
  advertencia: 'Advertência',
  suspensao_temp: 'Suspensão temporária',
  suspensao_perm: 'Suspensão permanente',
  restricao_funcao: 'Restrição de função',
};

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  };
}

function Gravidade({ valor }: ApiPayload) {
  return (
    <span className="inline-flex gap-0.5" title={`Gravidade ${valor} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`h-1.5 w-1.5 rounded-full ${n <= valor ? 'bg-red-500' : 'bg-slate-200'}`} />
      ))}
    </span>
  );
}

function NomeUsuario({ usuario, fallbackId }: ApiPayload) {
  if (!usuario) return <span className="font-mono text-[10px] text-slate-400">{fallbackId?.slice(0, 8)}</span>;
  return (
    <span>
      <span className="font-bold text-slate-900">{usuario.nome}</span>
      <span className="ml-1 text-[10px] uppercase tracking-wider text-slate-400">{usuario.tipo_usuario}</span>
    </span>
  );
}

export default function AdminModeracao() {
  const [tab, setTab] = useState('violacoes'); // 'violacoes' | 'punicoes'
  const [stats, setStats] = useState<ApiPayload | null>(null);
  const [violacoes, setViolacoes] = useState<ApiPayload[]>([]);
  const [punicoes, setPunicoes] = useState<ApiPayload[]>([]);
  const [statusFilter, setStatusFilter] = useState('pendente');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<ApiPayload | null>(null);

  // Modais
  const [analise, setAnalise] = useState<ApiPayload | null>(null); // { violacao, status, resolucao }
  const [punir, setPunir] = useState<ApiPayload | null>(null); // { violacao, tipo, motivo, dias_suspensao }
  const [revogar, setRevogar] = useState<ApiPayload | null>(null); // { punicao, motivo_revogacao }
  const [enviando, setEnviando] = useState(false);

  const notify = (tone: string, text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };

  const loadStats = () =>
    fetch(`${API_URL}/v1/moderacao/estatisticas`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStats(d?.estatisticas || null))
      .catch(() => {});

  const loadViolacoes = async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const r = await fetch(`${API_URL}/v1/moderacao/violacoes${qs}`, { headers: authHeaders() });
      const d = await r.json();
      setViolacoes(d.violacoes || []);
    } catch {
      notify('erro', 'Não foi possível carregar as violações.');
    } finally {
      setLoading(false);
    }
  };

  const loadPunicoes = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/v1/moderacao/punicoes`, { headers: authHeaders() });
      const d = await r.json();
      setPunicoes(d.punicoes || []);
    } catch {
      notify('erro', 'Não foi possível carregar as punições.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (tab === 'violacoes') loadViolacoes();
    else loadPunicoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter]);

  const submeterAnalise = async () => {
    setEnviando(true);
    try {
      const r = await fetch(`${API_URL}/v1/moderacao/violacoes/${analise.violacao.id}/analisar`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status: analise.status, resolucao: analise.resolucao }),
      });
      const d = await r.json();
      if (!r.ok) {
        notify('erro', d.error || d.message || 'Não foi possível registrar a análise.');
        return;
      }
      const confirmada = analise.status === 'confirmada';
      const violacao = analise.violacao;
      setAnalise(null);
      await Promise.all([loadViolacoes(), loadStats()]);
      notify('ok', 'Análise registrada.');
      // Violação confirmada sem punição fica sem consequência — emenda o fluxo.
      if (confirmada) setPunir({ violacao, tipo: 'advertencia', motivo: '', dias_suspensao: 7 });
    } finally {
      setEnviando(false);
    }
  };

  const submeterPunicao = async () => {
    setEnviando(true);
    try {
      const corpo: any = {
        usuario_id: punir.violacao.usuario_id,
        violacao_id: punir.violacao.id,
        tipo: punir.tipo,
        motivo: punir.motivo,
      };
      if (punir.tipo === 'suspensao_temp') corpo.dias_suspensao = Number(punir.dias_suspensao) || 7;
      const r = await fetch(`${API_URL}/v1/moderacao/punicoes`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok) {
        notify('erro', d.error || d.message || 'Não foi possível aplicar a punição.');
        return;
      }
      setPunir(null);
      await Promise.all([loadViolacoes(), loadStats()]);
      notify('ok', 'Punição aplicada e registrada.');
    } finally {
      setEnviando(false);
    }
  };

  const submeterRevogacao = async () => {
    setEnviando(true);
    try {
      const r = await fetch(`${API_URL}/v1/moderacao/punicoes/${revogar.punicao.id}/revogar`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ motivo_revogacao: revogar.motivo_revogacao }),
      });
      const d = await r.json();
      if (!r.ok) {
        notify('erro', d.error || d.message || 'Não foi possível revogar a punição.');
        return;
      }
      setRevogar(null);
      await Promise.all([loadPunicoes(), loadStats()]);
      notify('ok', 'Punição revogada.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      {/* Coluna estreita de propósito: fila de moderação é leitura de denúncias. */}
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Cabeçalho */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-red-600">Moderação</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Violações e punições</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Denúncias reportadas na plataforma, análise com resolução obrigatória e punições com trilha completa.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab('violacoes')} className={`px-4 py-2.5 rounded-xl font-bold text-xs transition ${tab === 'violacoes' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}>
              Violações
            </button>
            <button onClick={() => setTab('punicoes')} className={`px-4 py-2.5 rounded-xl font-bold text-xs transition ${tab === 'punicoes' ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}>
              Punições
            </button>
          </div>
        </div>

        {feedback && (
          <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2 ${feedback.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`} role="status">
            {feedback.tone === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {feedback.text}
          </div>
        )}

        {/* Métricas */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: `Violações (${stats.periodo_dias}d)`, valor: stats.total_violacoes },
              { label: 'Pendentes de análise', valor: stats.violacoes_pendentes, destaque: stats.violacoes_pendentes > 0 },
              { label: 'Punições ativas', valor: stats.punicoes_ativas },
              { label: 'Usuários banidos', valor: stats.usuarios_banidos },
            ].map((m) => (
              <div key={m.label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{m.label}</span>
                <div className={`text-2xl font-black mt-1 ${m.destaque ? 'text-amber-600' : 'text-slate-900'}`}>{m.valor}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filtros de violação */}
        {tab === 'violacoes' && (
          <div className="flex flex-wrap items-center gap-2">
            {[{ id: 'pendente', label: 'Pendentes' }, { id: 'em_analise', label: 'Em análise' }, { id: 'confirmada', label: 'Confirmadas' }, { id: 'rejeitada', label: 'Rejeitadas' }, { id: '', label: 'Todas' }].map((f) => (
              <button key={f.id} onClick={() => setStatusFilter(f.id)} className={`px-4 py-2 rounded-xl font-bold text-xs transition ${statusFilter === f.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {f.label}
              </button>
            ))}
            <button onClick={() => (tab === 'violacoes' ? loadViolacoes() : loadPunicoes())} className="ml-auto p-2.5 bg-slate-100 text-slate-700 rounded-xl">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Lista */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs font-bold text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Carregando…
            </div>
          ) : tab === 'violacoes' ? (
            violacoes.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs font-bold text-slate-400">
                Nenhuma violação nesta categoria.
              </div>
            ) : (
              violacoes.map((v) => {
                const st = STATUS_VIOLACAO[v.status] || { label: v.status, cls: 'bg-slate-100 text-slate-500' };
                const analisavel = ['pendente', 'em_analise'].includes(v.status);
                return (
                  <div key={v.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <NomeUsuario usuario={v.usuario} fallbackId={v.usuario_id} />
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${st.cls}`}>{st.label}</span>
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-extrabold uppercase tracking-wider">{TIPO_VIOLACAO[v.tipo] || v.tipo}</span>
                          <Gravidade valor={v.gravidade} />
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600">{v.descricao}</p>
                        {Array.isArray(v.evidencias) && v.evidencias.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {v.evidencias.map((e: any, i: number) => (
                              <span key={i} className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-500 max-w-xs truncate" title={e.conteudo}>
                                {e.tipo}: {e.conteudo}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="mt-2 text-[10px] text-slate-400">
                          {new Date(v.criado_em).toLocaleString('pt-BR')}
                          {v.reportado_por_usuario ? ` · reportado por ${v.reportado_por_usuario.nome}` : ''}
                          {v.resolucao ? ` · resolução: ${v.resolucao}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {analisavel && (
                          <>
                            <button onClick={() => setAnalise({ violacao: v, status: 'confirmada', resolucao: '' })} className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5">
                              <Gavel className="w-3.5 h-3.5" /> Analisar
                            </button>
                          </>
                        )}
                        {v.status === 'confirmada' && (
                          <button onClick={() => setPunir({ violacao: v, tipo: 'advertencia', motivo: '', dias_suspensao: 7 })} className="px-3.5 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5">
                            <Ban className="w-3.5 h-3.5" /> Punir
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : punicoes.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs font-bold text-slate-400">
              Nenhuma punição registrada.
            </div>
          ) : (
            punicoes.map((p) => (
              <div key={p.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <NomeUsuario usuario={p.usuario} fallbackId={p.usuario_id} />
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${p.ativa ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.ativa ? 'Ativa' : p.revogada_em ? 'Revogada' : 'Encerrada'}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-extrabold uppercase tracking-wider">{TIPO_PUNICAO[p.tipo] || p.tipo}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{p.motivo}</p>
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    De {new Date(p.inicio_em).toLocaleDateString('pt-BR')}
                    {p.termina_em ? ` até ${new Date(p.termina_em).toLocaleDateString('pt-BR')}` : ' · permanente'}
                    {p.violacao ? ` · origem: ${TIPO_VIOLACAO[p.violacao.tipo] || p.violacao.tipo}` : ''}
                    {p.motivo_revogacao ? ` · revogação: ${p.motivo_revogacao}` : ''}
                  </p>
                </div>
                {p.ativa && (
                  <button onClick={() => setRevogar({ punicao: p, motivo_revogacao: '' })} className="px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 shrink-0">
                    <Undo2 className="w-3.5 h-3.5" /> Revogar
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal de análise */}
      {analise && (
        <Modal titulo="Analisar violação" onClose={() => setAnalise(null)}>
          <div className="space-y-3">
            <div className="flex gap-2">
              {[{ id: 'confirmada', label: 'Confirmar', cls: 'bg-red-600 text-white' }, { id: 'rejeitada', label: 'Rejeitar', cls: 'bg-slate-900 text-white' }, { id: 'resolvida', label: 'Resolver', cls: 'bg-emerald-600 text-white' }].map((o) => (
                <button key={o.id} onClick={() => setAnalise({ ...analise, status: o.id })} className={`px-4 py-2 rounded-xl font-bold text-xs transition ${analise.status === o.id ? o.cls : 'bg-slate-100 text-slate-600'}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <textarea
              value={analise.resolucao}
              onChange={(e) => setAnalise({ ...analise, resolucao: e.target.value })}
              placeholder="Explique a resolução (mínimo de 10 caracteres) — fica registrada na trilha."
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
            <BotaoEnviar onClick={submeterAnalise} disabled={analise.resolucao.trim().length < 10 || enviando} enviando={enviando} texto="Registrar análise" />
          </div>
        </Modal>
      )}

      {/* Modal de punição */}
      {punir && (
        <Modal titulo={`Punir ${punir.violacao.usuario?.nome || 'usuário'}`} onClose={() => setPunir(null)}>
          <div className="space-y-3">
            <select value={punir.tipo} onChange={(e) => setPunir({ ...punir, tipo: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800">
              {Object.entries(TIPO_PUNICAO).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
            {punir.tipo === 'suspensao_temp' && (
              <label className="block text-xs font-bold text-slate-600">
                Dias de suspensão
                <input type="number" min={1} max={365} value={punir.dias_suspensao} onChange={(e) => setPunir({ ...punir, dias_suspensao: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800" />
              </label>
            )}
            <textarea
              value={punir.motivo}
              onChange={(e) => setPunir({ ...punir, motivo: e.target.value })}
              placeholder="Motivo da punição (mínimo de 10 caracteres) — o usuário pode vir a lê-lo."
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
            <BotaoEnviar onClick={submeterPunicao} disabled={punir.motivo.trim().length < 10 || enviando} enviando={enviando} texto="Aplicar punição" perigoso />
          </div>
        </Modal>
      )}

      {/* Modal de revogação */}
      {revogar && (
        <Modal titulo="Revogar punição" onClose={() => setRevogar(null)}>
          <div className="space-y-3">
            <textarea
              value={revogar.motivo_revogacao}
              onChange={(e) => setRevogar({ ...revogar, motivo_revogacao: e.target.value })}
              placeholder="Motivo da revogação (mínimo de 10 caracteres)."
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
            <BotaoEnviar onClick={submeterRevogacao} disabled={revogar.motivo_revogacao.trim().length < 10 || enviando} enviando={enviando} texto="Revogar punição" />
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({ titulo, children, onClose }: ApiPayload) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-label="Fechar" />
      <div className="relative w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black text-slate-900">{titulo}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-100 text-slate-500"><XCircle className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BotaoEnviar({ onClick, disabled, enviando, texto, perigoso }: ApiPayload) {
  return (
    <button onClick={onClick} disabled={disabled} className={`w-full px-4 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 ${perigoso ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-slate-900 text-white'}`}>
      {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
      {texto}
    </button>
  );
}
