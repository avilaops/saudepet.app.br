import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { useSocket } from '../../contexts/SocketContext'
import {
  VetBottomNav,
  VetIcon,
  VetLoading,
  VetPageHeader,
  formatDate,
  formatMoney,
  serviceLabel
} from '../../components/veterinario/VetUI'

const FILTROS = [
  ['abertas', 'Em aberto'],
  ['pagas', 'Pagas'],
  ['encerradas', 'Encerradas'],
  ['todas', 'Todas']
]

const ROTULO_STATUS: Record<string, string> = {
  CREATED: 'Aguardando pagamento',
  PENDING: 'Aguardando pagamento',
  PROCESSING: 'Processando',
  AUTHORIZED: 'Autorizado',
  PAID: 'Pago',
  FAILED: 'Falhou',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelada',
  PARTIALLY_REFUNDED: 'Estorno parcial',
  REFUNDED: 'Estornado',
  CHARGEBACK: 'Chargeback',
  DISPUTED: 'Em disputa'
}

const CLASSE_STATUS = (status: string) => {
  if (status === 'PAID') return 'vet-status--confirmed'
  if (['CREATED', 'PENDING', 'PROCESSING', 'AUTHORIZED'].includes(status)) return 'vet-status--pending'
  return 'vet-status--cancelled'
}

const ABERTA = (status: string) => ['CREATED', 'PENDING', 'PROCESSING', 'AUTHORIZED'].includes(status)
const CANCELAVEL = (status: string) => ['CREATED', 'PENDING'].includes(status)

export default function VetCobrancas() {
  const navigate = useNavigate()
  const { socket } = useSocket()
  const [filtro, setFiltro] = useState('abertas')
  const [resumo, setResumo] = useState<ApiPayload>({ totalAberto: 0, totalPago: 0, quantidadeAberta: 0, quantidadePaga: 0 })
  const [cobrancas, setCobrancas] = useState<ApiPayload[]>([])
  const [atendimentos, setAtendimentos] = useState<ApiPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [novaAberta, setNovaAberta] = useState(false)
  const [form, setForm] = useState<ApiPayload>({ atendimentoId: '', valor: '', descricao: '' })
  const [enviando, setEnviando] = useState(false)
  const [cancelandoId, setCancelandoId] = useState('')
  const [aCancelar, setACancelar] = useState<ApiPayload | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const [cobrancasResposta, atendimentosResposta] = await Promise.all([
        api.get('/v1/veterinario/financeiro/cobrancas'),
        api.get('/v1/veterinario/financeiro/cobrancas/atendimentos').catch(() => ({ data: { atendimentos: [] } }))
      ])
      setCobrancas(cobrancasResposta.data?.cobrancas || [])
      setResumo(cobrancasResposta.data?.resumo || { totalAberto: 0, totalPago: 0, quantidadeAberta: 0, quantidadePaga: 0 })
      setAtendimentos(atendimentosResposta.data?.atendimentos || [])
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar suas cobranças.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!socket) return undefined
    const aoPagar = () => carregar()
    socket.on('pagamento:aprovado', aoPagar)
    return () => {
      socket.off('pagamento:aprovado', aoPagar)
    }
  }, [socket, carregar])

  const visiveis = useMemo(() => cobrancas.filter((item) => {
    if (filtro === 'todas') return true
    if (filtro === 'abertas') return ABERTA(item.status)
    if (filtro === 'pagas') return item.status === 'PAID'
    return !ABERTA(item.status) && item.status !== 'PAID'
  }), [cobrancas, filtro])

  const cobraveis = atendimentos.filter((item) => !item.ja_pago && !item.cobranca_aberta)
  const atendimentoSelecionado = cobraveis.find((item) => item.id === form.atendimentoId)

  const abrirNova = () => {
    setAviso('')
    setErro('')
    setForm({ atendimentoId: cobraveis[0]?.id || '', valor: cobraveis[0]?.valor_estimado ? String(cobraveis[0].valor_estimado) : '', descricao: '' })
    setNovaAberta(true)
  }

  const escolherAtendimento = (event: any) => {
    const id = event.target.value
    const escolhido = cobraveis.find((item) => item.id === id)
    setForm((atual: ApiPayload) => ({
      ...atual,
      atendimentoId: id,
      valor: escolhido?.valor_estimado ? String(escolhido.valor_estimado) : atual.valor
    }))
  }

  const criar = async () => {
    const valor = Number(String(form.valor).replace(',', '.'))
    if (!form.atendimentoId) return setErro('Selecione o atendimento que será cobrado.')
    if (!valor || valor <= 0) return setErro('Informe um valor maior que zero.')

    setEnviando(true)
    setErro('')
    try {
      const { data } = await api.post('/v1/veterinario/financeiro/cobrancas', {
        atendimentoId: form.atendimentoId,
        valor,
        descricao: form.descricao.trim() || undefined
      })
      setNovaAberta(false)
      setAviso(data.message || 'Cobrança gerada e enviada ao tutor.')
      await carregar()
    } catch (requestError: any) {
      const resposta = requestError.response?.data
      const detalhe = resposta?.details?.map((item: ApiPayload) => item.message).join(' • ')
      setErro(detalhe || resposta?.error || 'Não foi possível gerar a cobrança.')
    } finally {
      setEnviando(false)
    }
  }

  const cancelar = async () => {
    const cobranca = aCancelar
    setACancelar(null)
    if (!cobranca) return
    setCancelandoId(cobranca.id)
    setErro('')
    try {
      await api.post(`/v1/veterinario/financeiro/cobrancas/${cobranca.id}/cancelar`)
      setAviso('Cobrança cancelada.')
      await carregar()
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível cancelar a cobrança.')
    } finally {
      setCancelandoId('')
    }
  }

  const copiarPix = async (cobranca: ApiPayload) => {
    if (!cobranca.pix_copy_paste) return
    try {
      await navigator.clipboard.writeText(cobranca.pix_copy_paste)
      setAviso('Código PIX copiado — é só enviar para o tutor.')
    } catch {
      setAviso('Não foi possível copiar automaticamente. Selecione o código manualmente.')
    }
  }

  return (
    <main className="vet-app">
      <VetPageHeader
        compact
        title="Cobranças"
        onBack={() => navigate('/veterinario/home')}
        action={
          <button className="vet-icon-button" type="button" onClick={carregar} aria-label="Atualizar">
            <VetIcon name="refresh" size={18} />
          </button>
        }
      />

      {loading ? <VetLoading label="Carregando cobranças" /> : (
        <>
          <section className="vet-wallet-summary">
            {erro && <p className="vet-card vet-request" role="alert">{erro}</p>}
            {aviso && <p className="vet-card vet-bank-success" role="status">{aviso}</p>}

            <div className="vet-balance-grid">
              <div className="vet-card vet-balance-card">
                <VetIcon name="clock" size={18} />
                <strong>{formatMoney(resumo.totalAberto)}</strong>
                <small>{resumo.quantidadeAberta} em aberto</small>
              </div>
              <div className="vet-card vet-balance-card">
                <VetIcon name="check" size={18} />
                <strong>{formatMoney(resumo.totalPago)}</strong>
                <small>{resumo.quantidadePaga} pagas</small>
              </div>
            </div>

            <button className="vet-transfer-button" type="button" onClick={abrirNova} disabled={!cobraveis.length}>
              {cobraveis.length ? 'Gerar nova cobrança' : 'Nenhum atendimento pendente de cobrança'}
            </button>
          </section>

          <div className="vet-tabs vet-wallet-tabs" role="tablist">
            {FILTROS.map(([chave, rotulo]) => (
              <button
                key={chave}
                type="button"
                role="tab"
                aria-selected={filtro === chave}
                className={`vet-tab ${filtro === chave ? 'is-active' : ''}`}
                onClick={() => setFiltro(chave)}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <section className="vet-list">
            {visiveis.length === 0 ? (
              <div className="vet-card vet-empty">
                <VetIcon name="wallet" size={38} />
                <strong>Nenhuma cobrança neste filtro</strong>
                <p>Gere uma cobrança a partir de um atendimento em andamento ou finalizado.</p>
              </div>
            ) : visiveis.map((cobranca) => (
              <article className="vet-card vet-charge" key={cobranca.id}>
                <div className="vet-charge__head">
                  <div>
                    <h2>{cobranca.tutor?.nome || 'Tutor'}</h2>
                    <p>
                      {cobranca.atendimento ? serviceLabel(cobranca.atendimento.tipo_atendimento) : 'Atendimento'}
                      {cobranca.atendimento?.pet?.nome ? ` • ${cobranca.atendimento.pet.nome}` : ''}
                      {' • '}{formatDate(cobranca.criado_em, true)}
                    </p>
                  </div>
                  <span className={`vet-status ${CLASSE_STATUS(cobranca.status)}`}>
                    {ROTULO_STATUS[cobranca.status] || cobranca.status}
                  </span>
                </div>

                <div className="vet-transaction__amounts">
                  <div>
                    <strong>{formatMoney(cobranca.valor)}</strong>
                    <small>Valor cobrado</small>
                  </div>
                  <div>
                    <strong>{cobranca.meu_repasse === null ? '—' : formatMoney(cobranca.meu_repasse)}</strong>
                    <small>{cobranca.meu_repasse === null ? 'Sem split (conta não habilitada)' : 'Seu repasse'}</small>
                  </div>
                </div>

                {cobranca.paid_at && <p className="vet-charge__meta">Pago em {formatDate(cobranca.paid_at, true)}</p>}
                {!cobranca.paid_at && cobranca.expires_at && ABERTA(cobranca.status) && (
                  <p className="vet-charge__meta">Válida até {formatDate(cobranca.expires_at, true)}</p>
                )}

                {ABERTA(cobranca.status) && (
                  <div className="vet-charge__actions">
                    {cobranca.pix_copy_paste && (
                      <button className="vet-button--primary" type="button" onClick={() => copiarPix(cobranca)}>
                        Copiar PIX
                      </button>
                    )}
                    {cobranca.tutor?.id && (
                      <button
                        className="vet-button--ghost"
                        type="button"
                        onClick={() => navigate(`/veterinario/chat/${cobranca.tutor.id}${cobranca.atendimento?.id ? `?atendimento=${cobranca.atendimento.id}` : ''}`)}
                      >
                        Falar com o tutor
                      </button>
                    )}
                    {CANCELAVEL(cobranca.status) ? (
                      <button
                        className="vet-button--secondary"
                        type="button"
                        disabled={cancelandoId === cobranca.id}
                        onClick={() => setACancelar(cobranca)}
                      >
                        {cancelandoId === cobranca.id ? 'Cancelando…' : 'Cancelar'}
                      </button>
                    ) : (
                      <p className="vet-charge__meta">
                        O pagamento já está em processamento no banco — não dá mais para cancelar por aqui.
                        Se precisar desfazer, peça o estorno à administração.
                      </p>
                    )}
                  </div>
                )}
              </article>
            ))}
          </section>
        </>
      )}

      {novaAberta && (
        <div className="vet-modal-layer" role="presentation">
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="nova-cobranca-titulo">
            <div className="vet-modal__title">
              <VetIcon name="wallet" />
              <h2 id="nova-cobranca-titulo">Nova cobrança</h2>
              <button className="vet-icon-button" type="button" onClick={() => setNovaAberta(false)} aria-label="Fechar">
                <VetIcon name="close" size={18} />
              </button>
            </div>

            {erro && <p className="vet-card vet-request" role="alert">{erro}</p>}

            <div className="vet-prescription-note">
              <label>
                Atendimento
                <select className="input" value={form.atendimentoId} onChange={escolherAtendimento}>
                  <option value="">Selecione…</option>
                  {cobraveis.map((atendimento) => (
                    <option key={atendimento.id} value={atendimento.id}>
                      {atendimento.tutor?.nome || 'Tutor'} • {atendimento.pet?.nome || 'Pet'} • {formatDate(atendimento.criado_em)}
                    </option>
                  ))}
                </select>
              </label>

              {atendimentoSelecionado && (
                <p className="vet-modal__patient">
                  <strong>{serviceLabel(atendimentoSelecionado.tipo_atendimento)}</strong>
                  <small>
                    {atendimentoSelecionado.pet?.nome || 'Pet'} • {atendimentoSelecionado.tutor?.nome || 'Tutor'}
                    {atendimentoSelecionado.valor_estimado ? ` • estimado ${formatMoney(atendimentoSelecionado.valor_estimado)}` : ''}
                  </small>
                </p>
              )}

              <label>
                Valor (R$)
                <input
                  className="input"
                  inputMode="decimal"
                  value={form.valor}
                  onChange={(event) => setForm((atual: ApiPayload) => ({ ...atual, valor: event.target.value }))}
                  placeholder="0,00"
                />
              </label>

              <label>
                Observação para o tutor <small>(opcional)</small>
                <input
                  className="input"
                  maxLength={300}
                  value={form.descricao}
                  onChange={(event) => setForm((atual: ApiPayload) => ({ ...atual, descricao: event.target.value }))}
                  placeholder="Ex.: consulta + aplicação de medicação"
                />
              </label>

              <p className="vet-policy">
                <strong>Como funciona</strong>
                A cobrança é gerada em PIX, o tutor recebe o aviso na hora e o seu repasse cai automaticamente
                na conta bancária cadastrada, já descontada a taxa da plataforma.
              </p>
            </div>

            <button
              className="vet-modal__submit"
              type="button"
              disabled={enviando || !form.atendimentoId || !form.valor}
              onClick={criar}
            >
              {enviando ? 'Gerando…' : 'Gerar cobrança PIX'}
            </button>
          </section>
        </div>
      )}

      {aCancelar && (
        <div
          className="vet-modal-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setACancelar(null)}
        >
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="cancelar-cobranca-titulo">
            <div className="vet-modal__title">
              <VetIcon name="wallet" />
              <h2 id="cancelar-cobranca-titulo">Cancelar cobrança</h2>
              <button className="vet-icon-button" type="button" onClick={() => setACancelar(null)} aria-label="Fechar">
                <VetIcon name="close" size={18} />
              </button>
            </div>

            <div className="vet-modal__patient">
              <strong>{aCancelar.tutor?.nome || 'Tutor'}</strong>
              <small>
                {aCancelar.atendimento ? serviceLabel(aCancelar.atendimento.tipo_atendimento) : 'Atendimento'}
                {' • '}{formatDate(aCancelar.criado_em, true)}
              </small>
            </div>

            <p className="vet-confirm__text">
              Cancelar a cobrança de {formatMoney(aCancelar.valor)}? O tutor deixará de conseguir pagar por ela.
            </p>

            <div className="vet-confirm__actions">
              <button type="button" className="vet-button--ghost" onClick={() => setACancelar(null)}>
                Manter cobrança
              </button>
              <button
                type="button"
                className="vet-button--secondary"
                disabled={cancelandoId === aCancelar.id}
                onClick={cancelar}
              >
                Cancelar cobrança
              </button>
            </div>
          </section>
        </div>
      )}

      <VetBottomNav />
    </main>
  )
}
