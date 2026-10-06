import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetBottomNav, VetIcon, VetLoading, VetPageHeader } from '../../components/veterinario/VetUI'
import PagamentoAssinaturaPix from '../../components/PagamentoAssinaturaPix'

/**
 * Clube Vet — a vitrine de planos do veterinário.
 *
 * Era um "está chegando"; agora vende de verdade os planos com os recursos do
 * CRM. As chaves `crm_*` que vêm em `beneficios` são o corte comercial lido
 * pelo backend — aqui elas viram rótulo humano.
 */

const ROTULO_RECURSO: Record<string, string> = {
  crm_clientes_lista: 'Clientela com busca, tags e favoritos',
  crm_agenda: 'Agenda de consultas com hora marcada',
  crm_notas_privadas: 'Notas privadas, tags e apelidos na clientela',
  crm_retencao: 'Retenção: clientes sumidos e convocação em lote',
  crm_relatorios: 'Relatórios de faturamento e avaliações',
}

const rotuloBeneficio = (item: ApiPayload) => ROTULO_RECURSO[item] || (String(item).startsWith('crm_') ? null : item)

const preco = (valor: string) => `R$ ${Number(valor).toFixed(2).replace('.', ',')}`

export default function VetClube() {
  const navigate = useNavigate()
  const [planos, setPlanos] = useState<ApiPayload[]>([])
  const [assinatura, setAssinatura] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setErro('')
    try {
      const [planosResponse, assinaturaResponse] = await Promise.all([
        api.get('/v1/billing/planos?tipo_usuario=veterinario'),
        api.get('/v1/billing/minha-assinatura').catch(() => ({ data: { assinatura: null } })),
      ])
      setPlanos(planosResponse.data?.planos || [])
      setAssinatura(assinaturaResponse.data?.assinatura || null)
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar os planos.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  // Plano pago não ativa mais sozinho: o backend abre a cobrança e só o webhook
  // do gateway libera o CRM. Antes o clube era assinado de graça, para sempre.
  const [cobranca, setCobranca] = useState<ApiPayload | null>(null) // { pagamento, plano }

  const assinar = async (plano: ApiPayload) => {
    setProcessando(plano.id); setErro(''); setAviso('')
    try {
      const { data } = await api.post('/v1/billing/assinaturas', {
        plano_id: plano.id,
        metodo_pagamento: 'pix',
        aceitar_termos: true
      })
      if (data?.pagamento) {
        setCobranca({ pagamento: data.pagamento, plano })
      } else {
        setAviso(`Assinatura do ${plano.nome} ativada!`)
        await carregar()
      }
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || requestError.response?.data?.message || 'Não foi possível assinar o plano.')
    } finally { setProcessando('') }
  }

  const cancelar = async () => {
    if (!assinatura) return
    if (!window.confirm(`Cancelar o plano ${assinatura.plano?.nome}? Os recursos pagos do CRM voltam a ficar bloqueados.`)) return
    setProcessando('cancelar'); setErro(''); setAviso('')
    try {
      await api.post(`/v1/billing/assinaturas/${assinatura.id}/cancelar`, { motivo: 'Cancelado pelo veterinário no app' })
      setAviso('Assinatura cancelada.')
      await carregar()
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || requestError.response?.data?.message || 'Não foi possível cancelar.')
    } finally { setProcessando('') }
  }

  return (
    <main className="vet-app">
      <VetPageHeader title="Clube Vet" subtitle="Planos e recursos para o seu consultório" onBack={() => navigate('/veterinario/home')} />
      <div className="vet-app-main">
        {erro && <p className="vet-card vet-request" role="alert">{erro}</p>}
        {aviso && <p className="vet-policy" role="status"><strong>{aviso}</strong></p>}

        {loading ? <VetLoading label="Carregando planos" /> : (
          <>
            {assinatura ? (
              <section className="vet-card vet-plan-atual">
                <span className="vet-plan-atual__icon"><VetIcon name="check" size={20} /></span>
                <div>
                  <strong>{assinatura.plano?.nome || 'Plano ativo'}</strong>
                  <small>
                    {preco(assinatura.valor_mensal)}/mês
                    {assinatura.proxima_cobranca && ` · próxima cobrança em ${new Date(assinatura.proxima_cobranca).toLocaleDateString('pt-BR')}`}
                  </small>
                </div>
                <button type="button" disabled={processando === 'cancelar'} onClick={cancelar}>
                  {processando === 'cancelar' ? 'Cancelando…' : 'Cancelar'}
                </button>
              </section>
            ) : (
              <div className="vet-policy">
                <strong>Você está no plano gratuito</strong>
                Clientela e agenda de consultas são suas para sempre. Os planos abaixo liberam notas privadas,
                campanhas de retorno e relatórios de faturamento.
              </div>
            )}

            <section className="vet-list" style={{ padding: '0.9rem 0 0' }}>
              {planos.length === 0 && (
                <div className="vet-card vet-empty">
                  <VetIcon name="crown" size={38} />
                  <strong>Nenhum plano publicado ainda</strong>
                  <p>Os planos do Clube Vet aparecem aqui assim que forem cadastrados.</p>
                </div>
              )}
              {planos.map((plano) => {
                const atual = assinatura?.plano_id === plano.id
                const destaque = /completo/i.test(plano.nome)
                const beneficios = (Array.isArray(plano.beneficios) ? plano.beneficios : [])
                  .map(rotuloBeneficio)
                  .filter(Boolean)
                return (
                  <article key={plano.id} className={`vet-card vet-plan ${destaque ? 'vet-plan--destaque' : ''}`}>
                    {destaque && <span className="vet-plan__eyebrow">Mais completo</span>}
                    <div className="vet-plan__head">
                      <h2>{plano.nome}</h2>
                      <span className="vet-plan__preco">{preco(plano.valor_mensal)}<small>/mês</small></span>
                    </div>
                    {plano.descricao && <p>{plano.descricao}</p>}
                    <ul className="vet-plan__beneficios">
                      {beneficios.map((item: ApiPayload) => (
                        <li key={item}><VetIcon name="check" size={15} />{item}</li>
                      ))}
                    </ul>
                    <button
                      className="vet-plan__cta vet-button--primary"
                      type="button"
                      disabled={atual || Boolean(assinatura) || processando === plano.id}
                      onClick={() => assinar(plano)}
                    >
                      {atual ? 'Seu plano atual' : processando === plano.id ? 'Assinando…' : assinatura ? 'Cancele o atual para trocar' : 'Assinar este plano'}
                    </button>
                  </article>
                )
              })}
            </section>
          </>
        )}
      </div>
      {cobranca && (
        <PagamentoAssinaturaPix
          pagamento={cobranca.pagamento}
          plano={cobranca.plano}
          onFechar={() => { setCobranca(null); carregar() }}
          onAtivada={(assinaturaAtiva: ApiPayload) => {
            setCobranca(null)
            setAviso(`Pagamento confirmado. ${assinaturaAtiva.plano?.nome || 'Seu plano'} está ativo!`)
            carregar()
          }}
        />
      )}

      <VetBottomNav />
    </main>
  )
}
