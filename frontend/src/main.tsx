import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { iniciarTamanhoDaLetra } from './lib/acessibilidade'
import { iniciarTemaVet } from './lib/temaVet'
import App from './App'
import './index.css'
import './public.css'
import './vet.css'

// Atualização do aplicativo instalado.
//
// O módulo virtual em modo autoUpdate troca o service worker sozinho, mas o
// navegador só vai procurar versão nova quando a página é CARREGADA — e num app
// de tela única, navegar entre telas não carrega nada. Quem deixa o Saúde Pet
// aberto (ou instalado na tela inicial) podia ficar dias na versão antiga sem
// perceber: foi assim que um mapa já publicado continuou invisível no celular.
//
// Duas correções, nas duas pontas do problema:
const rotasDeFluxoCritico = /^\/(tutor\/(solicitar|acompanhar)|veterinario\/atendimento)/
const emFluxoCritico = () => rotasDeFluxoCritico.test(window.location.pathname)

// 1. Recarregar sem atropelar. A versão nova chega recarregando a página, o que
//    apagaria o formulário de quem está pedindo socorro pelo pet. Nessas telas a
//    troca fica pendurada e acontece no primeiro momento seguro.
let recargaPendente = false
const aplicarVersaoNova = () => window.location.reload()

registerSW({
  immediate: true,
  onNeedReload() {
    if (emFluxoCritico()) recargaPendente = true
    else aplicarVersaoNova()
  },
  // 2. Procurar versão nova quando a pessoa sai do app. Recarregar em segundo
  //    plano não custa nada a ninguém, e ela volta já na versão nova.
  onRegisteredSW(_url, registro) {
    if (!registro) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return
      if (recargaPendente) aplicarVersaoNova()
      else registro.update().catch(() => {})
    })
  }
})

// Saiu do fluxo crítico com atualização pendurada? Aplica agora.
setInterval(() => {
  if (recargaPendente && !emFluxoCritico()) aplicarVersaoNova()
}, 20000)

// Antes da primeira pintura: quem escolheu letra maior não deve ver a tela
// pequena piscar antes de crescer.
iniciarTamanhoDaLetra()

// Modo escuro do vet: vale no app inteiro, não só na tela de Configurações.
iniciarTemaVet()

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root não encontrado no documento.')

ReactDOM.createRoot(raiz).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
