import type { ApiPayload } from '../../types/api'
import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import FichaSaudePet from '../../components/tutor/FichaSaudePet'
import { EmptyState, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import { racasPorTipo, OPCAO_OUTRA_RACA, OPCOES_IDADE } from '../../data/racas'

const CAMPO = 'mt-1.5 w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary'

export default function MeusPets() {
  const navigate = useNavigate()
  const location = useLocation()
  const [aviso, setAviso] = useState(location.state?.aviso || '')
  const [erro, setErro] = useState('')
  const [erroModal, setErroModal] = useState('')
  const [pets, setPets] = useState<ApiPayload[]>([])
  const [carregando, setCarregando] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingPet, setEditingPet] = useState<ApiPayload | null>(null)
  // Valor do seletor de raça: uma raça da lista, OPCAO_OUTRA_RACA ou ''.
  // O que vai para a API continua sendo formData.raca.
  const [racaEscolha, setRacaEscolha] = useState('')
  const [formData, setFormData] = useState<ApiPayload>({
    nome: '',
    tipo: 'cachorro',
    raca: '',
    idade: '',
    peso: '',
    sexo: '',
    porte: '',
    cor: '',
    castrado: false,
    data_nascimento: '',
    microchip: '',
    pedigree: '',
    condicoes_preexistentes: ''
  })

  useEffect(() => {
    carregarPets()
  }, [])

  const [uploadingFotoPetId, setUploadingFotoPetId] = useState<ApiPayload | null>(null)

  const carregarPets = async () => {
    try {
      const response = await api.get('/pets')
      setPets(response.data?.pets || [])
    } catch (error: any) {
      setErro(error.response?.data?.error || 'Não foi possível carregar seus pets.')
    } finally {
      setCarregando(false)
    }
  }

  const handleFotoPetChange = async (e: any, petId: ApiPayload) => {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErro('Por favor, selecione uma imagem válida.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setErro('A imagem deve ter no máximo 5MB.')
      return
    }

    try {
      setErro('')
      setUploadingFotoPetId(petId)
      const formData = new FormData()
      formData.append('foto', file)

      await api.post(`/pets/${petId}/foto`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      carregarPets()
    } catch (error: any) {
      console.error('Erro ao fazer upload da foto do pet:', error)
      setErro(error.response?.data?.error || 'Não foi possível atualizar a foto do pet.')
    } finally {
      setUploadingFotoPetId(null)
    }
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault()

    try {
      // Inputs entregam string; idade/peso viajam como número e vazio vira null.
      const payload = {
        ...formData,
        idade: formData.idade === '' || formData.idade === null ? null : Number(formData.idade),
        peso: formData.peso === '' || formData.peso === null ? null : Number(formData.peso),
        // Campo em branco significa "não informado", e não string vazia: o
        // backend limpa o valor quando recebe `null`.
        sexo: formData.sexo || null,
        porte: formData.porte || null,
        cor: formData.cor.trim() || null,
        data_nascimento: formData.data_nascimento || null,
        microchip: formData.microchip.trim() || null,
        pedigree: formData.pedigree.trim() || null,
        condicoes_preexistentes: formData.condicoes_preexistentes.trim() || null
      }
      if (editingPet) {
        await api.put(`/pets/${editingPet.id}`, payload)
      } else {
        await api.post('/pets', payload)
      }

      carregarPets()
      closeModal()
    } catch (error: any) {
      // O middleware devolve details[{field,message}] — a mensagem do campo é
      // o que ajuda a corrigir; "Erro de validação" sozinho não diz nada.
      const detalhe = error.response?.data?.details?.[0]
      const mensagem = detalhe
        ? `${detalhe.message}`
        : (error.response?.data?.error || error.message)
      setErroModal(mensagem)
    }
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este pet?')) {
      try {
        setErro('')
        await api.delete(`/pets/${id}`)
        carregarPets()
      } catch (error: any) {
        setErro(error.response?.data?.error || 'Não foi possível remover o pet.')
      }
    }
  }

  const openModal = (pet: ApiPayload = null) => {
    if (pet) {
      setEditingPet(pet)
      setFormData({
        nome: pet.nome,
        tipo: pet.tipo,
        raca: pet.raca || '',
        idade: pet.idade ?? '',
        peso: pet.peso || '',
        sexo: pet.sexo || '',
        porte: pet.porte || '',
        cor: pet.cor || '',
        castrado: Boolean(pet.castrado),
        // `<input type="date">` só entende AAAA-MM-DD.
        data_nascimento: pet.data_nascimento ? String(pet.data_nascimento).slice(0, 10) : '',
        microchip: pet.microchip || '',
        pedigree: pet.pedigree || '',
        condicoes_preexistentes: pet.condicoes_preexistentes || ''
      })
      const lista = racasPorTipo(pet.tipo)
      setRacaEscolha(!pet.raca ? '' : lista && lista.includes(pet.raca) ? pet.raca : lista ? OPCAO_OUTRA_RACA : '')
    } else {
      setEditingPet(null)
      setFormData({
        nome: '',
        tipo: 'cachorro',
        raca: '',
        idade: '',
        peso: '',
        sexo: '',
        porte: '',
        cor: '',
        castrado: false,
        data_nascimento: '',
        microchip: '',
        pedigree: '',
        condicoes_preexistentes: ''
      })
      setRacaEscolha('')
    }
    setErroModal('')
    setShowModal(true)
  }

  const mudarTipo = (tipo: string) => {
    // Trocar a espécie zera a raça — a lista de opções muda junto.
    setFormData((atual: ApiPayload) => ({ ...atual, tipo, raca: '' }))
    setRacaEscolha('')
  }

  const mudarRaca = (valor: string) => {
    setRacaEscolha(valor)
    setFormData((atual: ApiPayload) => ({ ...atual, raca: valor === OPCAO_OUTRA_RACA ? '' : valor }))
  }

  const racasDaEspecie = racasPorTipo(formData.tipo)

  const closeModal = () => {
    setShowModal(false)
    setEditingPet(null)
    setErroModal('')
  }

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader
        title="Meus pets"
        subtitle={pets.length > 0 ? `${pets.length} cadastrado${pets.length !== 1 ? 's' : ''}` : 'Nenhum cadastrado ainda'}
        onBack={() => navigate('/tutor/home')}
      />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {aviso && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.78rem] text-amber-800" role="status">
            <span>{aviso}</span>
            <button type="button" className="font-bold" onClick={() => setAviso('')} aria-label="Dispensar aviso">✕</button>
          </div>
        )}
        {erro && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">
            {erro}
          </p>
        )}
        <button
          onClick={() => openModal()}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82]"
        >
          <Icon name="plus" size={15} />
          Adicionar pet
        </button>

        {carregando ? (
          <div className="flex justify-center py-14">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" aria-label="Carregando" />
          </div>
        ) : pets.length === 0 ? (
          <EmptyState
            icon="paw"
            title="Nenhum pet cadastrado"
            description="O cadastro do animal é o que permite chamar um veterinário e guardar o histórico clínico dele."
          />
        ) : (
          <div className="space-y-2.5">
            {pets.map((pet) => (
              <Panel key={pet.id} className="flex items-center gap-3 px-4 py-3.5" as="article">
                {/* A foto é o próprio alvo de upload: um toque troca a imagem. */}
                <label className="relative block h-14 w-14 shrink-0 cursor-pointer">
                  <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-300">
                    {pet.foto
                      ? <img src={pet.foto} alt={pet.nome} className="h-full w-full object-cover" />
                      : <Icon name="paw" size={22} />}
                  </span>
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-lg border border-white bg-ink text-white">
                    <Icon name="camera" size={11} />
                  </span>
                  {uploadingFotoPetId === pet.id && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-ink/50">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    </span>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFotoPetChange(e, pet.id)} />
                </label>

                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[0.9rem] font-semibold tracking-tight text-ink">{pet.nome}</h2>
                  <p className="mt-0.5 truncate text-[0.72rem] text-slate-400">
                    {[pet.raca || pet.tipo, pet.idade ? `${pet.idade} anos` : null, pet.peso ? `${pet.peso} kg` : null]
                      .filter(Boolean).join(' · ')}
                  </p>
                  <button
                    onClick={() => navigate(`/tutor/pet/${pet.id}/carteira`)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-primary transition hover:text-[#0d6b6e]"
                  >
                    Carteira digital
                    <Icon name="chevron" size={12} />
                  </button>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openModal(pet)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 text-slate-500 transition hover:bg-slate-50"
                    aria-label={`Editar ${pet.nome}`}
                  >
                    <Icon name="pencil" size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(pet.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remover ${pet.nome}`}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-4 backdrop-blur-sm sm:items-center">
          <form
            onSubmit={handleSubmit}
            className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 bg-ink px-5 py-4 text-white">
              <h2 className="text-[1rem] font-semibold tracking-tight">
                {editingPet ? `Editar ${editingPet.nome}` : 'Novo pet'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="space-y-3 px-5 py-5">
              {erroModal && (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">
                  {erroModal}
                </p>
              )}
              <label className="block">
                <Eyebrow className="text-slate-400">Nome</Eyebrow>
                <input
                  type="text"
                  className={CAMPO}
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                />
              </label>

              <label className="block">
                <Eyebrow className="text-slate-400">Espécie</Eyebrow>
                <select
                  className={CAMPO}
                  value={formData.tipo}
                  onChange={(e) => mudarTipo(e.target.value)}
                  required
                >
                  <option value="cachorro">Cachorro</option>
                  <option value="gato">Gato</option>
                  <option value="outro">Outro</option>
                </select>
              </label>

              {racasDaEspecie ? (
                <>
                  <label className="block">
                    <Eyebrow className="text-slate-400">Raça</Eyebrow>
                    <select className={CAMPO} value={racaEscolha} onChange={(e) => mudarRaca(e.target.value)}>
                      <option value="">Selecione a raça</option>
                      {racasDaEspecie.map((raca) => (
                        <option key={raca} value={raca}>{raca}</option>
                      ))}
                      <option value={OPCAO_OUTRA_RACA}>{OPCAO_OUTRA_RACA}</option>
                    </select>
                  </label>
                  {racaEscolha === OPCAO_OUTRA_RACA && (
                    <label className="block">
                      <Eyebrow className="text-slate-400">Qual raça?</Eyebrow>
                      <input
                        type="text"
                        className={CAMPO}
                        value={formData.raca}
                        onChange={(e) => setFormData({ ...formData, raca: e.target.value })}
                        placeholder="Digite a raça"
                        autoFocus
                      />
                    </label>
                  )}
                </>
              ) : (
                <label className="block">
                  <Eyebrow className="text-slate-400">Raça ou espécie</Eyebrow>
                  <input
                    type="text"
                    className={CAMPO}
                    value={formData.raca}
                    onChange={(e) => setFormData({ ...formData, raca: e.target.value })}
                    placeholder="Ex.: coelho, calopsita…"
                  />
                </label>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <Eyebrow className="text-slate-400">Idade</Eyebrow>
                  <select
                    className={CAMPO}
                    value={formData.idade}
                    onChange={(e) => setFormData({ ...formData, idade: e.target.value })}
                  >
                    <option value="">Não sei informar</option>
                    {OPCOES_IDADE.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <Eyebrow className="text-slate-400">Peso (kg)</Eyebrow>
                  <input
                    type="number"
                    step="0.1"
                    className={CAMPO}
                    value={formData.peso}
                    onChange={(e) => setFormData({ ...formData, peso: e.target.value })}
                  />
                </label>

                <label className="block">
                  <Eyebrow className="text-slate-400">Sexo</Eyebrow>
                  <select
                    className={CAMPO}
                    value={formData.sexo}
                    onChange={(e) => setFormData({ ...formData, sexo: e.target.value })}
                  >
                    <option value="">Não informado</option>
                    <option value="macho">Macho</option>
                    <option value="femea">Fêmea</option>
                  </select>
                </label>

                <label className="block">
                  <Eyebrow className="text-slate-400">Porte</Eyebrow>
                  <select
                    className={CAMPO}
                    value={formData.porte}
                    onChange={(e) => setFormData({ ...formData, porte: e.target.value })}
                  >
                    <option value="">Não informado</option>
                    <option value="pequeno">Pequeno</option>
                    <option value="medio">Médio</option>
                    <option value="grande">Grande</option>
                  </select>
                </label>

                <label className="block">
                  <Eyebrow className="text-slate-400">Cor</Eyebrow>
                  <input
                    className={CAMPO}
                    value={formData.cor}
                    maxLength={40}
                    placeholder="Ex.: caramelo, preto e branco"
                    onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                  />
                </label>

                <label className="block">
                  <Eyebrow className="text-slate-400">Nascimento</Eyebrow>
                  <input
                    type="date"
                    className={CAMPO}
                    value={formData.data_nascimento}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                  />
                </label>
              </div>

              {/* Campos que existiam no banco e o cadastro nunca gravava. O
                  porte aparecia vazio até na tag da coleira, que é o que ajuda
                  a devolver um animal perdido. */}
              <label className="mt-3 flex items-center gap-2.5 text-[0.8rem] text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={formData.castrado}
                  onChange={(e) => setFormData({ ...formData, castrado: e.target.checked })}
                />
                Castrado
              </label>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <Eyebrow className="text-slate-400">Microchip</Eyebrow>
                  <input
                    className={CAMPO}
                    value={formData.microchip}
                    maxLength={40}
                    onChange={(e) => setFormData({ ...formData, microchip: e.target.value })}
                  />
                </label>

                <label className="block">
                  <Eyebrow className="text-slate-400">Pedigree</Eyebrow>
                  <input
                    className={CAMPO}
                    value={formData.pedigree}
                    maxLength={60}
                    placeholder="Registro, se houver"
                    onChange={(e) => setFormData({ ...formData, pedigree: e.target.value })}
                  />
                </label>
              </div>

              <label className="mt-3 block">
                <Eyebrow className="text-slate-400">Condições preexistentes</Eyebrow>
                <textarea
                  rows={2}
                  className={CAMPO}
                  value={formData.condicoes_preexistentes}
                  maxLength={1000}
                  placeholder="Cardiopatia, epilepsia, diabetes… o que muda a conduta antes de qualquer exame"
                  onChange={(e) => setFormData({ ...formData, condicoes_preexistentes: e.target.value })}
                />
              </label>

              {/* Alergias, medicamentos e vacinas precisam do pet salvo: no
                  cadastro novo a seção aparece logo depois do primeiro "Salvar". */}
              {editingPet ? (
                <FichaSaudePet petId={editingPet.id} />
              ) : (
                <p className="mt-3 text-[0.72rem] text-slate-400">
                  Alergias, medicamentos e vacinas você adiciona logo depois de salvar o pet.
                </p>
              )}
            </div>

            <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-slate-200/80 px-5 py-3 text-[0.8rem] font-semibold text-slate-500 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-primary px-5 py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82]"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      <TutorBottomNav />
    </div>
  )
}
