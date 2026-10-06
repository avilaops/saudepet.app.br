import type { ApiPayload } from '../../types/api'
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import TutorBottomNav from '../../components/tutor/TutorBottomNav';
import NotificacoesPreferencias from '../../components/NotificacoesPreferencias';
import TamanhoDaLetra from '../../components/TamanhoDaLetra';
import PedirCredenciamentoVet from '../../components/tutor/PedirCredenciamentoVet';
import { Eyebrow, GhostAction, Icon, PageBody, PageHeader, Panel } from '../../components/ui/AppKit';

function TutorProfile() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [userData, setUserData] = useState<ApiPayload>({
    nome: '',
    email: '',
    telefone: '',
    cidade: '',
    data_nascimento: '',
    sobre: '',
    foto_perfil: '',
    foto_capa: ''
  });
  const [loading, setLoading] = useState(true);
  const fileInputPerfil = useRef<HTMLInputElement | null>(null);
  const fileInputCapa = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const response = await api.get('/auth/profile');
      setUserData({
        nome: response.data.nome || '',
        email: response.data.email || '',
        telefone: response.data.telefone || '',
        cidade: response.data.cidade || '',
        // `<input type="date">` só entende AAAA-MM-DD.
        data_nascimento: response.data.data_nascimento ? String(response.data.data_nascimento).slice(0, 10) : '',
        sobre: response.data.sobre || '',
        foto_perfil: response.data.foto_perfil || '',
        foto_capa: response.data.foto_capa || ''
      });
      setLoading(false);
    } catch (error: any) {
      console.error('❌ Erro ao carregar dados:', error);
      setLoading(false);
    }
  };

  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingCapa, setUploadingCapa] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const handleImageChange = async (e: any, tipo: string) => {
    const file = e.target.files[0];
    if (!file) return;

    setErro('');
    setSucesso('');

    if (!file.type.startsWith('image/')) {
      setErro('Por favor, selecione uma imagem válida.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErro('A imagem deve ter no máximo 5MB.');
      return;
    }

    const setUploading = tipo === 'perfil' ? setUploadingFoto : setUploadingCapa;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('foto', file);

      const response = await api.post(`/users/foto/${tipo}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setUserData((prev: ApiPayload) => ({
        ...prev,
        foto_perfil: response.data.usuario.foto_perfil,
        foto_capa: response.data.usuario.foto_capa
      }));
      setSucesso(tipo === 'perfil' ? 'Foto de perfil atualizada.' : 'Foto de capa atualizada.');
    } catch (error: any) {
      console.error('❌ Erro ao fazer upload:', error);
      setErro(error.response?.data?.error || 'Não foi possível atualizar a foto.');
    } finally {
      setUploading(false);
    }
  };

  const handleSalvar = async () => {
    setErro('');
    setSucesso('');
    try {
      const { nome, email, telefone, cidade, sobre, data_nascimento } = userData;
      await api.put('/users/profile', {
        nome, email, telefone, cidade, sobre,
        // Vazio é "não informado", não string vazia.
        data_nascimento: data_nascimento || null
      });
      setSucesso('Perfil atualizado com sucesso!');
    } catch (error: any) {
      console.error('❌ Erro ao salvar:', error);
      setErro(error.response?.data?.error || 'Não foi possível salvar o perfil.');
    }
  };

  const handleSairDaConta = () => {
    // logout do AuthContext: limpa também o estado do contexto, não só o storage.
    if (window.confirm('Tem certeza que deseja sair da conta?')) logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <div className="text-slate-500">Carregando...</div>
      </div>
    );
  }

  // Iniciais quando não há foto: nada de avatar genérico comprado de banco de imagem.
  const iniciais = (userData.nome || 'T')
    .split(' ')
    .slice(0, 2)
    .map((parte: ApiPayload) => parte[0])
    .join('')
    .toUpperCase();

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader
        title="Meu Perfil"
        onBack={() => navigate(-1)}
        action={<GhostAction onClick={handleSairDaConta} icon="logout" label="Sair" />}
      />

      {/* Foto de Capa */}
      <div className="relative">
        <div className="h-32 overflow-hidden bg-gradient-to-r from-primary to-[#0b5f62]">
          {userData.foto_capa ? (
            <img
              src={userData.foto_capa}
              alt="Capa"
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>

        {/* Botão Capa */}
        <input
          type="file"
          ref={fileInputCapa}
          onChange={(e) => handleImageChange(e, 'capa')}
          accept="image/*"
          className="hidden"
        />
        <button
          onClick={() => fileInputCapa.current?.click()}
          className="absolute right-4 top-4 flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-1.5 text-[0.72rem] font-semibold text-ink shadow-sm backdrop-blur transition hover:bg-white"
        >
          <Icon name="camera" size={14} />
          Capa
        </button>

        {/* Foto de Perfil */}
        <div className="absolute -bottom-11 left-1/2 -translate-x-1/2">
          <div className="relative">
            <div className="h-[88px] w-[88px] overflow-hidden rounded-full border-4 border-white bg-slate-100 shadow-sm">
              {userData.foto_perfil ? (
                <img
                  src={userData.foto_perfil}
                  alt="Perfil"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary/10 text-xl font-semibold text-primary">
                  {iniciais}
                </div>
              )}
            </div>
            <input
              type="file"
              ref={fileInputPerfil}
              onChange={(e) => handleImageChange(e, 'perfil')}
              accept="image/*"
              className="hidden"
            />
            <button
              onClick={() => fileInputPerfil.current?.click()}
              className="absolute bottom-0 right-0 rounded-full bg-primary p-1.5 text-white shadow-sm transition hover:bg-[#127e82]"
              aria-label="Trocar foto de perfil"
            >
              <Icon name="camera" size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Nome. A margem acompanha o quanto a foto desce sobre a capa
          (-bottom-11 = 44px) mais um respiro, senão o nome encosta nela. */}
      <div className="mt-[3.25rem] px-5 text-center">
        <h2 className="text-[1.05rem] font-semibold tracking-tight text-ink">{userData.nome}</h2>
        {/* Sem estrelas aqui: tutor não recebe avaliação — a nota fixa
            "4.8 • 6 avaliações" era dado inventado. */}
        <p className="mt-1 text-[0.75rem] text-slate-400">{userData.cidade || 'Complete seu perfil abaixo'}</p>
      </div>

      {/* Formulário de Informações */}
      <PageBody>
        {erro && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">
            {erro}
          </p>
        )}
        {sucesso && (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[0.78rem] text-emerald-700" role="status">
            {sucesso}
          </p>
        )}

        {/* `space-y-4` entre os campos: com 3 o rótulo miúdo de um campo caía
            perto demais do campo anterior e a lista virava um bloco só. */}
        <Panel className="space-y-4 px-4 py-4">
          <h3 className="text-[0.9rem] font-semibold text-ink">Informações</h3>

          {/* Nome completo */}
          <label className="block">
            <Eyebrow className="text-slate-400">Nome completo</Eyebrow>
            <input
              type="text"
              value={userData.nome}
              onChange={(e) => setUserData({...userData, nome: e.target.value})}
              className="input mt-1.5 text-[0.8rem] text-ink"
              placeholder="Seu nome completo"
            />
          </label>

          {/* Email */}
          <label className="block">
            <Eyebrow className="text-slate-400">Email</Eyebrow>
            <input
              type="email"
              value={userData.email}
              onChange={(e) => setUserData({...userData, email: e.target.value})}
              className="input mt-1.5 text-[0.8rem] text-ink"
              placeholder="seu@email.com"
            />
          </label>

          {/* Telefone */}
          <label className="block">
            <Eyebrow className="text-slate-400">Telefone</Eyebrow>
            <input
              type="tel"
              value={userData.telefone}
              onChange={(e) => setUserData({...userData, telefone: e.target.value})}
              className="input mt-1.5 text-[0.8rem] text-ink"
              placeholder="(00) 00000-0000"
            />
          </label>

          {/* Cidade */}
          <label className="block">
            <Eyebrow className="text-slate-400">Cidade</Eyebrow>
            <input
              type="text"
              value={userData.cidade}
              onChange={(e) => setUserData({...userData, cidade: e.target.value})}
              className="input mt-1.5 text-[0.8rem] text-ink"
              placeholder="Sua cidade"
            />
          </label>

          {/* Data de nascimento */}
          <label className="block">
            <Eyebrow className="text-slate-400">Data de nascimento</Eyebrow>
            <input
              type="date"
              value={userData.data_nascimento}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setUserData({...userData, data_nascimento: e.target.value})}
              className="input mt-1.5 text-[0.8rem] text-ink"
            />
          </label>

          {/* Sobre Mim */}
          <label className="block">
            <Eyebrow className="text-slate-400">Sobre Mim</Eyebrow>
            <textarea
              value={userData.sobre}
              onChange={(e) => setUserData({...userData, sobre: e.target.value})}
              rows={3}
              className="input mt-1.5 resize-none text-[0.8rem] text-ink"
              placeholder="Conte um pouco sobre você e seus pets..."
            />
          </label>

          {/* Botão Salvar. `pt-1` sobre o espaço do grupo: o botão encerra o
              formulário, não é mais um campo da lista. */}
          <button
            onClick={handleSalvar}
            className="mt-1 w-full rounded-2xl bg-primary px-4 py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82]"
          >
            Salvar
          </button>
        </Panel>

        {/* Estas duas telas existiam sem nenhuma navegação que levasse a elas:
            estavam no roteador e eram inalcançáveis pelo aplicativo. */}
        <Panel className="divide-y divide-slate-100 overflow-hidden">
          <button
            type="button"
            onClick={() => navigate('/tutor/planos')}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name="spark" size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.85rem] font-semibold text-ink">Planos e assinatura</span>
              <span className="mt-0.5 block text-[0.72rem] text-slate-400">Benefícios para você e seus pets</span>
            </span>
            <Icon name="chevron" size={16} className="shrink-0 text-slate-300" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/tutor/privacidade')}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name="shield" size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.85rem] font-semibold text-ink">Privacidade e conta</span>
              <span className="mt-0.5 block text-[0.72rem] text-slate-400">Trocar senha, baixar seus dados, encerrar a conta</span>
            </span>
            <Icon name="chevron" size={16} className="shrink-0 text-slate-300" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/tutor/parceiros')}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name="paw" size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.85rem] font-semibold text-ink">Parceiros</span>
              <span className="mt-0.5 block text-[0.72rem] text-slate-400">Pet shops e serviços credenciados</span>
            </span>
            <Icon name="chevron" size={16} className="shrink-0 text-slate-300" />
          </button>
        </Panel>

        {/* O caminho para virar profissional sem abrir uma segunda conta.
            Só aparece para quem ainda é tutor — quem já foi credenciado tem a
            área do veterinário. */}
        {user?.tipo_usuario === 'tutor' && <PedirCredenciamentoVet />}

        {/* Notificações e situação da conta */}
        <TamanhoDaLetra />

        <NotificacoesPreferencias />

        {/* Sair da conta */}
        <button
          onClick={handleSairDaConta}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 px-4 py-3 text-[0.8rem] font-semibold text-red-500 transition hover:bg-red-50"
        >
          <Icon name="logout" size={16} />
          Sair da conta
        </button>
      </PageBody>

      <TutorBottomNav />
    </div>
  );
}

export default TutorProfile;
