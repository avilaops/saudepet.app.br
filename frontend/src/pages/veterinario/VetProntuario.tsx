import type { ApiPayload } from '../../types/api'
import DitarProntuario from '../../components/veterinario/DitarProntuario'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../services/api'
import VetHistoricoClinico from '../../components/veterinario/VetHistoricoClinico'
import {
  VetIcon,
  VetLoading,
  VetPageHeader,
  formatDate,
  serviceLabel
} from '../../components/veterinario/VetUI'

const STATUS_FINALIZADOS = ['finalizado', 'concluido']

// O aviso de "ainda não dá para finalizar" imprimia o enum do banco com os
// underscores trocados por espaço — "veterinario encontrado" na cara do
// profissional. Mesmo espírito do `serviceLabel`: o enum vira português.
const ROTULO_STATUS: Record<string, string> = {
  criado: 'criação',
  procurando_veterinario: 'busca por veterinário',
  oferta_enviada: 'oferta enviada',
  veterinario_encontrado: 'confirmação pendente',
  aceito: 'aceito',
  a_caminho: 'deslocamento',
  chegou: 'chegada ao local',
  atendimento_em_andamento: 'atendimento em andamento',
  finalizado: 'finalizado',
  concluido: 'concluído',
  encaminhado: 'encaminhamento para emergência',
  sem_veterinario: 'sem veterinário disponível',
  expirado: 'expirado',
  recusado: 'recusado',
  cancelado: 'cancelado',
  cancelado_tutor: 'cancelado pelo tutor',
  cancelado_vet: 'cancelado por você',
  cancelado_admin: 'cancelado pela plataforma',
  pagamento_falhou: 'pagamento não aprovado',
  contestado: 'contestado'
}
const rotuloStatus = (status: string) => ROTULO_STATUS[status] || String(status || '').replace(/_/g, ' ')

const ITEM_PRESCRICAO = { medicamento: '', concentracao: '', forma_farmaceutica: '', posologia: '', duracao_dias: '' }
const ITEM_EXAME = { nome_exame: '', justificativa: '' }
const ITEM_ALERGIA = { alergia: '', gravidade: 'moderada', observacoes: '' }
const ITEM_VACINA = { nome_vacina: '', laboratorio: '', lote: '', data_aplicacao: '', proxima_dose: '' }
const ITEM_MEDICAMENTO = { nome_medicamento: '', dosagem: '', frequencia_horas: '', uso_continuo: false, data_inicio: '', data_fim: '', observacoes: '' }

const FORMAS = ['comprimido', 'cápsula', 'xarope', 'suspensão', 'pomada', 'colírio', 'injetável', 'spray']

export default function VetProntuario() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [atendimento, setAtendimento] = useState<ApiPayload | null>(null)
  const [registro, setRegistro] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [documentos, setDocumentos] = useState<ApiPayload | null>(null)
  const [form, setForm] = useState<ApiPayload>({
    queixa_principal: '',
    exame_fisico: '',
    hipotese_diagnostica: '',
    diagnostico_definitivo: '',
    orientacoes_tutor: '',
    retorno_sugerido_em: '',
    prescricoes: [{ ...ITEM_PRESCRICAO }],
    exames: [],
    alergias: [],
    vacinas: [],
    medicamentos: []
  })

  /**
   * O que a IA devolveu entra nos campos, sem apagar o que já estava escrito.
   *
   * Campo em branco recebe o valor estruturado; campo já preenchido é
   * preservado, porque a queixa principal chega do relato do tutor e o
   * veterinário pode ter começado a escrever antes de ditar. As listas
   * (prescrição, exame, alergia) só são substituídas quando a IA trouxe algo
   * e o que existe ali ainda é a linha vazia inicial.
   */
  const aplicarDitado = (dados: ApiPayload) => {
    setForm((atual: ApiPayload) => {
      const listaVazia = (lista: ApiPayload[], chave: string) =>
        !lista?.length || (lista.length === 1 && !lista[0]?.[chave])

      const retornoEmDias = Number(dados?.retorno_dias)
      let retorno = atual.retorno_sugerido_em
      if (!retorno && Number.isFinite(retornoEmDias) && retornoEmDias > 0) {
        const data = new Date()
        data.setDate(data.getDate() + retornoEmDias)
        retorno = data.toISOString().slice(0, 10)
      }

      return {
        ...atual,
        queixa_principal: atual.queixa_principal || dados?.queixa_principal || '',
        exame_fisico: atual.exame_fisico || dados?.exame_fisico || '',
        hipotese_diagnostica: atual.hipotese_diagnostica || dados?.hipotese_diagnostica || '',
        diagnostico_definitivo: atual.diagnostico_definitivo || dados?.diagnostico_definitivo || '',
        orientacoes_tutor: atual.orientacoes_tutor || dados?.orientacoes_tutor || '',
        retorno_sugerido_em: retorno,
        prescricoes: dados?.prescricoes?.length && listaVazia(atual.prescricoes, 'medicamento')
          ? dados.prescricoes.map((item: ApiPayload) => ({
              ...ITEM_PRESCRICAO,
              medicamento: item.medicamento || '',
              concentracao: item.concentracao || '',
              forma_farmaceutica: FORMAS.includes(item.forma_farmaceutica) ? item.forma_farmaceutica : '',
              posologia: item.posologia || '',
              duracao_dias: item.duracao_dias != null ? String(item.duracao_dias) : ''
            }))
          : atual.prescricoes,
        exames: dados?.exames?.length && listaVazia(atual.exames, 'nome_exame')
          ? dados.exames.map((item: ApiPayload) => ({ ...ITEM_EXAME, nome_exame: item.nome_exame || '', justificativa: item.justificativa || '' }))
          : atual.exames,
        alergias: dados?.alergias?.length && listaVazia(atual.alergias, 'alergia')
          ? dados.alergias.map((item: ApiPayload) => ({
              ...ITEM_ALERGIA,
              alergia: item.alergia || '',
              gravidade: ['leve', 'moderada', 'grave'].includes(item.gravidade) ? item.gravidade : 'moderada',
              observacoes: item.observacoes || ''
            }))
          : atual.alergias
      }
    })
  }

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data } = await api.get(`/v1/solicitacoes/${id}`)
      setAtendimento(data)

      if (STATUS_FINALIZADOS.includes(data.status)) {
        const prontuario = await api.get(`/v1/solicitacoes/${id}/prontuario`)
        setRegistro(prontuario.data)
      } else {
        // A queixa já vem escrita: é o que o tutor relatou ao abrir o chamado.
        setForm((atual: ApiPayload) => ({ ...atual, queixa_principal: atual.queixa_principal || data.observacoes || '' }))
      }
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar o atendimento.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  const alterar = (campo: string) => (event: any) => {
    setForm((atual: ApiPayload) => ({ ...atual, [campo]: event.target.value }))
    setErro('')
  }

  const alterarLista = (lista: ApiPayload, indice: number, campo: string) => (event: any) => {
    const valor = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((atual: ApiPayload) => ({
      ...atual,
      [lista]: atual[lista].map((item: ApiPayload, posicao: number) => posicao === indice ? { ...item, [campo]: valor } : item)
    }))
  }

  const adicionar = (lista: ApiPayload, modelo: ApiPayload) => () => {
    setForm((atual: ApiPayload) => ({ ...atual, [lista]: [...atual[lista], { ...modelo }] }))
  }

  const remover = (lista: ApiPayload, indice: number) => () => {
    setForm((atual: ApiPayload) => ({ ...atual, [lista]: atual[lista].filter((_: ApiPayload, posicao: number) => posicao !== indice) }))
  }

  const finalizar = async (event: any) => {
    event.preventDefault()

    const prescricoes = form.prescricoes.filter((item: ApiPayload) => item.medicamento.trim() || item.posologia.trim())
    const incompleta = prescricoes.find((item: ApiPayload) => !item.medicamento.trim() || !item.posologia.trim())
    if (incompleta) {
      setErro('Cada medicamento precisa de nome e posologia — ou remova a linha em branco.')
      return
    }

    const exames = form.exames.filter((item: ApiPayload) => item.nome_exame.trim())
    const alergias = form.alergias.filter((item: ApiPayload) => item.alergia.trim())
    const vacinas = form.vacinas.filter((item: ApiPayload) => item.nome_vacina.trim())
    const medicamentos = form.medicamentos.filter((item: ApiPayload) => item.nome_medicamento.trim())

    const medicacaoIncompleta = medicamentos.find((item: ApiPayload) => !item.dosagem.trim() || !item.frequencia_horas)
    if (medicacaoIncompleta) {
      setErro('Cada medicação em uso precisa de dosagem e frequência — ou remova a linha em branco.')
      return
    }

    setEnviando(true)
    setErro('')
    try {
      const payload = {
        queixa_principal: form.queixa_principal.trim() || null,
        exame_fisico: form.exame_fisico.trim() || null,
        hipotese_diagnostica: form.hipotese_diagnostica.trim(),
        diagnostico_definitivo: form.diagnostico_definitivo.trim() || null,
        orientacoes_tutor: form.orientacoes_tutor.trim() || null,
        retorno_sugerido_em: form.retorno_sugerido_em || null,
        prescricoes: prescricoes.map((item: ApiPayload) => ({
          medicamento: item.medicamento.trim(),
          concentracao: item.concentracao.trim() || null,
          forma_farmaceutica: item.forma_farmaceutica.trim() || null,
          posologia: item.posologia.trim(),
          duracao_dias: item.duracao_dias ? Number(item.duracao_dias) : null
        })),
        exames: exames.map((item: ApiPayload) => ({
          nome_exame: item.nome_exame.trim(),
          justificativa: item.justificativa.trim() || null
        })),
        alergias: alergias.map((item: ApiPayload) => ({
          alergia: item.alergia.trim(),
          gravidade: item.gravidade,
          observacoes: item.observacoes.trim() || null
        })),
        vacinas: vacinas.map((item: ApiPayload) => ({
          nome_vacina: item.nome_vacina.trim(),
          laboratorio: item.laboratorio.trim() || null,
          lote: item.lote.trim() || null,
          data_aplicacao: item.data_aplicacao || null,
          proxima_dose: item.proxima_dose || null
        })),
        medicamentos: medicamentos.map((item: ApiPayload) => ({
          nome_medicamento: item.nome_medicamento.trim(),
          dosagem: item.dosagem.trim(),
          frequencia_horas: Number(item.frequencia_horas),
          uso_continuo: Boolean(item.uso_continuo),
          data_inicio: item.data_inicio || null,
          data_fim: item.data_fim || null,
          observacoes: item.observacoes.trim() || null
        }))
      }

      const { data } = await api.put(`/v1/solicitacoes/${id}/finalizar`, payload)
      setDocumentos({
        receita_pdf_url: data.receita_pdf_url,
        prontuario_pdf_url: data.prontuario_pdf_url
      })
      setAtendimento(data.solicitacao)
      setRegistro({ prontuario: data.prontuario, ...data })
    } catch (requestError: any) {
      const resposta = requestError.response?.data
      const detalhe = resposta?.details?.map((item: ApiPayload) => item.message).join(' • ')
      setErro(detalhe || resposta?.error || resposta?.message || 'Não foi possível finalizar o atendimento.')
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return (
      <main className="vet-app">
        <VetPageHeader compact title="Prontuário" onBack={() => navigate(-1)} />
        <VetLoading label="Carregando atendimento" />
      </main>
    )
  }

  if (!atendimento) {
    return (
      <main className="vet-app">
        <VetPageHeader compact title="Prontuário" onBack={() => navigate('/veterinario/home')} />
        <div className="vet-record">
          <p className="vet-card vet-request" role="alert">{erro || 'Atendimento não encontrado.'}</p>
        </div>
      </main>
    )
  }

  const finalizado = STATUS_FINALIZADOS.includes(atendimento.status)
  const emAndamento = atendimento.status === 'atendimento_em_andamento'
  const dadosDoRegistro = registro?.prontuario

  return (
    <main className="vet-app">
      <VetPageHeader
        compact
        title={finalizado ? 'Prontuário do atendimento' : 'Finalizar atendimento'}
        onBack={() => navigate(finalizado ? '/veterinario/historico' : `/veterinario/atendimento/${id}`)}
      />

      <div className="vet-record">
        <section className="vet-card vet-record-patient">
          <span className="vet-service-icon"><VetIcon name="document" size={19} /></span>
          <div>
            <strong>{atendimento.pet?.nome || 'Pet'}</strong>
            <small>
              {[atendimento.pet?.raca || atendimento.pet?.tipo, atendimento.pet?.idade ? `${atendimento.pet.idade} anos` : null, atendimento.pet?.peso ? `${atendimento.pet.peso} kg` : null]
                .filter(Boolean).join(' · ')}
            </small>
            <small>Tutor: {atendimento.tutor?.nome || '—'} · {serviceLabel(atendimento.tipo_atendimento)}</small>
          </div>
        </section>

        {/* O passado do animal antes do registro de hoje: alergia e prescrição
            anterior mudam a conduta, e até aqui só existiam soltas em cada
            atendimento isolado. */}
        {!documentos && <VetHistoricoClinico atendimentoId={id} />}

        {erro && <p className="vet-card vet-request" role="alert">{erro}</p>}

        {documentos && (
          <section className="vet-card vet-record-done" role="status">
            <strong>Atendimento finalizado e documentos emitidos</strong>
            <small>O tutor recebeu a receita e o prontuário por e-mail.</small>
            <div className="vet-record-done__links">
              {documentos.receita_pdf_url && (
                <a href={documentos.receita_pdf_url} target="_blank" rel="noreferrer"><VetIcon name="document" size={16} /> Receita em PDF</a>
              )}
              {documentos.prontuario_pdf_url && (
                <a href={documentos.prontuario_pdf_url} target="_blank" rel="noreferrer"><VetIcon name="document" size={16} /> Prontuário em PDF</a>
              )}
            </div>
            <button type="button" className="vet-button--primary vet-record-done__back" onClick={() => navigate('/veterinario/home')}>
              Voltar ao início
            </button>
          </section>
        )}

        {finalizado && !documentos && (
          <section className="vet-card vet-record-view">
            <h2>Registro clínico</h2>
            {dadosDoRegistro ? (
              <dl>
                <div><dt>Queixa principal</dt><dd>{dadosDoRegistro.queixa_principal}</dd></div>
                {dadosDoRegistro.exame_fisico && <div><dt>Exame físico</dt><dd>{dadosDoRegistro.exame_fisico}</dd></div>}
                <div><dt>Hipótese diagnóstica</dt><dd>{dadosDoRegistro.hipotese_diagnostica}</dd></div>
                {dadosDoRegistro.diagnostico_definitivo && <div><dt>Diagnóstico definitivo</dt><dd>{dadosDoRegistro.diagnostico_definitivo}</dd></div>}
                {dadosDoRegistro.orientacoes_tutor && <div><dt>Orientações ao tutor</dt><dd>{dadosDoRegistro.orientacoes_tutor}</dd></div>}
                {dadosDoRegistro.retorno_sugerido_em && <div><dt>Retorno sugerido</dt><dd>{formatDate(dadosDoRegistro.retorno_sugerido_em)}</dd></div>}
              </dl>
            ) : (
              <p className="vet-record-view__legacy">
                Este atendimento foi encerrado antes do prontuário estruturado. O que ficou registrado:
                <span>{registro?.diagnostico || 'sem diagnóstico registrado'}</span>
              </p>
            )}

            {dadosDoRegistro?.itensPrescricao?.length > 0 && (
              <>
                <h3>Prescrição</h3>
                <ul className="vet-record-items">
                  {dadosDoRegistro.itensPrescricao.map((item: ApiPayload) => (
                    <li key={item.id}>
                      <strong>{[item.medicamento, item.concentracao, item.forma_farmaceutica].filter(Boolean).join(' ')}</strong>
                      <small>{item.posologia}{item.duracao_dias ? ` · ${item.duracao_dias} dia(s)` : ''}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {dadosDoRegistro?.examesSolicitados?.length > 0 && (
              <>
                <h3>Exames solicitados</h3>
                <ul className="vet-record-items">
                  {dadosDoRegistro.examesSolicitados.map((item: ApiPayload) => (
                    <li key={item.id}>
                      <strong>{item.nome_exame}</strong>
                      {item.justificativa && <small>{item.justificativa}</small>}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="vet-record-done__links">
              {registro?.receita_pdf_url && (
                <a href={registro.receita_pdf_url} target="_blank" rel="noreferrer"><VetIcon name="document" size={16} /> Receita em PDF</a>
              )}
              {registro?.prontuario_pdf_url && (
                <a href={registro.prontuario_pdf_url} target="_blank" rel="noreferrer"><VetIcon name="document" size={16} /> Prontuário em PDF</a>
              )}
            </div>
          </section>
        )}

        {!finalizado && !emAndamento && (
          <p className="vet-card vet-request" role="status">
            O prontuário é preenchido no encerramento. Este atendimento está em
            <strong> {rotuloStatus(atendimento.status)}</strong> — inicie o atendimento para poder finalizá-lo.
          </p>
        )}

        {emAndamento && (
          <form className="vet-card vet-record-form" onSubmit={finalizar}>
            <h2>Registro clínico</h2>

            <DitarProntuario atendimentoId={String(id)} aoEstruturar={aplicarDitado} />

            <label>
              Queixa principal
              <small>Veio do relato do tutor. Ajuste se necessário.</small>
              <textarea rows={3} value={form.queixa_principal} onChange={alterar('queixa_principal')} maxLength={2000} placeholder="Motivo do atendimento" />
            </label>

            <label>
              Exame físico
              <textarea rows={3} value={form.exame_fisico} onChange={alterar('exame_fisico')} maxLength={4000} placeholder="Estado geral, mucosas, ausculta, temperatura…" />
            </label>

            <label>
              Hipótese diagnóstica *
              <textarea rows={2} value={form.hipotese_diagnostica} onChange={alterar('hipotese_diagnostica')} maxLength={2000} placeholder="Sem isso o atendimento não pode ser encerrado" required />
            </label>

            <label>
              Diagnóstico definitivo
              <input className="input" value={form.diagnostico_definitivo} onChange={alterar('diagnostico_definitivo')} maxLength={2000} placeholder="Quando houver conclusão fechada" />
            </label>

            <h3>Alergias identificadas</h3>
            <p className="vet-record-form__hint">
              Fica na ficha do animal, não neste atendimento: quem atender daqui a seis meses vê antes de prescrever.
            </p>
            {form.alergias.map((item: ApiPayload, indice: number) => (
              <fieldset className="vet-record-item" key={`alergia-${indice}`}>
                <legend>Alergia {indice + 1}</legend>
                <input className="input" value={item.alergia} onChange={alterarLista('alergias', indice, 'alergia')} placeholder="Dipirona, frango, picada de pulga…" maxLength={120} />
                <div className="vet-record-item__row">
                  <select className="input" value={item.gravidade} onChange={alterarLista('alergias', indice, 'gravidade')} aria-label={`Gravidade da alergia ${indice + 1}`}>
                    <option value="leve">Leve</option>
                    <option value="moderada">Moderada</option>
                    <option value="grave">Grave</option>
                  </select>
                  <button type="button" className="vet-button--ghost" onClick={remover('alergias', indice)}>Remover</button>
                </div>
                <input className="input" value={item.observacoes} onChange={alterarLista('alergias', indice, 'observacoes')} placeholder="Reação observada" maxLength={400} />
              </fieldset>
            ))}
            <button type="button" className="vet-record-add" onClick={adicionar('alergias', ITEM_ALERGIA)}>
              <VetIcon name="plus" size={16} /> Registrar alergia
            </button>

            <h3>Prescrição</h3>
            {form.prescricoes.map((item: ApiPayload, indice: number) => (
              <fieldset className="vet-record-item" key={`prescricao-${indice}`}>
                <legend>Medicamento {indice + 1}</legend>
                <input className="input" value={item.medicamento} onChange={alterarLista('prescricoes', indice, 'medicamento')} placeholder="Medicamento" maxLength={160} />
                <div className="vet-record-item__row">
                  <input className="input" value={item.concentracao} onChange={alterarLista('prescricoes', indice, 'concentracao')} placeholder="Concentração (500mg)" maxLength={80} />
                  <input className="input" list="vet-formas" value={item.forma_farmaceutica} onChange={alterarLista('prescricoes', indice, 'forma_farmaceutica')} placeholder="Forma" maxLength={60} />
                </div>
                <textarea rows={2} value={item.posologia} onChange={alterarLista('prescricoes', indice, 'posologia')} placeholder="Posologia: 1 comprimido a cada 12h" maxLength={400} />
                <div className="vet-record-item__row">
                  <input className="input" type="number" min="1" max="365" value={item.duracao_dias} onChange={alterarLista('prescricoes', indice, 'duracao_dias')} placeholder="Duração (dias)" />
                  {form.prescricoes.length > 1 && (
                    <button type="button" className="vet-button--ghost" onClick={remover('prescricoes', indice)}>Remover</button>
                  )}
                </div>
              </fieldset>
            ))}
            <datalist id="vet-formas">
              {FORMAS.map((forma) => <option key={forma} value={forma} />)}
            </datalist>
            <button type="button" className="vet-record-add" onClick={adicionar('prescricoes', ITEM_PRESCRICAO)}>
              <VetIcon name="plus" size={16} /> Adicionar medicamento
            </button>

            <h3>Vacinas aplicadas</h3>
            <p className="vet-record-form__hint">
              Entram na carteira digital do tutor e na tag pública do pet. Com a próxima dose preenchida, o tutor ganha o lembrete do reforço.
            </p>
            {form.vacinas.map((item: ApiPayload, indice: number) => (
              <fieldset className="vet-record-item" key={`vacina-${indice}`}>
                <legend>Vacina {indice + 1}</legend>
                <input className="input" value={item.nome_vacina} onChange={alterarLista('vacinas', indice, 'nome_vacina')} placeholder="V10, Antirrábica, Giárdia…" maxLength={120} />
                <div className="vet-record-item__row">
                  <input className="input" value={item.laboratorio} onChange={alterarLista('vacinas', indice, 'laboratorio')} placeholder="Laboratório" maxLength={120} />
                  <input className="input" value={item.lote} onChange={alterarLista('vacinas', indice, 'lote')} placeholder="Lote" maxLength={60} />
                </div>
                <div className="vet-record-item__row">
                  <label className="vet-record-item__field">
                    Aplicação
                    <input className="input" type="date" value={item.data_aplicacao} onChange={alterarLista('vacinas', indice, 'data_aplicacao')} />
                  </label>
                  <label className="vet-record-item__field">
                    Próxima dose
                    <input className="input" type="date" value={item.proxima_dose} onChange={alterarLista('vacinas', indice, 'proxima_dose')} />
                  </label>
                </div>
                <button type="button" className="vet-button--ghost" onClick={remover('vacinas', indice)}>Remover</button>
              </fieldset>
            ))}
            <button type="button" className="vet-record-add" onClick={adicionar('vacinas', ITEM_VACINA)}>
              <VetIcon name="plus" size={16} /> Registrar vacina aplicada
            </button>

            <h3>Medicações em uso</h3>
            <p className="vet-record-form__hint">
              O que o animal passa a usar, não a receita deste atendimento. Reescrever um medicamento já ativo encerra o registro anterior.
            </p>
            {form.medicamentos.map((item: ApiPayload, indice: number) => (
              <fieldset className="vet-record-item" key={`medicamento-${indice}`}>
                <legend>Medicação {indice + 1}</legend>
                <input className="input" value={item.nome_medicamento} onChange={alterarLista('medicamentos', indice, 'nome_medicamento')} placeholder="Medicamento" maxLength={160} />
                <div className="vet-record-item__row">
                  <input className="input" value={item.dosagem} onChange={alterarLista('medicamentos', indice, 'dosagem')} placeholder="Dosagem (10mg, 1 gota/kg)" maxLength={120} />
                  <input className="input" type="number" min="1" max="8760" value={item.frequencia_horas} onChange={alterarLista('medicamentos', indice, 'frequencia_horas')} placeholder="A cada (horas)" />
                </div>
                <div className="vet-record-item__row">
                  <label className="vet-record-item__field">
                    Início
                    <input className="input" type="date" value={item.data_inicio} onChange={alterarLista('medicamentos', indice, 'data_inicio')} />
                  </label>
                  <label className="vet-record-item__field">
                    Término
                    <input className="input" type="date" value={item.data_fim} onChange={alterarLista('medicamentos', indice, 'data_fim')} />
                  </label>
                </div>
                <label className="vet-record-item__check">
                  <input type="checkbox" checked={item.uso_continuo} onChange={alterarLista('medicamentos', indice, 'uso_continuo')} />
                  Uso contínuo
                </label>
                <div className="vet-record-item__row">
                  <input className="input" value={item.observacoes} onChange={alterarLista('medicamentos', indice, 'observacoes')} placeholder="Observação" maxLength={400} />
                  <button type="button" className="vet-button--ghost" onClick={remover('medicamentos', indice)}>Remover</button>
                </div>
              </fieldset>
            ))}
            <button type="button" className="vet-record-add" onClick={adicionar('medicamentos', ITEM_MEDICAMENTO)}>
              <VetIcon name="plus" size={16} /> Registrar medicação em uso
            </button>

            <h3>Exames solicitados</h3>
            {form.exames.map((item: ApiPayload, indice: number) => (
              <fieldset className="vet-record-item" key={`exame-${indice}`}>
                <legend>Exame {indice + 1}</legend>
                <input className="input" value={item.nome_exame} onChange={alterarLista('exames', indice, 'nome_exame')} placeholder="Hemograma completo" maxLength={160} />
                <div className="vet-record-item__row">
                  <input className="input" value={item.justificativa} onChange={alterarLista('exames', indice, 'justificativa')} placeholder="Justificativa" maxLength={400} />
                  <button type="button" className="vet-button--ghost" onClick={remover('exames', indice)}>Remover</button>
                </div>
              </fieldset>
            ))}
            <button type="button" className="vet-record-add" onClick={adicionar('exames', ITEM_EXAME)}>
              <VetIcon name="plus" size={16} /> Adicionar exame
            </button>

            <label>
              Orientações ao tutor
              <textarea rows={3} value={form.orientacoes_tutor} onChange={alterar('orientacoes_tutor')} maxLength={4000} placeholder="Repouso, dieta, sinais de alerta para procurar emergência…" />
            </label>

            <label>
              Retorno sugerido
              <small>Vira um lembrete de retorno para o tutor, no dia escolhido.</small>
              <input className="input" type="date" value={form.retorno_sugerido_em} onChange={alterar('retorno_sugerido_em')} />
            </label>

            <p className="vet-record-form__note">
              Ao finalizar, a receita e o prontuário são emitidos em PDF e enviados ao tutor por e-mail.
              O atendimento passa a ser histórico e só a prescrição pode ser corrigida depois.
            </p>

            <button className="vet-modal__submit" type="submit" disabled={enviando || !form.hipotese_diagnostica.trim()}>
              {enviando ? 'Finalizando…' : 'Finalizar e emitir documentos'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
