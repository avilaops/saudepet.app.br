/**
 * Script para criar banco de dados de teste
 * Uso: npx tsx scripts/create-test-db.ts
 */

const { Client } = require('pg');

async function createTestDatabase() {
  // Conectar ao banco postgres (padrão)
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres'
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    // Verificar se o banco já existe
    const checkResult = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'saudepet_test'"
    );

    if (checkResult.rows.length > 0) {
      console.log('⚠️  Banco saudepet_test já existe');
      console.log('🗑️  Removendo banco existente...');

      // Desconectar outros usuários
      await client.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = 'saudepet_test'
          AND pid <> pg_backend_pid();
      `);

      // Dropar banco
      await client.query('DROP DATABASE saudepet_test');
      console.log('✅ Banco removido');
    }

    // Criar banco de teste
    await client.query('CREATE DATABASE saudepet_test');
    console.log('✅ Banco saudepet_test criado com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao criar banco de teste:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createTestDatabase();

export {};
