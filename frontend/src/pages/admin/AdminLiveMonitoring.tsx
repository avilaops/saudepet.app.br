import type { ApiPayload } from '../../types/api'
import React, { useState, useEffect } from 'react';
import { RefreshCw, Ban, UserCog, Clock, X } from 'lucide-react';
import api from '../../services/api';
import { API_URL } from '../../services/api'

// Rótulo humano para o status. A tabela mostrava a chave crua do banco
// ('procurando_veterinario'), que é o vocabulário do código, não o de quem
// está de plantão às três da manhã.
const ROTULO_STATUS: Record<string, string> = {
  criado: 'Criado',
  procurando_veterinario: 'Procurando veterinário',
  oferta_enviada: 'Chamando veterinários',
  veterinario_encontrado: 'Aguardando aceite',
  aceito: 'Aceito',
  a_caminho: 'A caminho',
  chegou: 'No local',
  atendimento_em_andamento: 'Em atendimento',
  finalizado: 'Finalizado',
  concluido: 'Concluído',
  encaminhado: 'Encaminhado',
  cancelado: 'Cancelado',
  cancelado_tutor: 'Cancelado pelo tutor',
  cancelado_vet: 'Veterinário desistiu',
  cancelado_admin: 'Cancelado pela administração'
};

// Quanto tempo o chamado está aberto. É o número que diz se a operação está
// funcionando ou se alguém está esperando desde ontem.
const esperaEmMinutos = (criadoEm: ApiPayload) =>
  Math.max(0, Math.round((Date.now() - new Date(criadoEm).getTime()) / 60000));

const rotuloEspera = (minutos: ApiPayload) => {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h${String(minutos % 60).padStart(2, '0')}`;
  return `${Math.floor(horas / 24)}d`;
};

const EM_ESPERA = ['criado', 'procurando_veterinario', 'oferta_enviada', 'veterinario_encontrado'];

// Cores do badge de status por situação do chamado.
const statusBadgeClass = (status: string) => {
  const s = String(status || '').toLowerCase();
  if (s === 'finalizado' || s === 'concluido' || s === 'concluído') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (s === 'cancelado' || s === 'encaminhado') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

export default function AdminLiveMonitoring() {
  const [solicitacoes, setSolicitacoes] = useState<ApiPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [semConexao, setSemConexao] = useState(false);
  const [ultimoSucesso, setUltimoSucesso] = useState<ApiPayload | null>(null);
  // Intervenção: um chamado preso não tinha NENHUMA saída pelo painel. O admin
  // via o problema e precisava mexer no banco para resolver, enquanto o tutor
  // ficava impedido de abrir outro (o sistema recusa nova solicitação enquanto
  // houver uma ativa).
  const [acao, setAcao] = useState<ApiPayload | null>(null); // { item, tipo: 'cancelar'|'reatribuir' }
  const [motivo, setMotivo] = useState('');
  const [veterinarioEscolhido, setVeterinarioEscolhido] = useState('');
  const [veterinarios, setVeterinarios] = useState<ApiPayload[]>([]);
  const [executando, setExecutando] = useState(false);
  const [feedback, setFeedback] = useState<ApiPayload | null>(null); // { tone, text }

  const avisar = (tone: string, text: string) => {
    setFeedback({ tone, text });
    window.setTimeout(() => setFeedback(null), 6000);
  };

  const abrirAcao = async (item: ApiPayload, tipo: string) => {
    setAcao({ item, tipo });
    setMotivo('');
    setVeterinarioEscolhido('');
    if (tipo === 'reatribuir' && veterinarios.length === 0) {
      try {
        const { data } = await api.get('/v1/admin/veterinarios-disponiveis');
        setVeterinarios(data.veterinarios || []);
      } catch {
        // A tela ainda serve para devolver o chamado à fila sem escolher vet.
      }
    }
  };

  const executar = async () => {
    if (!acao) return;
    setExecutando(true);
    try {
      if (acao.tipo === 'cancelar') {
        await api.post(`/v1/admin/solicitacoes/${acao.item.id}/cancelar`, { motivo: motivo.trim() });
        avisar('ok', 'Atendimento cancelado. O tutor foi avisado e já pode abrir um novo chamado.');
      } else {
        await api.post(`/v1/admin/solicitacoes/${acao.item.id}/reatribuir`, {
          veterinarioId: veterinarioEscolhido || undefined,
          motivo: motivo.trim() || undefined
        });
        avisar('ok', veterinarioEscolhido
          ? 'Chamado entregue ao veterinário escolhido.'
          : 'Chamado devolvido à fila — o despacho recomeça.');
      }
      setAcao(null);
      fetchActiveRequests();
    } catch (err: any) {
      avisar('erro', err.response?.data?.error || 'Não foi possível concluir a intervenção.');
    } finally {
      setExecutando(false);
    }
  };

  useEffect(() => {
    fetchActiveRequests();
    const interval = setInterval(fetchActiveRequests, 10000); // Polling a cada 10s
    return () => clearInterval(interval);
  }, []);

  const fetchActiveRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/solicitacoes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSolicitacoes(data.solicitacoes || data || []);
      setSemConexao(false);
      setUltimoSucesso(new Date());
    } catch (err: any) {
      console.error('Erro ao carregar chamados operacionais:', err);
      setSemConexao(true);
    } finally {
      setLoading(false);
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

      {semConexao && (
        <div className="p-3 rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 text-xs font-bold" role="status">
          Sem conexão com o servidor
          {ultimoSucesso
            ? ` — exibindo últimos dados de ${ultimoSucesso.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : ' — nenhum dado carregado ainda'}
          .
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600">Torre de Controle Live</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">Monitoramento Operacional de Chamados</h1>
          <p className="text-xs text-slate-500 mt-0.5">Acompanhamento em tempo real das emergências e deslocamentos de veterinários.</p>
        </div>

        <button
          onClick={fetchActiveRequests}
          className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
      </div>

      {/* Tabela / Grid de Chamados */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-sm">Chamados Registrados no Sistema</h3>
          <span className="text-xs font-bold text-slate-500">Total: {solicitacoes.length}</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400">Carregando dados da operação...</div>
        ) : solicitacoes.length === 0 ? (
          <div className="p-12 text-center text-xs font-bold text-slate-400">Nenhuma solicitação encontrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">ID Chamado</th>
                  <th className="p-4">Pet / Tipo</th>
                  <th className="p-4">Endereço / Local</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Veterinário</th>
                  <th className="p-4">Esperando há</th>
                  <th className="p-4">Intervenção</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {solicitacoes.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4 font-mono font-bold text-slate-900">#{String(item.id || '').slice(0, 8)}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{item.pet?.nome || 'Pet'}</div>
                      <div className="text-[10px] text-slate-400 uppercase">{item.tipo_atendimento}</div>
                    </td>
                    <td className="p-4 max-w-xs truncate">{item.localizacao_cliente || 'N/A'}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 border font-bold text-[10px] rounded-full ${statusBadgeClass(item.status)}`}>
                        {ROTULO_STATUS[item.status] || item.status}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-900">
                      {item.veterinario?.usuario?.nome || 'Pendente de Aceite'}
                    </td>
                    <td className="p-4">
                      {(() => {
                        const minutos = esperaEmMinutos(item.criado_em);
                        // Meia hora sem ninguém aceitar é o sinal de que a praça
                        // não tem cobertura naquele momento.
                        const travado = EM_ESPERA.includes(item.status) && minutos >= 30;
                        return (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${travado ? 'text-red-600' : 'text-slate-400'}`}>
                            <Clock className="w-3 h-3" /> {rotuloEspera(minutos)}
                          </span>
                        );
                      })()}
                      <span className="block text-[10px] text-slate-400">
                        {new Date(item.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => abrirAcao(item, 'reatribuir')}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 transition flex items-center gap-1"
                          title="Devolver à fila ou entregar a outro veterinário"
                        >
                          <UserCog className="w-3 h-3" /> Reatribuir
                        </button>
                        <button
                          onClick={() => abrirAcao(item, 'cancelar')}
                          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-bold rounded-lg border border-red-200 transition flex items-center gap-1"
                        >
                          <Ban className="w-3 h-3" /> Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {acao && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {acao.tipo === 'cancelar' ? 'Cancelar atendimento' : 'Reatribuir atendimento'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {acao.item.pet?.nome || 'Pet'} · {acao.item.tutor?.nome || 'Tutor'} · #{String(acao.item.id).slice(0, 8)}
                </p>
              </div>
              <button onClick={() => setAcao(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-600">
              {acao.tipo === 'cancelar'
                ? 'O chamado é encerrado, o tutor recebe o aviso com o seu motivo e volta a poder abrir um novo atendimento.'
                : 'Sem escolher ninguém, o chamado volta para a fila e o despacho por proximidade recomeça. Escolhendo um veterinário, ele recebe o chamado direto e decide se aceita.'}
            </p>

            {acao.tipo === 'reatribuir' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Entregar a (opcional)</span>
                <select
                  value={veterinarioEscolhido}
                  onChange={(e) => setVeterinarioEscolhido(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                >
                  <option value="">Devolver à fila (qualquer veterinário)</option>
                  {veterinarios.map((vet) => (
                    <option key={vet.id} value={vet.id}>
                      {vet.usuario?.nome} — {vet.usuario?.cidade || 'sem cidade'} {vet.online ? '· online' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {acao.tipo === 'cancelar' ? 'Motivo (o tutor lê isto)' : 'Observação (opcional)'}
              </span>
              <textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={acao.tipo === 'cancelar'
                  ? 'Ex.: sem veterinário disponível na sua região hoje'
                  : 'Ex.: profissional anterior não respondeu'}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
              />
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAcao(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition"
              >
                Voltar
              </button>
              <button
                onClick={executar}
                disabled={executando || (acao.tipo === 'cancelar' && motivo.trim().length < 5)}
                className={`px-4 py-2.5 text-white text-xs font-bold rounded-xl transition disabled:opacity-40 ${
                  acao.tipo === 'cancelar' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {executando ? 'Aplicando…' : acao.tipo === 'cancelar' ? 'Cancelar atendimento' : 'Reatribuir'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
