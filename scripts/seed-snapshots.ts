import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Semente do banco de retratos.
 *
 * Existe para uma coisa só: deixar o aplicativo num estado em que dê para
 * fotografar as telas — inclusive as que só aparecem em situações incômodas de
 * produzir de propósito (a busca que não achou ninguém, o encaminhamento de
 * emergência, o atendimento fechado com anexos).
 *
 * Roda contra um banco descartável (`saudepet_snap`), nunca contra produção. É
 * proposital que ele derrube e recrie os dados a cada execução: retrato tem que
 * ser reproduzível, e dado acumulado de execução anterior sujaria a foto.
 */

const prisma = new PrismaClient();

const SENHA = 'snapshot123';

async function main() {
  const senha = await bcrypt.hash(SENHA, 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'retratos' },
    update: {},
    create: {
      nome: 'Saúde Pet — Retratos',
      slug: 'retratos',
      email: 'retratos@saudepet.app.br',
      telefone: '(17) 99999-0000',
      cidade: 'São José do Rio Preto',
      estado: 'SP',
      status: 'ativo'
    }
  });

  const tutor = await prisma.usuario.upsert({
    where: { id: 'tutor-retrato' },
    update: {},
    create: {
      id: 'tutor-retrato',
      tenant_id: tenant.id,
      nome: 'Marina Alves',
      email: 'marina@exemplo.com.br',
      senha,
      tipo_usuario: 'tutor',
      telefone: '(17) 98888-1234',
      cidade: 'São José do Rio Preto',
      estado: 'SP',
      endereco: 'Rua Bernardino de Campos, 1200',
      bairro: 'Centro',
      email_verificado: true,
      avaliacao_media: 4.8,
      total_avaliacoes: 6
    }
  });

  const usuarioVet = await prisma.usuario.upsert({
    where: { id: 'vet-usuario-retrato' },
    update: {},
    create: {
      id: 'vet-usuario-retrato',
      tenant_id: tenant.id,
      nome: 'Dr. Henrique Prado',
      email: 'henrique@exemplo.com.br',
      senha,
      tipo_usuario: 'veterinario',
      telefone: '(17) 97777-4321',
      cidade: 'São José do Rio Preto',
      estado: 'SP',
      email_verificado: true
    }
  });

  const veterinario = await prisma.veterinario.upsert({
    where: { usuario_id: usuarioVet.id },
    update: {},
    create: {
      tenant_id: tenant.id,
      usuario_id: usuarioVet.id,
      crmv: 'SP-12345',
      especialidade: 'Clínica geral de pequenos animais',
      aprovado_admin: true,
      online: true,
      latitude: -20.8113,
      longitude: -49.3758,
      avaliacao_media: 4.9
    }
  });

  const pet = await prisma.pet.upsert({
    where: { id: 'pet-retrato' },
    update: {},
    create: {
      id: 'pet-retrato',
      tenant_id: tenant.id,
      tutor_id: tutor.id,
      nome: 'Amora',
      tipo: 'cachorro',
      especie: 'cachorro',
      raca: 'Border Collie',
      idade: 4,
      peso: 16.4,
      sexo: 'femea',
      porte: 'medio',
      cor: 'preto e branco',
      pedigree: 'CBKC 2022/45118',
      castrado: true,
      microchip: '981020000123456',
      condicoes_preexistentes: 'Epilepsia idiopática, em controle com fenobarbital.',
      data_nascimento: new Date('2022-03-14')
    }
  });

  // Apaga só os atendimentos deste tenant: o retrato precisa ser reproduzível.
  await prisma.solicitacao.deleteMany({ where: { tenant_id: tenant.id } });

  const endereco = 'Rua Bernardino de Campos, 1200 — apto 42, bloco B';

  // 1. A busca que não encontrou ninguém.
  await prisma.solicitacao.create({
    data: {
      id: 'atend-sem-vet',
      tenant_id: tenant.id,
      tutor_id: tutor.id,
      pet_id: pet.id,
      tipo_atendimento: 'emergencia',
      status: 'sem_veterinario',
      localizacao_cliente: endereco,
      latitude: -20.8125,
      longitude: -49.3776,
      observacoes: 'Amora teve uma crise convulsiva há 20 minutos e está muito ofegante.',
      criado_em: new Date(Date.now() - 40 * 60 * 1000)
    }
  });

  // 2. O encaminhamento de emergência, com motivo e orientação em campo próprio.
  await prisma.solicitacao.create({
    data: {
      id: 'atend-encaminhado',
      tenant_id: tenant.id,
      tutor_id: tutor.id,
      pet_id: pet.id,
      veterinario_id: veterinario.id,
      tipo_atendimento: 'emergencia',
      status: 'encaminhado',
      localizacao_cliente: endereco,
      latitude: -20.8125,
      longitude: -49.3776,
      observacoes: 'Abdômen distendido e dor à palpação.',
      encaminhamento_motivo:
        'Abdômen agudo com suspeita de torção gástrica — precisa de radiografia e cirurgia.',
      encaminhamento_orientacao:
        'Leve agora ao Hospital Veterinário 24h da Av. Bady Bassitt, 3400. Avisei a equipe de lá; não ofereça água nem comida no caminho.',
      encaminhado_em: new Date(Date.now() - 3 * 60 * 60 * 1000),
      criado_em: new Date(Date.now() - 4 * 60 * 60 * 1000)
    }
  });

  // 3. Um atendimento fechado, com prontuário e mídia dos dois lados.
  const finalizado = await prisma.solicitacao.create({
    data: {
      id: 'atend-finalizado',
      tenant_id: tenant.id,
      tutor_id: tutor.id,
      pet_id: pet.id,
      veterinario_id: veterinario.id,
      tipo_atendimento: 'consulta_domiciliar',
      status: 'finalizado',
      localizacao_cliente: endereco,
      latitude: -20.8125,
      longitude: -49.3776,
      observacoes: 'Ferida na pata dianteira direita, lambendo bastante.',
      diagnostico: 'Dermatite acral por lambedura',
      finalizado_em: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      criado_em: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 3600000)
    }
  });

  await prisma.prontuarioEletronico.create({
    data: {
      tenant_id: tenant.id,
      atendimento_id: finalizado.id,
      pet_id: pet.id,
      veterinario_id: veterinario.id,
      queixa_principal: 'Lesão na face dorsal do membro torácico direito, com lambedura constante há cinco dias.',
      exame_fisico: 'Alerta, hidratada, TPC < 2s. Lesão ulcerada de 2 cm, bordas espessadas, sem secreção purulenta.',
      hipotese_diagnostica: 'Dermatite acral por lambedura (granuloma de lambedura).',
      diagnostico_definitivo: 'Dermatite acral por lambedura',
      orientacoes_tutor: 'Colar elizabetano por 14 dias. Limpeza com clorexidina 2% duas vezes ao dia. Retorno em 15 dias.',
      retorno_sugerido_em: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000)
    }
  });

  console.log('Retrato pronto.');
  console.log(`  tutor:        ${tutor.email} / ${SENHA}`);
  console.log(`  veterinário:  ${usuarioVet.email} / ${SENHA}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
