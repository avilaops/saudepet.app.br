import PublicLayout from '../../components/public/PublicLayout'
import LeadForm from '../../components/public/LeadForm'
import Seo from '../../components/public/Seo'

/**
 * Página de contato.
 *
 * O formulário existia só no rodapé do FAQ: para falar com a equipe era preciso
 * entrar em "Perguntas frequentes" e rolar até o fim. Aqui ele ganha endereço
 * próprio, ligado ao menu — e o FAQ continua com a mesma seção, para quem já
 * estava lendo por lá.
 */
export default function ContatoPage() {
  return (
    <PublicLayout>
      <Seo
        title="Contato — Saúde PET"
        description="Fale diretamente com a equipe do Saúde PET. Conte sua dúvida e respondemos o mais rápido possível."
        path="/contato"
      />

      <section className="lv-section lv-bg-light">
        <div className="lv-container lv-narrow">
          <div className="lv-section-header">
            <span className="lv-tag">FALE CONOSCO</span>
            <h1>Fale diretamente com nossa equipe</h1>
            <p>Escreva sua dúvida com as suas palavras. Respondemos no telefone ou no e-mail que você deixar aqui.</p>
          </div>
          <LeadForm compact />
        </div>
      </section>
    </PublicLayout>
  )
}
