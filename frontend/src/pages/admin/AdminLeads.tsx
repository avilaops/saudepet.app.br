import type { ApiPayload } from '../../types/api'
import { useEffect, useState } from 'react'
import AdminContentNav from '../../components/admin/AdminContentNav'
import { Aviso, Campo, Painel, StatusPill, Vazio, botaoPerigo, botaoPrimario, botaoSecundario, entrada } from '../../components/admin/AdminUI'
import api from '../../services/api'

const statuses = ['novo', 'contatado', 'qualificado', 'convertido', 'perdido', 'arquivado']

export default function AdminLeads() {
  const [filters, setFilters] = useState<ApiPayload>({ search: '', status: '', from: '', to: '', sort: 'created_desc', page: 1 })
  const [data, setData] = useState<ApiPayload>({ leads: [], pagination: {} })
  const [selected, setSelected] = useState<ApiPayload | null>(null)
  const [error, setError] = useState('')

  const requestFilters = () => ({
    ...filters,
    status: filters.status || undefined,
    from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
    to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
    limit: 25,
  })

  const load = () =>
    api.get('/admin/content/leads', { params: requestFilters() })
      .then((r) => setData(r.data))
      .catch(() => setError('Não foi possível carregar os leads.'))

  useEffect(() => { load() }, [filters.search, filters.status, filters.from, filters.to, filters.sort, filters.page])

  const update = async (lead: ApiPayload, patch: ApiPayload) => {
    try {
      const r = await api.patch(`/admin/content/leads/${lead.id}`, patch)
      setSelected(r.data.lead)
      load()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Não foi possível atualizar o lead.')
    }
  }

  const exportCsv = async () => {
    try {
      const r = await api.get('/admin/content/leads/export.csv', { params: requestFilters(), responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'leads-saude-pet.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Não foi possível exportar o CSV.')
    }
  }

  const remove = async (lead: ApiPayload) => {
    if (!window.confirm(`Excluir permanentemente o lead de ${lead.name}?`)) return
    try {
      await api.delete(`/admin/content/leads/${lead.id}`)
      setSelected(null)
      load()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Não foi possível excluir o lead.')
    }
  }

  return (
    <div>
      <AdminContentNav
        title="Leads"
        subtitle="Pedidos de contato vindos do site, com status e histórico de tratativa."
        actions={<button onClick={exportCsv} className={botaoPrimario}>Exportar CSV</button>}
      />

      <div className="space-y-6">
        <Painel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Campo rotulo="Pesquisar" className="sm:col-span-2 lg:col-span-1">
              <input
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                placeholder="Nome, telefone, e-mail ou cidade"
                className={entrada}
              />
            </Campo>
            <Campo rotulo="Status">
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                className={entrada}
              >
                <option value="">Todos</option>
                {statuses.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Campo>
            <Campo rotulo="De">
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })}
                className={entrada}
              />
            </Campo>
            <Campo rotulo="Até">
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })}
                className={entrada}
              />
            </Campo>
            <Campo rotulo="Ordenar">
              <select
                value={filters.sort}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value, page: 1 })}
                className={entrada}
              >
                <option value="created_desc">Mais recentes</option>
                <option value="created_asc">Mais antigos</option>
                <option value="name_asc">Nome A–Z</option>
              </select>
            </Campo>
          </div>
        </Painel>

        {error && <Aviso>{error}</Aviso>}

        <div className="grid gap-3">
          {data.leads.map((lead: ApiPayload) => (
            <article
              key={lead.id}
              className="grid items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1.2fr_1fr_auto_auto]"
            >
              <div className="min-w-0">
                <strong className="block truncate text-sm font-black text-slate-900">{lead.name}</strong>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {lead.city || 'Cidade não informada'} · {new Date(lead.created_at).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="min-w-0">
                <a
                  href={`https://wa.me/55${lead.phone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs font-bold text-teal-700 hover:underline"
                >
                  {lead.phone}
                </a>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{lead.interest}</span>
              </div>
              <StatusPill status={lead.status} />
              <button onClick={() => setSelected(lead)} className={botaoSecundario}>Detalhes</button>
            </article>
          ))}
        </div>

        {!data.leads.length && <Vazio>Nenhum lead encontrado.</Vazio>}

        {data.pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-4">
            <button
              disabled={filters.page === 1}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              className={botaoSecundario}
            >
              Anterior
            </button>
            <span className="text-xs font-bold tabular-nums text-slate-500">{filters.page} / {data.pagination.pages}</span>
            <button
              disabled={filters.page >= data.pagination.pages}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              className={botaoSecundario}
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-900/55" onClick={() => setSelected(null)}>
          <aside
            className="h-full w-full max-w-[480px] overflow-auto bg-white p-8"
            onClick={(e) => e.stopPropagation()}
            aria-label="Detalhes do lead"
          >
            <button
              className="float-right -mr-2 -mt-2 rounded-xl px-3 py-1 text-2xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={() => setSelected(null)}
              aria-label="Fechar"
            >
              ×
            </button>
            <h2 className="mb-6 mt-4 text-2xl font-black text-slate-900">{selected.name}</h2>
            <dl className="mb-6 grid grid-cols-[110px_1fr] gap-2.5 text-xs">
              <dt className="font-bold text-slate-400">Telefone</dt>
              <dd className="font-medium text-slate-700">{selected.phone}</dd>
              <dt className="font-bold text-slate-400">E-mail</dt>
              <dd className="font-medium text-slate-700">{selected.email || 'Não informado'}</dd>
              <dt className="font-bold text-slate-400">Pet</dt>
              <dd className="font-medium text-slate-700">
                {[selected.pet_name, selected.pet_type].filter(Boolean).join(' · ') || 'Não informado'}
              </dd>
              <dt className="font-bold text-slate-400">Origem</dt>
              <dd className="font-medium text-slate-700">{selected.source_page || 'Não identificada'}</dd>
              <dt className="font-bold text-slate-400">Campanha</dt>
              <dd className="font-medium text-slate-700">{selected.utm_campaign || 'Sem campanha'}</dd>
            </dl>
            <div className="space-y-4">
              <Campo rotulo="Status">
                <select
                  value={selected.status}
                  onChange={(e) => update(selected, { status: e.target.value })}
                  className={entrada}
                >
                  {statuses.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Observações">
                <textarea
                  defaultValue={selected.notes || ''}
                  onBlur={(e) => update(selected, { notes: e.target.value })}
                  rows={6}
                  className={entrada}
                />
              </Campo>
              <button className={botaoPerigo} onClick={() => remove(selected)}>Excluir lead</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
