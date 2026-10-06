import type { ApiPayload } from '../../types/api'
import { useState, useEffect } from 'react';
import { 
  Plus, Edit3, Eye, Lock, RefreshCw, Upload, Image as ImageIcon, 
  Trash2, ShieldCheck, CheckCircle2, PauseCircle, Archive, AlertTriangle, 
  ArrowUp, ArrowDown, Calendar, Link as LinkIcon, Monitor, Smartphone, X, Sparkles
} from 'lucide-react';
import { API_URL } from '../../services/api'

export default function AdminBannerManager() {
  const [banners, setBanners] = useState<ApiPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedBanner, setSelectedBanner] = useState<ApiPayload | null>(null);
  const [previewDevice, setPreviewDevice] = useState('desktop'); // 'desktop' | 'mobile'
  const [confirmPassword, setConfirmPassword] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Formulário do Banner
  const [formData, setFormData] = useState<ApiPayload>({
    title: '',
    altText: '',
    targetUrl: '',
    buttonLabel: '',
    startsAt: '',
    endsAt: ''
  });

  const [desktopFile, setDesktopFile] = useState<ApiPayload | null>(null);
  const [mobileFile, setMobileFile] = useState<ApiPayload | null>(null);
  const [desktopPreviewUrl, setDesktopPreviewUrl] = useState('');
  const [mobilePreviewUrl, setMobilePreviewUrl] = useState('');

  useEffect(() => {
    fetchAdminBanners();
  }, []);

  // Nginx, Caddy e afins respondem erro em HTML. Chamar res.json() nesses casos
  // estoura "Unexpected token '<' ... is not valid JSON" e esconde do admin qual
  // foi o problema — que costuma ser upload acima do limite.
  const lerResposta = async (res: ApiPayload) => {
    const texto = await res.text();
    try {
      return JSON.parse(texto);
    } catch {
      if (res.status === 413) {
        throw new Error('Imagem grande demais para o envio. Use um arquivo de até 5 MB.');
      }
      throw new Error(`O servidor respondeu ${res.status} sem JSON. Tente de novo; se persistir, avise o suporte.`);
    }
  };

  const fetchAdminBanners = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/landing-banners`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await lerResposta(res);
      if (data.success) {
        setBanners(data.banners);
      }
    } catch (err: any) {
      console.error('Erro ao buscar banners admin:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setSelectedBanner(null);
    setFormData({
      title: '',
      altText: '',
      targetUrl: '',
      buttonLabel: 'Confira Agora',
      startsAt: '',
      endsAt: ''
    });
    setDesktopFile(null);
    setMobileFile(null);
    setDesktopPreviewUrl('');
    setMobilePreviewUrl('');
    setShowEditorModal(true);
  };

  const handleOpenEdit = (banner: ApiPayload) => {
    setSelectedBanner(banner);
    setFormData({
      title: banner.title || '',
      altText: banner.altText || '',
      targetUrl: banner.targetUrl || '',
      buttonLabel: banner.buttonLabel || 'Confira Agora',
      startsAt: banner.startsAt ? banner.startsAt.substring(0, 16) : '',
      endsAt: banner.endsAt ? banner.endsAt.substring(0, 16) : ''
    });
    setDesktopFile(null);
    setMobileFile(null);
    setDesktopPreviewUrl(banner.desktopImageUrl || '');
    setMobilePreviewUrl(banner.mobileImageUrl || '');
    setShowEditorModal(true);
  };

  const handleDesktopFileChange = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      setDesktopFile(file);
      setDesktopPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleMobileFileChange = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      setMobileFile(file);
      setMobilePreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSaveDraft = async (e: any) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    // Upload de imagem demora; sem trava o admin clica duas vezes e cria banner duplicado.
    if (saving) return;
    setSaving(true);

    try {
      const token = localStorage.getItem('token');
      const bodyFormData = new FormData();
      bodyFormData.append('title', formData.title);
      bodyFormData.append('altText', formData.altText);
      bodyFormData.append('targetUrl', formData.targetUrl);
      bodyFormData.append('buttonLabel', formData.buttonLabel);
      if (formData.startsAt) bodyFormData.append('startsAt', formData.startsAt);
      if (formData.endsAt) bodyFormData.append('endsAt', formData.endsAt);

      if (desktopFile) bodyFormData.append('desktopImage', desktopFile);
      if (mobileFile) bodyFormData.append('mobileImage', mobileFile);

      const url = selectedBanner 
        ? `${API_URL}/v1/admin/landing-banners/${selectedBanner.id}`
        : `${API_URL}/v1/admin/landing-banners`;
      const method = selectedBanner ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: bodyFormData
      });

      const data = await lerResposta(res);
      if (!data.success) {
        throw new Error(data.message || 'Erro ao salvar rascunho');
      }

      setSuccessMessage(selectedBanner ? 'Rascunho atualizado!' : 'Novo rascunho criado!');
      setShowEditorModal(false);
      fetchAdminBanners();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Pede os textos à IA a partir da imagem escolhida. Só preenche o formulário —
  // nada é salvo até o admin revisar e clicar em salvar rascunho.
  const handleSuggestCopy = async () => {
    if (suggesting) return;
    setSuggesting(true);
    setErrorMessage('');

    try {
      const token = localStorage.getItem('token');
      const bodyFormData = new FormData();
      if (desktopFile) bodyFormData.append('desktopImage', desktopFile);
      else if (mobileFile) bodyFormData.append('mobileImage', mobileFile);
      if (formData.title) bodyFormData.append('brief', formData.title);

      const res = await fetch(`${API_URL}/v1/admin/landing-banners/ai-copy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: bodyFormData
      });

      const data = await lerResposta(res);
      if (!data.success) {
        throw new Error(data.message || 'Erro ao gerar os textos');
      }

      setFormData((atual: ApiPayload) => ({
        ...atual,
        title: data.sugestao.title || atual.title,
        altText: data.sugestao.altText || atual.altText,
        buttonLabel: data.sugestao.buttonLabel || atual.buttonLabel
      }));
      setSuccessMessage('Textos preenchidos pela IA. Revise antes de salvar.');
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSuggesting(false);
    }
  };

  const handleOpenPublishModal = (banner: ApiPayload) => {
    setSelectedBanner(banner);
    setConfirmPassword('');
    setErrorMessage('');
    setShowPasswordModal(true);
  };

  const handleConfirmPublish = async (e: any) => {
    e.preventDefault();
    if (!confirmPassword) return;

    setPublishing(true);
    setErrorMessage('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/landing-banners/${selectedBanner.id}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ password: confirmPassword })
      });

      const data = await lerResposta(res);
      if (!data.success) {
        throw new Error(data.message || 'Erro ao publicar banner');
      }

      setSuccessMessage(`Banner "${selectedBanner.title}" publicado na landing page com sucesso!`);
      setShowPasswordModal(false);
      fetchAdminBanners();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleStatusChange = async (bannerId: string, status: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/landing-banners/${bannerId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      const data = await lerResposta(res);
      if (data.success) {
        setSuccessMessage(`Status do banner alterado para ${status}`);
        fetchAdminBanners();
      }
    } catch (err: any) {
      console.error('Erro ao alterar status:', err);
    }
  };

  const handleOpenDeleteModal = (banner: ApiPayload) => {
    setSelectedBanner(banner);
    setConfirmPassword('');
    setErrorMessage('');
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async (e: any) => {
    e.preventDefault();
    if (!confirmPassword) return;

    setDeleting(true);
    setErrorMessage('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/landing-banners/${selectedBanner.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ password: confirmPassword })
      });

      const data = await lerResposta(res);
      if (!data.success) {
        throw new Error(data.message || 'Erro ao excluir banner');
      }

      setSuccessMessage(`Banner "${selectedBanner.title}" excluído definitivamente.`);
      setShowDeleteModal(false);
      setConfirmPassword('');
      fetchAdminBanners();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // Troca o banner de lugar com o vizinho e persiste a nova ordem do carrossel.
  const handleMove = async (index: number, direction: number) => {
    const target = index + direction;
    if (target < 0 || target >= banners.length) return;

    const reordered = [...banners];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setBanners(reordered); // feedback imediato; fetchAdminBanners confirma no fim
    setReordering(true);
    setErrorMessage('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/v1/admin/landing-banners/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          positions: reordered.map((banner, idx) => ({ id: banner.id, position: idx }))
        })
      });

      const data = await lerResposta(res);
      if (!data.success) {
        throw new Error(data.message || 'Erro ao reordenar banners');
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setReordering(false);
      fetchAdminBanners();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"><CheckCircle2 size={14} /> PUBLICADO</span>;
      case 'DRAFT':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300"><Edit3 size={14} /> RASCUNHO</span>;
      case 'PAUSED':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300"><PauseCircle size={14} /> PAUSADO</span>;
      case 'ARCHIVED':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300"><Archive size={14} /> ARQUIVADO</span>;
      default:
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider text-teal-600 uppercase bg-teal-50 px-2.5 py-1 rounded-full">Painel → Landing Page</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">Banners e Promoções</h1>
          <p className="text-slate-500 text-sm mt-0.5">Gerencie os carrosséis de campanhas visíveis na landing page com publicação protegida por senha.</p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-sm transition-all text-sm cursor-pointer"
        >
          <Plus size={18} />
          <span>Criar Novo Banner</span>
        </button>
      </div>

      {/* MENSAGENS DE FEEDBACK */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-semibold flex items-center justify-between">
          <span>✅ {successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-900">×</button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm font-semibold flex items-center justify-between">
          <span>⚠️ {errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="text-rose-600 hover:text-rose-900">×</button>
        </div>
      )}

      {/* LISTA DE BANNERS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">Banners Cadastrados ({banners.length})</h3>
          <span className="text-xs text-slate-500">Separados por Rascunho, Publicados e Arquivados</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">Carregando banners...</div>
        ) : banners.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <ImageIcon size={48} className="mx-auto text-slate-300" />
            <p className="text-slate-500 font-semibold text-sm">Nenhum banner cadastrado para este tenant.</p>
            <button onClick={handleOpenCreate} className="text-teal-600 font-bold text-sm hover:underline">
              + Criar o primeiro banner rascunho
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {banners.map((banner, index) => (
              <div key={banner.id} className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 hover:bg-slate-50/80 transition-all">
                {/* Miniatura & Info */}
                <div className="flex items-center gap-4 min-w-0">
                  {/* Ordem no carrossel */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0 || reordering}
                      className="p-1 rounded-md text-slate-400 hover:text-teal-600 hover:bg-teal-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 disabled:cursor-not-allowed cursor-pointer transition-all"
                      title="Mover para cima (aparece antes no carrossel)"
                      aria-label="Mover banner para cima"
                    >
                      <ArrowUp size={16} />
                    </button>

                    <span className="text-[11px] font-bold text-slate-400 tabular-nums">{index + 1}º</span>

                    <button
                      onClick={() => handleMove(index, 1)}
                      disabled={index === banners.length - 1 || reordering}
                      className="p-1 rounded-md text-slate-400 hover:text-teal-600 hover:bg-teal-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 disabled:cursor-not-allowed cursor-pointer transition-all"
                      title="Mover para baixo (aparece depois no carrossel)"
                      aria-label="Mover banner para baixo"
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>

                  <div className="relative w-36 h-20 bg-slate-900 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0">
                    <img
                      src={banner.desktopImageUrl}
                      alt={banner.altText || banner.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-900 text-base truncate">{banner.title}</h4>
                      {getStatusBadge(banner.status)}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                      <span>Alt: <strong>{banner.altText || 'N/A'}</strong></span>
                      {banner.targetUrl && <span className="truncate max-w-xs">Link: <strong>{banner.targetUrl}</strong></span>}
                    </div>

                    {banner.startsAt && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Calendar size={13} />
                        <span>Vigência: {new Date(banner.startsAt).toLocaleDateString('pt-BR')} {banner.endsAt ? `até ${new Date(banner.endsAt).toLocaleDateString('pt-BR')}` : '(Sem data final)'}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex items-center gap-2 flex-wrap self-end md:self-center">
                  {/* Prévia */}
                  <button
                    onClick={() => {
                      setSelectedBanner(banner);
                      setShowPreviewModal(true);
                    }}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                    title="Visualizar prévia fiel"
                  >
                    <Eye size={16} />
                    <span>Prévia</span>
                  </button>

                  {/* Editar Rascunho */}
                  <button
                    onClick={() => handleOpenEdit(banner)}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Edit3 size={16} />
                    <span>Editar</span>
                  </button>

                  {/* Botão PUBLICAR (Requer Senha) */}
                  {banner.status !== 'PUBLISHED' && (
                    <button
                      onClick={() => handleOpenPublishModal(banner)}
                      className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                    >
                      <Lock size={14} />
                      <span>Publicar no Site</span>
                    </button>
                  )}

                  {/* Pausar / Arquivar */}
                  {banner.status === 'PUBLISHED' && (
                    <button
                      onClick={() => handleStatusChange(banner.id, 'PAUSED')}
                      className="px-3 py-2 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <PauseCircle size={14} />
                      <span>Pausar</span>
                    </button>
                  )}

                  {banner.status !== 'ARCHIVED' && (
                    <button
                      onClick={() => handleStatusChange(banner.id, 'ARCHIVED')}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                      title="Arquivar banner (sai do site, mantém o histórico)"
                    >
                      <Archive size={16} />
                    </button>
                  )}

                  {/* Excluir definitivamente */}
                  <button
                    onClick={() => handleOpenDeleteModal(banner)}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-xs font-semibold cursor-pointer transition-all"
                    title="Excluir banner definitivamente"
                    aria-label={`Excluir banner ${banner.title}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 📝 MODAL EDITOR (UPLOAD & FORMULÁRIO DE RASCUNHO) */}
      {showEditorModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-900">
                {selectedBanner ? 'Editar Rascunho de Banner' : 'Criar Novo Banner Rascunho'}
              </h2>
              <button onClick={() => setShowEditorModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveDraft} className="space-y-4">
              <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  A IA lê a imagem que você subiu e escreve o título, o texto alternativo e o botão. Você revisa antes de salvar.
                </p>
                <button
                  type="button"
                  onClick={handleSuggestCopy}
                  disabled={suggesting || (!desktopFile && !mobileFile && !formData.title)}
                  className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-all"
                  title={!desktopFile && !mobileFile && !formData.title ? 'Suba a imagem ou escreva o tema da campanha primeiro' : 'Preencher os textos com IA'}
                >
                  <Sparkles className={`w-4 h-4 ${suggesting ? 'animate-pulse' : ''}`} />
                  <span>{suggesting ? 'Escrevendo...' : 'Preencher com IA'}</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Título Interno da Campanha *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Campanha de Vacinação V10 — Março"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Texto Alternativo (Acessibilidade Alt) *</label>
                <input
                  type="text"
                  required
                  value={formData.altText}
                  onChange={(e) => setFormData({ ...formData, altText: e.target.value })}
                  placeholder="Descreva a imagem para leitores de tela"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              {/* UPLOAD DE IMAGENS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Desktop Image */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Imagem Desktop (1440 × 480) *</label>
                  <div className="border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-xl p-3 text-center transition-all bg-slate-50">
                    {desktopPreviewUrl ? (
                      <div className="space-y-2">
                        <img src={desktopPreviewUrl} alt="Preview Desktop" className="w-full h-24 object-cover rounded-lg" />
                        <label className="text-xs text-teal-600 font-bold cursor-pointer hover:underline">
                          <span>Trocar imagem</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleDesktopFileChange} className="hidden" />
                        </label>
                      </div>
                    ) : (
                      <label className="cursor-pointer block py-4 space-y-1">
                        <Upload size={24} className="mx-auto text-slate-400" />
                        <span className="text-xs font-bold text-slate-600 block">Enviar imagem Desktop</span>
                        <span className="text-[11px] text-slate-400 block">JPG, PNG, WebP ou AVIF</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleDesktopFileChange} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>

                {/* Mobile Image */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Imagem Mobile (750 × 750)</label>
                  <div className="border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-xl p-3 text-center transition-all bg-slate-50">
                    {mobilePreviewUrl ? (
                      <div className="space-y-2">
                        <img src={mobilePreviewUrl} alt="Preview Mobile" className="w-full h-24 object-cover rounded-lg" />
                        <label className="text-xs text-teal-600 font-bold cursor-pointer hover:underline">
                          <span>Trocar imagem</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleMobileFileChange} className="hidden" />
                        </label>
                      </div>
                    ) : (
                      <label className="cursor-pointer block py-4 space-y-1">
                        <Upload size={24} className="mx-auto text-slate-400" />
                        <span className="text-xs font-bold text-slate-600 block">Enviar imagem Mobile</span>
                        <span className="text-[11px] text-slate-400 block">Se vazio, usa o recorte do Desktop</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleMobileFileChange} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Link de Destino (Opcional)</label>
                  <input
                    type="url"
                    value={formData.targetUrl}
                    onChange={(e) => setFormData({ ...formData, targetUrl: e.target.value })}
                    placeholder="https://saudepet.app.br/tutor/solicitar"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Texto do Botão</label>
                  <input
                    type="text"
                    value={formData.buttonLabel}
                    onChange={(e) => setFormData({ ...formData, buttonLabel: e.target.value })}
                    placeholder="Confira Agora"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditorModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-100"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Enviando imagem...' : 'Salvar Rascunho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🔒 MODAL CRÍTICO DE CONFIRMAÇÃO COM SENHA PARA PUBLICAÇÃO */}
      {showPasswordModal && selectedBanner && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            <div className="w-14 h-14 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <ShieldCheck size={32} />
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-900">Confirmar Publicação no Site</h3>
              <p className="text-slate-500 text-sm mt-1">
                Você está prestes a publicar o banner <strong>"{selectedBanner.title}"</strong> diretamente na landing page pública do Saúde PET.
              </p>
            </div>

            <form onSubmit={handleConfirmPublish} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Digite sua senha de administrador *</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-teal-500 outline-none font-mono"
                  autoFocus
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-lg">
                  ⚠️ {errorMessage}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-100"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={publishing}
                  className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
                >
                  {publishing ? 'Validando...' : 'Confirmar & Publicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🗑️ MODAL CRÍTICO DE EXCLUSÃO DEFINITIVA (REQUER SENHA) */}
      {showDeleteModal && selectedBanner && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle size={32} />
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-900">Excluir Banner Definitivamente</h3>
              <p className="text-slate-500 text-sm mt-1">
                O banner <strong>"{selectedBanner.title}"</strong> e as imagens enviadas serão apagados para sempre.
                {selectedBanner.status === 'PUBLISHED' && (
                  <span className="block mt-2 font-bold text-rose-600">
                    Atenção: este banner está no ar e sairá da landing page imediatamente.
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-400 mt-3">
                Só quer tirar do ar sem perder o histórico? Use <strong>Arquivar</strong> no lugar.
              </p>
            </div>

            <div className="relative w-full h-24 bg-slate-900 rounded-xl overflow-hidden border border-slate-200">
              <img
                src={selectedBanner.desktopImageUrl}
                alt={selectedBanner.altText || selectedBanner.title}
                className="w-full h-full object-cover opacity-60"
              />
            </div>

            <form onSubmit={handleConfirmDelete} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Digite sua senha de administrador para confirmar *
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-rose-500 outline-none font-mono"
                  autoFocus
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-lg">
                  ⚠️ {errorMessage}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-100"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={deleting}
                  className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
                >
                  {deleting ? 'Excluindo...' : 'Excluir para sempre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 👁️ MODAL DE PRÉVIA FIEL DA LANDING PAGE */}
      {showPreviewModal && selectedBanner && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl max-w-4xl w-full p-6 text-white space-y-4 shadow-2xl border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Eye size={20} className="text-teal-400" />
                <h3 className="font-bold text-lg">Prévia Fiel da Landing Page</h3>
              </div>

              {/* Toggle Desktop vs Mobile */}
              <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    previewDevice === 'desktop' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Monitor size={14} /> Desktop (1440px)
                </button>

                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    previewDevice === 'mobile' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Smartphone size={14} /> Mobile (375px)
                </button>
              </div>

              <button onClick={() => setShowPreviewModal(false)} className="text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            {/* Container da Prévia Fiel */}
            <div className="py-6 flex justify-center bg-slate-950 rounded-2xl border border-slate-800 p-4">
              <div className={`transition-all duration-300 ${previewDevice === 'mobile' ? 'w-[375px]' : 'w-full'}`}>
                <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl">
                  <picture>
                    <source media="(max-width: 768px)" srcSet={selectedBanner.mobileImageUrl || selectedBanner.desktopImageUrl} />
                    <img 
                      src={previewDevice === 'mobile' ? (selectedBanner.mobileImageUrl || selectedBanner.desktopImageUrl) : selectedBanner.desktopImageUrl} 
                      alt={selectedBanner.altText} 
                      className="w-full h-full object-cover max-h-[400px]" 
                    />
                  </picture>
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex flex-col justify-end p-6">
                    <h3 className="text-xl font-extrabold text-white">{selectedBanner.title}</h3>
                    {selectedBanner.buttonLabel && (
                      <button className="mt-3 bg-teal-600 text-white font-bold px-5 py-2 rounded-full text-xs self-start shadow-md">
                        {selectedBanner.buttonLabel} →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
