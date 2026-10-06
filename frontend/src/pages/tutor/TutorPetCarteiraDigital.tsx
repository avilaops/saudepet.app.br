import type { ApiPayload } from '../../types/api'
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer } from 'lucide-react';
import QRCode from 'qrcode';
import api from '../../services/api';
import TutorBottomNav from '../../components/tutor/TutorBottomNav';
import { Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit';

const SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'https://saudepet.app.br';

export default function TutorPetCarteiraDigital() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pet, setPet] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  // QR gerado no próprio navegador: a carteira dependia de um serviço externo
  // (api.qrserver.com), que recebia o id do pet e derrubava o QR se caísse.
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    fetchPetDetails();
  }, [id]);

  const fetchPetDetails = async () => {
    try {
      setLoading(true);
      setErro('');
      const { data } = await api.get(`/pets/${id}`);
      if (data?.pet) setPet(data.pet);
      else setErro('Pet não encontrado.');
    } catch (requestError: any) {
      setErro(requestError.response?.status === 404
        ? 'Pet não encontrado.'
        : requestError.response?.data?.error || 'Não foi possível carregar a carteira agora.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!pet?.id) return;
    QRCode.toDataURL(`${SITE_URL}/pet-tag/${pet.id}`, { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [pet?.id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center p-6 text-center text-[0.78rem] text-slate-400">
        Carregando Carteira Digital de Saúde do Pet...
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="container-app bg-surface-page pb-24">
        <PageHeader title="Carteira digital" onBack={() => navigate(-1)} />
        <div className="px-5 py-5">
          <Panel className="space-y-3 px-6 py-10 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-500">
              <Icon name="alert" size={20} />
            </span>
            <p className="text-[0.8rem] text-slate-500">{erro || 'Pet não encontrado.'}</p>
            <button
              onClick={() => navigate(-1)}
              className="rounded-xl bg-primary px-4 py-2.5 text-[0.78rem] font-semibold text-white transition hover:bg-[#127e82]"
            >
              Voltar
            </button>
          </Panel>
        </div>
      </div>
    );
  }

  const especie = pet.especie || pet.tipo || '';
  const idade = pet.idade != null
    ? (Number(pet.idade) === 0 ? 'Menos de 1 ano' : `${pet.idade} ${Number(pet.idade) === 1 ? 'ano' : 'anos'}`)
    : 'Idade não informada';

  const ficha = [
    { rotulo: 'Espécie / Raça', valor: `${especie} • ${pet.raca || 'Sem raça definida'}` },
    { rotulo: 'Idade / Sexo', valor: `${idade}${pet.sexo ? ` • ${pet.sexo}` : ''}` },
    { rotulo: 'Castrado / Microchip', valor: `${pet.castrado ? 'Sim' : 'Não'}${pet.microchip ? ` • #${pet.microchip}` : ''}` }
  ];

  return (
    <div className="container-app bg-surface-page pb-24 print:max-w-none print:bg-white print:pb-0">
      {/* Cabeçalho e navegação saem do papel: a folha guarda só a carteira. */}
      <div className="print:hidden">
        <PageHeader
          title="Carteira digital"
          subtitle={pet.nome}
          onBack={() => navigate(-1)}
        />
      </div>

      <div className="space-y-4 px-5 pb-6 pt-5 print:px-0 print:py-0">
        <button
          onClick={handlePrint}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82] print:hidden"
        >
          <Printer className="h-4 w-4" /> Imprimir Carteira / QR Code da Coleira
        </button>

        {/* PASSAPORTE / CARTEIRA DIGITAL DO PET */}
        <Panel className="space-y-5 px-4 py-5 print:border-none print:shadow-none">
          {/* Top Passaporte Header */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Icon name="paw" size={20} />
              </span>
              <div className="min-w-0">
                <Eyebrow className="block text-primary">Carteira Digital de Saúde</Eyebrow>
                <h1 className="mt-0.5 truncate text-[1.15rem] font-semibold tracking-tight text-ink">{pet.nome}</h1>
              </div>
            </div>

            <div className="shrink-0 text-right font-mono text-[0.65rem] text-slate-400">
              <div>REGISTRO SAÚDE PET</div>
              <div className="font-semibold text-ink">ID: #{String(pet.id || '').slice(0, 8).toUpperCase()}</div>
            </div>
          </div>

          {/* Dados do Pet e QR Code da Coleira */}
          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
            {/* Foto do Pet. `py-1` acima do grupo: a foto redonda é o centro do
                cartão e precisa de ar antes da ficha começar. */}
            <div className="flex flex-col items-center gap-2 py-1 text-center">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white shadow-sm">
                {pet.foto ? (
                  <img src={pet.foto} alt={pet.nome} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl">🐶</span>
                )}
              </div>
              <span className="text-[0.85rem] font-semibold text-ink">{pet.nome}</span>
            </div>

            {/* Ficha Geral */}
            <div className="divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
              {ficha.map((linha) => (
                <div key={linha.rotulo} className="px-3.5 py-2.5">
                  <Eyebrow className="block text-slate-400">{linha.rotulo}</Eyebrow>
                  <p className="mt-0.5 text-[0.8rem] font-semibold text-ink">{linha.valor}</p>
                </div>
              ))}
            </div>

            {/* QR Code de Coleira Inteligente */}
            <div className="flex flex-col items-center justify-center space-y-2 rounded-xl border border-slate-200/80 bg-white p-3 text-center">
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR code da coleira" className="h-24 w-24" />
                : <div className="grid h-24 w-24 place-items-center text-[0.65rem] text-slate-400">Gerando…</div>}
              <Eyebrow className="block text-ink">QR Code da Coleira</Eyebrow>
              <span className="block text-[0.65rem] text-slate-400">Escaneie em caso de emergência</span>
            </div>
          </div>

          {/* Histórico de Vacinas */}
          <div className="space-y-2.5">
            <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold text-ink">
              <Icon name="shield" size={18} className="text-primary" /> Registro de Vacinação
            </h3>

            {(!pet.vacinas || pet.vacinas.length === 0) ? (
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-6 text-center text-[0.75rem] leading-relaxed text-slate-400">
                Nenhuma vacina registrada ainda. As vacinas aplicadas pelos veterinários da plataforma são lançadas automaticamente aqui.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80">
                {pet.vacinas.map((v: ApiPayload, i: number) => (
                  <div key={i} className="flex items-start justify-between gap-3 bg-white px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-[0.82rem] font-semibold text-ink">{v.nome_vacina}</div>
                      <div className="mt-0.5 text-[0.7rem] text-slate-400">
                        {[v.laboratorio && `Laboratório: ${v.laboratorio}`, v.lote && `Lote: ${v.lote}`].filter(Boolean).join(' • ') || 'Sem laboratório/lote registrados'}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold text-primary">
                      Aplicada em {new Date(v.data_aplicacao).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="print:hidden">
        <TutorBottomNav />
      </div>
    </div>
  );
}
