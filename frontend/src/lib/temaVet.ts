/**
 * Modo escuro do aplicativo do veterinário.
 *
 * O interruptor existia em Configurações e só valia enquanto aquela tela
 * estivesse aberta: o `useEffect` que ligava a classe também a removia no
 * `return` de limpeza. Bastava tocar em "voltar" e o app clareava de novo —
 * o que faz o vet achar que a preferência não salvou.
 *
 * O tema é decisão do aplicativo inteiro, então mora aqui e é aplicado no
 * arranque, antes da primeira pintura.
 */

const CHAVE = 'saudepet_vet_preferences';
const CLASSE = 'vet-dark-mode';

export interface PreferenciasVet {
  push: boolean;
  dark: boolean;
  location: boolean;
}

export function preferenciasVet(): PreferenciasVet {
  try {
    return { push: true, dark: false, location: false, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') };
  } catch {
    // Armazenamento bloqueado não pode impedir o app de abrir.
    return { push: true, dark: false, location: false };
  }
}

export function aplicarTemaVet(escuro: boolean) {
  document.documentElement.classList.toggle(CLASSE, Boolean(escuro));
  return Boolean(escuro);
}

export function salvarPreferenciasVet(preferencias: PreferenciasVet) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(preferencias));
  } catch {
    // Preferência não persistida ainda vale para esta sessão.
  }
  return aplicarTemaVet(preferencias.dark);
}

/** Aplica o tema salvo no arranque, para não piscar claro antes de escurecer. */
export function iniciarTemaVet() {
  return aplicarTemaVet(preferenciasVet().dark);
}
