/**
 * Guarda da preferência de tamanho da letra (frontend).
 *
 * Vive no backend porque é aqui que roda o Jest do projeto. O módulo é puro:
 * lê e escreve `document.documentElement.style` e o localStorage.
 */
const path = require('path');
const fs = require('fs');

const MODULO = path.join(__dirname, '..', '..', '..', '..', 'frontend', 'src', 'lib', 'acessibilidade.ts');

describe('Preferência de tamanho da letra', () => {
  const fonte = fs.readFileSync(MODULO, 'utf8');

  it('o padrão é 16px — o mesmo do navegador, não um valor menor', () => {
    expect(fonte).toMatch(/padrao:\s*\{\s*rotulo:\s*'Padrão',\s*px:\s*16/);
  });

  it('oferece degraus maiores para quem tem dificuldade de leitura', () => {
    expect(fonte).toMatch(/grande:.*px:\s*18/s);
    expect(fonte).toMatch(/maior:.*px:\s*20/s);
  });

  it('escreve na fonte-base do documento, escalando o app inteiro em rem', () => {
    expect(fonte).toMatch(/document\.documentElement\.style\.fontSize/);
  });

  it('valor inválido no armazenamento cai no padrão, sem quebrar o app', () => {
    expect(fonte).toMatch(/tamanhoValido\(valor\)\s*\?\s*valor\s*:\s*'padrao'/);
  });

  it('armazenamento bloqueado não impede o app de abrir', () => {
    // Navegador em modo restrito lança ao tocar no localStorage.
    const leitura = fonte.slice(fonte.indexOf('export function tamanhoSalvo'), fonte.indexOf('export function aplicarTamanho'));
    expect(leitura).toMatch(/catch\s*\{/);
  });

  it('a preferência é aplicada antes da primeira pintura', () => {
    const main = fs.readFileSync(path.join(path.dirname(MODULO), '..', 'main.tsx'), 'utf8');
    const posInicio = main.indexOf('iniciarTamanhoDaLetra()');
    const posRender = main.indexOf('createRoot');
    expect(posInicio).toBeGreaterThan(-1);
    expect(posInicio).toBeLessThan(posRender);
  });

  it('os campos de formulário ficam em 16px no celular — abaixo disso o iOS dá zoom sozinho', () => {
    const css = fs.readFileSync(path.join(path.dirname(MODULO), '..', 'index.css'), 'utf8');
    expect(css).toMatch(/@media screen and \(max-width: 820px\)/);
    expect(css).toMatch(/font-size:\s*16px\s*!important/);
  });
});

export {};
