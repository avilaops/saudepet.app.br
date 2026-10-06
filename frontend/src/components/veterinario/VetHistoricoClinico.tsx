import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import api from '../../services/api'
import { VetIcon, VetLoading, formatDate, serviceLabel } from './VetUI'
import RegistrosRemovidos from './RegistrosRemovidos'

/**
 * Histórico clínico acumulado do pet, lido a partir do atendimento aberto.
 *
 * Antes cada atendimento era legível isoladamente: o veterinário prescrevia sem
 * ver o que já tinha sido prescrito nem a alergia registrada por outro colega.
 * A alergia vem primeiro e sem precisar de clique — é a informação que muda uma
 * conduta.
 */
/**
 * Junta os medicamentos já prescritos de várias páginas sem repetir.
 *
 * O backend deduplica dentro da página que devolveu; ao acumular páginas na tela,
 * a mesma droga reapareceria uma vez por página em que foi prescrita.
 */
function mesclarMedicamentos(atuais: ApiPayload, novos: ApiPayload) {
  const chave = (item: ApiPayload) => String(item.medicamento || '').trim().toLowerCase()
  const vistos = new Set(atuais.map(chave))
  return [...atuais, ...novos.filter((item: ApiPayload) => chave(item) && !vistos.has(chave(item)))]
}

/**
 * Ficha clínica corrigível: alergia, vacina e medicação nasciam no fechamento do
 * atendimento e ficavam imutáveis — errar o pet, a dose ou a data significava
 * pedir alguém para abrir o banco. Cada tipo declara aqui o endereço no backend,
 * como se chama na tela e quais campos o veterinário pode reescrever.
 *
 * Remover não apaga: o backend marca o registro como inativo, guarda o motivo e
 * lança o evento na trilha de auditoria. Por isso o motivo é obrigatório.
 */
const FICHA: Record<string, any> = {
  alergia: {
    recurso: 'alergias',
    rotulo: 'alergia',
    titulo: (item: ApiPayload) => item.alergia,
    campos: [
      { nome: 'alergia', rotulo: 'Alergia', tipo: 'texto' },
      { nome: 'gravidade', rotulo: 'Gravidade', tipo: 'select', opcoes: ['leve', 'moderada', 'grave'] },
      { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', opcional: true }
    ]
  },
  vacina: {
    recurso: 'vacinas',
    rotulo: 'vacina',
    titulo: (item: ApiPayload) => item.nome_vacina,
    campos: [
      { nome: 'nome_vacina', rotulo: 'Vacina', tipo: 'texto' },
      { nome: 'laboratorio', rotulo: 'Laboratório', tipo: 'texto', opcional: true },
      { nome: 'lote', rotulo: 'Lote', tipo: 'texto', opcional: true },
      { nome: 'data_aplicacao', rotulo: 'Data de aplicação', tipo: 'data' },
      { nome: 'proxima_dose', rotulo: 'Próxima dose', tipo: 'data', opcional: true }
    ]
  },
  medicamento: {
    recurso: 'medicamentos',
    rotulo: 'medicação',
    titulo: (item: ApiPayload) => item.nome_medicamento,
    campos: [
      { nome: 'nome_medicamento', rotulo: 'Medicamento', tipo: 'texto' },
      { nome: 'dosagem', rotulo: 'Dosagem', tipo: 'texto' },
      { nome: 'frequencia_horas', rotulo: 'A cada quantas horas', tipo: 'numero' },
      { nome: 'uso_continuo', rotulo: 'Uso contínuo', tipo: 'checkbox' },
      { nome: 'data_inicio', rotulo: 'Início', tipo: 'data' },
      { nome: 'data_fim', rotulo: 'Término', tipo: 'data', opcional: true },
      { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', opcional: true }
    ]
  }
}

// `<input type="date">` só entende yyyy-mm-dd; o backend devolve ISO completo.
const paraCampoData = (valor: string) => (valor ? String(valor).slice(0, 10) : '')

function formularioInicial(tipo: string, item: ApiPayload) {
  return FICHA[tipo].campos.reduce((acumulado: ApiPayload, campo: any) => {
    const valor = item[campo.nome]
    if (campo.tipo === 'checkbox') acumulado[campo.nome] = Boolean(valor)
    else if (campo.tipo === 'data') acumulado[campo.nome] = paraCampoData(valor)
    else acumulado[campo.nome] = valor === null || valor === undefined ? '' : String(valor)
    return acumulado
  }, {})
}

/**
 * Campo obrigatório em branco fica de fora do PUT (o backend aceita correção
 * parcial e mantém o valor atual); campo opcional em branco vai como `null`,
 * que é como se limpa uma observação ou um reforço que não existe mais.
 */
function montarPayload(tipo: string, formulario: ApiPayload) {
  const payload: ApiPayload = {}
  for (const campo of FICHA[tipo].campos) {
    const valor = formulario[campo.nome]
    if (campo.tipo === 'checkbox') {
      payload[campo.nome] = Boolean(valor)
    } else if (valor === '' || valor === null || valor === undefined) {
      if (campo.opcional) payload[campo.nome] = null
    } else if (campo.tipo === 'numero') {
      payload[campo.nome] = Number(valor)
    } else {
      payload[campo.nome] = valor
    }
  }
  return payload
}

export default function VetHistoricoClinico({ atendimentoId, aberto = false }: ApiPayload) {
  const [historico, setHistorico] = useState<ApiPayload | null>(null)
  // Os atendimentos vivem fora de `historico` porque "Carregar mais" acumula
  // páginas: o resto da resposta (alergias, vacinas, pet) é sempre o da última.
  const [atendimentos, setAtendimentos] = useState<ApiPayload[]>([])
  const [medicamentos, setMedicamentos] = useState<ApiPayload[]>([])
  const [paginacao, setPaginacao] = useState<ApiPayload | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState('')
  // Falha ao buscar a próxima página não pode apagar o que já está na tela, por
  // isso não reaproveita `erro` — que troca a seção inteira por um aviso.
  const [erroMais, setErroMais] = useState('')
  const [expandido, setExpandido] = useState<ApiPayload | null>(null)
  // Correção/remoção de um item da ficha: `{ tipo, item, modo }`.
  const [acao, setAcao] = useState<ApiPayload | null>(null)
  const [formulario, setFormulario] = useState<ApiPayload>({})
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroAcao, setErroAcao] = useState('')
  const [sucessoAcao, setSucessoAcao] = useState('')

  const buscarPagina = useCallback(
    (pagina: number) => api.get(`/v1/solicitacoes/${atendimentoId}/historico-do-pet`, { params: { pagina } }),
    [atendimentoId]
  )

  const carregar = useCallback(async () => {
    if (!atendimentoId) return
    setCarregando(true)
    setErro('')
    setErroMais('')
    try {
      const { data } = await buscarPagina(1)
      setHistorico(data)
      setAtendimentos(data.atendimentos || [])
      setMedicamentos(data.resumo?.medicamentos_ja_prescritos || [])
      setPaginacao(data.paginacao || null)
      // Na tela dedicada o atendimento mais recente já abre — é o que o
      // veterinário foi ler. Dentro do prontuário fica fechado, para não
      // empurrar o formulário para fora da tela.
      if (aberto && data.atendimentos?.length) {
        setExpandido(data.atendimentos[0].atendimento_id)
      }
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar o histórico clínico do pet.')
    } finally {
      setCarregando(false)
    }
  }, [atendimentoId, aberto, buscarPagina])

  const carregarMais = async () => {
    if (carregandoMais || !paginacao || paginacao.pagina >= paginacao.paginas) return
    setCarregandoMais(true)
    setErroMais('')
    try {
      const { data } = await buscarPagina(paginacao.pagina + 1)
      setAtendimentos((atuais) => [...atuais, ...(data.atendimentos || [])])
      setMedicamentos((atuais) => mesclarMedicamentos(atuais, data.resumo?.medicamentos_ja_prescritos || []))
      setPaginacao(data.paginacao || null)
    } catch (requestError: any) {
      setErroMais(requestError.response?.data?.error || 'Não foi possível carregar mais atendimentos.')
    } finally {
      setCarregandoMais(false)
    }
  }

  useEffect(() => { carregar() }, [carregar])

  const abrirAcao = (tipo: string, item: ApiPayload, modo: string) => {
    setAcao({ tipo, item, modo })
    setFormulario(modo === 'corrigir' ? formularioInicial(tipo, item) : {})
    setMotivo('')
    setErroAcao('')
    setSucessoAcao('')
  }

  const fecharAcao = () => {
    if (salvando) return
    setAcao(null)
    setErroAcao('')
  }

  const confirmarAcao = async (evento: any) => {
    evento.preventDefault()
    if (!acao || salvando) return
    const { tipo, item, modo } = acao
    const petId = historico?.pet?.id
    if (!petId) {
      setErroAcao('Não foi possível identificar o pet deste atendimento.')
      return
    }

    setSalvando(true)
    setErroAcao('')
    try {
      const base = `/v1/pets/${petId}/${FICHA[tipo].recurso}/${item.id}`
      if (modo === 'remover') {
        // O motivo viaja no corpo do DELETE: é ele que sobra na auditoria depois
        // que o registro sai da ficha.
        await api.delete(base, { data: { motivo } })
      } else {
        await api.put(base, montarPayload(tipo, formulario))
      }
      setAcao(null)
      setSucessoAcao(modo === 'remover'
        ? `${FICHA[tipo].titulo(item)} removida da ficha. O registro fica guardado na auditoria.`
        : `${FICHA[tipo].titulo(item)} corrigida na ficha do pet.`)
      await carregar()
    } catch (requestError: any) {
      const dados = requestError.response?.data
      setErroAcao(dados?.details?.[0]?.message || dados?.error || 'Não foi possível concluir a alteração.')
    } finally {
      setSalvando(false)
    }
  }

  /**
   * Os dois botões que faltavam em cada linha da ficha. Ficam ao lado do item,
   * não escondidos atrás de um menu: corrigir uma alergia errada é urgente.
   */
  const acoesDoItem = (tipo: string, item: ApiPayload) => (
    <span className="vet-clinical-item__actions">
      {item.atualizado_em && (
        <em className="vet-clinical-item__fixed" title={`Corrigido em ${formatDate(item.atualizado_em)}`}>corrigido</em>
      )}
      <button type="button" onClick={() => abrirAcao(tipo, item, 'corrigir')}>Corrigir</button>
      <button type="button" onClick={() => abrirAcao(tipo, item, 'remover')}>Remover</button>
    </span>
  )

  if (carregando) {
    return <section className="vet-card vet-clinical"><VetLoading label="Carregando histórico clínico" /></section>
  }

  if (erro) {
    return (
      <section className="vet-card vet-clinical" role="alert">
        <p className="vet-clinical__error">{erro}</p>
        <button type="button" className="vet-record-add" onClick={carregar}>
          <VetIcon name="refresh" size={16} /> Tentar novamente
        </button>
      </section>
    )
  }

  if (!historico) return null

  const {
    alergias = [],
    vacinas = [],
    medicamentos_em_uso: emUso = [],
    lembretes = [],
    resumo = {},
    pet
  } = historico
  const totalDeAtendimentos = paginacao?.total ?? resumo.total_atendimentos ?? 0
  const temMais = Boolean(paginacao && paginacao.pagina < paginacao.paginas)

  return (
    <>
    {/* O caminho de volta para o que foi removido por engano. Fica fora do
        cartão do histórico porque não é conteúdo da ficha: é consulta. */}
    {pet?.id && <RegistrosRemovidos petId={pet.id} />}

    <section className="vet-card vet-clinical" aria-label="Histórico clínico do pet">
      <header className="vet-clinical__head">
        <span className="vet-service-icon"><VetIcon name="folder" size={19} /></span>
        <div>
          <strong>Histórico clínico de {pet?.nome || 'pet'}</strong>
          <small>
            {totalDeAtendimentos > 0
              ? `${totalDeAtendimentos} atendimento(s) anterior(es) · último em ${formatDate(resumo.ultimo_atendimento_em)}`
              : 'Primeiro atendimento deste pet na plataforma'}
          </small>
        </div>
      </header>

      {/* Resultado da última correção/remoção fica na própria seção, junto do
          que mudou — sem alert(), que tira o veterinário da tela no meio do
          atendimento. */}
      {sucessoAcao && (
        <p className="vet-card vet-bank-success" role="status">
          <VetIcon name="check" size={15} /> {sucessoAcao}
        </p>
      )}
      {erroAcao && !acao && (
        <p className="vet-card vet-request" role="alert">{erroAcao}</p>
      )}

      {alergias.length > 0 && (
        <div className="vet-clinical-alert" role="alert">
          <strong><VetIcon name="shield" size={16} /> Alergias registradas</strong>
          <ul>
            {alergias.map((item: ApiPayload) => (
              <li key={item.id}>
                <span className={`vet-clinical-alert__tag vet-clinical-alert__tag--${item.gravidade}`}>{item.gravidade}</span>
                {item.alergia}{item.observacoes ? ` — ${item.observacoes}` : ''}
                {acoesDoItem('alergia', item)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {emUso.length > 0 && (
        <div className="vet-clinical-current" role="note">
          <h3>Medicações em uso</h3>
          <ul>
            {emUso.map((item: ApiPayload) => (
              <li key={item.id}>
                <strong>{item.nome_medicamento} {item.dosagem}</strong>
                <small>
                  A cada {item.frequencia_horas}h
                  {item.uso_continuo ? ' · uso contínuo' : ''}
                  {' · desde '}{formatDate(item.data_inicio)}
                  {item.data_fim ? ` até ${formatDate(item.data_fim)}` : ''}
                  {item.observacoes ? ` · ${item.observacoes}` : ''}
                </small>
                {acoesDoItem('medicamento', item)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {vacinas.length > 0 && (
        <div className="vet-clinical-drugs">
          <h3>Carteira de vacinação</h3>
          <ul className="vet-record-items">
            {vacinas.map((item: ApiPayload) => (
              <li key={item.id}>
                <strong>{item.nome_vacina}</strong>
                <small>
                  Aplicada em {formatDate(item.data_aplicacao)}
                  {item.veterinario_nome ? ` por ${item.veterinario_nome}` : ''}
                  {item.lote ? ` · lote ${item.lote}` : ''}
                  {item.proxima_dose ? ` · próxima dose em ${formatDate(item.proxima_dose)}` : ''}
                </small>
                {acoesDoItem('vacina', item)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lembretes.length > 0 && (
        <ul className="vet-clinical-reminders">
          {lembretes.map((item: ApiPayload) => (
            <li key={item.id}>
              <VetIcon name="clock" size={15} />
              <span>{item.titulo}</span>
              <strong>{formatDate(item.data_lembrete)}</strong>
            </li>
          ))}
        </ul>
      )}

      {medicamentos.length > 0 && (
        <div className="vet-clinical-drugs">
          <h3>Já prescritos a este pet</h3>
          <div className="vet-clinical-drugs__list">
            {medicamentos.map((item) => (
              <span key={`${item.medicamento}-${item.prescrito_em}`} title={`Prescrito em ${formatDate(item.prescrito_em)}`}>
                {[item.medicamento, item.concentracao].filter(Boolean).join(' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {atendimentos.length === 0 ? (
        <p className="vet-clinical__empty">Nenhum atendimento anterior registrado para este animal.</p>
      ) : (
        <ol className="vet-clinical-timeline">
          {atendimentos.map((item) => {
            const abertoAgora = expandido === item.atendimento_id
            return (
              <li key={item.atendimento_id} className={`vet-clinical-entry ${abertoAgora ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="vet-clinical-entry__head"
                  aria-expanded={abertoAgora}
                  onClick={() => setExpandido((atual: ApiPayload) => atual === item.atendimento_id ? null : item.atendimento_id)}
                >
                  <span className="vet-clinical-entry__date">{formatDate(item.data)}</span>
                  <span className="vet-clinical-entry__title">
                    {item.diagnostico || item.hipotese_diagnostica || 'Atendimento sem diagnóstico registrado'}
                  </span>
                  <span className="vet-clinical-entry__meta">
                    {serviceLabel(item.tipo_atendimento)}
                    {item.veterinario ? ` · ${item.veterinario}` : ''}
                    {item.crmv ? ` (CRMV ${item.crmv})` : ''}
                  </span>
                  <VetIcon name="chevron" size={16} className="vet-clinical-entry__chevron" />
                </button>

                {abertoAgora && (
                  <div className="vet-clinical-entry__body">
                    {!item.estruturado && (
                      <p className="vet-clinical-entry__legacy">
                        Atendimento encerrado antes do prontuário estruturado — só há os textos livres.
                      </p>
                    )}

                    {item.queixa_principal && <p><em>Queixa:</em> {item.queixa_principal}</p>}
                    {item.exame_fisico && <p><em>Exame físico:</em> {item.exame_fisico}</p>}
                    {item.hipotese_diagnostica && <p><em>Hipótese:</em> {item.hipotese_diagnostica}</p>}
                    {item.orientacoes_tutor && <p><em>Orientações:</em> {item.orientacoes_tutor}</p>}
                    {item.retorno_sugerido_em && <p><em>Retorno sugerido:</em> {formatDate(item.retorno_sugerido_em)}</p>}

                    {item.prescricoes.length > 0 ? (
                      <ul className="vet-record-items">
                        {item.prescricoes.map((prescricao: ApiPayload) => (
                          <li key={prescricao.id}>
                            <strong>{[prescricao.medicamento, prescricao.concentracao, prescricao.forma_farmacia].filter(Boolean).join(' ')}</strong>
                            <small>{prescricao.posologia}{prescricao.duracao_dias ? ` · ${prescricao.duracao_dias} dia(s)` : ''}</small>
                          </li>
                        ))}
                      </ul>
                    ) : item.receita_texto && (
                      <p className="vet-clinical-entry__receita">{item.receita_texto}</p>
                    )}

                    {item.exames.length > 0 && (
                      <p><em>Exames solicitados:</em> {item.exames.map((exame: ApiPayload) => exame.nome_exame).join(', ')}</p>
                    )}

                    <div className="vet-record-done__links">
                      {item.receita_pdf_url && (
                        <a href={item.receita_pdf_url} target="_blank" rel="noreferrer"><VetIcon name="document" size={15} /> Receita</a>
                      )}
                      {item.prontuario_pdf_url && (
                        <a href={item.prontuario_pdf_url} target="_blank" rel="noreferrer"><VetIcon name="document" size={15} /> Prontuário</a>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {atendimentos.length > 0 && (
        <div className="vet-clinical__more">
          <p>Exibindo {atendimentos.length} de {totalDeAtendimentos} atendimento(s) anterior(es).</p>
          {erroMais && <p role="alert" className="vet-clinical__error">{erroMais}</p>}
          {temMais && (
            <button type="button" className="vet-record-add" onClick={carregarMais} disabled={carregandoMais}>
              <VetIcon name="refresh" size={16} />
              {carregandoMais
                ? 'Carregando…'
                : `Carregar mais (página ${paginacao.pagina + 1} de ${paginacao.paginas})`}
            </button>
          )}
        </div>
      )}

      {acao && (
        <div className="vet-modal-layer" role="presentation">
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="ficha-clinica-title">
            <div className="vet-modal__title">
              <VetIcon name={acao.modo === 'remover' ? 'close' : 'document'} />
              <h2 id="ficha-clinica-title">
                {acao.modo === 'remover'
                  ? `Remover ${FICHA[acao.tipo].rotulo}`
                  : `Corrigir ${FICHA[acao.tipo].rotulo}`}
              </h2>
              <button className="vet-icon-button" type="button" onClick={fecharAcao} aria-label="Fechar">
                <VetIcon name="close" size={18} />
              </button>
            </div>

            {erroAcao && <p className="vet-card vet-request" role="alert">{erroAcao}</p>}

            <form onSubmit={confirmarAcao}>
              <div className="vet-prescription-note">
                <p>
                  <strong>{FICHA[acao.tipo].titulo(acao.item)}</strong>
                  <small>{pet?.nome ? `Ficha de ${pet.nome}` : 'Ficha clínica do pet'}</small>
                </p>

                {acao.modo === 'remover' ? (
                  <>
                    <label>
                      Motivo da remoção
                      <textarea
                        className="input"
                        rows={3}
                        required
                        minLength={5}
                        placeholder="Ex.: lançada no pet errado durante o plantão"
                        value={motivo}
                        onChange={(evento) => setMotivo(evento.target.value)}
                      />
                    </label>
                    <p className="vet-review-pending">
                      O registro não é apagado: sai da ficha e do prontuário, e fica guardado na auditoria
                      com o seu nome e este motivo.
                    </p>
                  </>
                ) : (
                  FICHA[acao.tipo].campos.map((campo: any) => (
                    <label key={campo.nome}>
                      {campo.rotulo}
                      {campo.tipo === 'textarea' && (
                        <textarea
                          className="input"
                          rows={3}
                          value={formulario[campo.nome] ?? ''}
                          onChange={(evento) => setFormulario({ ...formulario, [campo.nome]: evento.target.value })}
                        />
                      )}
                      {campo.tipo === 'select' && (
                        <select
                          className="input"
                          value={formulario[campo.nome] ?? ''}
                          onChange={(evento) => setFormulario({ ...formulario, [campo.nome]: evento.target.value })}
                        >
                          {campo.opcoes.map((opcao: string) => <option key={opcao} value={opcao}>{opcao}</option>)}
                        </select>
                      )}
                      {campo.tipo === 'checkbox' && (
                        <input
                          type="checkbox"
                          checked={Boolean(formulario[campo.nome])}
                          onChange={(evento) => setFormulario({ ...formulario, [campo.nome]: evento.target.checked })}
                        />
                      )}
                      {(campo.tipo === 'texto' || campo.tipo === 'data' || campo.tipo === 'numero') && (
                        <input
                          className="input"
                          type={campo.tipo === 'texto' ? 'text' : (campo.tipo === 'data' ? 'date' : 'number')}
                          value={formulario[campo.nome] ?? ''}
                          onChange={(evento) => setFormulario({ ...formulario, [campo.nome]: evento.target.value })}
                        />
                      )}
                    </label>
                  ))
                )}
              </div>

              <button
                type="submit"
                className="vet-modal__submit"
                disabled={salvando || (acao.modo === 'remover' && motivo.trim().length < 5)}
              >
                {salvando
                  ? 'Salvando…'
                  : (acao.modo === 'remover' ? 'Remover da ficha' : 'Salvar correção')}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
    </>
  )
}
