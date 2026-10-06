/**
 * Complementa scripts/seed-test-db.js (tenant + vet aprovado) com um tutor,
 * um pet e uma solicitação em andamento atribuída a esse vet — o mínimo para
 * testar POST /solicitacoes/:id/ditar-prontuario ponta a ponta.
 *
 * Uso: DATABASE_URL="postgresql://postgres:postgres@localhost:5445/saudepet" node seed-teste-ditado.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'clinica-demo' } });
  if (!tenant) throw new Error('Rode scripts/seed-test-db.js primeiro');

  const veterinario = await prisma.veterinario.findFirst({ where: { tenant_id: tenant.id } });
  if (!veterinario) throw new Error('Veterinário de teste não encontrado');

  const senhaHash = await bcrypt.hash('SenhaSegura@123', 10);
  const tutor = await prisma.usuario.create({
    data: {
      tenant_id: tenant.id,
      nome: 'Tutora Teste',
      email: 'tutor.teste@test.com',
      telefone: '(11) 98888-0000',
      senha: senhaHash,
      tipo_usuario: 'tutor',
      cidade: 'São Paulo',
      email_verificado: true
    }
  });

  const pet = await prisma.pet.create({
    data: {
      tenant_id: tenant.id,
      tutor_id: tutor.id,
      nome: 'Rex',
      especie: 'Cão',
      raca: 'SRD',
      porte: 'médio'
    }
  });

  const solicitacao = await prisma.solicitacao.create({
    data: {
      tenant_id: tenant.id,
      tutor_id: tutor.id,
      veterinario_id: veterinario.id,
      pet_id: pet.id,
      tipo_atendimento: 'consulta_domiciliar',
      status: 'atendimento_em_andamento',
      observacoes: 'Vacina polivalente e checagem de rotina'
    }
  });

  console.log('✅ tutor:', tutor.email);
  console.log('✅ pet:', pet.nome, pet.id);
  console.log('✅ solicitacao:', solicitacao.id, solicitacao.status);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
