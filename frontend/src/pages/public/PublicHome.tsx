import type { ApiPayload } from '../../types/api'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import LeadForm from '../../components/public/LeadForm'
import PublicLayout from '../../components/public/PublicLayout'
import Seo from '../../components/public/Seo'
import LandingBannersCarousel from '../../components/public/LandingBannersCarousel'
import { faqCategories } from '../../data/faq'

// Ícones SVG reutilizáveis
function Icon({ name, className = '', size = 24 }: ApiPayload) {
  const paths: Record<string, string> = {
    clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
    heart: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    phone: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
    userCheck: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    mapPin: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
    stethoscope: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    syringe: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
    pulse: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    message: 'M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    zap: 'M13 10V3L4 14h7v7l9-11h-7z',
    cpu: 'M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
    arrowRight: 'M14 5l7 7m0 0l-7 7m7-7H3',
    alert: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    quote: 'M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z'
  }

  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name] || paths.heart} />
    </svg>
  )
}

export default function PublicHome() {
  const [openFaqIndex, setOpenFaqIndex] = useState<ApiPayload | null>(null)

  // Fonte única das perguntas — a página /faq usa a mesma lista completa.
  const faqItems = faqCategories.flatMap((categoria) => categoria.items).slice(0, 7)

  return (
    <PublicLayout>
      <Seo
        title="Saúde PET — Veterinário em casa com cuidado e proximidade"
        description="Atendimento veterinário domiciliar rápido, seguro e profissional para cuidar do seu pet sem sair de casa."
        path="/"
      />

      {/* 1. HERO SECTION */}
      <section className="lv-hero-section">
        <div className="lv-container text-center">
          {/* Badge de tempo médio */}
          <div className="lv-badge-pill">
            <Icon name="clock" size={16} />
            <span>Atendimento em casa, sob demanda ou agendado</span>
          </div>

          {/* Headline Principal */}
          <h1 className="lv-hero-title">
            Veterinário na sua casa em{' '}
            <span className="lv-text-orange">minutos.</span>
          </h1>

          {/* Subtítulo */}
          <p className="lv-hero-subtitle">
            Atendimento veterinário domiciliar rápido, seguro e profissional para cuidar do seu pet sem sair de casa.
          </p>

          {/* Botões de Ação */}
          <div className="lv-hero-actions">
            <Link className="lv-btn lv-btn-orange" to="/register">
              Criar conta grátis <Icon name="arrowRight" size={18} />
            </Link>
            <a className="lv-btn lv-btn-outline" href="#como-funciona">
              Como funciona
            </a>
          </div>

          {/* Selo de Confiança */}
          <div className="lv-trust-badge">
            <span className="lv-heart-icon">🧡</span> Veterinários com CRMV verificado antes do primeiro atendimento
          </div>
        </div>
      </section>

      {/* CARROSSEL DE BANNERS / CAMPANHAS DA LANDING PAGE */}
      <LandingBannersCarousel />

      {/* 2. CARD GRID (4 PROPOSIÇÕES DE VALOR) */}
      <section className="lv-value-grid-section">
        <div className="lv-container">
          <div className="lv-grid-4">
            <div className="lv-card">
              <div className="lv-card-icon">
                <Icon name="shield" size={24} />
              </div>
              <h3>Veterinários verificados</h3>
              <p>Todos os profissionais são credenciados e verificados.</p>
            </div>

            <div className="lv-card">
              <div className="lv-card-icon">
                <Icon name="home" size={24} />
              </div>
              <h3>Atendimento domiciliar</h3>
              <p>Seu pet recebe cuidado no conforto de casa.</p>
            </div>

            <div className="lv-card">
              <div className="lv-card-icon">
                <Icon name="star" size={24} />
              </div>
              <h3>Avaliações reais</h3>
              <p>Veja a opinião de quem já usou o serviço.</p>
            </div>

            <div className="lv-card">
              <div className="lv-card-icon">
                <Icon name="heart" size={24} />
              </div>
              <h3>Segurança e cuidado</h3>
              <p>Menos estresse e mais atenção para seu pet.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. COMO FUNCIONA */}
      <section id="como-funciona" className="lv-section lv-bg-light">
        <div className="lv-container">
          <div className="lv-section-header">
            <span className="lv-tag">SIMPLES E RÁPIDO</span>
            <h2>Como funciona</h2>
            <p>Em poucos passos, seu pet recebe atendimento profissional em casa.</p>
          </div>

          <div className="lv-grid-4 lv-steps-grid">
            <div className="lv-step-card">
              <div className="lv-step-icon">
                <Icon name="phone" size={24} />
              </div>
              <span className="lv-step-number">Passo 1</span>
              <h3>Solicite atendimento</h3>
              <p>Preencha o formulário com os dados do seu pet.</p>
            </div>

            <div className="lv-step-card">
              <div className="lv-step-icon">
                <Icon name="userCheck" size={24} />
              </div>
              <span className="lv-step-number">Passo 2</span>
              <h3>Veterinário aceita</h3>
              <p>Um profissional próximo aceita o chamado.</p>
            </div>

            <div className="lv-step-card">
              <div className="lv-step-icon">
                <Icon name="mapPin" size={24} />
              </div>
              <span className="lv-step-number">Passo 3</span>
              <h3>Ele vai até você</h3>
              <p>O veterinário se desloca até a sua casa.</p>
            </div>

            <div className="lv-step-card">
              <div className="lv-step-icon">
                <Icon name="stethoscope" size={24} />
              </div>
              <span className="lv-step-number">Passo 4</span>
              <h3>Atendimento profissional</h3>
              <p>Seu pet recebe cuidado de qualidade em casa.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. NOSSOS SERVIÇOS (TIPOS DE ATENDIMENTO) */}
      <section id="servicos" className="lv-section">
        <div className="lv-container">
          <div className="lv-section-header">
            <span className="lv-tag">NOSSOS SERVIÇOS</span>
            <h2>Tipos de atendimento</h2>
          </div>

          <div className="lv-grid-2">
            <div className="lv-service-card">
              <div className="lv-service-icon">
                <Icon name="stethoscope" size={24} />
              </div>
              <div>
                <h3>Consulta veterinária</h3>
                <p>Avaliação clínica completa do seu pet em casa.</p>
              </div>
            </div>

            <div className="lv-service-card">
              <div className="lv-service-icon">
                <Icon name="syringe" size={24} />
              </div>
              <div>
                <h3>Vacinação</h3>
                <p>Vacinas aplicadas com segurança no conforto do lar.</p>
              </div>
            </div>

            <div className="lv-service-card">
              <div className="lv-service-icon">
                <Icon name="pulse" size={24} />
              </div>
              <div>
                <h3>Avaliação de saúde</h3>
                <p>Check-up geral para garantir o bem-estar do pet.</p>
              </div>
            </div>

            <div className="lv-service-card">
              <div className="lv-service-icon">
                <Icon name="message" size={24} />
              </div>
              <div>
                <h3>Orientação profissional</h3>
                <p>Tire dúvidas e receba orientações especializadas.</p>
              </div>
            </div>
          </div>

          {/* Disclaimer Box */}
          <div className="lv-warning-box">
            <Icon name="alert" size={22} className="lv-text-orange" />
            <span>
              Alguns procedimentos mais complexos precisam ser realizados em clínicas especializadas. Nosso veterinário orientará sobre os próximos passos.
            </span>
          </div>
        </div>
      </section>

      {/* Veterinários e depoimentos reais entram aqui quando existirem —
          as seções anteriores usavam nomes, notas e falas inventados. */}

      {/* 7. NOSSOS DIFERENCIAIS */}
      <section id="diferenciais" className="lv-section lv-bg-light">
        <div className="lv-container">
          <div className="lv-section-header">
            <span className="lv-tag">POR QUE NOS ESCOLHER</span>
            <h2>Nossos diferenciais</h2>
          </div>

          <div className="lv-grid-2">
            <div className="lv-diff-card">
              <div className="lv-diff-icon">
                <Icon name="home" size={22} />
              </div>
              <div>
                <h3>Atendimento em casa</h3>
                <p>Sem deslocamento, sem filas, sem espera.</p>
              </div>
            </div>

            <div className="lv-diff-card">
              <div className="lv-diff-icon">
                <Icon name="heart" size={22} />
              </div>
              <div>
                <h3>Menos estresse</h3>
                <p>Seu pet fica calmo no ambiente familiar.</p>
              </div>
            </div>

            <div className="lv-diff-card">
              <div className="lv-diff-icon">
                <Icon name="shield" size={22} />
              </div>
              <div>
                <h3>Profissionais verificados</h3>
                <p>Todos os veterinários são avaliados e credenciados.</p>
              </div>
            </div>

            <div className="lv-diff-card">
              <div className="lv-diff-icon">
                <Icon name="zap" size={22} />
              </div>
              <div>
                <h3>Agilidade</h3>
                <p>Atendimento rápido com profissionais próximos.</p>
              </div>
            </div>

            <div className="lv-diff-card lv-full-width-card">
              <div className="lv-diff-icon">
                <Icon name="cpu" size={22} />
              </div>
              <div>
                <h3>Tecnologia moderna</h3>
                <p>Plataforma inteligente que conecta você ao melhor profissional.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. BANNER CTA */}
      <section className="lv-cta-banner-section">
        <div className="lv-container">
          <div className="lv-cta-banner-card">
            <h2>Seu pet merece atendimento de qualidade sem sair de casa.</h2>
            <p>Crie sua conta, cadastre seu pet e chame um veterinário quando precisar.</p>
            <Link className="lv-btn lv-btn-orange" to="/register">
              Criar conta grátis <Icon name="arrowRight" size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* 8B. FALE COM A EQUIPE
           O `LeadForm` era importado no topo deste arquivo e nunca renderizado:
           a página inicial — de longe a mais visitada — não tinha nenhum ponto
           de captura. Quem não quisesse criar conta na hora não tinha por onde
           deixar contato. */}
      <section id="contato" className="lv-section">
        <div className="lv-container lv-narrow">
          <div className="lv-section-header">
            <span className="lv-tag">PREFERE QUE A GENTE LIGUE?</span>
            <h2>Fale com a nossa equipe</h2>
            <p>Deixe seu contato e a gente responde pelo canal que você escolher.</p>
          </div>
          <LeadForm />
        </div>
      </section>

      {/* 9. PERGUNTAS FREQUENTES */}
      <section id="faq" className="lv-section">
        <div className="lv-container lv-narrow">
          <div className="lv-section-header">
            <span className="lv-tag">TIRE SUAS DÚVIDAS</span>
            <h2>Perguntas frequentes</h2>
            <p>Tudo que você precisa saber sobre o atendimento veterinário domiciliar.</p>
          </div>

          <div className="lv-accordion-list">
            {faqItems.map((item, idx) => {
              const isOpen = openFaqIndex === idx
              return (
                <div key={idx} className={`lv-accordion-item ${isOpen ? 'is-open' : ''}`}>
                  <button
                    className="lv-accordion-btn"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                  >
                    <span>{item.q}</span>
                    <span className="lv-accordion-icon">{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && <div className="lv-accordion-content"><p>{item.a}</p></div>}
                </div>
              )
            })}
          </div>

          <div className="text-center" style={{ marginTop: '36px' }}>
            <Link to="/faq" className="lv-text-teal" style={{ fontWeight: 700 }}>
              Ver todas as perguntas frequentes →
            </Link>
          </div>
        </div>
      </section>


    </PublicLayout>
  )
}
