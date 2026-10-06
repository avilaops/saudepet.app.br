import type { ApiPayload } from '../../types/api'
import React, { useState, useEffect } from 'react';
import { ShieldCheck, FileText, CheckCircle2, XCircle, AlertTriangle, Eye, RotateCcw, Ban, Search, ExternalLink, Sparkles, RefreshCw, Minus } from 'lucide-react';
import { API_URL } from '../../services/api'

// O enum do banco não é texto de tela: "REQUIRES_RESUBMISSION" aparecia cru
// dentro do badge de status.
const STATUS_CREDENCIAMENTO: Record<string, { label: string; classe: string }> = {
  PENDING_REVIEW: { label: 'Aguardando análise', classe: 'bg-amber-50 text-amber-700 border-amber-200' },
  APPROVED: { label: 'Credenciado', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'Rejeitado', classe: 'bg-red-50 text-red-700 border-red-200' },
  SUSPENDED: { label: 'Suspenso', classe: 'bg-red-50 text-red-700 border-red-200' },
  REQUIRES_RESUBMISSION: { label: 'Reenvio pedido', classe: 'bg-sky-50 text-sky-700 border-sky-200' }
};

const MOTIVOS_REJEICAO = [
  { id: 'documento_invalido', label: 'Documento ilegível ou inválido' },
  { id: 'crmv_irregular', label: 'CRMV não localizado ou irregular' },
  { id: 'divergencia_dados', label: 'Divergência entre nome e CRMV' },
  { id: 'documento_vencido', label: 'Documento vencido' },
  { id: 'suspeita_fraude', label: 'Suspeita de fraude' }
];

/**
 * A triagem da IA vira uma lista de conferência, não um JSON cru.
 *
 * O que o administrador precisa responder é "bate ou não bate com o cadastro" —
 * e isso são três perguntas objetivas que a análise já devolve como booleano.
 * Despejar o objeto inteiro na tela obrigava a lê-lo como se fosse log.
 */
function itensDaTriagem(analise: ApiPayload) {
  if (!analise || analise.status === 'erro') return [];
  const tipoEsperado = analise.tipo_documento_detectado === 'carteira_crmv' || analise.tipo_documento_detectado === 'diploma';
  return [
    { rotulo: 'Documento legível', valor: analise.documento_legivel },
    { rotulo: 'Nome confere com o cadastro', valor: analise.nome_consistente, extraido: analise.nome_extraido },
    { rotulo: 'CRMV confere com o cadastro', valor: analise.crmv_consistente, extraido: analise.crmv_extraido },
    { rotulo: 'Tipo de documento reconhecido', valor: tipoEsperado, extraido: analise.tipo_documento_detectado }
  ];
}

function SinalDaTriagem({ valor }: ApiPayload) {
  if (valor === true) return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Confere" />;
  if (valor === false) return <XCircle className="w-4 h-4 text-red-600 shrink-0" aria-label="Não confere" />;
  return <Minus className="w-4 h-4 text-slate-400 shrink-0" aria-label="Não foi possível verificar" />;
}

/**
 * Pré-visualização do documento.
 *
 * `object-cover` recortava o documento — justo o que precisa ser lido inteiro.
 * O fundo quadriculado revela margem e recorte de scan que um fundo chapado
 * esconderia.
 */
function PreviewDocumento({ titulo, url, vazio }: ApiPayload) {
  return (
    <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-slate-400" /> {titulo}
        </span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1 shrink-0"
          >
            Ver original <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block group">
          <img
            src={url}
            alt={titulo}
            loading="lazy"
            className="w-full h-52 object-contain rounded-xl border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] transition group-hover:border-emerald-300"
          />
        </a>
      ) : (
        <div className="h-52 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-1.5 text-slate-400">
          <FileText className="w-6 h-6" />
          <span className="text-xs">{vazio}</span>
        </div>
      )}
    </div>
  );
}

export default function AdminVeterinariosManagement() {
  const [veterinarios, setVeterinarios] = useState<ApiPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING_REVIEW');
  const [search, setSearch] = useState('');

  // Modal State
  const [selectedVet, setSelectedVet] = useState<ApiPayload | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [motivoRejeicao, setMotivoRejeicao] = useState('documento_invalido');
  const [submitting, setSubmitting] = useState(false);
  const [erroModal, setErroModal] = useState('');
  const [aviso, setAviso] = useState('');
  // Rejeitar e suspender pedem uma segunda batida: são ações que derrubam o
  // credenciamento de alguém e antes saíam num `window.confirm` do navegador.
  const [confirmando, setConfirmando] = useState<ApiPayload | null>(null);

  useEffect(() => {
    fetchVeterinarios();
  }, [statusFilter]);

  const fetchVeterinarios = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const queryParams = new URLSearchParams();
      if (statusFilter) queryParams.append('status', statusFilter);
      if (search) queryParams.append('search', search);

      const res = await fetch(`${API_URL}/v1/admin/veterinarios?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setVeterinarios(data.veterinarios || []);
    } catch (err: any) {
      console.error('Erro ao buscar lista de veterinários:', err);
    } finally {
      setLoading(false);
    }
  };

  const fecharModal = () => {
    setSelectedVet(null);
    setObservacao('');
    setMotivoRejeicao('documento_invalido');
    setErroModal('');
    setConfirmando(null);
  };

  const handleOpenDetails = async (id: string) => {
    setSelectedVet({ id, carregando: true });
    setObservacao('');
    setErroModal('');
    setConfirmando(null);
    try {
      setLoadingDetails(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/veterinarios/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.veterinario) {
        setSelectedVet(data.veterinario);
      } else {
        setErroModal(data.error || 'Não foi possível carregar este cadastro.');
      }
    } catch (err: any) {
      setErroModal('Não foi possível carregar este cadastro. Verifique sua conexão.');
    } finally {
      setLoadingDetails(false);
    }
  };

  /**
   * Um caminho só para as quatro decisões — antes eram quatro funções quase
   * idênticas, cada uma engolindo o erro no console e avisando por `alert()`.
   * Agora a falha aparece dentro do modal, com o cadastro ainda aberto.
   */
  const executarDecisao = async ({ rota, corpo, sucesso }: ApiPayload) => {
    if (!selectedVet) return;
    setSubmitting(true);
    setErroModal('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/veterinarios/${selectedVet.id}/${rota}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(corpo)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErroModal(data.error || 'A ação não foi concluída. Nada foi alterado.');
        return;
      }

      fecharModal();
      setAviso(sucesso);
      fetchVeterinarios();
    } catch (err: any) {
      setErroModal('Falha de conexão. A ação não foi concluída.');
    } finally {
      setSubmitting(false);
    }
  };

  const nomeDoVet = selectedVet?.usuario?.nome || 'o veterinário';

  const handleAprovar = () => executarDecisao({
    rota: 'aprovar',
    corpo: { observacao },
    sucesso: `${nomeDoVet} foi credenciado e já pode atender.`
  });

  const handleSolicitarReenvio = () => executarDecisao({
    rota: 'solicitar-reenvio',
    corpo: { observacao },
    sucesso: `Pedido de reenvio de documentos enviado a ${nomeDoVet}.`
  });

  const handleRejeitar = () => executarDecisao({
    rota: 'rejeitar',
    corpo: { motivo: motivoRejeicao, observacao },
    sucesso: `Cadastro de ${nomeDoVet} rejeitado.`
  });

  const handleSuspender = () => executarDecisao({
    rota: 'suspender',
    corpo: { motivo: observacao || 'Suspenso pela administração' },
    sucesso: `${nomeDoVet} foi suspenso e está offline.`
  });

  // v1.0: o caminho de volta. Suspenso/rejeitado volta a APPROVED com auditoria.
  const handleReativar = () => executarDecisao({
    rota: 'reativar',
    corpo: { motivo: observacao || 'Reativado pela administração' },
    sucesso: `${nomeDoVet} foi reativado e já pode atender.`
  });

  // O aviso de sucesso se apaga sozinho: é confirmação, não algo a despachar.
  useEffect(() => {
    if (!aviso) return undefined;
    const timer = setTimeout(() => setAviso(''), 6000);
    return () => clearTimeout(timer);
  }, [aviso]);

  // Esc fecha o modal — antes o único jeito de sair era mirar no ✕.
  useEffect(() => {
    if (!selectedVet) return undefined;
    const onKeyDown = (event: any) => event.key === 'Escape' && !submitting && fecharModal();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedVet, submitting]);

  return (
    <>
      <div className="space-y-8">
        
        {/* Header Superior */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600">Moderação Humana Auditável</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Credenciamento de Veterinários (CRMV)</h1>
            <p className="text-xs text-slate-500 mt-0.5">Analise diplomas, valide CRMVs com apoio de IA e controle as autorizações profissionais.</p>
          </div>

          <button
            onClick={fetchVeterinarios}
            className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar Fila
          </button>
        </div>

        {aviso && (
          <div
            className="flex items-center gap-2.5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl"
            role="status"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-900">{aviso}</p>
            <button
              onClick={() => setAviso('')}
              aria-label="Dispensar"
              className="ml-auto text-emerald-600 hover:text-emerald-800 shrink-0"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Filtros e Busca */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {[
              { id: 'PENDING_REVIEW', label: 'Pendentes' },
              { id: 'APPROVED', label: 'Aprovados' },
              { id: 'REJECTED', label: 'Rejeitados' },
              { id: 'SUSPENDED', label: 'Suspensos' },
              { id: 'REQUIRES_RESUBMISSION', label: 'Reenvio Solicitado' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs transition ${statusFilter === f.id ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por CRMV, Nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchVeterinarios()}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>
        </div>

        {/* Tabela da Fila */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs font-bold text-slate-400">Carregando fila de credenciamento...</div>
          ) : veterinarios.length === 0 ? (
            <div className="p-12 text-center text-xs font-bold text-slate-400">Nenhum veterinário encontrado nesta categoria.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="p-4">Profissional</th>
                    <th className="p-4">CRMV / UF</th>
                    <th className="p-4">Especialidade</th>
                    <th className="p-4">Status IA</th>
                    <th className="p-4">Status Credenciamento</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {veterinarios.map((vet) => (
                    <tr key={vet.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{vet.usuario?.nome || 'Sem Nome'}</div>
                        <div className="text-[11px] text-slate-400">{vet.usuario?.email}</div>
                      </td>
                      <td className="p-4 font-mono font-bold text-slate-900">{vet.crmv}{vet.crmv_uf ? <span className="text-slate-400">/{vet.crmv_uf}</span> : null}</td>
                      <td className="p-4">{vet.especialidade}</td>
                      <td className="p-4">
                        {vet.documento_analise ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-200 font-bold text-[10px] rounded-full">
                            <Sparkles className="w-3 h-3 text-teal-600" /> Triado por IA
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Pendente de Triagem</span>
                        )}
                      </td>
                      <td className="p-4">
                        {(() => {
                          const status = STATUS_CREDENCIAMENTO[vet.status_credenciamento]
                            || { label: vet.status_credenciamento, classe: 'bg-slate-50 text-slate-600 border-slate-200' };
                          return (
                            <span className={`px-2.5 py-1 font-semibold text-[10px] rounded-full border ${status.classe}`}>
                              {status.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleOpenDetails(vet.id)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 ml-auto"
                        >
                          <Eye className="w-3.5 h-3.5" /> Analisar
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

      {/* Análise de credenciamento */}
      {selectedVet && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-analise"
        >
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl my-8 border border-slate-200 overflow-hidden">

            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Análise de credenciamento</span>
                <h2 id="titulo-analise" className="text-lg font-bold text-slate-900 mt-0.5 truncate">
                  {selectedVet.usuario?.nome || 'Carregando…'}
                </h2>
                {selectedVet.crmv && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className="font-mono font-medium text-slate-700">{selectedVet.crmv}{selectedVet.crmv_uf ? `/${selectedVet.crmv_uf}` : ""}</span>
                    {selectedVet.especialidade ? ` · ${selectedVet.especialidade}` : ''}
                  </p>
                )}
              </div>
              <button
                onClick={fecharModal}
                disabled={submitting}
                aria-label="Fechar"
                className="p-2 -m-2 text-slate-400 hover:text-slate-700 rounded-lg transition disabled:opacity-40"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {loadingDetails || selectedVet.carregando ? (
              <div className="py-16 text-center text-xs text-slate-400">Carregando documentos…</div>
            ) : (
              <div className="px-6 py-5 space-y-5">

                {erroModal && (
                  <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl" role="alert">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-800 leading-relaxed">{erroModal}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <PreviewDocumento
                    titulo="Carteira do CRMV"
                    url={selectedVet.documento_signed_url}
                    vazio="Nenhuma carteira anexada"
                  />
                  <PreviewDocumento
                    titulo="Diploma / identidade"
                    url={selectedVet.diploma_signed_url}
                    vazio="Nenhum diploma anexado"
                  />
                </div>

                {/* Triagem automática: apoio à decisão, não a decisão */}
                {selectedVet.documento_analise && (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                      <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                        Conferência automática
                      </span>
                      <span className="ml-auto text-[11px] text-slate-400">Apoio à análise — a decisão é sua</span>
                    </div>

                    {selectedVet.documento_analise.status === 'erro' ? (
                      <p className="px-4 py-3 text-xs text-slate-500">
                        {selectedVet.documento_analise.observacoes || 'A conferência automática não pôde ser concluída. Analise os documentos manualmente.'}
                      </p>
                    ) : (
                      <>
                        <ul className="divide-y divide-slate-100">
                          {itensDaTriagem(selectedVet.documento_analise).map((item) => (
                            <li key={item.rotulo} className="flex items-center gap-2.5 px-4 py-2.5">
                              <SinalDaTriagem valor={item.valor} />
                              <span className="text-xs text-slate-700 flex-1">{item.rotulo}</span>
                              {item.extraido && (
                                <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 truncate max-w-[45%]">
                                  {item.extraido}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {selectedVet.documento_analise.observacoes && (
                          <p className="px-4 py-3 text-xs text-slate-600 leading-relaxed bg-slate-50 border-t border-slate-100">
                            {selectedVet.documento_analise.observacoes}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div>
                  <label htmlFor="observacao-admin" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Observações internas
                    <span className="font-normal text-slate-400"> · ficam no registro de auditoria</span>
                  </label>
                  <textarea
                    id="observacao-admin"
                    rows={3}
                    placeholder="Conferência no sistema do CRMV, justificativa da decisão…"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                  />
                </div>

                {/* Decisões. Aprovar é a ação primária; o resto é secundário até
                    ser escolhido — quatro botões sólidos competindo não diziam
                    qual era o caminho normal. */}
                {!confirmando ? (
                  <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                    <button
                      onClick={handleAprovar}
                      disabled={submitting}
                      className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {submitting ? 'Aprovando…' : 'Aprovar credenciamento'}
                    </button>
                    <button
                      onClick={handleSolicitarReenvio}
                      disabled={submitting}
                      className="flex-1 py-3 px-4 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4 text-slate-400" /> Pedir reenvio
                    </button>
                    <button
                      onClick={() => setConfirmando('rejeitar')}
                      disabled={submitting}
                      className="flex-1 py-3 px-4 bg-white hover:bg-red-50 text-red-700 font-semibold text-xs rounded-xl border border-red-200 transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> Rejeitar
                    </button>
                    {selectedVet.status_credenciamento === 'APPROVED' && (
                      <button
                        onClick={() => setConfirmando('suspender')}
                        disabled={submitting}
                        className="py-3 px-4 bg-white hover:bg-red-50 text-red-700 font-semibold text-xs rounded-xl border border-red-200 transition flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Ban className="w-4 h-4" /> Suspender
                      </button>
                    )}
                    {['SUSPENDED', 'REJECTED', 'EXPIRED'].includes(selectedVet.status_credenciamento) && (
                      <button
                        onClick={handleReativar}
                        disabled={submitting}
                        className="py-3 px-4 bg-white hover:bg-emerald-50 text-emerald-700 font-semibold text-xs rounded-xl border border-emerald-200 transition flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <RefreshCw className="w-4 h-4" /> {submitting ? 'Reativando…' : 'Reativar'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-3.5">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-900 leading-relaxed">
                        {confirmando === 'rejeitar'
                          ? <>Rejeitar o cadastro de <strong>{nomeDoVet}</strong>. Ele será avisado por e-mail com o motivo escolhido e não poderá atender.</>
                          : <>Suspender <strong>{nomeDoVet}</strong>. Ele fica offline imediatamente e perde o acesso aos atendimentos.</>}
                      </p>
                    </div>

                    {confirmando === 'rejeitar' && (
                      <div>
                        <label htmlFor="motivo-rejeicao" className="block text-xs font-semibold text-red-900 mb-1.5">
                          Motivo informado ao veterinário
                        </label>
                        <select
                          id="motivo-rejeicao"
                          value={motivoRejeicao}
                          onChange={(e) => setMotivoRejeicao(e.target.value)}
                          className="w-full p-2.5 bg-white border border-red-200 rounded-xl text-xs text-slate-800 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-500/15"
                        >
                          {MOTIVOS_REJEICAO.map((motivo) => (
                            <option key={motivo.id} value={motivo.id}>{motivo.label}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="flex gap-2.5">
                      <button
                        onClick={() => setConfirmando(null)}
                        disabled={submitting}
                        className="flex-1 py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition disabled:opacity-50"
                      >
                        Voltar
                      </button>
                      <button
                        onClick={confirmando === 'rejeitar' ? handleRejeitar : handleSuspender}
                        disabled={submitting}
                        className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition disabled:opacity-50"
                      >
                        {submitting
                          ? 'Confirmando…'
                          : confirmando === 'rejeitar' ? 'Confirmar rejeição' : 'Confirmar suspensão'}
                      </button>
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>
        </div>
      )}

    </>
  );
}
