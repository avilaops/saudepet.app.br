async function makeRequest(endpoint, method = 'POST', data) {
  const response = await fetch(`http://localhost:3001/api${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.log(`⚠️  ${endpoint}: ${error}`);
    return null;
  }
  
  return response.json();
}

async function main() {
  console.log('🌱 Populando banco de dados via API...\n');

  // Admin
  console.log('👤 Criando admin...');
  const admin = await makeRequest('/users', 'POST', {
    full_name: 'Administrador Sistema',
    email: 'admin@saudepet.com',
    phone: '(11) 98765-4321',
    role: 'admin',
  });
  if (admin) console.log(`✅ Admin: ${admin.email}`);

  // Tutores
  console.log('\n👥 Criando tutores...');
  const tutor1 = await makeRequest('/tutors', 'POST', {
    nome: 'Maria Silva',
    cpf: '12345678900',
    email: 'maria@email.com',
    telefone: '11911111111',
    endereco: 'Rua das Flores, 123',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01234567',
  });
  if (tutor1) console.log(`✅ Tutor: ${tutor1.nome}`);

  const tutor2 = await makeRequest('/tutors', 'POST', {
    nome: 'José Santos',
    cpf: '98765432100',
    email: 'jose@email.com',
    telefone: '11922222222',
    endereco: 'Av. Paulista, 456',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01310100',
  });
  if (tutor2) console.log(`✅ Tutor: ${tutor2.nome}`);

  // Veterinários
  console.log('\n⚕️  Criando veterinários...');
  const vet1 = await makeRequest('/veterinarians', 'POST', {
    nome: 'Dr. Carlos Souza',
    crmv: 'CRMV-SP 12345',
    especialidade: 'Clínica Geral',
    email: 'carlos@clinica.com',
    telefone: '11933333333',
    bio: 'Veterinário com 10 anos de experiência',
  });
  if (vet1) console.log(`✅ Veterinário: ${vet1.nome}`);

  const vet2 = await makeRequest('/veterinarians', 'POST', {
    nome: 'Dra. Ana Lima',
    crmv: 'CRMV-SP 67890',
    especialidade: 'Cirurgia',
    email: 'ana@clinica.com',
    telefone: '11944444444',
    bio: 'Especialista em cirurgias',
  });
  if (vet2) console.log(`✅ Veterinário: ${vet2.nome}`);

  // Pets (se tutores foram criados)
  if (tutor1 && tutor1.id) {
    console.log('\n🐕 Criando pets...');
    const pet1 = await makeRequest('/pets', 'POST', {
      nome: 'Rex',
      especie: 'Cachorro',
      raca: 'Labrador',
      sexo: 'Macho',
      data_nascimento: '2020-01-15',
      peso: '25.5',
      cor: 'Amarelo',
      tutor_id: tutor1.id,
    });
    if (pet1) console.log(`✅ Pet: ${pet1.nome}`);
  }

  if (tutor2 && tutor2.id) {
    const pet2 = await makeRequest('/pets', 'POST', {
      nome: 'Miau',
      especie: 'Gato',
      raca: 'Siamês',
      sexo: 'Fêmea',
      data_nascimento: '2021-05-20',
      peso: '4.2',
      cor: 'Branco e Marrom',
      tutor_id: tutor2.id,
    });
    if (pet2) console.log(`✅ Pet: ${pet2.nome}`);
  }

  console.log('\n✅ Seed concluído!');
}

main().catch(console.error);
