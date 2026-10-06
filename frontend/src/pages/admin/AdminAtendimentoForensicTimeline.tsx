import type { ApiPayload } from '../../types/api'
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Clock } from 'lucide-react';
import { API_URL } from '../../services/api'

export default function AdminAtendimentoForensicTimeline() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    fetchTimeline();
  }, [id]);

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/auditoria/atendimento/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await res.json();
      if (res.ok) {
        setData(result);
      } else {
        setErro(result.message || 'Não foi possível carregar a linha do tempo pericial.');
      }
    } catch (err: any) {
      console.error('Erro ao buscar linha do tempo:', err);
      setErro('Falha de conexão ao carregar a linha do tempo pericial. Verifique a rede e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 p-6 text-xs font-bold text-slate-400">
        Reconstruindo linha do tempo pericial unificada do atendimento #{id?.slice(0, 8)}...
      </div>
    );
  }

  if (!data || !data.solicitacao) {
    return (
      <div className="flex flex-col items-center justify-center py-24 p-6 text-xs text-slate-500 gap-4">
        <p>{erro || 'Atendimento não encontrado ou acesso negado.'}</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl">Voltar</button>
      </div>
    );
  }

  const { solicitacao, timelineEvents } = data;

  return (
    // Coluna estreita de propósito: a linha do tempo forense é leitura corrida.
    <div className="mx-auto max-w-5xl space-y-8">
      
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-white rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para Auditoria
        </button>

        <div className="flex items-center gap-2 text-emerald-600 font-extrabold text-xs">
          <ShieldCheck className="w-4 h-4" /> Investigação Pericial Ativa
        </div>
      </div>

      {/* Banner do Atendimento */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-6">
          <div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Linha do Tempo Pericial Unificada</span>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Atendimento #{solicitacao.id.slice(0, 8).toUpperCase()}</h1>
            <p className="text-xs text-slate-500 mt-0.5">Criado em {new Date(solicitacao.criado_em).toLocaleString('pt-BR')} • Status: <strong className="uppercase">{solicitacao.status}</strong></p>
          </div>

          <div className="flex gap-2">
            {solicitacao.receita_pdf_signed_url && (
              <a
                href={solicitacao.receita_pdf_signed_url}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
              >
                📄 Receita PDF (Presigned R2)
              </a>
            )}
            {solicitacao.prontuario_pdf_signed_url && (
              <a
                href={solicitacao.prontuario_pdf_signed_url}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
              >
                📋 Prontuário PDF (Presigned R2)
              </a>
            )}
          </div>
        </div>

        {/* Envolvidos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
            <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Tutor Solicitante</span>
            <div className="font-extrabold text-slate-900">{solicitacao.tutor?.nome}</div>
            <div className="text-slate-500">{solicitacao.tutor?.email} • {solicitacao.tutor?.telefone}</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
            <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Veterinário Responsável</span>
            <div className="font-extrabold text-slate-900">{solicitacao.veterinario?.usuario?.nome || 'Pendente / Não atribuído'}</div>
            <div className="text-slate-500">CRMV: {solicitacao.veterinario?.crmv || 'N/A'}</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
            <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Pet Atendido</span>
            <div className="font-extrabold text-slate-900">{solicitacao.pet?.nome || 'N/A'}</div>
            <div className="text-slate-500">{solicitacao.pet?.especie || solicitacao.pet?.tipo} • {solicitacao.pet?.raca}</div>
          </div>
        </div>
      </div>

      {/* Linha do Tempo Cronológica Pericial */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div>
          <h3 className="font-extrabold text-slate-900 text-lg">História Sequencial e Prova Pericial dos Fatos</h3>
          <p className="text-xs text-slate-500">Todos os eventos gravados de forma imutável no PostgreSQL organizados por ordem cronológica.</p>
        </div>

        <div className="relative border-l-2 border-slate-200 ml-4 space-y-8 pl-6">
          {(timelineEvents || []).map((evt: ApiPayload, idx: number) => {
            const getCategoryBadge = (cat: ApiPayload) => {
              switch (cat) {
                case 'SOLICITACAO': return 'bg-blue-50 text-blue-700 border-blue-200';
                case 'STATUS': return 'bg-purple-50 text-purple-700 border-purple-200';
                case 'CHAT': return 'bg-amber-50 text-amber-700 border-amber-200';
                case 'PAGAMENTO': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                case 'AUDIT': return 'bg-slate-100 text-slate-800 border-slate-300';
                default: return 'bg-slate-50 text-slate-700 border-slate-200';
              }
            };

            return (
              <div key={idx} className="relative group">
                {/* Ponto na Linha */}
                <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-slate-900 ring-4 ring-white" />

                <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 shadow-sm hover:shadow-md transition">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-full border uppercase ${getCategoryBadge(evt.category)}`}>
                        {evt.category}
                      </span>
                      <h4 className="font-extrabold text-slate-900 text-sm">{evt.title}</h4>
                    </div>

                    <span className="font-mono text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {new Date(evt.timestamp).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700">{evt.description}</p>

                  {/* Detalhes do Nó */}
                  {evt.payload && (
                    <div className="p-3 bg-white border border-slate-200 rounded-xl text-[11px] font-mono text-slate-600 space-y-1">
                      <pre className="whitespace-pre-wrap font-mono">{JSON.stringify(evt.payload, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
