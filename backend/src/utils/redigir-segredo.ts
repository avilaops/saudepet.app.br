/**
 * Remove segredo de texto antes de ele chegar ao log.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * Em 28/08/2026 um relatório colado num canal interno trouxe, junto com a
 * saída de comandos de produção, uma string de conexão com senha e uma
 * credencial de demonstração. O caminho é sempre o mesmo: alguém copia a
 * saída de um erro ou de um script, e o segredo viaja de carona.
 *
 * O middleware de erro registra `err.message` como a biblioteca escreveu. A
 * maioria das bibliotecas mascara a senha, mas nem todas, e basta uma para o
 * segredo entrar no arquivo de log e depois num relatório.
 *
 * ── O que este módulo NÃO faz ─────────────────────────────────────────────
 *
 * Não desliga log. Diagnóstico é o que permite consertar produção, e log
 * mudo custa mais caro que log cuidadoso. O que sai é só o VALOR do segredo:
 * host, porta, nome do banco, usuário e a mensagem inteira continuam, porque
 * é com isso que se descobre o que quebrou.
 */

/** O que substitui o valor. Curto e reconhecível na leitura do log. */
const MASCARA = '***';

/**
 * Cada padrão preserva o contexto e apaga só o segredo.
 *
 * A ordem importa: o primeiro que casar num trecho vence, então os mais
 * específicos vêm antes dos genéricos.
 */
const PADROES: Array<[RegExp, string]> = [
  // postgres://usuario:SENHA@host:5432/banco  ->  postgres://usuario:***@host:5432/banco
  // Mantém o esquema, o usuário e o destino, que é o que serve para depurar.
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@]+@/gi, `$1:${MASCARA}@`],

  // Authorization: Bearer <token>  |  Basic <base64>
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${MASCARA}`],

  // senha=..., password: "...", secret=..., api_key: '...', token=...
  // Aceita = ou :, com ou sem aspas, e para no primeiro separador.
  [
    /\b(senha|password|passwd|secret|api[_-]?key|apikey|token|authorization|auth)\b(\s*[:=]\s*)(["']?)([^"'\s,;&}]{4,})\3/gi,
    `$1$2$3${MASCARA}$3`
  ],

  // Chaves com prefixo conhecido, que aparecem soltas no meio do texto.
  [/\b(sk|pk|rk|whsec|xoxb|ghp|gho|glpat)[-_][A-Za-z0-9_-]{12,}/g, `$1_${MASCARA}`],

  // Chave VAPID e JWT soltos: três blocos base64 separados por ponto.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, `eyJ${MASCARA}`]
];

/**
 * Devolve o texto sem os valores sensíveis.
 *
 * Entrada que não é texto volta como veio: quem chama costuma passar
 * `err.message`, que em erro malformado pode ser `undefined`.
 */
export function redigirSegredo<T>(valor: T): T {
  if (typeof valor !== 'string') return valor;

  let texto: string = valor;
  for (const [padrao, troca] of PADROES) {
    texto = texto.replace(padrao, troca);
  }
  return texto as unknown as T;
}

/**
 * Aplica a redação em profundidade, para objeto que vai inteiro para o log.
 *
 * O limite de profundidade evita que uma estrutura cíclica (Request do
 * Express, por exemplo) trave o processo dentro do próprio tratador de erro,
 * que é o pior lugar possível para travar.
 */
export function redigirObjeto(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 4) return '[profundo demais]';
  if (typeof valor === 'string') return redigirSegredo(valor);
  if (valor === null || typeof valor !== 'object') return valor;

  if (Array.isArray(valor)) {
    return valor.map((item) => redigirObjeto(item, profundidade + 1));
  }

  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
    // Campo cujo NOME já diz que é segredo sai mascarado inteiro, sem depender
    // de o valor casar com algum padrão.
    if (/^(senha|password|passwd|secret|token|authorization|auth|api[_-]?key|apikey|cookie|set-cookie)$/i.test(chave)) {
      saida[chave] = MASCARA;
      continue;
    }
    saida[chave] = redigirObjeto(item, profundidade + 1);
  }
  return saida;
}

export default redigirSegredo;
