import { useEffect, useState } from 'react'
import api from '../../services/api'
import { Eyebrow, Icon } from '../ui/AppKit'

/**
 * Escolher o profissional — só onde não há pressa.
 *
 * Em emergência ninguém quer comparar currículos: quer alguém a caminho. Em
 * vacinação, avaliação e consulta de rotina, escolher faz sentido, e é o mesmo
 * motivo pelo qual ninguém escolhe motorista de ambulância mas escolhe dentista.
 *
 * "Qualquer profissional" continua sendo a primeira opção e vem marcada: quem
 * não quer escolher não deve ter que escolher.
 */

type Profissional = {
  id: string
  nome: string
  foto: string | null
  crmv: string
  especialidade: string
  area_atuacao: string | null
  avaliacao_media: number | null
  total_avaliacoes: number
  atendimentos_concluidos: number
  distancia_km: number | null
  online: boolean
  preco: number | null
}

type Props = {
  tipo: string
  latitude: number | null
  longitude: number | null
  escolhido: string | null
  onEscolher: (id: string | null, preco?: number | null) => void
}

export default function EscolherProfissional({ tipo, latitude, longitude, escolhido, onEscolher }: Props) {
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [disponivel, setDisponivel] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vigente = true
    setCarregando(true)
    api.get('/v1/solicitacoes/profissionais', {
      params: { tipo, latitude: latitude ?? undefined, longitude: longitude ?? undefined }
    })
      .then(({ data }) => {
        if (!vigente) return
        setDisponivel(Boolean(data.escolha_disponivel))
        setProfissionais(data.profissionais || [])
      })
      .catch(() => {
        // Sem a lista, o chamado segue pela fila aberta — que é o caminho de
        // sempre. Melhor isso do que travar o pedido.
        if (vigente) setDisponivel(false)
      })
      .finally(() => { if (vigente) setCarregando(false) })
    return () => { vigente = false }
  }, [tipo, latitude, longitude])

  if (!disponivel || carregando || profissionais.length === 0) return null

  return (
    <div className="space-y-2">
      <Eyebrow className="text-slate-400">Quem você quer que atenda</Eyebrow>

      <label
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${escolhido === null ? 'border-primary bg-primary/5' : 'border-slate-200'}`}
      >
        <input
          type="radio"
          name="profissional"
          className="h-4 w-4"
          checked={escolhido === null}
          onChange={() => onEscolher(null, null)}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.85rem] font-semibold text-ink">Qualquer profissional</span>
          <span className="mt-0.5 block text-[0.72rem] text-slate-500">
            Vai para quem estiver disponível primeiro — costuma ser mais rápido.
          </span>
        </span>
      </label>

      {profissionais.map((pro) => (
        <label
          key={pro.id}
          className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition ${escolhido === pro.id ? 'border-primary bg-primary/5' : 'border-slate-200'}`}
        >
          <input
            type="radio"
            name="profissional"
            className="mt-1 h-4 w-4"
            checked={escolhido === pro.id}
            onChange={() => onEscolher(pro.id, pro.preco)}
          />

          {pro.foto ? (
            <img src={pro.foto} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <Icon name="vet" size={18} />
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="block text-[0.85rem] font-semibold text-ink">{pro.nome}</span>
            {pro.preco != null && (
              <span className="mt-0.5 block text-[0.78rem] font-bold text-primary">
                {pro.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            )}
            <span className="mt-0.5 block text-[0.72rem] text-slate-500">
              CRMV {pro.crmv} · {pro.especialidade}
            </span>

            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.7rem] text-slate-500">
              {/* Sem avaliação não é demérito: é profissional novo, e esconder
                  isso atrás de um zero seria pior que dizer a verdade. */}
              {pro.total_avaliacoes > 0 ? (
                <span className="font-semibold text-slate-700">
                  ★ {pro.avaliacao_media?.toFixed(1)} · {pro.total_avaliacoes}{' '}
                  {pro.total_avaliacoes === 1 ? 'avaliação' : 'avaliações'}
                </span>
              ) : (
                <span className="text-slate-400">Ainda sem avaliações</span>
              )}
              {pro.atendimentos_concluidos > 0 && (
                <span>{pro.atendimentos_concluidos} atendimentos</span>
              )}
              {pro.distancia_km != null && <span>{pro.distancia_km} km de você</span>}
            </span>

            {pro.area_atuacao && (
              <span className="mt-0.5 block text-[0.68rem] text-slate-400">{pro.area_atuacao}</span>
            )}
          </span>
        </label>
      ))}

      <p className="text-[0.68rem] leading-relaxed text-slate-400">
        Se quem você escolheu não puder atender, o pedido segue automaticamente para os outros
        profissionais — você não fica sem atendimento.
      </p>
    </div>
  )
}
