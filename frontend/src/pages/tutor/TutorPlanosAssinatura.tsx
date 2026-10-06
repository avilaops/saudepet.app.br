import type { ApiPayload } from '../../types/api'
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Check, Sparkles, Star, Zap, CreditCard, ArrowLeft } from 'lucide-react';
import api from '../../services/api';
import PagamentoAssinaturaPix from '../../components/PagamentoAssinaturaPix';

export default function TutorPlanosAssinatura() {
  const navigate = useNavigate();
  const [planos, setPlanos] = useState<ApiPayload[]>([]);
  const [assinaturaAtual, setAssinaturaAtual] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<ApiPayload | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Plano pago não ativa mais sozinho: o backend abre a cobrança e só o webhook
  // do gateway confirma. Antes a assinatura nascia ativa sem ninguém pagar.
  const [cobranca, setCobranca] = useState<ApiPayload | null>(null); // { pagamento, plano }

  useEffect(() => {
    fetchPlanosEAssinatura();
  }, []);

  const fetchPlanosEAssinatura = async () => {
    try {
      setLoading(true);
      const [resPlanos, resAssinatura] = await Promise.all([
        api.get('/public/planos?tipo_usuario=tutor'),
        api.get('/v1/billing/minha-assinatura').catch(() => ({ data: { assinatura: null } }))
      ]);

      if (resPlanos.data?.planos) {
        setPlanos(resPlanos.data.planos);
      }
      if (resAssinatura.data?.assinatura) {
        setAssinaturaAtual(resAssinatura.data.assinatura);
      }
    } catch (err: any) {
      console.error('Erro ao carregar planos:', err);
      setError('Não foi possível carregar os planos no momento.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssinar = async (plano: ApiPayload) => {
    try {
      setProcessingId(plano.id);
      setError('');
      setSuccess('');

      const res = await api.post('/v1/billing/assinaturas', {
        plano_id: plano.id,
        metodo_pagamento: 'pix',
        aceitar_termos: true
      });

      if (res.data?.pagamento) {
        setCobranca({ pagamento: res.data.pagamento, plano });
      } else {
        setSuccess(`Plano ${plano.nome} ativado.`);
        fetchPlanosEAssinatura();
      }
    } catch (err: any) {
      console.error('Erro ao assinar plano:', err);
      setError(err.response?.data?.message || 'Falha ao processar assinatura.');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center p-6 text-xs text-slate-500 font-bold">
        Carregando planos…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-page text-ink py-10 px-4 sm:px-6 lg:px-8 space-y-8">
      <div className="max-w-5xl mx-auto space-y-10">

        {/* Back navigation */}
        <button
          onClick={() => navigate('/tutor')}
          className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 font-bold text-xs transition inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
        </button>

        {/* Header */}
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-primary font-extrabold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" /> Saúde PET Club
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-ink">
            Economize em todas as consultas e proteja quem você ama
          </h1>
          <p className="text-slate-500 text-sm">
            Escolha o plano ideal para o seu pet. Descontos em atendimento veterinário, vacinas preventivas e teleorientação ilimitada 24h.
          </p>
        </div>

        {/* Alertas */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-2xl text-center">
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-2xl text-center">
            {success}
          </div>
        )}

        {/* Card de Assinatura Ativa (se tiver) */}
        {assinaturaAtual && (
          <div className="p-6 bg-white border border-teal-200 rounded-3xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-primary" />
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest block">Sua Assinatura Ativa</span>
                <h3 className="text-lg font-black text-ink">{assinaturaAtual.plano?.nome || 'Plano Saúde PET'}</h3>
              </div>
            </div>
            <span className="px-3 py-1 bg-primary text-white font-black text-xs rounded-full">
              STATUS: ATIVA
            </span>
          </div>
        )}

        {/* Grid de Planos */}
        {planos.length === 0 && !error && (
          <div className="p-8 bg-white border border-slate-200 rounded-3xl text-center text-xs font-bold text-slate-500">
            Nenhum plano disponível no momento — volte em breve.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {planos.map((plano, i) => {
            const isVip = Boolean(plano.destaque) || (plano.nome || '').toLowerCase().includes('vip');
            const isAtual = assinaturaAtual?.plano_id === plano.id;

            return (
              <div
                key={plano.id || i}
                className={`relative rounded-3xl p-8 transition-all flex flex-col justify-between space-y-6 ${
                  isVip
                    ? 'bg-white border-2 border-primary shadow-xl shadow-primary/10'
                    : 'bg-white border border-slate-200 shadow-sm'
                }`}
              >
                {isVip && (
                  <div className="absolute -top-3.5 right-6 px-3.5 py-1 bg-primary text-white font-black text-[10px] uppercase tracking-widest rounded-full flex items-center gap-1 shadow-lg">
                    <Star className="w-3 h-3 fill-white" /> MAIS RECOMENDADO
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-2xl font-black text-ink">{plano.nome}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{plano.descricao}</p>

                  <div className="pt-2">
                    <span className="text-4xl font-black text-ink">
                      R$ {Number(plano.valor_mensal).toFixed(2).replace('.', ',')}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold"> /mês</span>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Benefícios Inclusos</span>
                    {Array.isArray(plano.beneficios) && plano.beneficios.map((b: ApiPayload, idx: number) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                        <div className="w-4 h-4 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3" />
                        </div>
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  disabled={isAtual || processingId === plano.id}
                  onClick={() => handleAssinar(plano)}
                  className={`w-full py-4 font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition flex items-center justify-center gap-2 ${
                    isAtual
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : isVip
                      ? 'bg-primary hover:bg-[#127e82] text-white shadow-primary/20'
                      : 'bg-ink hover:bg-slate-800 text-white'
                  }`}
                >
                  {processingId === plano.id ? (
                    'Processando...'
                  ) : isAtual ? (
                    'Plano Atual'
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" /> Assinar {plano.nome}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

      </div>

      {cobranca && (
        <PagamentoAssinaturaPix
          pagamento={cobranca.pagamento}
          plano={cobranca.plano}
          onFechar={() => { setCobranca(null); fetchPlanosEAssinatura(); }}
          onAtivada={(assinaturaAtiva: ApiPayload) => {
            setCobranca(null);
            setSuccess(`Pagamento confirmado. ${assinaturaAtiva.plano?.nome || 'Seu plano'} está ativo!`);
            fetchPlanosEAssinatura();
          }}
        />
      )}
    </div>
  );
}
