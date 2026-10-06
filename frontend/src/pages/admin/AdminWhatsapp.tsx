import type { ApiPayload } from '../../types/api'
import { useEffect, useState } from 'react'
import AdminContentNav from '../../components/admin/AdminContentNav'
import { Aviso, Campo, Painel, StatusPill, Vazio, botaoPrimario, entrada } from '../../components/admin/AdminUI'
import api from '../../services/api'

export default function AdminWhatsapp() {
  const [status, setStatus] = useState<ApiPayload | null>(null)
  const [data, setData] = useState<ApiPayload>({ messages: [], pagination: {} })
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [sendTo, setSendTo] = useState('')
  const [sendBody, setSendBody] = useState('')
  const [sending, setSending] = useState(false)

  const load = () =>
    // `meta-admin.routes` só está montado em /api/v1/admin/meta — sem o prefixo,
    // as três chamadas desta tela caíam no notFoundHandler e nada carregava.
    api.get('/v1/admin/meta/whatsapp/mensagens', { params: { phone: phone || undefined } })
      .then((r) => setData(r.data))
      .catch(() => setError('Não foi possível carregar as mensagens.'))

  useEffect(() => {
    // Debounce de 400ms no filtro por telefone pra não disparar uma requisição por tecla.
    const t = setTimeout(() => { load() }, 400)
    return () => clearTimeout(t)
  }, [phone])
  const [statusIndisponivel, setStatusIndisponivel] = useState(false)
  useEffect(() => {
    api.get('/v1/admin/meta/status')
      .then((r) => setStatus(r.data))
      .catch(() => setStatusIndisponivel(true))
  }, [])

  const send = async (e: any) => {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      await api.post('/v1/admin/meta/whatsapp/enviar', { to: sendTo, body: sendBody })
      setSendBody('')
      load()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Falha ao enviar mensagem.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <AdminContentNav title="WhatsApp" subtitle="Mensagens trocadas pelo número oficial e envio manual." />

      <div className="space-y-6">
        {status && !status.whatsapp && (
          <Aviso tom="alerta">
            Integração com WhatsApp ainda não configurada (faltam{' '}
            <code className="rounded bg-amber-100 px-1 font-mono">WHATSAPP_PHONE_NUMBER_ID</code> /{' '}
            <code className="rounded bg-amber-100 px-1 font-mono">WHATSAPP_API_TOKEN</code> no ambiente).
            Veja o{' '}
            <a
              href="https://github.com/avilaops/saude-pet1/blob/main/ROADMAP.md"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              ROADMAP
            </a>{' '}
            pra configurar.
          </Aviso>
        )}
        {statusIndisponivel && (
          <Aviso tom="alerta">Não foi possível verificar a configuração da integração com o WhatsApp.</Aviso>
        )}

        <Painel titulo="Envio manual">
          <form className="flex flex-col items-end gap-3 sm:flex-row" onSubmit={send}>
            <Campo rotulo="Enviar mensagem manual" className="w-full sm:w-72">
              <input
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="Telefone, ex: (11) 91234-5678"
                required
                className={entrada}
              />
            </Campo>
            <Campo rotulo="Texto" className="w-full sm:flex-1">
              <input
                value={sendBody}
                onChange={(e) => setSendBody(e.target.value)}
                placeholder="Mensagem"
                required
                className={entrada}
              />
            </Campo>
            <button type="submit" disabled={sending} className={`${botaoPrimario} w-full sm:w-auto`}>
              {sending ? 'Enviando...' : 'Enviar'}
            </button>
          </form>
        </Painel>

        <Painel>
          <Campo rotulo="Filtrar por telefone" className="w-full sm:w-72">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Só números" className={entrada} />
          </Campo>
        </Painel>

        {error && <Aviso>{error}</Aviso>}

        <div className="grid gap-3">
          {data.messages.map((msg: ApiPayload) => (
            <article
              key={msg.id}
              className="grid items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1.2fr_1fr_auto]"
            >
              <div className="min-w-0">
                <strong className="block text-sm font-black text-slate-900">
                  {msg.direction === 'inbound' ? 'Recebida' : 'Enviada'}
                </strong>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {msg.wa_phone} · {new Date(msg.created_at).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-slate-700">
                  {msg.body || (msg.template_name ? `Template: ${msg.template_name}` : '(sem texto)')}
                </span>
              </div>
              <StatusPill status={msg.status} />
            </article>
          ))}
        </div>
        {!data.messages.length && <Vazio>Nenhuma mensagem ainda.</Vazio>}
      </div>
    </div>
  )
}
