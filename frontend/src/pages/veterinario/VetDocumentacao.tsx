import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetBottomNav, VetIcon, VetLoading, VetPageHeader } from '../../components/veterinario/VetUI'

// Envio do documento profissional (CRMV).
//
// `POST /veterinarios/documento` existia completo no backend — sobe para o R2 e
// passa o documento pela triagem por IA — e não tinha NENHUMA tela que o
// chamasse. "Documentação (CRMV e comprovantes)" nas Configurações levava para
// o perfil, que não tem upload. Ou seja: o passo que destrava o credenciamento
// era o único sem caminho no aplicativo, e o veterinário ficava parado em
// "aguardando análise" sem ter como enviar nada.

const SITUACAO: Record<string, { rotulo: string; texto: string }> = {
  PENDING_REVIEW: {
    rotulo: 'Aguardando análise',
    texto: 'Seu documento está na fila da equipe. Você recebe um e-mail assim que houver decisão.'
  },
  APPROVED: {
    rotulo: 'Credenciamento aprovado',
    texto: 'Está tudo certo: você já pode ficar online e receber chamados.'
  },
  REJECTED: {
    rotulo: 'Credenciamento recusado',
    texto: 'A equipe não conseguiu validar seus documentos. Veja o motivo abaixo e envie novamente.'
  },
  REQUIRES_RESUBMISSION: {
    rotulo: 'Reenvio solicitado',
    texto: 'A equipe pediu um documento novo. Envie a foto abaixo para voltar para a fila de análise.'
  },
  SUSPENDED: {
    rotulo: 'Credenciamento suspenso',
    texto: 'Seu acesso a atendimentos está suspenso. Fale com a equipe para entender o que houve.'
  }
}

const TAMANHO_MAXIMO = 8 * 1024 * 1024

export default function VetDocumentacao() {
  const navigate = useNavigate()
  const [veterinario, setVeterinario] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const inputArquivo = useRef<HTMLInputElement | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data } = await api.get('/veterinarios/meus-dados')
      setVeterinario(data)
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar sua documentação.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const enviarDocumento = async (event: any) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setErro('')
    setSucesso('')

    // As duas checagens que o backend também faz — mas dizer aqui evita subir
    // 8 MB por uma rede de celular para receber um 400 no fim.
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      return setErro('Envie uma foto (JPG ou PNG) ou um PDF do documento.')
    }
    if (file.size > TAMANHO_MAXIMO) {
      return setErro('O arquivo deve ter no máximo 8MB. Tente uma foto com menos resolução.')
    }

    setEnviando(true)
    try {
      const formData = new FormData()
      formData.append('documento', file)
      await api.post('/veterinarios/documento', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setSucesso('Documento enviado. A equipe vai analisar e avisar por e-mail.')
      carregar()
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível enviar o documento agora.')
    } finally {
      setEnviando(false)
    }
  }

  if (loading) return <VetLoading label="Carregando documentação" />

  const situacao = SITUACAO[veterinario?.status_credenciamento] || SITUACAO.PENDING_REVIEW
  const analise = veterinario?.documento_analise
  // A triagem por IA é apoio para a equipe, não veredito. Quando a chave da IA
  // não está configurada ela devolve `nao_configurado` — nesse caso não há o
  // que mostrar, e inventar um checklist cinza só confunde.
  const temAnalise = analise && analise.status !== 'nao_configurado' && analise.status !== 'erro'

  return (
    <main className="vet-app">
      <VetPageHeader
        compact
        title="Documentação"
        subtitle="CRMV e comprovantes"
        onBack={() => navigate('/veterinario/configuracoes')}
      />

      <div className="vet-settings">
        {erro && <p className="vet-card vet-request" role="alert">{erro}</p>}
        {sucesso && <p className="vet-card vet-request" role="status">{sucesso}</p>}

        <section className="vet-card vet-section-card">
          <div className="vet-section-card__title">
            <VetIcon name="shield" size={18} />
            <h2>{situacao.rotulo}</h2>
          </div>
          <p className="vet-review-pending">{situacao.texto}</p>
          {veterinario?.motivo_decisao && (
            <p className="vet-prescription-note"><strong>Motivo informado pela equipe:</strong> {veterinario.motivo_decisao}</p>
          )}
        </section>

        <section className="vet-card vet-section-card">
          <div className="vet-section-card__title">
            <VetIcon name="document" size={18} />
            <h2>Documento do CRMV</h2>
          </div>

          {veterinario?.documento_url ? (
            <p className="vet-review-pending">
              Já existe um documento enviado
              {veterinario.documento_analisado_em
                ? ` em ${new Date(veterinario.documento_analisado_em).toLocaleDateString('pt-BR')}`
                : ''}.
              Enviar outro substitui o anterior e devolve seu cadastro para a fila de análise.
            </p>
          ) : (
            <p className="vet-review-pending">
              Envie uma foto nítida da sua carteira do CRMV, com o número e seu nome legíveis.
              Sem este documento a equipe não consegue liberar seus atendimentos.
            </p>
          )}

          <input
            ref={inputArquivo}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={enviarDocumento}
          />
          <button
            className="vet-modal__submit"
            type="button"
            disabled={enviando}
            onClick={() => inputArquivo.current?.click()}
          >
            {enviando
              ? 'Enviando…'
              : veterinario?.documento_url ? 'Enviar outro documento' : 'Enviar documento'}
          </button>
        </section>

        {temAnalise && (
          <section className="vet-card vet-section-card">
            <div className="vet-section-card__title">
              <VetIcon name="info" size={18} />
              <h2>Conferência automática</h2>
            </div>
            <p className="vet-review-pending">
              Uma primeira leitura do documento, feita automaticamente. A decisão final é sempre da equipe.
            </p>
            <ul className="vet-prescription-note">
              <li>{analise.documento_legivel === false ? '✗' : '✓'} Imagem legível</li>
              <li>
                {analise.crmv_consistente === true ? '✓' : analise.crmv_consistente === false ? '✗' : '–'}
                {' '}CRMV do documento confere com o cadastro
                {analise.crmv_extraido ? ` (lido: ${analise.crmv_extraido})` : ''}
              </li>
              <li>
                {analise.nome_consistente === true ? '✓' : analise.nome_consistente === false ? '✗' : '–'}
                {' '}Nome do documento confere com o cadastro
                {analise.nome_extraido ? ` (lido: ${analise.nome_extraido})` : ''}
              </li>
              {analise.observacoes && <li>{analise.observacoes}</li>}
            </ul>
          </section>
        )}
      </div>

      <VetBottomNav />
    </main>
  )
}
