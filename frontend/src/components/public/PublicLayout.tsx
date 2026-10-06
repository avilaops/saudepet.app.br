import type { ApiPayload } from '../../types/api'
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import BrandLogo from '../brand/BrandLogo'
import AnalyticsTracker from './AnalyticsTracker'
import MenuDeEntrada from './MenuDeEntrada'

// "Contato" existe aqui porque o formulário só vivia no rodapé do FAQ: quem
// queria falar com a equipe tinha de adivinhar que estava lá dentro e rolar até
// o fim.
// "Mercado" saiu do menu em 28/08/2026, a pedido do Nicolas. A vitrine existe e
// funciona, mas o catálogo ainda está em levantamento: os preços vieram de
// etiqueta fotografada na loja do fornecedor, sem custo negociado, e mais de
// cem itens sequer têm preço. Enquanto isso, o Mercado é só para quem está
// construindo ele — não para o visitante do site.
//
// Tirar do menu esconde a porta, não tranca. As rotas `/mercado/*` continuam
// respondendo para quem digitar o endereço, e a vitrine pública só devolve loja
// APROVADA (a Casa de Rações está em `rascunho`, por isso hoje volta vazia).
// Para virar trava de verdade — inclusive nos feeds `/public/mercado/feed.xml`
// e `.csv`, que existem para o Google e o WhatsApp lerem — falta o gate de
// super admin no backend.
const links = [['/', 'Início'], ['/#como-funciona', 'Como funciona'], ['/faq', 'FAQ'], ['/blog', 'Blog'], ['/contato', 'Contato']]

export default function PublicLayout({ children }: ApiPayload) {
  const [open, setOpen] = useState(false)
  return (
    <div className="public-shell">
      <AnalyticsTracker />
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <header className="public-header">
        <div className="public-wrap header-inner">
          <Link to="/" aria-label="Saúde PET, página inicial"><BrandLogo /></Link>

          {/*
            No celular o Entrar fica FORA da gaveta, ao lado do hambúrguer.
            Escondido lá dentro, a ação principal do site exigia dois toques e
            um palpite: quem chega para entrar na conta não pensa em abrir menu.
            Em telas grandes ele volta para dentro do <nav>, onde sempre esteve.
          */}
          <div className="header-acoes">
            <div className="header-acoes__entrar"><MenuDeEntrada aoNavegar={() => setOpen(false)} /></div>
            <button className="menu-toggle" aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} aria-controls="public-nav" onClick={() => setOpen(!open)}><span /><span /><span /></button>
          </div>

          <nav id="public-nav" className={open ? 'public-nav is-open' : 'public-nav'} aria-label="Menu principal">
            {links.map(([to, label]) => to.includes('#') ? <a key={to} href={to} onClick={() => setOpen(false)}>{label}</a> : <NavLink key={to} to={to} onClick={() => setOpen(false)}>{label}</NavLink>)}
            <div className="public-nav__entrar"><MenuDeEntrada aoNavegar={() => setOpen(false)} /></div>
          </nav>
        </div>
      </header>
      <main id="conteudo">{children}</main>
      <footer className="public-footer">
        <div className="public-wrap footer-grid footer-grid-v2">
          <div className="footer-brand"><BrandLogo light /><p>Cuidado veterinário mais próximo, claro e humano — onde seu pet se sente em casa.</p><span>Saúde e tecnologia a serviço do vínculo.</span></div>
          {/* Link com hash precisa ser <a>: o React Router não rola até a âncora. */}
          <nav aria-label="Explore"><strong>Explore</strong><a href="/#como-funciona">Como funciona</a><Link to="/faq">Perguntas frequentes</Link><Link to="/blog">Blog</Link><Link to="/contato">Contato</Link></nav>
          <nav aria-label="Acesso"><strong>Acesso</strong><Link to="/login?perfil=tutor">Entrar como tutor</Link><Link to="/login?perfil=veterinario">Entrar como veterinário</Link><Link to="/register">Criar conta</Link><Link to="/privacidade">Política de Privacidade</Link></nav>
        </div>
        <div className="public-wrap footer-copy"><p>© {new Date().getFullYear()} Saúde PET. Todos os direitos reservados.</p><Link to="/privacidade">Privacidade e termos</Link></div>
      </footer>
    </div>
  )
}
