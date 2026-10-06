/**
 * Tamanho da letra escolhido pela pessoa.
 *
 * O app do tutor foi desenhado com texto entre 11 e 15 px — abaixo dos 16 px
 * que o navegador usa por padrão. Funciona para quem tem vista boa e exclui
 * quem não tem: um tutor idoso simplesmente não consegue ler o cadastro do
 * pet, e a única saída era o pinch-zoom, que desloca a tela e confunde.
 *
 * Como todo o espaçamento e tipografia do app é em `rem`, mexer na fonte-base
 * do documento aumenta a interface inteira em proporção — texto, respiro e
 * área de toque juntos. É diferente de "dar zoom": nada sai do lugar, o
 * layout continua inteiro na tela.
 */

const CHAVE = 'saudepet:tamanho-da-letra';

// `padrao` é 16px, o mesmo do navegador. Os outros dois sobem em passos que
// se percebem sem quebrar o layout de celular.
export const TAMANHOS = {
  padrao: { rotulo: 'Padrão', px: 16, descricao: 'Tamanho normal do aplicativo' },
  grande: { rotulo: 'Grande', px: 18, descricao: 'Textos e botões maiores' },
  maior: { rotulo: 'Maior', px: 20, descricao: 'Para quem tem dificuldade de leitura' }
} as const;

export type TamanhoDaLetra = keyof typeof TAMANHOS;

function tamanhoValido(valor: string | null): valor is TamanhoDaLetra {
  return valor !== null && valor in TAMANHOS;
}

export function tamanhoSalvo() {
  try {
    const valor = localStorage.getItem(CHAVE);
    return tamanhoValido(valor) ? valor : 'padrao';
  } catch {
    // Navegador com armazenamento bloqueado não pode impedir o app de abrir.
    return 'padrao';
  }
}

export function aplicarTamanho(chave: string): TamanhoDaLetra {
  const escolhido: TamanhoDaLetra = tamanhoValido(chave) ? chave : 'padrao';
  document.documentElement.style.fontSize = `${TAMANHOS[escolhido].px}px`;
  return escolhido;
}

export function salvarTamanho(chave: string): TamanhoDaLetra {
  const escolhido = aplicarTamanho(chave);
  try {
    localStorage.setItem(CHAVE, escolhido);
  } catch {
    // Preferência não persistida ainda vale para esta sessão.
  }
  return escolhido;
}

/** Aplica a preferência antes da primeira pintura, para não piscar. */
export function iniciarTamanhoDaLetra() {
  return aplicarTamanho(tamanhoSalvo());
}
