import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetIcon, VetLoading, VetPageHeader } from '../../components/veterinario/VetUI'

/**
 * Primeiros passos do veterinário.
 *
 * Era um carrossel de seis telas de texto, e duas delas prometiam coisas que
 * não existem no produto: "todos os dias você recebe uma dica do Saúde Pet na
 * tela inicial" (não há dica nenhuma) e "ao final de cada atendimento, avalie o
 * tutor" (não existe avaliação do vet para o tutor — só do tutor para o vet).
 * Uma terceira mandava para "Configurações > Documentos", que até semana
 * passada levava a uma tela sem upload.
 *
 * Passou a ser uma lista do que realmente destrava o trabalho, com o estado de
 * cada item lido do servidor e um botão que leva ao lugar certo. Ninguém
 * "conclui" o onboarding lendo texto: conclui enviando o documento e ficando
 * online.
 */

const CHAVE_CONCLUIDO = 'vet_onboarding_concluido'

export default function VetOnboarding() {
  const navigate = useNavigate()
  const [veterinario, setVeterinario] = useState<ApiPayload | null>(null)
  const [temDadosBancarios, setTemDadosBancarios] = useState(false)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [vetResposta, financeiroResposta] = await Promise.allSettled([
      api.get('/veterinarios/meus-dados'),
      api.get('/v1/veterinario/financeiro/status')
    ])
    if (vetResposta.status === 'fulfilled') setVeterinario(vetResposta.value.data)
    if (financeiroResposta.status === 'fulfilled') {
      setTemDadosBancarios(Boolean(financeiroResposta.value.data?.veterinario?.tem_dados_bancarios))
    }
    setLoading(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const concluir = () => {
    localStorage.setItem(CHAVE_CONCLUIDO, 'true')
    navigate('/veterinario/home')
  }

  if (loading) return <VetLoading label="Preparando seus primeiros passos" />

  const perfilCompleto = Boolean(
    veterinario?.especialidade && veterinario?.usuario?.sobre && veterinario?.usuario?.foto_perfil
  )
  const documentoEnviado = Boolean(veterinario?.documento_url)
  const credenciado = veterinario?.status_credenciamento === 'APPROVED'

  const passos = [
    {
      icone: 'user',
      titulo: 'Complete seu perfil',
      descricao: 'Foto, especialidade e um texto sobre como você atende. É o que o tutor lê antes de aceitar.',
      pronto: perfilCompleto,
      acao: 'Abrir meu perfil',
      para: '/veterinario/perfil'
    },
    {
      icone: 'folder',
      titulo: 'Envie o documento do CRMV',
      descricao: credenciado
        ? 'Seu credenciamento está aprovado.'
        : documentoEnviado
          ? 'Documento enviado. A equipe analisa e avisa por e-mail.'
          : 'Sem este documento a equipe não consegue liberar seus atendimentos.',
      pronto: credenciado,
      emAnalise: documentoEnviado && !credenciado,
      acao: documentoEnviado ? 'Ver situação' : 'Enviar documento',
      para: '/veterinario/documentacao'
    },
    {
      icone: 'bank',
      titulo: 'Cadastre sua conta para receber',
      descricao: 'Chave PIX ou conta bancária. Sem isso o repasse do que você atender não tem para onde ir.',
      pronto: temDadosBancarios,
      acao: 'Cadastrar conta',
      para: '/veterinario/conta-bancaria'
    },
    {
      icone: 'power',
      titulo: 'Fique online para receber chamados',
      descricao: 'O interruptor fica no topo da tela inicial. Offline, nenhum chamado chega até você.',
      pronto: Boolean(veterinario?.online),
      acao: 'Ir para a tela inicial',
      para: '/veterinario/home'
    }
  ]

  const concluidos = passos.filter((passo) => passo.pronto).length

  return (
    <main className="vet-app">
      {/* Voltar aqui não é `navigate(-1)`: a home reenvia para o onboarding
          enquanto ele não estiver concluído, e o par viraria um laço. */}
      <VetPageHeader
        compact
        title="Primeiros passos"
        subtitle={`${concluidos} de ${passos.length} concluídos`}
        onBack={concluir}
      />

      <div className="vet-settings">
        <section className="vet-card vet-section-card">
          <div className="vet-section-card__title">
            <VetIcon name="users" size={18} />
            <h2>Bem-vindo ao Saúde Pet</h2>
          </div>
          <p className="vet-review-pending">
            Você atende pets em domicílio e recebe pelo aplicativo. Quatro coisas destravam isso — dá para fazer
            agora ou voltar aqui depois, pelo menu.
          </p>
        </section>

        {passos.map((passo) => (
          <section
            key={passo.titulo}
            className="vet-card vet-section-card"
            aria-label={`${passo.titulo}${passo.pronto ? ' — concluído' : ''}`}
          >
            <div className="vet-section-card__title">
              <VetIcon name={passo.pronto ? 'check' : passo.icone} size={18} />
              <h2>{passo.titulo}</h2>
              {passo.pronto && <span className="vet-status vet-status--confirmed">Pronto</span>}
              {passo.emAnalise && <span className="vet-status vet-status--pending">Em análise</span>}
            </div>
            <p className="vet-review-pending">{passo.descricao}</p>
            {!passo.pronto && (
              <button
                type="button"
                className="vet-modal__submit"
                onClick={() => navigate(passo.para)}
              >
                {passo.acao}
              </button>
            )}
          </section>
        ))}

        <button type="button" className="vet-button--ghost" onClick={concluir}>
          {concluidos === passos.length ? 'Começar a atender' : 'Continuar depois'}
        </button>
      </div>
    </main>
  )
}
