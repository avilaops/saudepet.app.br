import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { iniciarTamanhoDaLetra } from './lib/acessibilidade'
import { iniciarTemaVet } from './lib/temaVet'
import App, { preCarregarPaginaDoServidor } from './App'
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

const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// As páginas públicas chegam desenhadas pelo servidor com os mesmos `.tsx`
// (`entry-server.tsx`). Nelas o React assume o HTML que já está na tela em vez
// de apagar e desenhar de novo — sem piscar. Nas demais a raiz vem vazia.
//
// Antes de assumir, o código da página já tem de estar carregado: se o `lazy`
// suspender no meio da hidratação, qualquer atualização que chegue antes (a
// sessão, por exemplo) faz o React descartar o HTML e redesenhar tudo.
if (raiz.dataset.ssr === '1') {
  preCarregarPaginaDoServidor(window.location.pathname).then(() => ReactDOM.hydrateRoot(raiz, app))
} else {
  ReactDOM.createRoot(raiz).render(app)
}
