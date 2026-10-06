import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'

/**
 * O que a descrição escrita não mostra.
 *
 * Serve os dois lados. O TUTOR anexa ao pedir socorro — a foto da ferida, o
 * vídeo da convulsão, o áudio da respiração — e é isso que o veterinário olha
 * antes de aceitar; antes, o único caminho para arquivo era o chat, que só abre
 * DEPOIS do aceite. O VETERINÁRIO anexa durante a consulta, e aí é registro
 * clínico: fica no prontuário e no histórico do pet, e não expira como anexo de
 * conversa.
 *
 * O arquivo nunca é servido por URL pública: o backend assina um endereço de
 * curta duração a cada leitura.
 */

export type MidiaDoAtendimento = {
  id: string
  tipo: 'imagem' | 'video' | 'audio'
  autor_papel: 'tutor' | 'veterinario'
  legenda: string | null
  nome_original: string
  criado_em: string
  url: string | null
}

type Props = {
  atendimentoId: string
  /** Sem isto o componente só exibe — é o modo do histórico e do prontuário. */
  podeEditar?: boolean
  /** Quando o pai já tem a lista (prontuário, histórico), evita uma busca a mais. */
  midiasIniciais?: MidiaDoAtendimento[]
  titulo?: string
  /** Explicação curta acima do seletor, diferente para tutor e veterinário. */
  ajuda?: string
}

const LIMITE_MB = 25

export default function MidiasDoAtendimento({
  atendimentoId,
  podeEditar = false,
  midiasIniciais,
  titulo = 'Fotos, vídeos e áudios',
  ajuda
}: Props) {
  const [fotos, setFotos] = useState<MidiaDoAtendimento[]>(midiasIniciais ?? [])
  const [carregando, setCarregando] = useState(!midiasIniciais)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [legenda, setLegenda] = useState('')
  const campoRef = useRef<HTMLInputElement | null>(null)

  const buscar = useCallback(async () => {
    try {
      const { data } = await api.get(`/v1/solicitacoes/${atendimentoId}/midias`)
      setFotos(data.midias || [])
    } catch {
      // Sem foto o atendimento continua inteiro: não vale gritar erro aqui.
      setFotos([])
    } finally {
      setCarregando(false)
    }
  }, [atendimentoId])

  useEffect(() => {
    if (midiasIniciais) return
    buscar()
  }, [buscar, midiasIniciais])

  const enviar = async (arquivo: File) => {
    if (arquivo.size > LIMITE_MB * 1024 * 1024) {
      setErro(`O arquivo passa de ${LIMITE_MB} MB.`)
      return
    }

    setEnviando(true)
    setErro('')
    const corpo = new FormData()
    corpo.append('arquivo', arquivo)
    // A legenda é o que separa um álbum de imagens soltas de um registro que
    // diz alguma coisa a quem atender depois.
    if (legenda.trim()) corpo.append('legenda', legenda.trim())

    try {
      await api.post(`/v1/solicitacoes/${atendimentoId}/midias`, corpo, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setLegenda('')
      await buscar()
    } catch (falha: any) {
      const resposta = (falha as { response?: { data?: { error?: string; message?: string } } }).response
      setErro(resposta?.data?.error || resposta?.data?.message || 'Não conseguimos enviar o arquivo.')
    } finally {
      setEnviando(false)
      if (campoRef.current) campoRef.current.value = ''
    }
  }

  const remover = async (fotoId: string) => {
    setErro('')
    try {
      await api.delete(`/v1/solicitacoes/${atendimentoId}/midias/${fotoId}`)
      setFotos((atuais) => atuais.filter((foto) => foto.id !== fotoId))
    } catch (falha: any) {
      const resposta = (falha as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não conseguimos remover o arquivo.')
    }
  }

  if (!podeEditar && !carregando && fotos.length === 0) return null

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[0.85rem] font-semibold text-ink">{titulo}</h3>
        {fotos.length > 0 && (
          <span className="text-[0.7rem] text-slate-400">
            {fotos.length} {fotos.length === 1 ? 'arquivo' : 'arquivos'}
          </span>
        )}
      </div>

      {erro && (
        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[0.75rem] text-red-700" role="alert">
          {erro}
        </p>
      )}

      {carregando ? (
        <p className="mt-3 text-[0.75rem] text-slate-400">Carregando…</p>
      ) : fotos.length === 0 ? (
        <p className="mt-2 text-[0.75rem] leading-relaxed text-slate-500">
          {ajuda
            || 'Nada anexado ainda. Registre o que a descrição não mostra — lesão, secreção, postura, o som da respiração — e escreva o que o arquivo registra.'}
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {fotos.map((foto) => (
            <li key={foto.id} className="overflow-hidden rounded-xl border border-slate-200">
              {!foto.url ? (
                <div className="flex h-28 w-full items-center justify-center bg-slate-100 px-2 text-center text-[0.68rem] text-slate-400">
                  Arquivo indisponível agora
                </div>
              ) : foto.tipo === 'video' ? (
                // Sem autoplay: abrir a tela não pode puxar dezenas de megabytes
                // do plano de dados de quem está numa emergência.
                <video
                  src={foto.url}
                  controls
                  preload="metadata"
                  className="h-28 w-full bg-slate-900 object-cover"
                />
              ) : foto.tipo === 'audio' ? (
                <div className="flex h-28 w-full items-center bg-slate-50 px-2">
                  <audio src={foto.url} controls preload="metadata" className="w-full" />
                </div>
              ) : (
                <a href={foto.url} target="_blank" rel="noreferrer">
                  <img
                    src={foto.url}
                    alt={foto.legenda || 'Registro do atendimento'}
                    loading="lazy"
                    className="h-28 w-full bg-slate-100 object-cover"
                  />
                </a>
              )}
              <div className="px-2 py-1.5">
                <p className="text-[0.68rem] leading-snug text-slate-600">
                  {foto.legenda || <span className="text-slate-400">Sem legenda</span>}
                </p>
                {/* Quem enviou muda o peso do que se vê: o arquivo do tutor é
                    relato, o do veterinário é registro clínico. */}
                <p className="text-[0.62rem] text-slate-400">
                  {foto.autor_papel === 'veterinario' ? 'registro do veterinário' : 'enviado pelo tutor'}
                </p>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => remover(foto.id)}
                    className="mt-1 text-[0.66rem] font-semibold text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {podeEditar && (
        <div className="mt-3 space-y-2">
          <input
            value={legenda}
            onChange={(evento) => setLegenda(evento.target.value)}
            maxLength={200}
            placeholder="O que o arquivo mostra (ex.: ferida na pata desde ontem)"
            className="w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary"
          />
          <input
            ref={campoRef}
            type="file"
            accept="image/*,video/*,audio/*"
            disabled={enviando}
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0]
              if (arquivo) enviar(arquivo)
            }}
            className="block w-full text-[0.75rem] text-slate-500 file:mr-3 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2.5 file:text-[0.8rem] file:font-semibold file:text-white"
          />
          <p className="text-[0.68rem] leading-relaxed text-slate-400">
            {enviando
              ? 'Enviando…'
              : `Foto, vídeo curto ou áudio, até ${LIMITE_MB} MB. Fica no prontuário e no histórico do pet — não expira como anexo de conversa.`}
          </p>
        </div>
      )}
    </section>
  )
}
