const fs = require('fs');
const path = require('path');

/**
 * Guarda de cobertura da trilha de auditoria.
 *
 * O ROADMAP pedia "confirmar que o AuditLog cobre todas as ações sensíveis,
 * não só uma parte". A verificação de 20/08/2026 encontrou onze controllers
 * com escrita sensível e ZERO chamada de auditoria — aprovar veterinário,
 * punir usuário, trocar credencial de pagamento e suspender organização
 * aconteciam sem deixar rastro de quem fez.
 *
 * Este teste não valida comportamento em tempo de execução: ele impede a
 * regressão silenciosa de alguém remover o registro de uma ação irreversível.
 * Aceita as três formas em uso — `AuditService.logForensicEvent`, o atalho
 * `AuditService.log` e o `prisma.auditLog.create` embutido na transação (este
 * é o mais forte, porque grava junto com a mudança).
 */

const SRC = path.join(__dirname, '..', '..', '..', 'src');
const CONTROLLERS = path.join(SRC, 'controllers');

/**
 * Lê um arquivo da fonte pelo nome SEM extensão.
 *
 * Este teste travava a cada arquivo migrado para TypeScript: ele abria
 * `audit.service.js` por caminho fixo e passou a estourar ENOENT no dia em que
 * o serviço virou `.ts` — um teste de auditoria falhando por motivo que não
 * tem nada a ver com auditoria. Como a migração da Fase 1 vai passar por todos
 * os onze controllers da lista abaixo, resolver a extensão aqui evita repetir
 * o mesmo conserto onze vezes.
 */
function lerFonte(...partes) {
  const base = path.join(...partes);
  for (const ext of ['.ts', '.js']) {
    if (fs.existsSync(base + ext)) return fs.readFileSync(base + ext, 'utf8');
  }
  return null;
}

// Ação irreversível ou de dinheiro → o arquivo que a executa.
const ACOES_SENSIVEIS = [
  ['admin-veterinario.controller', 'aprovar, rejeitar e suspender credenciamento de veterinário'],
  ['moderacao.controller', 'aplicar e revogar punição de usuário'],
  ['gateway.controller', 'cadastrar e remover credenciais de pagamento'],
  ['tenant.controller', 'suspender, cancelar e remover organização'],
  ['admin-financeiro.controller', 'estornar pagamento'],
  ['partner.controller', 'aprovar e rejeitar parceiro'],
  ['commission.controller', 'criar regra de comissão'],
  ['admin-user.controller', 'alterar privilégios e revogar sessões'],
  ['ficha-clinica.controller', 'corrigir e remover registro clínico'],
  ['content-admin.controller', 'publicar e apagar conteúdo'],
  ['admin-cidade.controller', 'alterar regras comerciais e cobertura']
];

const registraAuditoria = (fonte) =>
  /AuditService\s*\.\s*log(ForensicEvent)?\s*\(/.test(fonte) ||
  /logForensicEvent\s*\(/.test(fonte) ||
  /prisma\.auditLog\.create|auditLog\.create\s*\(/.test(fonte);

describe('Cobertura da trilha de auditoria', () => {
  it.each(ACOES_SENSIVEIS)('%s registra auditoria (%s)', (arquivo) => {
    const fonte = lerFonte(CONTROLLERS, arquivo);
    expect(fonte).not.toBeNull();
    expect(registraAuditoria(fonte)).toBe(true);
  });

  it('a retificação de receita continua auditada', () => {
    const fonte = lerFonte(CONTROLLERS, 'solicitacao.controller');
    expect(fonte).toMatch(/prescricao\.retificada_apos_finalizacao/);
  });

  it('o serviço de auditoria grava a ação no campo certo do modelo', () => {
    // `acao` é o campo do schema; mandar `action` fazia o Prisma recusar o
    // create inteiro e todo evento pericial se perdia em silêncio.
    const fonte = lerFonte(SRC, 'services', 'audit.service');
    expect(fonte).toMatch(/acao:\s*action/);
  });
});

export {};
