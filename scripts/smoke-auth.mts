#!/usr/bin/env node
/**
 * Smoke da política de acesso (Saúde Pet v1.0 — Auth) contra um ambiente REAL.
 *
 * Percorre o coração de `politica-acesso.service.js` no caminho negativo e no
 * positivo, com HTTP puro contra a API já publicada:
 *
 *   1. cadastra um veterinário            → 201, sem access_token
 *   2. login antes de confirmar o e-mail  → 403
 *   3. confirma o e-mail (token do e-mail) e tenta de novo, sem aprovação → 403
 *   4. admin aprova                        → 200
 *   5. login                               → 200 (guarda o refresh token)
 *   6. admin suspende                      → 200
 *   7. refresh e login                     → 403 nos dois
 *   8. admin reativa                       → 200
 *   9. login                               → 200
 *  10. (opcional) admin apaga a conta de teste
 *
 * Uso:
 *   API_URL=https://api.saudepet.app.br/api/v1 \
 *   ADMIN_EMAIL=... ADMIN_SENHA=... \
 *   npx tsx scripts/smoke-auth.mts
 *
 * Variáveis:
 *   API_URL            base da API versionada (padrão http://localhost:3000/api/v1)
 *   ADMIN_EMAIL/SENHA  admin do tenant (obrigatórios)
 *   TENANT_SLUG        padrão "saudepet"
 *   SMOKE_EMAIL        e-mail da conta de teste (padrão smoke-vet+<timestamp>@<SMOKE_DOMINIO>)
 *   SMOKE_DOMINIO      domínio que RECEBE e-mail de verdade, para você copiar o token (padrão example.com)
 *   VERIFY_TOKEN       token do link de verificação; se ausente, o script pede no terminal
 *   VERIFY_TOKEN_CMD   alternativa: comando de shell que imprime o token (ex.: um psql no
 *                      banco de homologação); {email} é substituído pelo e-mail da conta
 *   LIMPAR=false       não apaga a conta ao final
 *
 * O passo 3 precisa do token que chega POR E-MAIL (`/verify-email?token=...`).
 * Sem SMTP em produção o backend imprime o link no log; copie o `token` de lá.
 *
 * Sai com código 1 na primeira asserção que falhar. Nunca imprime senhas.
 */
import readline from 'node:readline/promises';
import { execSync } from 'node:child_process';
import { stdin, stdout } from 'node:process';

const API = (process.env.API_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '');
const TENANT = process.env.TENANT_SLUG || 'saudepet';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_SENHA = process.env.ADMIN_SENHA;
const LIMPAR = process.env.LIMPAR !== 'false';

if (!ADMIN_EMAIL || !ADMIN_SENHA) {
  console.error('✖ Defina ADMIN_EMAIL e ADMIN_SENHA.');
  process.exit(2);
}

const carimbo = Date.now();
const VET = {
  nome: `Smoke Vet ${carimbo}`,
  email: process.env.SMOKE_EMAIL || `smoke-vet+${carimbo}@${process.env.SMOKE_DOMINIO || 'example.com'}`,
  telefone: `(11) 9${String(carimbo).slice(-8)}`,
  senha: `Smoke@${carimbo}`,
  crmv: String(carimbo).slice(-5),
  crmv_uf: 'SP',
  especialidade: 'Clínica geral (smoke)'
};

let passo = 0;
const falhas = [];

function ok(cond, rotulo, extra) {
  passo += 1;
  const tag = cond ? '✔' : '✖';
  console.log(`${tag} ${String(passo).padStart(2, '0')} ${rotulo}${extra ? ` — ${extra}` : ''}`);
  if (!cond) {
    falhas.push(rotulo);
    throw new Error(rotulo);
  }
}

async function http(metodo, rota, { corpo, token } = {}) {
  const res = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  let dados = null;
  try { dados = await res.json(); } catch { /* corpo vazio */ }
  return { status: res.status, dados };
}

const resumo = (r) => `${r.status}${r.dados?.error ? ` "${r.dados.error}"` : ''}`;

async function login(email, senha) {
  return http('POST', '/auth/login', { corpo: { email, senha, tenant_slug: TENANT } });
}

async function obterTokenDeVerificacao() {
  if (process.env.VERIFY_TOKEN) return process.env.VERIFY_TOKEN.trim();
  if (process.env.VERIFY_TOKEN_CMD) {
    const cmd = process.env.VERIFY_TOKEN_CMD.replaceAll('{email}', VET.email);
    return execSync(cmd, { encoding: 'utf-8' }).trim();
  }
  if (!stdin.isTTY) {
    throw new Error('Passo 3 precisa de VERIFY_TOKEN (token do e-mail de verificação) fora de um terminal interativo');
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const token = (await rl.question(`   → Cole o token do link de verificação enviado para ${VET.email}: `)).trim();
  rl.close();
  return token;
}

async function acharVeterinarioNaFila(adminToken) {
  const r = await http('GET', `/admin/veterinarios?search=${encodeURIComponent(VET.email)}&limit=5`, { token: adminToken });
  const vet = (r.dados?.veterinarios || []).find((v) => v.usuario?.email === VET.email);
  return { r, vet };
}

let adminToken = null;
let usuarioId = null;

async function main() {
  console.log(`Smoke Auth v1.0 → ${API} (tenant ${TENANT})`);
  console.log(`Conta de teste: ${VET.email}\n`);

  // Admin
  const a = await login(ADMIN_EMAIL, ADMIN_SENHA);
  ok(a.status === 200 && a.dados?.access_token, 'admin faz login', resumo(a));
  ok(['admin', 'super_admin'].includes(a.dados.usuario?.tipo_usuario), 'credencial informada é de administrador', a.dados.usuario?.tipo_usuario);
  adminToken = a.dados.access_token;

  // 1. Cadastro
  const cad = await http('POST', '/auth/register', {
    corpo: { ...VET, tipo_usuario: 'veterinario', tenant_slug: TENANT }
  });
  ok(cad.status === 201, 'cadastro de veterinário aceito', resumo(cad));
  ok(cad.dados.access_token === null && cad.dados.refresh_token === null, 'cadastro NÃO devolve sessão ao veterinário');
  usuarioId = cad.dados.usuario?.id;

  // 2. Login antes de confirmar e-mail
  const l1 = await login(VET.email, VET.senha);
  ok(l1.status === 403, 'login antes da confirmação de e-mail é barrado', resumo(l1));

  // 3. Confirma e-mail; sem aprovação continua barrado
  const token = await obterTokenDeVerificacao();
  const ve = await http('POST', '/auth/verify-email', { corpo: { token } });
  ok(ve.status === 200, 'e-mail confirmado', resumo(ve));
  const l2 = await login(VET.email, VET.senha);
  ok(l2.status === 403 && /aprovad/i.test(l2.dados?.error || ''), 'e-mail confirmado mas sem aprovação: barrado como pendente', resumo(l2));

  // 4. Aprova
  const { r: fila, vet } = await acharVeterinarioNaFila(adminToken);
  ok(Boolean(vet), 'veterinário aparece na fila do admin', vet ? `status ${vet.status_credenciamento}, CRMV ${vet.crmv}/${vet.crmv_uf}` : resumo(fila));
  ok(vet.crmv_uf === 'SP', 'UF do CRMV persistida');
  const ap = await http('POST', `/admin/veterinarios/${vet.id}/aprovar`, { token: adminToken, corpo: { observacao: 'smoke' } });
  ok(ap.status === 200, 'admin aprova', resumo(ap));

  // 5. Login permitido
  const l3 = await login(VET.email, VET.senha);
  ok(l3.status === 200 && l3.dados.access_token && l3.dados.refresh_token, 'login aprovado + confirmado entra', resumo(l3));
  ok(l3.dados.usuario?.senha === undefined, 'resposta do login não carrega o hash da senha');
  const refreshAprovado = l3.dados.refresh_token;
  const me = await http('GET', '/veterinarios/meus-dados', { token: l3.dados.access_token });
  ok(me.status === 200 && me.dados?.status_credenciamento === 'APPROVED', 'área do veterinário responde', resumo(me));

  // 6. Suspende
  const su = await http('POST', `/admin/veterinarios/${vet.id}/suspender`, { token: adminToken, corpo: { motivo: 'smoke' } });
  ok(su.status === 200, 'admin suspende', resumo(su));

  // 7. Refresh e login barrados; access token antigo também cai
  const rf = await http('POST', '/auth/refresh', { corpo: { refresh_token: refreshAprovado } });
  ok(rf.status === 403 || rf.status === 401, 'refresh do suspenso é barrado', resumo(rf));
  const l4 = await login(VET.email, VET.senha);
  ok(l4.status === 403 && /bloquead/i.test(l4.dados?.error || ''), 'login do suspenso é barrado como bloqueada', resumo(l4));
  const meSusp = await http('GET', '/veterinarios/meus-dados', { token: l3.dados.access_token });
  ok(meSusp.status === 401, 'access token emitido antes da suspensão deixa de valer', resumo(meSusp));

  // 8. Reativa
  const re = await http('POST', `/admin/veterinarios/${vet.id}/reativar`, { token: adminToken, corpo: { motivo: 'smoke' } });
  ok(re.status === 200, 'admin reativa', resumo(re));

  // 9. Login permitido de novo
  const l5 = await login(VET.email, VET.senha);
  ok(l5.status === 200 && l5.dados.access_token, 'login depois da reativação entra', resumo(l5));

  // Auditoria registrou o ciclo
  const aud = await http('GET', `/admin/auditoria/logs?search=${vet.id}&limite=50`, { token: adminToken });
  if (aud.status === 200) {
    const acoes = JSON.stringify(aud.dados);
    const tem = ['veterinario_aprovado', 'veterinario_suspenso', 'veterinario_reativado'].filter((acao) => acoes.includes(acao));
    console.log(`ℹ  auditoria encontrou: ${tem.join(', ') || 'nenhuma das três ações (confira o filtro da rota)'}`);
  } else {
    console.log(`ℹ  auditoria não consultada (${resumo(aud)})`);
  }

  console.log('\nℹ  Google com veterinário pendente/suspenso não dá para automatizar aqui (OAuth interativo).');
  console.log('   Faça à mão: suspenda este vet, entre pelo Google com o mesmo e-mail → deve responder 403.\n');
}

async function limpar() {
  if (!LIMPAR || !adminToken || !usuarioId) return;
  const del = await http('DELETE', `/admin/usuarios/${usuarioId}`, { token: adminToken });
  console.log(del.status === 200 ? `🧹 conta de teste removida (${usuarioId})` : `⚠  não removeu a conta de teste: ${resumo(del)} — apague ${VET.email} à mão`);
}

try {
  await main();
  await limpar();
  console.log(`\n✅ Smoke Auth v1.0: ${passo} verificações passaram.`);
  process.exit(0);
} catch (erro) {
  console.error(`\n❌ Smoke Auth v1.0 falhou em: ${erro.message}`);
  if (LIMPAR) console.error('   A conta de teste NÃO foi apagada, para você investigar.');
  process.exit(1);
}
