import { useEffect, useState } from 'react'
import { ativarPush, desativarPush, inscricaoConfirmada, suportaPush } from '../../lib/push'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetIcon, VetPageHeader } from '../../components/veterinario/VetUI'
import TamanhoDaLetra from '../../components/TamanhoDaLetra'
import { preferenciasVet, salvarPreferenciasVet } from '../../lib/temaVet'
import TrocarSenha from '../../components/TrocarSenha'
import AreaDeAtendimento from '../../components/veterinario/AreaDeAtendimento'

export default function VetConfiguracoes() {
  const navigate = useNavigate()
  const [preferences, setPreferences] = useState<Record<string, any>>(preferenciasVet)
  const [message, setMessage] = useState('')

  // O interruptor de push reflete a inscrição REAL do navegador, não só a
  // preferência guardada — e ligar/desligar registra/remove no backend.
  useEffect(() => {
    if (!suportaPush()) return
    inscricaoConfirmada()
      .then((inscrito) => setPreferences((current) => ({ ...current, push: inscrito })))
      .catch(() => {})
  }, [])

  const togglePush = async () => {
    try {
      if (preferences.push) {
        await desativarPush()
        setPreferences((current) => ({ ...current, push: false }))
        setMessage('Notificações desativadas neste dispositivo.')
      } else {
        // `ativarPush` devolve `{ ok, motivo }`. Enquanto ela devolvia um
        // booleano isto funcionava; com o objeto, `ok ? ... : ...` era SEMPRE
        // verdadeiro — o interruptor ligava e a tela dizia "ativadas" mesmo
        // com a permissão negada. Regressão introduzida ao melhorar o retorno,
        // e o tipo de erro que só aparece quando alguém tenta de verdade.
        const r = await ativarPush()
        setPreferences((current) => ({ ...current, push: r.ok }))
        setMessage(
          r.ok
            ? 'Notificações ativadas — você recebe alertas mesmo com o app fechado.'
            : r.motivo === 'negado'
              ? 'O navegador bloqueou. Libere nas permissões do site e tente de novo.'
              : r.motivo === 'adiado'
                ? 'Você fechou o pedido do navegador. Toque de novo para ativar.'
                : 'Não conseguimos ativar agora. Tente de novo em instantes.'
        )
      }
    } catch {
      setMessage('Não foi possível alterar as notificações agora.')
    }
  }

  // A limpeza deste efeito removia a classe ao sair da tela: o modo escuro só
  // valia enquanto Configurações estivesse aberta. O tema agora é do app
  // inteiro (`lib/temaVet`) e é aplicado no arranque.
  useEffect(() => { salvarPreferenciasVet(preferences as any) }, [preferences])

  const toggleLocation = async () => {
    if (preferences.location) {
      setPreferences((current) => ({ ...current, location: false }))
      return
    }
    setMessage('Solicitando permissão de localização…')
    navigator.geolocation?.getCurrentPosition(async ({ coords }) => {
      try {
        const response = await api.get('/veterinarios/meus-dados')
        await api.put('/veterinarios/status-online', { online: Boolean(response.data.online), latitude: coords.latitude, longitude: coords.longitude })
        setPreferences((current) => ({ ...current, location: true }))
        setMessage('Localização ativada para encontrar atendimentos próximos.')
      } catch { setMessage('Não foi possível salvar sua localização agora.') }
    }, () => setMessage('Permissão de localização não concedida.'), { timeout: 6000, maximumAge: 300000 })
  }

  const groups = [
    { title: 'Preferências', rows: [
      { icon: 'pin', title: 'Localização', helper: 'Encontrar tutores próximos', toggle: 'location', action: toggleLocation },
      { icon: 'bell', title: 'Notificações neste dispositivo', helper: 'Alertas de chamadas mesmo com o app fechado', toggle: 'push', action: togglePush },
      { icon: 'moon', title: 'Modo escuro', helper: 'Tema escuro do app', toggle: 'dark' },
    ] },
    { title: 'Conta profissional', rows: [
      // Levava ao perfil, que não tem upload nenhum — e o envio do documento é
      // justamente o que destrava o credenciamento.
      { icon: 'folder', title: 'Documentação', helper: 'CRMV e comprovantes', to: '/veterinario/documentacao' },
      { icon: 'clock', title: 'Horários e valores', helper: 'Disponibilidade, serviços, vacinas e preços', to: '/veterinario/horarios-valores' },
    ] },
    { title: 'Financeiro', rows: [
      { icon: 'bank', title: 'Conta bancária', helper: 'Chave PIX e conta onde você recebe', to: '/veterinario/conta-bancaria' },
      { icon: 'wallet', title: 'Cobranças', helper: 'Gerar cobrança e acompanhar pagamentos', to: '/veterinario/cobrancas' },
      { icon: 'chart', title: 'Meus repasses', helper: 'Saldo, extrato e transferências', to: '/veterinario/repasses' },
    ] },
    // O outro lado do balcão. O veterinário tem cachorro em casa como qualquer
    // pessoa, e até 26/08/2026 a única saída para cuidar do próprio pet aqui
    // dentro era abrir uma SEGUNDA conta com outro e-mail — as rotas de tutor
    // recusavam quem tinha `tipo_usuario: veterinario`. Agora ele entra na área
    // do tutor com a mesma conta; o que ele não pode é atender o próprio
    // chamado, e disso cuidam o despacho e o `aceitar`.
    { title: 'Meus pets', rows: [
      { icon: 'paw', title: 'Meus pets', helper: 'A carteirinha dos seus próprios animais', to: '/tutor/pets' },
      { icon: 'pin', title: 'Chamar um veterinário', helper: 'Atendimento em casa para o seu pet', to: '/tutor/solicitar' },
      { icon: 'clock', title: 'Histórico dos meus pets', helper: 'Atendimentos que você recebeu como tutor', to: '/tutor/historico' },
    ] },
    { title: 'Informações', rows: [
      { icon: 'shield', title: 'Dicas de segurança', helper: 'Proteja sua conta e seus dados', to: '/privacidade' },
      { icon: 'info', title: 'Política de privacidade', helper: 'Como seus dados são tratados', to: '/privacidade' },
    ] },
  ]

  return (
    <main className="vet-app">
      <VetPageHeader compact title="Configurações" onBack={() => navigate('/veterinario/home')} />
      <div className="vet-settings">
        {message && <p className="vet-card vet-request" role="status">{message}</p>}
        <TamanhoDaLetra className="vet-card" />

        {/* `POST /auth/change-password` existia e nenhuma tela do produto o
            expunha: trocar a senha exigia sair da conta e pedir e-mail. */}
        <TrocarSenha />

        {/* Até onde ele aceita ir. Antes o raio era só da cidade, igual para
            todos — quem só atende a zona sul recebia chamado do outro lado. */}
        <AreaDeAtendimento />

        {groups.map((group) => (
          <section className="vet-card vet-settings-group" key={group.title}>
            <h2>{group.title}</h2>
            {group.rows.map((row: any) => (
              <div className="vet-setting-row" key={row.title}>
                <span className="vet-setting-row__icon"><VetIcon name={row.icon} size={19} /></span>
                <span>
                  <strong>{row.title}</strong>
                  <small>{row.helper}</small>
                </span>
                {row.toggle ? (
                  <button
                    type="button"
                    className={`vet-switch ${preferences[row.toggle] ? 'is-on' : ''}`}
                    aria-label={`${preferences[row.toggle] ? 'Desativar' : 'Ativar'} ${row.title}`}
                    aria-pressed={preferences[row.toggle]}
                    onClick={row.action || (() => setPreferences((current) => ({ ...current, [row.toggle]: !current[row.toggle] })))}
                  />
                ) : (
                  <button className="vet-icon-button" type="button" onClick={() => navigate(row.to)} aria-label={`Abrir ${row.title}`}>
                    <VetIcon name="chevron" size={17} />
                  </button>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </main>
  )
}
