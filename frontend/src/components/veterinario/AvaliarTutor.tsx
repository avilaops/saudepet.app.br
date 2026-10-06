import { useState } from 'react'
import api from '../../services/api'
import { VetIcon } from './VetUI'

/**
 * O outro lado da confiança.
 *
 * O produto promete avaliação bilateral e o banco só sabia uma direção: o tutor
 * avaliava o veterinário e ponto. Aqui está a que faltava — e o que se avalia
 * não é o animal, é a experiência de atender ali: o endereço estava certo?
 * havia alguém para receber? o pet estava contido? as informações batiam com o
 * que se encontrou?
 *
 * A nota é opcional e o comentário também. Quem acabou um plantão às três da
 * manhã não deve ser obrigado a preencher formulário para fechar a tela.
 */

type Props = {
  atendimentoId: string
  /** Já avaliado antes: a tela mostra o que ele escreveu e não pergunta de novo. */
  avaliacaoExistente?: { nota: number; comentario: string | null } | null
}

export default function AvaliarTutor({ atendimentoId, avaliacaoExistente = null }: Props) {
  const [avaliacao, setAvaliacao] = useState(avaliacaoExistente)
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  if (avaliacao) {
    return (
      <div className="vet-review">
        <strong><VetIcon name="check" size={14} /> Você avaliou este tutor</strong>
        <span className="vet-review__stars" role="img" aria-label={`${avaliacao.nota} de 5 estrelas`}>
          {[1, 2, 3, 4, 5].map((posicao) => (
            <VetIcon key={posicao} name="star" size={13} className={posicao <= avaliacao.nota ? 'is-filled' : ''} />
          ))}
        </span> &nbsp; {avaliacao.nota}/5
        {avaliacao.comentario && <em>“{avaliacao.comentario}”</em>}
      </div>
    )
  }

  const enviar = async () => {
    if (!nota) return setErro('Escolha de 1 a 5 estrelas.')
    setEnviando(true)
    setErro('')
    try {
      await api.post(`/v1/solicitacoes/${atendimentoId}/avaliar-tutor`, {
        nota,
        comentario: comentario.trim() || undefined
      })
      setAvaliacao({ nota, comentario: comentario.trim() || null })
    } catch (falha: any) {
      const resposta = (falha as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não conseguimos registrar a avaliação.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="vet-avaliar-tutor">
      <strong>Como foi atender aqui?</strong>
      <small>
        Endereço certo, alguém para receber, pet contido, informações batendo com o que você
        encontrou. Isso ajuda quem for atender esse tutor depois.
      </small>

      <div className="vet-avaliar-tutor__estrelas" role="radiogroup" aria-label="Nota de 1 a 5">
        {[1, 2, 3, 4, 5].map((posicao) => (
          <button
            key={posicao}
            type="button"
            role="radio"
            aria-checked={nota === posicao}
            aria-label={`${posicao} ${posicao === 1 ? 'estrela' : 'estrelas'}`}
            onClick={() => setNota(posicao)}
          >
            <VetIcon name="star" size={20} className={posicao <= nota ? 'is-filled' : ''} />
          </button>
        ))}
      </div>

      <textarea
        rows={2}
        value={comentario}
        onChange={(evento) => setComentario(evento.target.value)}
        maxLength={500}
        placeholder="Algo que o próximo profissional deveria saber (opcional)"
      />

      {erro && <p className="vet-review-pending" role="alert">{erro}</p>}

      <button type="button" onClick={enviar} disabled={enviando} className="vet-button--primary">
        {enviando ? 'Enviando…' : 'Enviar avaliação'}
      </button>
    </div>
  )
}
