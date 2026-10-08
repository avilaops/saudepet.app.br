/**
 * Seed mínimo da v1.0 (multi-tenant).
 *
 * `seed.ts` é anterior ao multi-tenant e não roda mais: faz `upsert` por
 * `email`, que deixou de ser único (a unicidade é `tenant_id + email`). Este
 * cria o tenant "saudepet" com configuração e três contas de exemplo —
 * idempotente, pode rodar quantas vezes quiser.
 *
 *   DATABASE_URL=... npx tsx prisma/seed-v1.ts
 *
 * Senhas são de desenvolvimento. Troque no primeiro acesso em produção — ou
 * melhor, não rode este seed em produção: crie o admin por `SEED_ADMIN_*`.
 */
import { PrismaClient, type TipoUsuario } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TENANT_SLUG = process.env.SEED_TENANT_SLUG || 'saudepet';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@saudepet.com';
const ADMIN_SENHA = process.env.SEED_ADMIN_SENHA || 'admin123';

interface NovoUsuario {
  nome: string;
  email: string;
  senha: string;
  telefone: string;
  tipo_usuario: TipoUsuario;
  cidade: string;
}

async function usuario(tenant_id: string, dados: NovoUsuario) {
  const senha = await bcrypt.hash(dados.senha, 10);
  return prisma.usuario.upsert({
    where: { tenant_id_email: { tenant_id, email: dados.email } },
    update: {},
    create: { ...dados, senha, tenant_id, email_verificado: true }
  });
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: {
      nome: 'Saúde Pet',
      slug: TENANT_SLUG,
      email: 'contato@saudepet.app.br',
      telefone: '(11) 99999-0000',
      cidade: 'São Paulo',
      estado: 'SP',
      configuracoes: { create: {} }
    }
  });
  console.log(`✅ tenant "${tenant.slug}" (${tenant.id})`);

  const admin = await usuario(tenant.id, {
    nome: 'Administrador', email: ADMIN_EMAIL, senha: ADMIN_SENHA,
    telefone: '(11) 99999-9999', tipo_usuario: 'admin', cidade: 'São Paulo'
  });
  console.log(`✅ admin ${admin.email}`);

  const tutor = await usuario(tenant.id, {
    nome: 'Maria Silva', email: 'tutor@exemplo.com', senha: 'tutor123',
    telefone: '(11) 98888-8888', tipo_usuario: 'tutor', cidade: 'São Paulo'
  });
  console.log(`✅ tutor ${tutor.email} / tutor123`);

  const petExistente = await prisma.pet.findFirst({ where: { tutor_id: tutor.id, nome: 'Rex' } });
  if (!petExistente) {
    await prisma.pet.create({
      data: { tenant_id: tenant.id, tutor_id: tutor.id, nome: 'Rex', tipo: 'cachorro', especie: 'cachorro', raca: 'Labrador', idade: 5, peso: 30.5, sexo: 'macho', porte: 'grande' }
    });
    console.log('✅ pet Rex');
  }

  const vetUsuario = await usuario(tenant.id, {
    nome: 'Dr. João Santos', email: 'vet@exemplo.com', senha: 'vet123',
    telefone: '(11) 97777-7777', tipo_usuario: 'veterinario', cidade: 'São Paulo'
  });
  await prisma.veterinario.upsert({
    where: { usuario_id: vetUsuario.id },
    update: {},
    create: {
      tenant_id: tenant.id, usuario_id: vetUsuario.id,
      crmv: '12345', crmv_uf: 'SP', especialidade: 'Clínica Geral',
      aprovado_admin: true, status_credenciamento: 'APPROVED'
    }
  });
  console.log(`✅ veterinário aprovado ${vetUsuario.email} / vet123`);
}

main()
  .catch((erro: Error) => { console.error('❌ seed falhou:', erro.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
