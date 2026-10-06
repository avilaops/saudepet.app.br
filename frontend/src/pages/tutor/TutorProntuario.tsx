import type { ApiPayload } from '../../types/api'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../services/api'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import { Badge, EmptyState, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import MidiasDoAtendimento from '../../components/MidiasDoAtendimento'

const dataCurta = (valor: string) => (valor ? new Date(valor).toLocaleDateString('pt-BR') : null)

function Campo({ titulo, children }: ApiPayload) {
  if (!children) return null
  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <Eyebrow className="text-slate-400">{titulo}</Eyebrow>
      <p className="mt-1 whitespace-pre-line text-[0.78rem] leading-relaxed text-slate-600">{children}</p>
    </div>
  )
}

function Prescricoes({ itens }: ApiPayload) {
  if (!itens?.length) return null
  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <Eyebrow className="text-slate-400">Prescrição</Eyebrow>
      <div className="mt-2 space-y-2">
        {itens.map((item: ApiPayload) => (
          <div key={item.id} className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2.5">
            <p className="text-[0.8rem] font-semibold text-ink">
              {item.medicamento}
              {item.concentracao ? <span className="font-normal text-slate-500"> · {item.concentracao}</span> : null}
              {item.forma_farmacia ? <span className="font-normal text-slate-500"> · {item.forma_farmacia}</span> : null}
            </p>
            <p className="mt-0.5 text-[0.75rem] leading-relaxed text-slate-600">{item.posologia}</p>
            {item.duracao_dias ? (
              <p className="mt-0.5 text-[0.7rem] text-slate-400">Duração: {item.duracao_dias} dia{item.duracao_dias !== 1 ? 's' : ''}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function Exames({ itens }: ApiPayload) {
  if (!itens?.length) return null
  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <Eyebrow className="text-slate-400">Exames solicitados</Eyebrow>
      <div className="mt-2 space-y-1.5">
        {itens.map((exame: ApiPayload) => (
          <div key={exame.id} className="text-[0.78rem] leading-relaxed text-slate-600">
            <span className="font-semibold text-ink">{exame.nome_exame}</span>
            {exame.justificativa ? <span className="text-slate-500"> — {exame.justificativa}</span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function LinksPdf({ receita, prontuario }: ApiPayload) {
  if (!receita && !prontuario) return null
  return (
    <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
      {receita && (
        <a href={receita} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 px-3 py-2 text-[0.72rem] font-semibold text-ink transition hover:bg-slate-50">
          <Icon name="clipboard" size={14} /> Receita em PDF
        </a>
      )}
      {prontuario && (
        <a href={prontuario} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 px-3 py-2 text-[0.72rem] font-semibold text-ink transition hover:bg-slate-50">
          <Icon name="clipboard" size={14} /> Prontuário em PDF
        </a>
      )}
    </div>
  )
}

function AtendimentoAnterior({ atendimento }: ApiPayload) {
  const [aberto, setAberto] = useState(false)
  return (
    <Panel className="overflow-hidden" as="article">
      <button onClick={() => setAberto(!aberto)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0">
          <p className="text-[0.82rem] font-semibold text-ink">
            {dataCurta(atendimento.data)}
            {atendimento.veterinario ? <span className="font-normal text-slate-500"> · {atendimento.veterinario}</span> : null}
          </p>
          <p className="mt-0.5 truncate text-[0.72rem] text-slate-500">
            {atendimento.diagnostico || atendimento.queixa_principal || 'Sem diagnóstico registrado'}
          </p>
        </div>
        <span className="flex items-center gap-2">
          {!atendimento.estruturado && <Badge tone="slate">texto livre</Badge>}
          <Icon name="chevron" size={15} className={`shrink-0 text-slate-300 transition-transform ${aberto ? 'rotate-90' : ''}`} />
        </span>
      </button>
      {aberto && (
        <>
          <Campo titulo="Queixa">{atendimento.queixa_principal}</Campo>
          <Campo titulo="Diagnóstico">{atendimento.diagnostico}</Campo>
          <Campo titulo="Orientações">{atendimento.orientacoes_tutor}</Campo>
          <Prescricoes itens={atendimento.prescricoes} />
          <Exames itens={atendimento.exames} />
          {/* Os arquivos vêm com o histórico; o componente não busca de novo. */}
          {atendimento.midias?.length > 0 && (
            <div className="px-4 pb-3">
              <MidiasDoAtendimento
                atendimentoId={atendimento.atendimento_id}
                midiasIniciais={atendimento.midias}
                titulo="Fotos, vídeos e áudios deste atendimento"
              />
            </div>
          )}
          {atendimento.receita_texto && <Campo titulo="Receita (texto vigente)">{atendimento.receita_texto}</Campo>}
          <LinksPdf receita={atendimento.receita_pdf_url} prontuario={atendimento.prontuario_pdf_url} />
        </>
      )}
    </Panel>
  )
}

export default function TutorProntuario() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [prontuario, setProntuario] = useState<ApiPayload | null>(null)
  const [historico, setHistorico] = useState<ApiPayload | null>(null)
  const [erro, setErro] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get(`/solicitacoes/${id}/prontuario`),
      api.get(`/solicitacoes/${id}/historico-do-pet`)
    ])
      .then(([p, h]) => {
        setProntuario(p.data)
        setHistorico(h.data)
      })
      .catch(() => setErro(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="container-app flex min-h-screen items-center justify-center bg-surface-page">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
      </div>
    )
  }

  if (erro || !prontuario) {
    return (
      <div className="container-app bg-surface-page pb-24">
        <PageHeader title="Prontuário" onBack={() => navigate('/tutor/historico')} />
        <div className="px-5 py-5">
          <EmptyState
            icon="alert"
            title="Prontuário indisponível"
            description="Não conseguimos carregar este atendimento. Tente novamente em instantes."
          />
        </div>
        <TutorBottomNav />
      </div>
    )
  }

  const registro = prontuario.prontuario
  const pet = historico?.pet
  const alergias = historico?.alergias || []
  const emUso = historico?.medicamentos_em_uso || []
  const vacinas = historico?.vacinas || []
  const lembretes = historico?.lembretes || []
  const anteriores = historico?.atendimentos || []

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader
        title="Prontuário"
        subtitle={pet ? `${pet.nome} · ${dataCurta(prontuario.finalizado_em) || 'em atendimento'}` : undefined}
        onBack={() => navigate('/tutor/historico')}
      />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {/* Alergias sempre no topo: é o dado que muda conduta. */}
        {alergias.length > 0 && (
          <Panel className="border-red-100 bg-red-50/60 px-4 py-3">
            <div className="flex items-center gap-1.5 text-red-600">
              <Icon name="alert" size={15} />
              <Eyebrow className="text-red-500">Alergias registradas</Eyebrow>
            </div>
            <p className="mt-1 text-[0.78rem] font-medium leading-relaxed text-red-700">
              {alergias.map((a: ApiPayload) => a.descricao || a.alergeno || a.nome).filter(Boolean).join(' · ')}
            </p>
          </Panel>
        )}

        {/* Atendimento atual */}
        <Panel className="overflow-hidden" as="article">
          <div className="px-4 py-3.5">
            <Eyebrow className="text-slate-400">Este atendimento</Eyebrow>
            <h2 className="mt-0.5 text-[0.95rem] font-semibold tracking-tight text-ink">
              {registro?.diagnostico_definitivo || prontuario.diagnostico || 'Registro do atendimento'}
            </h2>
          </div>
          <Campo titulo="Queixa relatada">{registro?.queixa_principal || prontuario.queixa_do_tutor}</Campo>
          <Campo titulo="Exame físico">{registro?.exame_fisico}</Campo>
          <Campo titulo="Hipótese diagnóstica">{registro?.hipotese_diagnostica}</Campo>
          {!registro && <Campo titulo="Diagnóstico">{prontuario.diagnostico}</Campo>}
          <Prescricoes itens={registro?.itensPrescricao} />
          {!registro && <Campo titulo="Receita">{prontuario.receita}</Campo>}
          <Exames itens={registro?.examesSolicitados} />
          {registro?.orientacoes_tutor && (
            <div className="border-t border-slate-100 bg-teal-50/50 px-4 py-3">
              <Eyebrow className="text-teal-600">Orientações para você</Eyebrow>
              <p className="mt-1 whitespace-pre-line text-[0.8rem] font-medium leading-relaxed text-teal-900">
                {registro.orientacoes_tutor}
              </p>
            </div>
          )}
          {registro?.retorno_sugerido_em && (
            <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 text-[0.78rem] text-slate-600">
              <Icon name="clock" size={15} className="text-amber-500" />
              Retorno sugerido em <strong className="text-ink">{dataCurta(registro.retorno_sugerido_em)}</strong>
            </div>
          )}
          <LinksPdf receita={prontuario.receita_pdf_url} prontuario={prontuario.prontuario_pdf_url} />
        </Panel>

        {/* Saúde do pet */}
        {(emUso.length > 0 || vacinas.length > 0 || lembretes.length > 0) && (
          <Panel className="overflow-hidden">
            <div className="px-4 py-3.5">
              <Eyebrow className="text-slate-400">Saúde de {pet?.nome || 'seu pet'} hoje</Eyebrow>
            </div>
            {emUso.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-3">
                <Eyebrow className="text-slate-400">Medicamentos em uso</Eyebrow>
                <div className="mt-1.5 space-y-1">
                  {emUso.map((m: ApiPayload) => (
                    <p key={m.id} className="text-[0.78rem] text-slate-600">
                      <span className="font-semibold text-ink">{m.nome || m.medicamento}</span>
                      {m.posologia ? ` — ${m.posologia}` : ''}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {vacinas.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-3">
                <Eyebrow className="text-slate-400">Vacinas</Eyebrow>
                <div className="mt-1.5 space-y-1">
                  {vacinas.slice(0, 5).map((v: ApiPayload) => (
                    <p key={v.id} className="text-[0.78rem] text-slate-600">
                      <span className="font-semibold text-ink">{v.nome || v.vacina}</span>
                      {v.data_aplicacao ? ` — ${dataCurta(v.data_aplicacao)}` : ''}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {lembretes.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-3">
                <Eyebrow className="text-slate-400">Próximos cuidados</Eyebrow>
                <div className="mt-1.5 space-y-1">
                  {lembretes.map((l: ApiPayload) => (
                    <p key={l.id} className="flex items-center gap-1.5 text-[0.78rem] text-slate-600">
                      <Icon name="clock" size={13} className="shrink-0 text-amber-500" />
                      <span>{l.titulo || l.descricao} — {dataCurta(l.data_lembrete)}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        )}

        {/* Histórico anterior */}
        {anteriores.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <Eyebrow className="text-slate-400">Atendimentos anteriores</Eyebrow>
              <span className="text-[0.7rem] text-slate-400">
                {historico.resumo?.exibindo} de {historico.resumo?.total_atendimentos}
              </span>
            </div>
            {anteriores.map((a: ApiPayload) => (
              <AtendimentoAnterior key={a.atendimento_id} atendimento={a} />
            ))}
          </div>
        )}
      </div>

      <TutorBottomNav />
    </div>
  )
}
