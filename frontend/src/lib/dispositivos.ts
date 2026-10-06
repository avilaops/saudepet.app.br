import { inscricaoAtual, inscricaoConfirmada, suportaPush } from './push'

export interface InfoDispositivo {
  id: string
  nome: string
  tipo: 'smartphone' | 'tablet' | 'desktop' | 'desconhecido'
  sistema: string
  navegador: string
  eEsteAparelho: boolean
  pwaInstalada: boolean
  statusServidor: 'ativo' | 'pendente' | 'sem-suporte'
  dataRegistro?: string
}

/** Detecta se o ambiente atual é iOS (iPhone, iPad, iPod). */
export function isIos(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** Detecta se o app está rodando no modo PWA Standalone (instalado na tela de início). */
export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** Detecta nome amigável do navegador atual. */
export function identificarNavegador(): string {
  if (typeof navigator === 'undefined') return 'Navegador Web'
  const ua = navigator.userAgent

  if (/Edg\//.test(ua)) return 'Microsoft Edge'
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return 'Google Chrome'
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari'
  if (/Firefox\//.test(ua)) return 'Mozilla Firefox'
  if (/Opera|OPR\//.test(ua)) return 'Opera'
  return 'Navegador Web'
}

/** Detecta o sistema operacional. */
export function identificarSistema(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo'
  const ua = navigator.userAgent

  if (/iPhone/.test(ua)) return 'iOS (iPhone)'
  if (/iPad/.test(ua)) return 'iPadOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows NT 10.0/.test(ua)) return 'Windows 10/11'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Dispositivo'
}

/** Retorna as informações do aparelho atual com validação honesta de servidor. */
export async function obterDispositivoAtual(): Promise<InfoDispositivo> {
  const compativel = suportaPush()
  const ativoServidor = compativel ? await inscricaoConfirmada() : false
  const pwa = isPwaStandalone()
  const sistema = identificarSistema()
  const navegador = identificarNavegador()

  let tipo: InfoDispositivo['tipo'] = 'desktop'
  if (/iPhone|Android.*Mobile/.test(navigator.userAgent)) tipo = 'smartphone'
  else if (/iPad|Android(?!.*Mobile)/.test(navigator.userAgent)) tipo = 'tablet'

  return {
    id: 'local-device',
    nome: `${sistema} · ${navegador}`,
    tipo,
    sistema,
    navegador,
    eEsteAparelho: true,
    pwaInstalada: pwa,
    statusServidor: !compativel ? 'sem-suporte' : ativoServidor ? 'ativo' : 'pendente',
    dataRegistro: 'Este aparelho'
  }
}

