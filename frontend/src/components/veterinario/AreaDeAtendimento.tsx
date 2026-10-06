import { useEffect, useState } from 'react'
import api from '../../services/api'
import { VetIcon } from './VetUI'

/**
 * Até onde este profissional aceita ir.
 *
 * O raio era só da cidade, igual para todos: quem só atende a zona sul recebia
 * chamado do outro lado, recusava, e o tutor esperava mais por um "não"
 * previsível. Agora o raio é dele — e deixar em branco continua valendo o da
 * cidade, que é o comportamento de sempre e a escolha certa para quem roda a
 * cidade inteira.
 */

export default function AreaDeAtendimento() {
  const [raio, setRaio] = useState('')
  const [area, setArea] = useState('')
  const [raioDaCidade, setRaioDaCidade] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    api.get('/veterinarios/meus-dados')
      .then(({ data }) => {
        setRaio(data.raio_atendimento_km == null ? '' : String(data.raio_atendimento_km))
        setArea(data.area_atuacao || '')
        setRaioDaCidade(data.raio_da_cidade ?? null)
      })
      .catch(() => {})
  }, [])

  const salvar = async () => {
    setSalvando(true)
    setAviso('')
    try {
      await api.put('/veterinarios/perfil', {
        // String vazia vira `null` de propósito: apagar o campo é voltar ao
        // raio da cidade, e o backend precisa distinguir isso de "não mexi".
        raio_atendimento_km: raio === '' ? null : Number(raio),
        area_atuacao: area.trim() || null
      })
      setAviso('Área de atendimento salva.')
    } catch (erro: any) {
      const resposta = (erro as { response?: { data?: { error?: string } } }).response
      setAviso(resposta?.data?.error || 'Não foi possível salvar agora.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="vet-card vet-settings-group">
      <h2><VetIcon name="pin" size={17} /> Área de atendimento</h2>

      <label className="vet-campo">
        <span>Raio máximo (km)</span>
        <input
          type="number"
          min={1}
          max={200}
          inputMode="numeric"
          value={raio}
          placeholder={raioDaCidade ? `Sem limite próprio — usa ${raioDaCidade} km da cidade` : 'Usa o raio da cidade'}
          onChange={(evento) => setRaio(evento.target.value)}
        />
        <small>
          Chamados além desta distância não chegam até você. Em branco, vale o raio da cidade.
        </small>
      </label>

      <label className="vet-campo">
        <span>Onde você costuma atender</span>
        <input
          type="text"
          maxLength={200}
          value={area}
          placeholder="Ex.: zona sul, centro e Boa Vista"
          onChange={(evento) => setArea(evento.target.value)}
        />
        <small>Aparece para o tutor. O filtro de verdade é o raio acima.</small>
      </label>

      {aviso && <p className="vet-review-pending" role="status">{aviso}</p>}

      <button type="button" className="vet-button--primary" onClick={salvar} disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar área de atendimento'}
      </button>
    </section>
  )
}
