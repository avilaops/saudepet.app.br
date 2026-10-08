/**
 * `require('modulo').default` num módulo que exporta com `module.exports = X`
 * devolve `undefined` — e o TypeScript aceita, porque o arquivo também declara
 * `export default`.
 *
 * Foram dois em produção, achados em 08/10/2026 no primeiro teste de ponta a
 * ponta com contas reais: o fechamento do atendimento não gerava receita nem
 * prontuário, e a retificação de receita respondia erro 500 depois de já ter
 * gravado a correção. Nenhum teste pegava, porque os testes simulavam os dois
 * módulos.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../src');

function arquivos(pasta: string): string[] {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
    const caminho = path.join(pasta, item.name);
    return item.isDirectory() ? arquivos(caminho) : caminho.endsWith('.ts') ? [caminho] : [];
  });
}

describe('importação por .default', () => {
  it('ninguém lê .default de um require cujo módulo exporta com module.exports', () => {
    const problemas: string[] = [];
    const padrao = /require\(\s*['"]([^'"]+)['"]\s*\)(?:\s+as\s+typeof\s+import\([^)]*\))?\s*\)?\s*\.default\b/g;

    for (const arquivo of arquivos(SRC)) {
      const texto = fs.readFileSync(arquivo, 'utf8');
      for (const achado of texto.matchAll(padrao)) {
        if (!achado[1].startsWith('.')) continue; // pacote de terceiros: outro contrato
        const alvo = path.resolve(path.dirname(arquivo), achado[1]) + '.ts';
        if (!fs.existsSync(alvo)) continue;
        const fonte = fs.readFileSync(alvo, 'utf8');
        const exportaInstancia = /^module\.exports\s*=/m.test(fonte);
        const tambemComoDefault = /^module\.exports\.default\s*=/m.test(fonte);
        if (exportaInstancia && !tambemComoDefault) {
          problemas.push(`${path.relative(SRC, arquivo)} lê .default de ${path.relative(SRC, alvo)}`);
        }
      }
    }

    expect(problemas).toEqual([]);
  });

  it('os dois serviços que quebraram entregam o que quem chama espera', () => {
    const pdf = require('../../src/services/pdf.service');
    const auditoria = require('../../src/services/audit.service');

    expect(typeof pdf.gerarReceitaPdf).toBe('function');
    expect(pdf.default).toBe(pdf);
    expect(typeof auditoria.logForensicEvent).toBe('function');
  });
});
