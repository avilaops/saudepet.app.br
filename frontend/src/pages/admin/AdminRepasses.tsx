import type { ApiPayload } from '../../types/api'
import React, { useCallback, useEffect, useState } from 'react'
import { Banknote, CheckCircle2, Copy, RefreshCw, XCircle } from 'lucide-react'
import api from '../../services/api'
import { Aviso, Campo, Painel, Vazio, botaoPerigo, botaoPrimario, botaoSecundario, entrada } from '../../components/admin/AdminUI'

// Fila de repasses aos veterinários.
//
// O pedido de transferência do veterinário debitava o saldo dele e criava uma
// transação pendente que NENHUM ponto do sistema lia — não havia rota, worker
// nem tela que pagasse aquilo. O dinheiro sumia da tela do profissional e não
// chegava a lugar nenhum. Esta tela é a outra ponta: quem paga vê o pedido,
// os dados bancários e fecha o ciclo — confirmando ou devolvendo o saldo.

const FILTROS = [
  ['pendente', 'Aguardando repasse'],
  ['concluida', 'Repassados'],
  ['cancelada', 'Recusados'],
  ['todos', 'Todos']
]

const ROTULO_STATUS: Record<string, string> = {
  pendente: 'Aguardando repasse',
  processando: 'Em processamento',
  aprovada: 'Aprovado',
  concluida: 'Repassado',
  cancelada: 'Recusado'
}

const dinheiro = (valor: any) =>
  Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const dataHora = (valor: string) =>
  valor ? new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function AdminRepasses() {
  const [filtro, setFiltro] = useState('pendente')
  const [transferencias, setTransferencias] = useState<ApiPayload[]>([])
  const [totalPendente, setTotalPendente] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [emAcao, setEmAcao] = useState<ApiPayload | null>(null)

  // Modal de confirmação/recusa: pagar dinheiro não pode ser um clique solto.
  const [decisao, setDecisao] = useState<ApiPayload | null>(null) // { transferencia, tipo: 'pagar'|'recusar' }
  const [texto, setTexto] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const { data } = await api.get('/v1/billing/admin/transferencias', { params: { status: filtro } })
      setTransferencias(data.transferencias || [])
      setTotalPendente(data.total_pendente || 0)
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar a fila de repasses.')
    } finally {
      setCarregando(false)
    }
  }, [filtro])

  useEffect(() => { carregar() }, [carregar])

  const confirmarDecisao = async () => {
    if (!decisao) return
    const { transferencia, tipo } = decisao
    setEmAcao(transferencia.id)
    setErro('')
    try {
      if (tipo === 'pagar') {
        await api.post(`/v1/billing/admin/transferencias/${transferencia.id}/pagar`, { comprovante: texto.trim() || undefined })
        setAviso(`Repasse de ${dinheiro(transferencia.valor)} confirmado. O veterinário foi avisado.`)
      } else {
        await api.post(`/v1/billing/admin/transferencias/${transferencia.id}/recusar`, { motivo: texto.trim() })
        setAviso(`Pedido recusado. ${dinheiro(transferencia.valor)} voltou para o saldo do veterinário.`)
      }
      setDecisao(null)
      setTexto('')
      carregar()
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível concluir a ação.')
    } finally {
      setEmAcao(null)
    }
  }

  const copiar = (dados: ApiPayload) => {
    if (!dados) return
    const linhas = [
      dados.titular && `Titular: ${dados.titular}`,
      dados.cpf_cnpj && `CPF/CNPJ: ${dados.cpf_cnpj}`,
      dados.banco && `Banco: ${dados.banco}`,
      dados.agencia && `Agência: ${dados.agencia}`,
      dados.conta && `Conta: ${dados.conta}${dados.tipo_conta ? ` (${dados.tipo_conta})` : ''}`
    ].filter(Boolean).join('\n')
    navigator.clipboard?.writeText(linhas)
    setAviso('Dados bancários copiados.')
  }

  const recusaCurta = decisao?.tipo === 'recusar' && texto.trim().length < 5

  return (
    <div className="space-y-5">
      <Painel
        titulo="Repasses aos veterinários"
        acoes={
          <button type="button" className={botaoSecundario} onClick={carregar} disabled={carregando}>
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        }
      >
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Banknote className="h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Aguardando repasse</p>
            <p className="text-lg font-black text-amber-900">{dinheiro(totalPendente)}</p>
          </div>
          <p className="ml-auto max-w-md text-[11px] font-medium leading-relaxed text-amber-800">
            O saldo já foi debitado da carteira do veterinário no momento do pedido. Recusar devolve o valor.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={filtro === valor ? botaoPrimario : botaoSecundario}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </Painel>

      {erro && <Aviso>{erro}</Aviso>}
      {aviso && <Aviso tom="info">{aviso}</Aviso>}

      {carregando ? (
        <Vazio>Carregando…</Vazio>
      ) : transferencias.length === 0 ? (
        <Vazio>Nenhum pedido nesta situação.</Vazio>
      ) : (
        <div className="space-y-3">
          {transferencias.map((item) => (
            <Painel key={item.id} className="!p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-lg font-black text-slate-900">{dinheiro(item.valor)}</p>
                  <p className="text-xs font-bold text-slate-700">
                    {item.veterinario?.nome || 'Veterinário removido'}
                    {item.veterinario?.crmv ? ` · CRMV ${item.veterinario.crmv}` : ''}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                    Pedido em {dataHora(item.criado_em)}
                    {item.concluido_em ? ` · Repassado em ${dataHora(item.concluido_em)}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                  {ROTULO_STATUS[item.status] || item.status}
                </span>
              </div>

              {item.dados_bancarios ? (
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs md:grid-cols-3">
                  {[
                    ['Titular', item.dados_bancarios.titular],
                    ['CPF/CNPJ', item.dados_bancarios.cpf_cnpj],
                    ['Banco', item.dados_bancarios.banco],
                    ['Agência', item.dados_bancarios.agencia],
                    ['Conta', item.dados_bancarios.conta],
                    ['Tipo', item.dados_bancarios.tipo_conta]
                  ].filter(([, valor]) => valor).map(([rotulo, valor]) => (
                    <div key={rotulo} className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{rotulo}</dt>
                      <dd className="truncate font-bold text-slate-800">{valor}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-[11px] font-bold text-slate-400">
                  Sem dados bancários gravados — peça ao veterinário para reenviar o pedido.
                </p>
              )}

              {item.notas && (
                <p className="mt-3 text-[11px] font-medium text-slate-500">
                  <span className="font-bold uppercase tracking-wider text-slate-400">Observação:</span> {item.notas}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {item.dados_bancarios && (
                  <button type="button" className={botaoSecundario} onClick={() => copiar(item.dados_bancarios)}>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar dados
                  </button>
                )}
                {['pendente', 'processando', 'aprovada'].includes(item.status) && (
                  <>
                    <button
                      type="button"
                      className={botaoPrimario}
                      disabled={emAcao === item.id}
                      onClick={() => { setDecisao({ transferencia: item, tipo: 'pagar' }); setTexto('') }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirmar repasse
                    </button>
                    <button
                      type="button"
                      className={botaoPerigo}
                      disabled={emAcao === item.id}
                      onClick={() => { setDecisao({ transferencia: item, tipo: 'recusar' }); setTexto('') }}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Recusar e devolver
                    </button>
                  </>
                )}
              </div>
            </Painel>
          ))}
        </div>
      )}

      {decisao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">
              {decisao.tipo === 'pagar' ? 'Confirmar repasse' : 'Recusar pedido'}
            </h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
              {decisao.tipo === 'pagar'
                ? `Você está declarando que ${dinheiro(decisao.transferencia.valor)} já foi enviado para a conta de ${decisao.transferencia.veterinario?.nome || 'o veterinário'}. A ação fica registrada na auditoria.`
                : `${dinheiro(decisao.transferencia.valor)} volta para o saldo disponível de ${decisao.transferencia.veterinario?.nome || 'o veterinário'}.`}
            </p>

            <div className="mt-4">
              <Campo rotulo={decisao.tipo === 'pagar' ? 'Comprovante ou identificação (opcional)' : 'Motivo da recusa'}>
                <textarea
                  className={entrada}
                  rows={3}
                  value={texto}
                  onChange={(event) => setTexto(event.target.value)}
                  placeholder={decisao.tipo === 'pagar' ? 'Ex.: PIX E1234... em 20/08' : 'Ex.: conta informada não pertence ao titular'}
                />
              </Campo>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={botaoSecundario} onClick={() => { setDecisao(null); setTexto('') }}>
                Cancelar
              </button>
              <button
                type="button"
                className={decisao.tipo === 'pagar' ? botaoPrimario : botaoPerigo}
                disabled={recusaCurta || emAcao === decisao.transferencia.id}
                onClick={confirmarDecisao}
              >
                {decisao.tipo === 'pagar' ? 'Confirmar repasse' : 'Recusar e devolver saldo'}
              </button>
            </div>
            {recusaCurta && (
              <p className="mt-2 text-right text-[11px] font-bold text-slate-400">
                Escreva o motivo — o veterinário precisa saber o que corrigir.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
