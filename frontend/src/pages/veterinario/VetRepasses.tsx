import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetBottomNav, VetIcon, VetLoading, VetPageHeader, formatDate, formatMoney } from '../../components/veterinario/VetUI'

const filters = [['todos', 'Todos'], ['repassado', 'Repassado'], ['aguardando', 'Aguardando'], ['reembolsado', 'Reembolsado']]
const matchesFilter = (status: string, filter: ApiPayload) => {
  if (filter === 'todos') return true
  if (filter === 'repassado') return status === 'concluida'
  if (filter === 'reembolsado') return status === 'estornada'
  return ['pendente', 'aguardando_confirmacao', 'processando', 'aprovada'].includes(status)
}
const transactionStatus = (status: string) => ({ concluida: 'Recebido', estornada: 'Reembolsado', cancelada: 'Cancelado', falhou: 'Falhou', aprovada: 'Aguardando repasse', processando: 'Processando', aguardando_confirmacao: 'Aguardando confirmação', pendente: 'Pendente' }[status] || status)

export default function VetRepasses() {
  const navigate = useNavigate()
  const [wallet, setWallet] = useState<ApiPayload | null>(null)
  const [transactions, setTransactions] = useState<ApiPayload[]>([])
  const [filter, setFilter] = useState('todos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [transferOpen, setTransferOpen] = useState(false)
  const [form, setForm] = useState<ApiPayload>({ valor: '', banco: '', agencia: '', conta: '', tipo_conta: 'corrente', cpf_cnpj: '', titular: '' })
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [walletResponse, statementResponse] = await Promise.all([api.get('/v1/billing/saldo'), api.get('/v1/billing/extrato?limit=100')])
      setWallet(walletResponse.data?.carteira || {})
      setTransactions(statementResponse.data?.transacoes || [])
    } catch (requestError: any) { setError(requestError.response?.data?.error || 'Não foi possível carregar os repasses.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const visible = transactions.filter((item) => matchesFilter(item.status, filter))
  // Só um pedido por vez. Antes o botão continuava ali e cada toque debitava o
  // saldo de novo; agora a tela mostra o que já está em andamento.
  const pedidoEmAberto = transactions.find((item) =>
    item.tipo === 'transferencia_vet' && ['pendente', 'processando', 'aprovada'].includes(item.status))
  const requestTransfer = async () => {
    const value = Number(String(form.valor).replace(',', '.'))
    if (!value || value <= 0) return setError('Informe um valor válido para transferência.')
    setSubmitting(true); setError('')
    try {
      await api.post('/v1/billing/transferencias', { valor: value, dados_bancarios: { banco: form.banco, agencia: form.agencia, conta: form.conta, tipo_conta: form.tipo_conta, cpf_cnpj: form.cpf_cnpj, titular: form.titular } })
      setTransferOpen(false); await load()
    } catch (requestError: any) { setError(requestError.response?.data?.error || 'Não foi possível solicitar a transferência.') } finally { setSubmitting(false) }
  }

  return (
    <main className="vet-app">
      <VetPageHeader
        compact
        title="Meus repasses"
        onBack={() => navigate('/veterinario/home')}
        action={
          <button className="vet-icon-button" type="button" onClick={load} aria-label="Atualizar">
            <VetIcon name="refresh" size={18} />
          </button>
        }
      />

      {loading ? <VetLoading label="Carregando repasses" /> : (
        <>
          <section className="vet-wallet-summary">
            {error && <p className="vet-card vet-request" role="alert">{error}</p>}

            <div className="vet-policy">
              <strong>Política de repasse</strong>
              Os valores exibidos refletem as transações registradas no Saúde Pet. Ao solicitar, o valor sai do saldo disponível
              e entra na fila de repasse; a equipe confirma a transferência e você é avisado. Um pedido por vez.
            </div>

            <div className="vet-balance-grid">
              <div className="vet-card vet-balance-card">
                <VetIcon name="chart" size={18} />
                <strong>{formatMoney(wallet?.total_recebido)}</strong>
                <small>Total recebido</small>
              </div>
              <div className="vet-card vet-balance-card">
                <VetIcon name="clock" size={18} />
                <strong>{formatMoney(wallet?.saldo_pendente)}</strong>
                <small>Aguardando confirmação</small>
              </div>
            </div>

            {pedidoEmAberto ? (
              <div className="vet-policy">
                <strong>Pedido de {formatMoney(pedidoEmAberto.valor_total)} em andamento</strong>
                Solicitado em {formatDate(pedidoEmAberto.criado_em, true)}. O valor já saiu do saldo disponível e você
                recebe um aviso assim que o repasse for feito. Se o pedido for recusado, o valor volta para o seu saldo.
              </div>
            ) : Number(wallet?.saldo_disponivel || 0) > 0 && (
              <button
                className="vet-transfer-button"
                type="button"
                onClick={() => { setForm((current: ApiPayload) => ({ ...current, valor: String(wallet.saldo_disponivel) })); setTransferOpen(true) }}
              >
                Solicitar transferência de {formatMoney(wallet.saldo_disponivel)}
              </button>
            )}
          </section>

          <div className="vet-tabs vet-wallet-tabs" role="tablist">
            {filters.map(([key, label]) => (
              <button
                className={`vet-tab ${filter === key ? 'is-active' : ''}`}
                key={key}
                onClick={() => setFilter(key)}
                type="button"
                role="tab"
                aria-selected={filter === key}
              >
                {label}
              </button>
            ))}
          </div>

          <section className="vet-list">
            {visible.length === 0 ? (
              <div className="vet-card vet-empty">
                <VetIcon name="wallet" size={38} />
                <strong>Nenhum repasse neste filtro</strong>
              </div>
            ) : visible.map((item) => (
              <article className="vet-card vet-transaction" key={item.id}>
                <div className="vet-transaction__head">
                  <div>
                    <h2>{item.descricao || 'Transação de atendimento'}</h2>
                    <p>{formatDate(item.criado_em)}</p>
                  </div>
                  <span className={`vet-status ${item.status === 'concluida' ? 'vet-status--confirmed' : item.status === 'estornada' ? 'vet-status--cancelled' : 'vet-status--pending'}`}>
                    {/* O tradutor existia no topo do arquivo e nunca era
                        chamado: a tela mostrava o enum cru do banco
                        ("concluida", "estornada") para o veterinário. */}
                    {transactionStatus(item.status)}
                  </span>
                </div>
                <div className="vet-transaction__amounts">
                  <div>
                    <strong>{formatMoney(item.valor_total)}</strong>
                    <small>Valor total</small>
                  </div>
                  <div>
                    <strong>{formatMoney(item.valor_veterinario)}</strong>
                    <small>Seu repasse</small>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {transferOpen && (
        <div className="vet-modal-layer" role="presentation">
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
            <div className="vet-modal__title">
              <VetIcon name="wallet" />
              <h2 id="transfer-title">Solicitar transferência</h2>
              <button className="vet-icon-button" type="button" onClick={() => setTransferOpen(false)} aria-label="Fechar">
                <VetIcon name="close" size={18} />
              </button>
            </div>

            <div className="vet-prescription-note">
              <label>
                Valor (R$)
                <input className="input" inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </label>
              <label>
                Titular
                <input className="input" value={form.titular} onChange={(e) => setForm({ ...form, titular: e.target.value })} />
              </label>
              <label>
                CPF/CNPJ
                <input className="input" value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} />
              </label>
              <label>
                Banco
                <input className="input" value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
              </label>
              <label>
                Agência
                <input className="input" value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} />
              </label>
              <label>
                Conta
                <input className="input" value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} />
              </label>
              <label>
                Tipo de conta
                <select className="input" value={form.tipo_conta} onChange={(e) => setForm({ ...form, tipo_conta: e.target.value })}>
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                </select>
              </label>
            </div>

            <button
              className="vet-modal__submit"
              type="button"
              disabled={submitting || !form.titular || !form.cpf_cnpj || !form.banco || !form.agencia || !form.conta}
              onClick={requestTransfer}
            >
              {submitting ? 'Enviando…' : 'Confirmar solicitação'}
            </button>
          </section>
        </div>
      )}

      <VetBottomNav />
    </main>
  )
}
