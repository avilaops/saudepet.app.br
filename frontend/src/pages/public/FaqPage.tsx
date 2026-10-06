import type { ApiPayload } from '../../types/api'
import { useMemo, useState } from 'react'
import PublicLayout from '../../components/public/PublicLayout'
import LeadForm from '../../components/public/LeadForm'
import Seo from '../../components/public/Seo'
import { faqCategories } from '../../data/faq'

const normalize = (value: ApiPayload) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function FaqPage() {
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Todas')
  const [openItems, setOpenItems] = useState(new Set())

  const categoryNames = useMemo(() => {
    return ['Todas', ...faqCategories.map((c) => c.name)]
  }, [])

  const filteredCategories = useMemo(() => {
    return faqCategories
      .filter((cat) => selectedCategory === 'Todas' || cat.name === selectedCategory)
      .map((category) => ({
        ...category,
        items: category.items.filter((item) =>
          normalize(`${item.q} ${item.a}`).includes(normalize(query))
        )
      }))
      .filter((category) => category.items.length > 0)
  }, [query, selectedCategory])

  const toggleItem = (key: ApiPayload) => {
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const allQuestions = faqCategories.flatMap((category) => category.items)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: allQuestions.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  }

  return (
    <PublicLayout>
      <Seo
        title="Perguntas frequentes sobre atendimento veterinário | Saúde PET"
        description="Tire todas as suas dúvidas sobre o atendimento veterinário em casa, segurança dos profissionais, valores e agendamento."
        path="/faq"
        jsonLd={jsonLd}
      />

      {/* HERO FAQ */}
      <section className="lv-hero-section">
        <div className="lv-container text-center">
          <span className="lv-tag">TIRE SUAS DÚVIDAS</span>
          <h1 className="lv-hero-title">
            Perguntas <span className="lv-text-teal">Frequentes</span>
          </h1>
          <p className="lv-hero-subtitle">
            Tudo o que você precisa saber sobre o atendimento veterinário domiciliar do Saúde PET.
          </p>

          {/* Campo de Busca */}
          <div style={{ maxWidth: '560px', margin: '0 auto 24px' }}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite sua dúvida (ex.: valor, CRMV, horário, vacina)..."
              style={{
                width: '100%',
                padding: '16px 20px',
                borderRadius: '999px',
                border: '1.5px solid #cbd5e1',
                fontSize: '1rem',
                outline: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
              }}
            />
          </div>

          {/* Filtros de Categoria */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {categoryNames.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '999px',
                  border: '1px solid',
                  borderColor: selectedCategory === cat ? '#0d9488' : '#e2e8f0',
                  background: selectedCategory === cat ? '#0d9488' : '#ffffff',
                  color: selectedCategory === cat ? '#ffffff' : '#475569',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* LISTA DE FAQ */}
      <section className="lv-section">
        <div className="lv-container lv-narrow">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category) => (
              <div key={category.name} style={{ marginBottom: '44px' }}>
                <h2
                  style={{
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    marginBottom: '16px',
                    borderBottom: '2px solid #e6f7f6',
                    paddingBottom: '8px'
                  }}
                >
                  {category.name}
                </h2>
                <div className="lv-accordion-list">
                  {category.items.map((item) => {
                    const isOpen = openItems.has(item.q)
                    return (
                      <div key={item.q} className={`lv-accordion-item ${isOpen ? 'is-open' : ''}`}>
                        <button
                          className="lv-accordion-btn"
                          onClick={() => toggleItem(item.q)}
                          aria-expanded={isOpen}
                        >
                          <span>{item.q}</span>
                          <span className="lv-accordion-icon">{isOpen ? '▲' : '▼'}</span>
                        </button>
                        {isOpen && (
                          <div className="lv-accordion-content">
                            <p>{item.a}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center" style={{ padding: '48px 0' }}>
              <h3 style={{ fontSize: '1.3rem', color: '#0f172a', marginBottom: '8px' }}>
                Nenhuma pergunta encontrada para "{query}"
              </h3>
              <p style={{ color: '#64748b' }}>Tente pesquisar outro termo ou envie sua mensagem abaixo.</p>
            </div>
          )}
        </div>
      </section>

      {/* CONTATO FAQ */}
      <section id="contato" className="lv-section lv-bg-light">
        <div className="lv-container lv-narrow">
          <div className="lv-section-header">
            <span className="lv-tag">AINDA COM DÚVIDAS?</span>
            <h2>Fale diretamente com nossa equipe</h2>
            <p>Envie sua mensagem e responderemos o mais rápido possível.</p>
          </div>
          <LeadForm compact />
        </div>
      </section>
    </PublicLayout>
  )
}
