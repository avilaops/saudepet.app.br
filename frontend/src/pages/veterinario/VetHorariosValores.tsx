import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import GradeSemanalEditor from '../../components/veterinario/GradeSemanalEditor'
import { VetIcon, VetLoading, VetPageHeader } from '../../components/veterinario/VetUI'

type Categoria = 'SERVICO_DOMICILIAR' | 'VACINA' | 'OUTRO_SERVICO' | 'ADICIONAL_HORARIO'
type ItemCatalogo = { codigo: string; nome: string; descricao: string; categoria: Categoria; preco: number | null; ativo: boolean; ordem: number }

const GRUPOS: Array<{ categoria: Categoria; titulo: string; resumo: string; icone: string }> = [
  { categoria: 'SERVICO_DOMICILIAR', titulo: 'Serviços domiciliares', resumo: 'Consultas e cuidados realizados na casa do tutor.', icone: 'home' },
  { categoria: 'VACINA', titulo: 'Vacinas e testes', resumo: 'O valor da dose, separado da aplicação.', icone: 'health' },
  { categoria: 'OUTRO_SERVICO', titulo: 'Outros serviços', resumo: 'Atendimentos complementares que ampliam sua oferta.', icone: 'paw' },
  { categoria: 'ADICIONAL_HORARIO', titulo: 'Adicionais por horário', resumo: 'Valores somados fora do horário comercial.', icone: 'clock' },
]

export default function VetHorariosValores() {
  const navigate = useNavigate()
  const [itens, setItens] = useState<ItemCatalogo[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data } = await api.get('/v1/veterinario/catalogo')
      setItens(data.itens || [])
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar seus valores.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])
  const ativos = useMemo(() => itens.filter((item) => item.ativo).length, [itens])
  const semPreco = useMemo(() => itens.find((item) => item.ativo && (!item.preco || item.preco <= 0)), [itens])
  const atualizar = (codigo: string, mudanca: Partial<ItemCatalogo>) => {
    setSucesso('')
    setItens((atuais) => atuais.map((item) => item.codigo === codigo ? { ...item, ...mudanca } : item))
  }

  const salvar = async () => {
    if (semPreco) {
      setErro(`Informe um valor para “${semPreco.nome}” antes de publicar.`)
      document.getElementById(`preco-${semPreco.codigo}`)?.focus()
      return
    }
    setSalvando(true)
    setErro('')
    setSucesso('')
    try {
      const { data } = await api.put('/v1/veterinario/catalogo', { itens: itens.map(({ codigo, ativo, preco }) => ({ codigo, ativo, preco })) })
      setItens(data.itens || itens)
      setSucesso(data.message || 'Valores publicados com sucesso.')
    } catch (requestError: any) {
      const detalhe = requestError.response?.data?.details?.[0]?.message
      setErro(detalhe || requestError.response?.data?.error || 'Não foi possível publicar seus valores.')
    } finally { setSalvando(false) }
  }

  return (
    <main className="vet-app">
      <VetPageHeader compact title="Horários e valores" subtitle="Sua disponibilidade e tabela comercial" onBack={() => navigate('/veterinario/configuracoes')} />
      <div className="vet-app-main vet-catalog-page">
        <section className="vet-catalog-hero">
          <span className="vet-catalog-hero__icon"><VetIcon name="wallet" size={24} /></span>
          <div><span>Sua vitrine profissional</span><h1>Clareza para o tutor. Controle para você.</h1><p>Ative somente o que oferece. O tutor verá o preço antes de escolher o profissional.</p></div>
          <strong>{ativos}<small>itens ativos</small></strong>
        </section>

        <GradeSemanalEditor />
        {erro && <p className="vet-catalog-feedback is-error" role="alert">{erro}</p>}
        {sucesso && <p className="vet-catalog-feedback is-success" role="status">{sucesso}</p>}

        {loading ? <VetLoading label="Montando sua tabela comercial" /> : (
          <div className="vet-catalog-groups">
            {GRUPOS.map((grupo) => (
              <section className="vet-card vet-catalog-section" key={grupo.categoria}>
                <div className="vet-catalog-section__title">
                  <span className="vet-setting-row__icon"><VetIcon name={grupo.icone} size={19} /></span>
                  <div><h2>{grupo.titulo}</h2><p>{grupo.resumo}</p></div>
                </div>
                <div className="vet-catalog-items">
                  {itens.filter((item) => item.categoria === grupo.categoria).map((item) => (
                    <div className={`vet-catalog-item ${item.ativo ? 'is-active' : ''}`} key={item.codigo}>
                      <button type="button" className={`vet-switch ${item.ativo ? 'is-on' : ''}`} aria-pressed={item.ativo} aria-label={`${item.ativo ? 'Desativar' : 'Ativar'} ${item.nome}`} onClick={() => atualizar(item.codigo, { ativo: !item.ativo })} />
                      <label htmlFor={`preco-${item.codigo}`}><strong>{item.nome}</strong><small>{item.descricao}</small></label>
                      <div className="vet-catalog-price"><span>R$</span><input id={`preco-${item.codigo}`} inputMode="decimal" type="number" min="0.01" max="50000" step="0.01" placeholder="0,00" value={item.preco ?? ''} onChange={(event) => atualizar(item.codigo, { preco: event.target.value === '' ? null : Number(event.target.value) })} /></div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {!loading && (
          <div className="vet-catalog-publish">
            <span><strong>{ativos === 0 ? 'Catálogo ainda privado' : `${ativos} ${ativos === 1 ? 'item será publicado' : 'itens serão publicados'}`}</strong><small>Itens desligados não aparecem para o tutor.</small></span>
            <button type="button" disabled={salvando || itens.length === 0} onClick={salvar}>{salvando ? 'Publicando…' : 'Publicar valores'}</button>
          </div>
        )}
      </div>
    </main>
  )
}
