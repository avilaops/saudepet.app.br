import type { ApiPayload } from '../../types/api'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import { Badge, EmptyState, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'

const STATUS: Record<string, { texto: string; tom: 'teal' | 'slate' | 'amber' | 'red' }> = {
  finalizado: { texto: 'Finalizado', tom: 'teal' },
  concluido: { texto: 'Finalizado', tom: 'teal' },
  cancelado: { texto: 'Cancelado', tom: 'slate' },
  cancelado_tutor: { texto: 'Cancelado', tom: 'slate' },
  cancelado_vet: { texto: 'Cancelado', tom: 'slate' },
  procurando_veterinario: { texto: 'Procurando', tom: 'amber' },
  oferta_enviada: { texto: 'Chamando', tom: 'amber' },
  veterinario_encontrado: { texto: 'Confirmando', tom: 'amber' },
  aceito: { texto: 'Confirmado', tom: 'amber' },
  a_caminho: { texto: 'A caminho', tom: 'amber' },
  chegou: { texto: 'No local', tom: 'amber' },
  atendimento_em_andamento: { texto: 'Em andamento', tom: 'amber' },
  encaminhado: { texto: 'Encaminhado à emergência', tom: 'red' }
}

const TIPO: Record<string, string> = {
  emergencia: 'Emergência',
  consulta_domiciliar: 'Consulta domiciliar',
  teleorientacao: 'Teleorientação'
}

const FINALIZADOS = ['finalizado', 'concluido']

export default function HistoricoAtendimentos() {
  const navigate = useNavigate()
  const [atendimentos, setAtendimentos] = useState<ApiPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregarAtendimentos()
  }, [])

  const carregarAtendimentos = async () => {
    try {
      const response = await api.get('/solicitacoes/tutor/lista')
      setAtendimentos(Array.isArray(response.data) ? response.data : [])
    } catch (error: any) {
      // Sem isto, falha de rede aparecia como "Nenhum atendimento ainda".
      setErro(error.response?.data?.error || 'Não foi possível carregar seu histórico.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container-app flex min-h-screen items-center justify-center bg-surface-page">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
      </div>
    )
  }

  return (
    <div className="container-app bg-surface-page pb-24">
      {erro && (
        <div className="mx-5 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">
          {erro}
          <button type="button" className="ml-2 font-bold underline" onClick={() => { setLoading(true); setErro(''); carregarAtendimentos() }}>Tentar novamente</button>
        </div>
      )}
      <PageHeader
        title="Histórico"
        subtitle={atendimentos.length > 0 ? `${atendimentos.length} atendimento${atendimentos.length !== 1 ? 's' : ''}` : 'Nenhum atendimento ainda'}
        onBack={() => navigate('/tutor/home')}
      />

      <div className="space-y-2.5 px-5 py-5">
        {atendimentos.length === 0 ? (
          <EmptyState
            icon="history"
            title="Nenhum atendimento ainda"
            description="Cada atendimento concluído guarda aqui o diagnóstico, a receita e o prontuário do seu pet."
          />
        ) : (
          atendimentos.map((atendimento) => {
            const estado = STATUS[atendimento.status] || { texto: atendimento.status, tom: 'slate' }
            const finalizado = FINALIZADOS.includes(atendimento.status)
            return (
              <Panel key={atendimento.id} className="overflow-hidden" as="article">
                <div className="flex items-start justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <h2 className="truncate text-[0.9rem] font-semibold tracking-tight text-ink">
                      {atendimento.pet?.nome || 'Pet'}
                    </h2>
                    <p className="mt-0.5 text-[0.72rem] text-slate-400">
                      {TIPO[atendimento.tipo_atendimento] || 'Atendimento'} ·{' '}
                      {new Date(atendimento.criado_em).toLocaleDateString('pt-BR')}
                    </p>
                    {atendimento.veterinario?.usuario?.nome && (
                      <p className="mt-1 truncate text-[0.72rem] text-slate-500">
                        {atendimento.veterinario.usuario.nome}
                      </p>
                    )}
                  </div>
                  <Badge tone={estado.tom}>{estado.texto}</Badge>
                </div>

                {atendimento.diagnostico && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    <Eyebrow className="text-slate-400">Diagnóstico</Eyebrow>
                    <p className="mt-1 text-[0.78rem] leading-relaxed text-slate-600">{atendimento.diagnostico}</p>
                  </div>
                )}

                {/* O checkout existia no roteador e nenhuma tela levava até ele:
                    quando o veterinário gerava a cobrança, o tutor não tinha
                    por onde pagar dentro do aplicativo. */}
                {atendimento.pagamento && atendimento.pagamento.status !== 'PAID' && (
                  <button
                    onClick={() => navigate(`/tutor/pagamento/${atendimento.id}`)}
                    className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 bg-primary/5 px-4 py-3 text-[0.78rem] font-semibold text-primary transition hover:bg-primary/10"
                  >
                    <Icon name="wallet" size={14} />
                    Pagar atendimento
                  </button>
                )}

                {atendimento.pagamento?.status === 'PAID' && (
                  <p className="border-t border-slate-100 px-4 py-3 text-[0.75rem] font-semibold text-emerald-600">
                    Pagamento confirmado
                  </p>
                )}

                {/* O checkout existia no roteador e nenhuma tela levava até ele:
                    quando o veterinário gerava a cobrança, o tutor não tinha
                    por onde pagar dentro do aplicativo. */}
                {atendimento.pagamento && atendimento.pagamento.status !== 'PAID' && (
                  <button
                    onClick={() => navigate(`/tutor/pagamento/${atendimento.id}`)}
                    className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 bg-primary/5 px-4 py-3 text-[0.78rem] font-semibold text-primary transition hover:bg-primary/10"
                  >
                    <Icon name="card" size={14} />
                    Pagar atendimento
                  </button>
                )}

                {atendimento.pagamento?.status === 'PAID' && (
                  <p className="border-t border-slate-100 px-4 py-3 text-[0.75rem] font-semibold text-emerald-600">
                    Pagamento confirmado
                  </p>
                )}

                {finalizado && (
                  <button
                    onClick={() => navigate(`/tutor/atendimento/${atendimento.id}/prontuario`)}
                    className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-3 text-[0.78rem] font-semibold text-primary transition hover:bg-slate-50"
                  >
                    <Icon name="clipboard" size={14} />
                    Ver prontuário completo
                  </button>
                )}

                {(atendimento.receita_pdf_url || atendimento.prontuario_pdf_url) && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
                    {atendimento.receita_pdf_url && (
                      <a
                        href={atendimento.receita_pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 px-3 py-2 text-[0.72rem] font-semibold text-ink transition hover:bg-slate-50"
                      >
                        <Icon name="clipboard" size={14} />
                        Receita
                      </a>
                    )}
                    {atendimento.prontuario_pdf_url && (
                      <a
                        href={atendimento.prontuario_pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 px-3 py-2 text-[0.72rem] font-semibold text-ink transition hover:bg-slate-50"
                      >
                        <Icon name="clipboard" size={14} />
                        Prontuário
                      </a>
                    )}
                  </div>
                )}

                {finalizado && !atendimento.avaliacao && (
                  <button
                    onClick={() => navigate(`/tutor/avaliar/${atendimento.id}`)}
                    className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-3 text-[0.78rem] font-semibold text-primary transition hover:bg-slate-50"
                  >
                    <Icon name="star" size={14} />
                    Avaliar atendimento
                  </button>
                )}

                {atendimento.avaliacao && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Eyebrow className="text-slate-400">Sua avaliação</Eyebrow>
                      <span className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((posicao) => (
                          <Icon
                            key={posicao}
                            name="star"
                            size={12}
                            className={posicao <= atendimento.avaliacao.nota ? 'text-primary' : 'text-slate-200'}
                          />
                        ))}
                      </span>
                    </div>
                    {atendimento.avaliacao.comentario && (
                      <p className="mt-1.5 text-[0.75rem] leading-relaxed text-slate-500">
                        “{atendimento.avaliacao.comentario}”
                      </p>
                    )}
                  </div>
                )}
              </Panel>
            )
          })
        )}
      </div>

      <TutorBottomNav />
    </div>
  )
}
