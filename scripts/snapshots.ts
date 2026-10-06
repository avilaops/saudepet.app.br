import { chromium, devices, type Page } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';

/**
 * Retratos das telas.
 *
 * Serve para olhar o que foi construído sem depender de alguém abrir o
 * aplicativo no celular e mandar print. Sobe o Chrome já instalado na máquina
 * (`channel: 'chrome'` — nada de baixar navegador), entra como tutor e como
 * veterinário no ambiente local, e fotografa as telas uma a uma.
 *
 * Roda contra o banco de retratos (`saudepet_snap`, semeado por
 * `seed-snapshots.ts`), nunca contra produção: fotografar cliente real seria
 * expor dado de saúde de terceiro num arquivo PNG.
 *
 * Uso:
 *   1. `npx tsx scripts/seed-snapshots.ts`   (com DATABASE_URL do banco de retratos)
 *   2. backend em :3000 e vite em :5173
 *   3. `npx tsx scripts/snapshots.ts`
 */

const BASE = process.env.SNAPSHOT_BASE_URL || 'http://localhost:5173';
const SAIDA = process.env.SNAPSHOT_DIR || path.join(process.cwd(), 'snapshots');
const SENHA = 'snapshot123';

type Retrato = {
  nome: string;
  caminho: string;
  /** Espera algo aparecer antes de fotografar — tela em branco não é retrato. */
  espera?: string;
  antes?: (page: Page) => Promise<void>;
};

const DO_TUTOR: Retrato[] = [
  { nome: '01-tutor-home', caminho: '/tutor', espera: 'text=Chamar' },
  {
    nome: '02-solicitar-passo1-limites',
    caminho: '/tutor/solicitar',
    espera: 'text=tipo de atendimento'
  },
  {
    nome: '03-solicitar-passo2-anexos',
    caminho: '/tutor/solicitar',
    espera: 'text=tipo de atendimento',
    antes: async (page) => {
      await page.getByText('Emergência 24h').click();
      await page.getByRole('button', { name: /Avançar para Pet/i }).click();
      await page.waitForSelector('text=Fotos, vídeo ou áudio');
    }
  },
  {
    nome: '04-busca-sem-veterinario',
    caminho: '/tutor/acompanhar/atend-sem-vet',
    espera: 'text=Nenhum veterinário disponível'
  },
  {
    nome: '05-encaminhamento-emergencia',
    caminho: '/tutor/acompanhar/atend-encaminhado',
    espera: 'text=Procure um serviço de emergência'
  },
  { nome: '06-meus-pets', caminho: '/tutor/pets', espera: 'text=Amora' },
  {
    nome: '07-cadastro-do-pet-completo',
    caminho: '/tutor/pets',
    espera: 'text=Amora',
    antes: async (page) => {
      await page.getByRole('button', { name: /editar/i }).first().click();
      await page.waitForSelector('text=Condições preexistentes');
    }
  },
  { nome: '08-perfil-do-tutor', caminho: '/tutor/perfil', espera: 'text=Data de nascimento' },
  { nome: '09-prontuario-do-pet', caminho: '/tutor/historico', espera: 'text=Amora' }
];

const DO_VETERINARIO: Retrato[] = [
  { nome: '10-vet-home', caminho: '/veterinario', espera: 'text=plantão' },
  { nome: '11-vet-historico-avaliar-tutor', caminho: '/veterinario/historico', espera: 'text=Como foi atender aqui' }
];

async function entrar(page: Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', SENHA);
  await page.getByRole('button', { name: /entrar/i }).first().click();
  await page.waitForURL(/\/(tutor|veterinario)/, { timeout: 20000 });
}

async function fotografar(page: Page, retratos: Retrato[]) {
  const feitos: string[] = [];

  for (const retrato of retratos) {
    try {
      await page.goto(`${BASE}${retrato.caminho}`, { waitUntil: 'domcontentloaded' });
      if (retrato.antes) await retrato.antes(page);
      if (retrato.espera) await page.waitForSelector(retrato.espera, { timeout: 12000 });
      // Um instante para a fonte assentar e o mapa desenhar o primeiro quadro.
      await page.waitForTimeout(900);
      const arquivo = path.join(SAIDA, `${retrato.nome}.png`);
      await page.screenshot({ path: arquivo, fullPage: true });
      feitos.push(retrato.nome);
      console.log(`  ✓ ${retrato.nome}`);
    } catch (erro) {
      // Uma tela que falha não pode levar o álbum inteiro junto.
      const mensagem = erro instanceof Error ? erro.message.split('\n')[0] : String(erro);
      console.log(`  ✗ ${retrato.nome} — ${mensagem}`);
    }
  }

  return feitos;
}

async function main() {
  await mkdir(SAIDA, { recursive: true });

  const navegador = await chromium.launch({ channel: 'chrome', headless: true });
  const contexto = await navegador.newContext({
    ...devices['iPhone 13 Pro'],
    locale: 'pt-BR',
    // O aplicativo pede GPS na tela de endereço; sem posição concedida, a tela
    // ficaria presa no aviso de permissão negada em vez de mostrar o mapa.
    permissions: ['geolocation'],
    geolocation: { latitude: -20.8125, longitude: -49.3776 }
  });

  const page = await contexto.newPage();

  console.log('Tutor:');
  await entrar(page, 'marina@exemplo.com.br');
  const doTutor = await fotografar(page, DO_TUTOR);

  console.log('Veterinário:');
  await contexto.clearCookies();
  await page.evaluate(() => localStorage.clear()).catch(() => {});
  await entrar(page, 'henrique@exemplo.com.br');
  const doVet = await fotografar(page, DO_VETERINARIO);

  await navegador.close();

  console.log(`\n${doTutor.length + doVet.length} retratos em ${SAIDA}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
