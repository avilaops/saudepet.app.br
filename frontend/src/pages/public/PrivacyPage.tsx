import PublicLayout from '../../components/public/PublicLayout'
import Seo from '../../components/public/Seo'

// A política anterior cobria só o formulário de leads da landing. Esta versão
// descreve o tratamento real do produto (contas, pets, prontuário, chat,
// pagamentos, notificações). Revisão jurídica formal (prazos internos e prazo
// mínimo de guarda do prontuário) segue pendente no ROADMAP — a nota pública
// de pendência foi removida por ser pior do que a lacuna que anunciava.
export default function PrivacyPage() {
  return <PublicLayout>
    <Seo title="Política de Privacidade | Saúde PET" description="Como o Saúde PET trata dados pessoais de tutores, veterinários e pets, conforme a LGPD." path="/privacidade" />
    <article className="policy public-wrap narrow">
      <span className="eyebrow">LGPD e transparência</span>
      <h1>Política de Privacidade</h1>
      <p className="policy-date">Atualizada em 20 de agosto de 2026.</p>

      <h2>Quais dados coletamos</h2>
      <p><strong>Conta e perfil:</strong> nome, e-mail, telefone, cidade e, se você optar, fotos de perfil e capa. Veterinários também informam CRMV, especialidade e documentos de credenciamento. Senhas são armazenadas apenas como hash criptográfico; login social (Google/Facebook) traz somente nome, e-mail e identificador da conta.</p>
      <p><strong>Pets e saúde:</strong> dados do animal (nome, espécie, raça, idade, peso, fotos), histórico clínico, prontuários, prescrições, exames, vacinas, alergias e lembretes. São dados sobre o animal, mas vinculados ao tutor — tratamos com o mesmo cuidado de dado pessoal.</p>
      <p><strong>Atendimentos e comunicação:</strong> solicitações, linha do tempo de cada atendimento (com autor de cada mudança), mensagens do chat e anexos enviados, avaliações e, quando você compartilha, localização para o atendimento domiciliar.</p>
      <p><strong>Pagamentos:</strong> registramos valor, método, situação e divisão do pagamento. Os dados do cartão são processados diretamente pelo Mercado Pago — não passam pelos nossos servidores e não os armazenamos.</p>
      <p><strong>Notificações:</strong> se você ativar as notificações push, guardamos o endereço técnico de entrega gerado pelo seu navegador. Desativar nas preferências remove esse registro.</p>
      <p><strong>Formulário de contato (site):</strong> nome, telefone e, se informados, e-mail, cidade e dados básicos do pet.</p>

      <h2>Finalidade e bases de tratamento</h2>
      <p>Usamos os dados para executar o serviço contratado (arts. 7º, V da LGPD): conectar tutor e veterinário, registrar o atendimento e o prontuário, processar pagamentos e enviar as comunicações do próprio atendimento. Denúncias e registros de moderação atendem ao legítimo interesse de manter a plataforma segura. O aceite do formulário de contato vale para responder à solicitação — não é autorização genérica de marketing.</p>

      <h2>Métricas próprias</h2>
      <p>No site público registramos rota visitada, sessão anônima, origem, parâmetros UTM e categoria geral do dispositivo. Não guardamos o IP completo: geramos um identificador criptográfico não reversível para segurança e deduplicação. Não registramos conteúdo de formulários como evento analítico.</p>

      <h2>Com quem compartilhamos</h2>
      <p>Não vendemos dados. Compartilhamos apenas com operadores necessários ao serviço: <strong>Mercado Pago</strong> (processamento de pagamentos), <strong>Cloudflare</strong> (armazenamento de imagens e documentos), o provedor de e-mail transacional e o serviço de push do seu próprio navegador. O veterinário do atendimento acessa o histórico clínico do pet para continuidade do tratamento, dentro da mesma operação.</p>

      <h2>Armazenamento, segurança e retenção</h2>
      <p>Os dados ficam em banco PostgreSQL da própria operação, com backup diário do banco e dos arquivos. Senhas usam hash com sal; credenciais de pagamento da operação e dados bancários de repasse são criptografados; toda ação relevante gera trilha de auditoria. Eventos analíticos têm retenção padrão de 180 dias. Prontuários são preservados pelo prazo exigido para registros clínicos; demais dados, pelo tempo necessário ao serviço e às obrigações legais.</p>

      <h2>Seus direitos</h2>
      <p>Você pode pedir confirmação do tratamento, acesso, correção, portabilidade quando aplicável, exclusão do que não formos obrigados a manter e revisão de decisões automatizadas. Notificações push podem ser desativadas a qualquer momento nas preferências do app.</p>

      <h2>Controlador e encarregado (DPO)</h2>
      <p>O controlador dos dados é o <strong>Saúde PET</strong>, plataforma operada pela Avila Ops. O canal do encarregado pelo tratamento de dados pessoais (DPO) é o e-mail <a href="mailto:sac@saudepet.app.br">sac@saudepet.app.br</a> — também o caminho para exercer qualquer um dos direitos acima. Respondemos às solicitações nos prazos da LGPD.</p>
    </article>
  </PublicLayout>
}
