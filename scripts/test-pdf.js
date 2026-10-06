const axios = require('axios');

async function testPdf() {
  try {
    const res = await axios.post('https://saudepet.app.br/api/v1/pdf/receita', {
      protocolo: 'TEST-123',
      nomeTutor: 'Nicolas Rosa',
      nomePet: 'Thor',
      especiePet: 'Cão',
      racaPet: 'Golden Retriever',
      pesoPet: '32.5',
      nomeVet: 'Dra. Camila Silva',
      crmvVet: '12345',
      ufCrmv: 'SP',
      medicamentos: [
        { nome: 'Amoxicilina + Clavulanato 250mg', posologia: '1 comprimido a cada 12 horas por 10 dias' },
        { nome: 'Meloxicam 2.5mg', posologia: '1 comprimido a cada 24 horas por 5 dias' }
      ],
      orientacoes: 'Manter repouso e manter água fresca disponível.'
    });

    console.log('🎉 Resposta da API de PDF:', res.data);
  } catch (err) {
    console.error('❌ Erro no teste de PDF:', err.response?.data || err.message);
  }
}

testPdf();
