import { dataDeCalendario } from '../../lib/datas'
import type { ApiPayload } from '../../types/api'
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, PhoneCall, Heart, AlertTriangle, CheckCircle2, MapPin, ExternalLink } from 'lucide-react';
import api from '../../services/api';

export default function PublicPetIdentityTag() {
  const { id } = useParams();
  const [pet, setPet] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // O "Alertar Tutor" era só um deeplink de WhatsApp: o sistema nunca ficava
  // sabendo que a coleira tinha sido lida, e quem não quisesse mandar mensagem
  // sumia do mapa. Agora a leitura é registrada e o tutor recebe o aviso.
  const [alertando, setAlertando] = useState(false);
  const [alertado, setAlertado] = useState(false);
  const [recado, setRecado] = useState<ApiPayload>({ mensagem: '', contato: '' });
  const [formularioAberto, setFormularioAberto] = useState(false);

  useEffect(() => {
    fetchPetTag();
  }, [id]);

  // Abertura da página: registro passivo, sem pedir nada de quem escaneou. O
  // backend segura o aviso ao tutor por uma hora para não transformar um QR
  // compartilhado numa enxurrada de alertas.
  useEffect(() => {
    api.post(`/v1/public/pet-tag/${id}/scan`, { deliberado: false }).catch(() => {
      // Silencioso de propósito: quem achou o animal não precisa lidar com um
      // erro nosso nesta hora.
    });
  }, [id]);

  // A tag expõe contato do tutor para quem achar o pet — não deve ser indexada
  // (o nginx já manda X-Robots-Tag; a meta cobre qualquer outro caminho).
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const fetchPetTag = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/v1/public/pet-tag/${id}`);
      if (data?.pet) {
        setPet(data.pet);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // A localização é o dado mais valioso para quem perdeu o animal, então vale
  // pedir — mas o alerta acontece com ou sem ela, e a recusa não trava nada.
  const posicaoAtual = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => resolve({}),
      { timeout: 8000, maximumAge: 60000 }
    );
  });

  const alertarTutor = async () => {
    setAlertando(true);
    try {
      const posicao = (await posicaoAtual()) as Record<string, any>;
      await api.post(`/v1/public/pet-tag/${id}/scan`, {
        ...posicao,
        mensagem: recado.mensagem.trim() || undefined,
        contato: recado.contato.trim() || undefined,
        deliberado: true
      });
      setAlertado(true);
    } catch {
      // Mesmo se o registro falhar, o WhatsApp continua sendo um caminho.
      setAlertado(true);
    } finally {
      setAlertando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-xs font-bold gap-3">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        Lendo identificação digital da coleira...
      </div>
    );
  }

  if (error || !pet) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-slate-400 text-xs text-center space-y-4">
        <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-2xl mx-auto">⚠️</div>
        <h2 className="text-xl font-bold text-white">Identificação não encontrada</h2>
        <p>A tag deste pet não está cadastrada ou foi desativada.</p>
      </div>
    );
  }

  const tutorTelefoneLimpo = pet.tutor?.telefone?.replace(/\D/g, '') || '';
  const whatsAppUrl = `https://wa.me/55${tutorTelefoneLimpo}?text=Olá!%20Achei%20seu%20pet%20${encodeURIComponent(pet.nome)}%20pelo%20escaneamento%20da%20coleira%20Saúde%20PET!`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto space-y-6">
        
        {/* Top Identification Badge */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-3xl text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 text-emerald-400 font-extrabold text-xs uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" /> Tag Oficial Saúde PET Identificada
          </div>
          <p className="text-[11px] text-emerald-300">Coleira Inteligente de Identificação de Pet Perdido</p>
        </div>

        {/* Pet Profile Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 text-center">
          
          <div className="relative w-32 h-32 mx-auto rounded-full overflow-hidden border-4 border-emerald-500 shadow-xl bg-slate-800 flex items-center justify-center">
            {pet.foto ? (
              <img src={pet.foto} alt={pet.nome} className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl">🐾</span>
            )}
          </div>

          <div>
            <h1 className="text-3xl font-black text-white">{pet.nome}</h1>
            <p className="text-sm font-semibold text-slate-400">{pet.especie} • {pet.raca || 'Sem raça definida'}</p>
            {/* O microchip saiu da resposta pública de propósito: é o número
                que prova posse, e quem precisa dele lê no próprio animal. */}
          </div>

          {/* Encontrei este pet — agora avisa o tutor DE VERDADE, não só abre
              o WhatsApp de quem achou. */}
          {alertado ? (
            <div className="w-full p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
              <p className="text-sm font-black text-emerald-300">Tutor avisado!</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Ele recebeu um alerta no aplicativo com a sua localização, se você autorizou.
                Se puder, fale com ele também pelo WhatsApp.
              </p>
              {pet.tutor?.telefone && (
                <a
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center justify-center gap-2 py-3 px-5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl transition uppercase tracking-wide"
                >
                  <PhoneCall className="w-4 h-4" /> Falar no WhatsApp
                </a>
              )}
            </div>
          ) : (
            <div className="w-full space-y-2">
              <button
                type="button"
                onClick={() => (formularioAberto ? alertarTutor() : setFormularioAberto(true))}
                disabled={alertando}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-sm rounded-2xl shadow-lg shadow-emerald-500/25 transition flex items-center justify-center gap-2 uppercase tracking-wide disabled:opacity-60"
              >
                <PhoneCall className="w-5 h-5" />
                {alertando ? 'Avisando…' : 'Achei este Pet! Alertar Tutor'}
              </button>

              {formularioAberto && (
                <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700 space-y-2 text-left">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Vamos avisar o tutor agora. Se você permitir a localização, ele saberá onde o
                    {' '}{pet.nome} foi visto.
                  </p>
                  <input
                    value={recado.contato}
                    onChange={(e) => setRecado({ ...recado, contato: e.target.value })}
                    placeholder="Seu telefone (opcional)"
                    className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500"
                  />
                  <textarea
                    rows={2}
                    value={recado.mensagem}
                    onChange={(e) => setRecado({ ...recado, mensagem: e.target.value })}
                    placeholder="Onde você encontrou? (opcional)"
                    className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 resize-none"
                  />
                  <button
                    type="button"
                    onClick={alertarTutor}
                    disabled={alertando}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl transition uppercase tracking-wide disabled:opacity-60"
                  >
                    {alertando ? 'Avisando…' : 'Confirmar alerta'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tutor info */}
          <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700 text-left text-xs space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tutor Responsável</span>
            <div className="font-extrabold text-white">{pet.tutor?.nome}</div>
            <div className="text-slate-400 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {pet.tutor?.cidade || 'Cidade não informada'}</div>
          </div>

          {/* Alertas Médicos & Saúde */}
          {pet.alergias && pet.alergias.length > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-left space-y-2">
              <div className="flex items-center gap-1.5 text-amber-400 font-extrabold text-xs">
                <AlertTriangle className="w-4 h-4" /> Alertas Médicos / Alergias
              </div>
              <ul className="text-xs text-amber-200 list-disc list-inside">
                {pet.alergias.map((a: ApiPayload, i: number) => (
                  <li key={i}>{a.nome || a.substancia}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Vacinas Recentes */}
          {pet.vacinas && pet.vacinas.length > 0 && (
            <div className="text-left space-y-2 pt-2">
              <h4 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">Vacinas Aplicadas Recentes</h4>
              <div className="space-y-2">
                {pet.vacinas.map((v: ApiPayload, i: number) => (
                  <div key={i} className="p-3 bg-slate-800 rounded-xl border border-slate-700/60 flex justify-between items-center text-xs">
                    <span className="font-bold text-white">{v.nome_vacina}</span>
                    <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {dataDeCalendario(v.data_aplicacao)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
