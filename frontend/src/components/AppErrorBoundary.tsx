import { Component, type ReactNode } from 'react'

export default class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('Falha ao renderizar a interface:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error-boundary" role="alert">
          <img src="/brand/logo-completa.png" alt="Saúde PET" width="185" height="51" />
          <h1>Não foi possível exibir esta tela</h1>
          <p>A página encontrou um erro inesperado. Atualize para tentar novamente ou volte ao painel.</p>
          <div>
            <button type="button" onClick={() => window.location.reload()}>Atualizar página</button>
            <a href="/app">Voltar ao painel</a>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
