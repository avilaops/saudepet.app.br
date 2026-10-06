const prisma = require('../../src/config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ═══════════════════════════════════════════════════════
// FIXTURES - Dados de teste reutilizáveis
// ═══════════════════════════════════════════════════════

const fixtures = {
  // Tenants
  tenants: {
    clinicaDemo: {
      id: 'tenant-demo-1',
      nome: 'Clínica Demo',
      slug: 'clinica-demo',
      status: 'ativo',
      plano: 'premium',
      email: 'contato@clinicademo.com',
      telefone: '11999999999',
      cidade: 'São Paulo',
      estado: 'SP'
    },
    clinicaTeste: {
      id: 'tenant-test-2',
      nome: 'Clínica Teste',
      slug: 'clinica-teste',
      status: 'ativo',
      plano: 'basic',
      email: 'test@clinicateste.com',
      telefone: '11888888888',
      cidade: 'Rio de Janeiro',
      estado: 'RJ'
    }
  },

  // Usuários
  usuarios: {
    admin: {
      id: 'admin-1',
      tenant_id: 'tenant-demo-1',
      nome: 'Admin Teste',
      email: 'admin@test.com',
      telefone: '11999990001',
      senha: 'Admin@123',
      tipo_usuario: 'admin',
      cidade: 'São Paulo',
      email_verificado: true
    },
    tutor: {
      id: 'tutor-1',
      tenant_id: 'tenant-demo-1',
      nome: 'João Silva',
      email: 'joao@test.com',
      telefone: '11999990002',
      senha: 'Tutor@123',
      tipo_usuario: 'tutor',
      cidade: 'São Paulo',
      email_verificado: true
    },
    veterinario: {
      id: 'vet-1',
      tenant_id: 'tenant-demo-1',
      nome: 'Dr. Pedro Santos',
      email: 'pedro@test.com',
      telefone: '11999990003',
      senha: 'Vet@123',
      tipo_usuario: 'veterinario',
      cidade: 'São Paulo',
      email_verificado: true
    },
    superAdmin: {
      id: 'super-admin-1',
      tenant_id: null,
      nome: 'Super Admin',
      email: 'super@test.com',
      telefone: '11999990004',
      senha: 'Super@123',
      tipo_usuario: 'super_admin',
      cidade: 'São Paulo',
      email_verificado: true
    }
  },

  // Pets
  pets: {
    rex: {
      id: 'pet-1',
      tenant_id: 'tenant-demo-1',
      tutor_id: 'tutor-1',
      nome: 'Rex',
      tipo: 'cachorro',
      raca: 'Labrador',
      idade: 3,
      peso: 25.5
    },
    mimi: {
      id: 'pet-2',
      tenant_id: 'tenant-demo-1',
      tutor_id: 'tutor-1',
      nome: 'Mimi',
      tipo: 'gato',
      raca: 'Persa',
      idade: 2,
      peso: 4.2
    }
  },

  // Formulários
  formularios: {
    preConsulta: {
      id: 'form-1',
      tenant_id: 'tenant-demo-1',
      titulo: 'Pré-Consulta',
      tipo: 'pre_consulta',
      status: 'ativo',
      obrigatorio: true,
      campos: [
        {
          id: 'motivo',
          tipo: 'textarea',
          label: 'Motivo da consulta',
          obrigatorio: true
        },
        {
          id: 'urgencia',
          tipo: 'select',
          label: 'Nível de urgência',
          opcoes: ['Baixa', 'Média', 'Alta'],
          obrigatorio: true
        }
      ]
    },
    anamnese: {
      id: 'form-2',
      tenant_id: 'tenant-demo-1',
      titulo: 'Anamnese Completa',
      tipo: 'anamnese',
      status: 'ativo',
      campos: [
        {
          id: 'historico',
          tipo: 'textarea',
          label: 'Histórico de saúde',
          obrigatorio: true
        }
      ]
    }
  },

  // Transações
  transacoes: {
    pagamentoAtendimento: {
      id: 'trans-1',
      tenant_id: 'tenant-demo-1',
      tipo: 'pagamento_atendimento',
      status: 'concluida',
      valor_total: 150.00,
      valor_tutor: 150.00,
      valor_veterinario: 127.50,
      valor_plataforma: 22.50,
      percentual_plataforma: 15,
      metodo_pagamento: 'pix'
    }
  }
};

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Gerar senha hash
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

/**
 * Gerar token JWT de teste
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      tipo_usuario: user.tipo_usuario,
      tenant_id: user.tenant_id
    },
    process.env.JWT_SECRET || 'test-secret-key',
    { expiresIn: '1d' }
  );
}

/**
 * Criar usuário de teste com senha hash
 */
async function createTestUser(userData) {
  const hashedPassword = await hashPassword(userData.senha);
  return {
    ...userData,
    senha: hashedPassword
  };
}

/**
 * Gerar dados de teste com senhas hash
 */
async function getHashedFixtures() {
  const hashedUsuarios = {};
  
  for (const [key, user] of Object.entries(fixtures.usuarios)) {
    hashedUsuarios[key] = await createTestUser(user);
  }

  return {
    ...fixtures,
    usuarios: hashedUsuarios
  };
}

// ═══════════════════════════════════════════════════════
// BUILDERS - Para criar dados de teste dinamicamente
// ═══════════════════════════════════════════════════════

const builders = {
  tenant: (overrides = {}) => ({
    id: `tenant-${Date.now()}`,
    nome: 'Clínica Teste',
    slug: `clinica-${Date.now()}`,
    status: 'ativo',
    plano: 'basic',
    email: `test-${Date.now()}@test.com`,
    telefone: '11999999999',
    cidade: 'São Paulo',
    estado: 'SP',
    ...overrides
  }),

  usuario: (overrides = {}) => ({
    id: `user-${Date.now()}`,
    tenant_id: 'tenant-demo-1',
    nome: 'Usuario Teste',
    email: `user-${Date.now()}@test.com`,
    telefone: `119999${Date.now().toString().slice(-5)}`,
    senha: 'Test@123',
    tipo_usuario: 'tutor',
    cidade: 'São Paulo',
    email_verificado: false,
    ...overrides
  }),

  pet: (overrides = {}) => ({
    id: `pet-${Date.now()}`,
    tenant_id: 'tenant-demo-1',
    tutor_id: 'tutor-1',
    nome: 'Pet Teste',
    tipo: 'cachorro',
    raca: 'SRD',
    idade: 1,
    peso: 10.0,
    ...overrides
  }),

  formulario: (overrides = {}) => ({
    id: `form-${Date.now()}`,
    tenant_id: 'tenant-demo-1',
    titulo: 'Formulário Teste',
    tipo: 'custom',
    status: 'ativo',
    campos: [
      {
        id: 'campo1',
        tipo: 'texto',
        label: 'Campo Teste',
        obrigatorio: false
      }
    ],
    ...overrides
  }),

  transacao: (overrides = {}) => ({
    id: `trans-${Date.now()}`,
    tenant_id: 'tenant-demo-1',
    tipo: 'pagamento_atendimento',
    status: 'pendente',
    valor_total: 100.00,
    percentual_plataforma: 15,
    ...overrides
  })
};

module.exports = {
  fixtures,
  builders,
  hashPassword,
  generateToken,
  createTestUser,
  getHashedFixtures
};
