import { useState } from 'react'
import api from '../../services/api'
import { Icon, Panel } from '../ui/AppKit'

/**
 * Quando não há veterinário.
 *
 * A busca podia girar para sempre: o estado `sem_veterinario` existia na
 * máquina de estados, ninguém transicionava para ele, e o tutor ficava olhando
 * "procurando veterinário" às três da manhã sem que nada dissesse que não viria
 * ninguém. Agora um vigia encerra a busca no prazo — e esta é a tela que ele
 * encontra.
 *
 * Duas exigências guiaram o texto: dizer a verdade sem rodeio, e nunca deixar a
 * pessoa sem próximo passo. Numa emergência, "tente mais tarde" sozinho é
 * abandono — por isso a orientação de procurar um pronto-socorro vem junto,
 * antes dos botões.
 */

type Props = {
  solicitacaoId: string
  petNome?: string
  /** Chamado quando a busca recomeça — a tela volta a acompanhar o chamado. */
  onRetomado: (solicitacao: unknown) => void
  onVoltar: () => void
}

export default function BuscaEncerrada({ solicitacaoId, petNome, onRetomado, onVoltar }: Props) {
  const [procurando, setProcurando] = useState(false)
  const [erro, setErro] = useState('')

  const procurarDeNovo = async () => {
    setProcurando(true)
    setErro('')
    try {
      const { data } = await api.post(`/v1/solicitacoes/${solicitacaoId}/retomar-busca`)
      onRetomado(data.solicitacao)
    } catch (falha: any) {
      const resposta = (falha as { response?: { data?: { error?: string; message?: string } } }).response
      setErro(resposta?.data?.error || resposta?.data?.message || 'Não conseguimos recomeçar a busca agora.')
    } finally {
      setProcurando(false)
    }
  }

  const pet = petNome || 'seu pet'

  return (
    <Panel className="border-amber-200 bg-amber-50 px-4 py-4">
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <Icon name="alert" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[0.85rem] font-semibold text-amber-900">
            Nenhum veterinário disponível agora
          </p>
          <p className="mt-1 text-[0.75rem] leading-relaxed text-amber-800">
            Procuramos e não encontramos profissional de plantão para atender {pet} neste
            momento. Sentimos muito — preferimos avisar a deixar você esperando.
          </p>
          {/* O aviso clínico vem antes dos botões de propósito: se o caso é grave,
              tentar de novo no aplicativo não é o próximo passo certo. */}
          <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[0.73rem] leading-relaxed text-amber-900">
            <strong>Se {pet} estiver em risco</strong>, não espere por aqui: procure um
            pronto-socorro veterinário agora.
          </p>
        </div>
      </div>

      {erro && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[0.75rem] text-red-700" role="alert">
          {erro}
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={procurarDeNovo}
          disabled={procurando}
          className="flex-1 rounded-2xl bg-primary px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {procurando ? 'Procurando…' : 'Procurar de novo'}
        </button>
        <button
          type="button"
          onClick={onVoltar}
          className="rounded-2xl border border-amber-300 px-4 py-3 text-[0.82rem] font-semibold text-amber-800 transition hover:bg-amber-100"
        >
          Voltar ao início
        </button>
      </div>

      <p className="mt-2 text-[0.7rem] leading-relaxed text-amber-700">
        Procurar de novo mantém o pet, os sintomas e o endereço que você já informou.
      </p>
    </Panel>
  )
}
