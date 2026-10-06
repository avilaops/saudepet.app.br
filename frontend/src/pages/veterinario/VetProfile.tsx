import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetAvatar, VetBottomNav, VetIcon, VetLoading, VetPageHeader } from '../../components/veterinario/VetUI'

// Perfil do veterinário no padrão VetUI. A versão anterior era um mockup:
// capa do Unsplash, avatar do via.placeholder, galeria que nunca carregava,
// três botões sem onClick e "4.8 • 6 avaliações" por cima de dados reais.
const UFS_CRMV = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

export default function VetProfile() {
  const navigate = useNavigate()
  const [veterinario, setVeterinario] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [uploading, setUploading] = useState<ApiPayload | null>(null) // 'perfil' | 'capa' | null
  const [form, setForm] = useState<ApiPayload>({ nome: '', cidade: '', especialidade: '', crmv: '', crmv_uf: '', sobre: '' })
  const inputPerfil = useRef<HTMLInputElement | null>(null)
  const inputCapa = useRef<HTMLInputElement | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data } = await api.get('/veterinarios/meus-dados')
      setVeterinario(data)
      setForm({
        nome: data.usuario?.nome || '',
        cidade: data.usuario?.cidade || '',
        especialidade: data.especialidade || '',
        crmv: data.crmv || '',
        crmv_uf: data.crmv_uf || '',
        sobre: data.usuario?.sobre || ''
      })
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar seu perfil.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  // Antes de aprovado o vet corrige o próprio número; depois disso o CRMV é a
  // credencial que a equipe verificou e a troca passa pela documentação.
  const crmvEditavel = veterinario?.status_credenciamento !== 'APPROVED'

  const salvar = async (event: any) => {
    event.preventDefault()
    setSalvando(true)
    setErro('')
    setSucesso('')
    try {
      await api.put('/users/profile', { nome: form.nome, cidade: form.cidade, sobre: form.sobre })
      // O CRMV só vai junto quando pode ser alterado. Depois de aprovado ele é
      // a credencial que a equipe analisou: o backend recusa a troca, e mandar
      // o campo à toa faria o salvamento inteiro falhar por nada.
      await api.put('/veterinarios/perfil', {
        especialidade: form.especialidade,
        sobre: form.sobre,
        ...(crmvEditavel ? { crmv: form.crmv } : {}),
        // UF ainda não conferida (conta antiga sem UF) pode ser preenchida mesmo depois de aprovado.
        ...((crmvEditavel || !veterinario?.crmv_uf) && form.crmv_uf ? { crmv_uf: form.crmv_uf } : {})
      })
      setSucesso('Perfil atualizado com sucesso!')
      carregar()
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível salvar as alterações.')
    } finally {
      setSalvando(false)
    }
  }

  const trocarFoto = (tipo: string) => async (event: any) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setErro('')
    setSucesso('')
    if (!file.type.startsWith('image/')) return setErro('Por favor, selecione uma imagem válida.')
    if (file.size > 5 * 1024 * 1024) return setErro('A imagem deve ter no máximo 5MB.')
    setUploading(tipo)
    try {
      const formData = new FormData()
      formData.append('foto', file)
      const { data } = await api.post(`/users/foto/${tipo}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setVeterinario((atual: ApiPayload) => atual ? { ...atual, usuario: { ...atual.usuario, foto_perfil: data.usuario.foto_perfil, foto_capa: data.usuario.foto_capa } } : atual)
      setSucesso(tipo === 'perfil' ? 'Foto de perfil atualizada.' : 'Foto de capa atualizada.')
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível atualizar a foto.')
    } finally {
      setUploading(null)
    }
  }

  if (loading) return <main className="vet-app"><VetLoading label="Carregando seu perfil" /></main>

  if (!veterinario) {
    return (
      <main className="vet-app">
        <VetPageHeader compact title="Meu perfil" onBack={() => navigate('/veterinario/home')} />
        <div className="vet-app-main">
          <div className="vet-card vet-empty">
            <VetIcon name="user" size={38} />
            <strong>{erro || 'Não foi possível carregar seu perfil.'}</strong>
            <button className="vet-button--primary" type="button" onClick={carregar}>Tentar novamente</button>
          </div>
        </div>
      </main>
    )
  }

  const usuario = veterinario.usuario || {}
  const totalAvaliacoes = veterinario.total_avaliacoes ?? null

  return (
    <main className="vet-app">
      <VetPageHeader compact title="Meu perfil" subtitle="Como os tutores veem você" onBack={() => navigate('/veterinario/home')} />
      <div className="vet-app-main">
        {erro && <p className="vet-card vet-request" role="alert">{erro}</p>}
        {sucesso && <p className="vet-card vet-bank-success" role="status">{sucesso}</p>}

        {/* Capa + avatar reais — sem imagem, fica a cor da marca e as iniciais */}
        <section className="vet-card vet-profile-hero">
          <div className="vet-profile-hero__capa">
            {usuario.foto_capa && <img src={usuario.foto_capa} alt="" />}
            <button type="button" className="vet-profile-hero__trocar" onClick={() => inputCapa.current?.click()} disabled={uploading === 'capa'}>
              <VetIcon name="image" size={14} /> {uploading === 'capa' ? 'Enviando…' : 'Capa'}
            </button>
          </div>
          <div className="vet-profile-hero__cabecalho">
            <button type="button" className="vet-profile-hero__avatar" onClick={() => inputPerfil.current?.click()} aria-label="Trocar foto de perfil" disabled={uploading === 'perfil'}>
              <VetAvatar user={usuario} size="lg" />
              <span><VetIcon name="camera" size={13} /></span>
            </button>
            <div>
              <strong>Dr(a). {usuario.nome}</strong>
              <small>{[veterinario.especialidade, veterinario.crmv ? `CRMV ${veterinario.crmv}${veterinario.crmv_uf ? `/${veterinario.crmv_uf}` : ''}` : null].filter(Boolean).join(' · ') || 'Complete seu perfil profissional'}</small>
              <small>
                {Number(veterinario.total_atendimentos) > 0
                  ? `★ ${Number(veterinario.avaliacao_media || 0).toFixed(1)}${totalAvaliacoes != null ? ` (${totalAvaliacoes})` : ''} · ${veterinario.total_atendimentos} atendimentos`
                  : 'Ainda sem atendimentos avaliados'}
              </small>
            </div>
          </div>
          <input ref={inputPerfil} type="file" accept="image/*" hidden onChange={trocarFoto('perfil')} />
          <input ref={inputCapa} type="file" accept="image/*" hidden onChange={trocarFoto('capa')} />
        </section>

        <form className="vet-card vet-section-card" onSubmit={salvar}>
          <div className="vet-section-card__title"><VetIcon name="edit" size={18} /><h2>Informações do perfil</h2></div>
          <div className="vet-prescription-note">
            <label>Nome completo<input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required minLength={2} maxLength={100} /></label>
            <label>Cidade<input className="input" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} maxLength={100} /></label>
            <label>Especialidade<input className="input" value={form.especialidade} onChange={(e) => setForm({ ...form, especialidade: e.target.value })} maxLength={100} placeholder="Ex.: clínica geral" /></label>
            <label>
              CRMV
              <input
                className="input"
                value={form.crmv}
                onChange={(e) => setForm({ ...form, crmv: e.target.value })}
                maxLength={20}
                placeholder="SP-12345"
                readOnly={!crmvEditavel}
                aria-describedby={crmvEditavel ? undefined : 'crmv-bloqueado'}
              />
              {!crmvEditavel && (
                <small id="crmv-bloqueado">
                  Verificado no credenciamento. Para corrigir, envie o documento novo em Configurações → Documentação.
                </small>
              )}
            </label>
            <label>
              Estado do CRMV
              <select
                className="input"
                value={form.crmv_uf}
                onChange={(e) => setForm({ ...form, crmv_uf: e.target.value })}
                disabled={!crmvEditavel && Boolean(veterinario?.crmv_uf)}
                aria-label="Estado do CRMV"
              >
                <option value="">Selecione a UF</option>
                {UFS_CRMV.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </label>
            <label>Sobre você<textarea className="input" rows={4} value={form.sobre} onChange={(e) => setForm({ ...form, sobre: e.target.value })} maxLength={1000} placeholder="Conte sua experiência e como você atende — os tutores leem isto antes de aceitar." /></label>
          </div>
          <button className="vet-modal__submit" type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar alterações'}</button>
        </form>
      </div>
      <VetBottomNav />
    </main>
  )
}
