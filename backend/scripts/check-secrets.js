const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.includes('node_modules/') && !file.endsWith('.lock'));

const patterns = [
  /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\b\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i,
  /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_\-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/
];

const findings = [];
for (const file of tracked) {
  if (/\.example$/i.test(file) || /(^|\/)tests?\//i.test(file) || /\.old\.js$/i.test(file)) continue;
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 2_000_000) continue;
  let content;
  try {
    content = fs.readFileSync(absolute, 'utf8');
  } catch {
    continue;
  }
  content.split(/\r?\n/).forEach((line, index) => {
    if (patterns.some((pattern) => pattern.test(line)) && !/SUA_CHAVE|PLACEHOLDER|process\.env/i.test(line)) {
      findings.push(`${file}:${index + 1}`);
    }
  });
}

if (findings.length) {
  console.error('Possíveis credenciais versionadas encontradas (valores ocultos):');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('Nenhum padrão de credencial hardcoded foi encontrado nos arquivos rastreados.');
