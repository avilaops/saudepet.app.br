const authSchema = require('../../../src/schemas/auth.schema');
const petSchema = require('../../../src/schemas/pet.schema');
const formularioSchema = require('../../../src/schemas/formulario.schema');
const billingSchema = require('../../../src/schemas/billing.schema');

describe('Validation Schemas - Unit', () => {
  describe('authSchema.register', () => {
    it('deve validar dados corretos de registro', () => {
      const validData = {
        nome: 'João Silva',
        email: 'joao@test.com',
        telefone: '(11) 99999-9999',
        senha: 'Senha@123',
        tipo_usuario: 'tutor',
        cidade: 'São Paulo',
        tenant_slug: 'clinica-demo'
      };

      const result = authSchema.registerSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar email inválido', () => {
      const invalidData = {
        nome: 'João Silva',
        email: 'email-invalido',
        telefone: '(11) 99999-9999',
        senha: 'Senha@123',
        tipo_usuario: 'tutor',
        cidade: 'São Paulo'
      };

      const result = authSchema.registerSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toContain('email');
    });

    it('deve rejeitar senha fraca', () => {
      const invalidData = {
        nome: 'João Silva',
        email: 'joao@test.com',
        telefone: '(11) 99999-9999',
        senha: '123', // Muito curta
        tipo_usuario: 'tutor',
        cidade: 'São Paulo'
      };

      const result = authSchema.registerSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('deve rejeitar tipo_usuario inválido', () => {
      const invalidData = {
        nome: 'João Silva',
        email: 'joao@test.com',
        telefone: '(11) 99999-9999',
        senha: 'Senha@123',
        tipo_usuario: 'invalido', // Tipo não permitido
        cidade: 'São Paulo'
      };

      const result = authSchema.registerSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('deve rejeitar cadastro sem senha — o default saudepet123 não pode voltar', () => {
      // Até 20/08/2026 o schema completava senha ausente com 'saudepet123':
      // toda conta criada só com o e-mail nascia com a mesma senha conhecida.
      const semSenha = {
        nome: 'João da Silva',
        email: 'joao@test.com'
      };

      const result = authSchema.registerSchema.safeParse(semSenha);

      expect(result.success).toBe(false);
      expect(result.error.issues.some((issue) => issue.path.includes('senha'))).toBe(true);
    });

    it('deve rejeitar cadastro sem nome — nada de "Tutor Saúde PET" automático', () => {
      const semNome = {
        email: 'joao@test.com',
        senha: 'Senha@123'
      };

      const result = authSchema.registerSchema.safeParse(semNome);

      expect(result.success).toBe(false);
      expect(result.error.issues.some((issue) => issue.path.includes('nome'))).toBe(true);
    });

    it('deve exigir CRMV quando o cadastro é de veterinário', () => {
      const vetSemCrmv = {
        nome: 'Dra. Ana',
        email: 'ana@test.com',
        senha: 'Senha@123',
        tipo_usuario: 'veterinario'
      };

      const result = authSchema.registerSchema.safeParse(vetSemCrmv);

      expect(result.success).toBe(false);
      expect(result.error.issues.some((issue) => issue.path.includes('crmv'))).toBe(true);
    });

    it('não inventa telefone, cidade nem CRMV quando não informados', () => {
      const minimo = {
        nome: 'João da Silva',
        email: 'joao@test.com',
        senha: 'Senha@123'
      };

      const result = authSchema.registerSchema.safeParse(minimo);

      expect(result.success).toBe(true);
      expect(result.data.telefone).toBeUndefined();
      expect(result.data.cidade).toBeUndefined();
      expect(result.data.crmv).toBeUndefined();
    });

    it('deve rejeitar e-mail faltando', () => {
      const invalidData = {
        senha: 'Senha@123'
        // email é o único campo sem default
      };

      const result = authSchema.registerSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error.issues.length).toBeGreaterThan(0);
    });
  });

  describe('petSchema.create', () => {
    it('deve validar dados corretos de pet', () => {
      const validData = {
        nome: 'Rex',
        tipo: 'cachorro',
        raca: 'Labrador',
        idade: 3,
        peso: 25.5
      };

      const result = petSchema.createPetSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar peso negativo', () => {
      const invalidData = {
        nome: 'Rex',
        tipo: 'cachorro',
        raca: 'Labrador',
        idade: 3,
        peso: -10 // Peso negativo
      };

      const result = petSchema.createPetSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('deve rejeitar idade negativa', () => {
      const invalidData = {
        nome: 'Rex',
        tipo: 'cachorro',
        raca: 'Labrador',
        idade: -1, // Idade negativa
        peso: 10
      };

      const result = petSchema.createPetSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('formularioSchema.create', () => {
    it('deve validar formulário correto', () => {
      const validData = {
        titulo: 'Formulário de Anamnese',
        tipo: 'anamnese',
        campos: [
          {
            id: 'campo1',
            tipo: 'texto',
            label: 'Nome do campo',
            obrigatorio: true
          }
        ]
      };

      const result = formularioSchema.createFormularioSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar campos vazios', () => {
      const invalidData = {
        titulo: 'Formulário',
        tipo: 'custom',
        campos: [] // Array vazio não permitido
      };

      const result = formularioSchema.createFormularioSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('billingSchema.criarPagamento', () => {
    it('deve validar pagamento correto', () => {
      const validData = {
        atendimento_id: '123e4567-e89b-12d3-a456-426614174000',
        valor_total: 150.00,
        metodo_pagamento: 'pix'
      };

      const result = billingSchema.criarPagamentoSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('deve rejeitar valor zero', () => {
      const invalidData = {
        atendimento_id: '123e4567-e89b-12d3-a456-426614174000',
        valor_total: 0, // Valor zero não permitido
        metodo_pagamento: 'pix'
      };

      const result = billingSchema.criarPagamentoSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('deve rejeitar método de pagamento inválido', () => {
      const invalidData = {
        atendimento_id: '123e4567-e89b-12d3-a456-426614174000',
        valor_total: 100.00,
        metodo_pagamento: 'invalido' // Método não permitido
      };

      const result = billingSchema.criarPagamentoSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });
});
