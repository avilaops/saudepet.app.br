import type { ApiPayload } from '../../types/api'
import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import api from '../../services/api'
import { getAnalyticsSessionId } from './AnalyticsTracker'

const initial = { name: '', phone: '', email: '', city: '', state: '', petName: '', petType: '', interest: '', preferredContactTime: '', privacyAccepted: false, website: '' }
const maskPhone = (value: ApiPayload) => {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export default function LeadForm({ compact = false }) {
  const [form, setForm] = useState(initial)
  const [state, setState] = useState<ApiPayload>({ loading: false, error: '', success: '' })
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const change = (event: any) => setForm((current) => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  const submit = async (event: any) => {
    event.preventDefault(); setState({ loading: true, error: '', success: '' })
    try {
      const response = await api.post('/public/leads', {
        ...form, phone: form.phone.replace(/\D/g, ''), state: form.state.toUpperCase(),
        privacyPurpose: 'Contato sobre o atendimento ou serviço selecionado neste formulário.',
        sourcePage: window.location.pathname, referrer: document.referrer || undefined,
        utmSource: params.get('utm_source') || undefined, utmMedium: params.get('utm_medium') || undefined,
        utmCampaign: params.get('utm_campaign') || undefined, utmContent: params.get('utm_content') || undefined,
        utmTerm: params.get('utm_term') || undefined, anonymousSessionId: getAnalyticsSessionId()
      })
      setForm(initial); setState({ loading: false, error: '', success: response.data.message })
    } catch (error: any) {
      const details = error.response?.data?.details?.map((item: ApiPayload) => item.message).join('. ')
      setState({ loading: false, success: '', error: details || error.response?.data?.error || 'Não foi possível enviar agora. Revise os dados e tente novamente.' })
    }
  }
  return (
    <form className={compact ? 'lead-form compact' : 'lead-form'} onSubmit={submit} noValidate>
      <div className="form-grid">
        <label>Nome completo<span aria-hidden="true"> *</span><input name="name" value={form.name} onChange={change} required autoComplete="name" /></label>
        <label>Telefone / WhatsApp<span aria-hidden="true"> *</span><input name="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} required inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" /></label>
        <label>E-mail<input name="email" type="email" value={form.email} onChange={change} autoComplete="email" /></label>
        <label>Cidade<input name="city" value={form.city} onChange={change} autoComplete="address-level2" /></label>
        {!compact && <><label>Estado<input name="state" value={form.state} onChange={change} maxLength={2} autoComplete="address-level1" placeholder="UF" /></label><label>Nome do pet<input name="petName" value={form.petName} onChange={change} /></label><label>Tipo do pet<select name="petType" value={form.petType} onChange={change}><option value="">Selecione</option><option>Cachorro</option><option>Gato</option><option>Outro</option></select></label><label>Melhor horário<input name="preferredContactTime" value={form.preferredContactTime} onChange={change} placeholder="Ex.: manhã" /></label></>}
        {/* Era uma lista de quatro opções. Quem chegava com uma pergunta de
            verdade tinha de encaixá-la em "Outras informações" e esperar que
            alguém adivinhasse o resto. Agora escreve. */}
        <label className="form-wide">
          Como podemos ajudar?<span aria-hidden="true"> *</span>
          <textarea
            name="interest"
            value={form.interest}
            onChange={change}
            required
            rows={4}
            maxLength={2000}
            placeholder="Conte sua dúvida: o que aconteceu com seu pet, em que cidade você está, o que precisa saber…"
          />
        </label>
      </div>
      <label className="honeypot" aria-hidden="true">Website<input name="website" value={form.website} onChange={change} tabIndex={-1} autoComplete="off" /></label>
      <label className="privacy-check"><input type="checkbox" name="privacyAccepted" checked={form.privacyAccepted} onChange={change} required /> <span>Li a <Link to="/privacidade" target="_blank">Política de Privacidade</Link> e autorizo o uso destes dados exclusivamente para responder a esta solicitação.</span></label>
      {state.error && <p className="form-message error" role="alert">{state.error}</p>}
      {state.success && <p className="form-message success" role="status">{state.success}</p>}
      <button className="public-button" disabled={state.loading}>{state.loading ? 'Enviando…' : 'Quero falar com a equipe'}</button>
    </form>
  )
}
