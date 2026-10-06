-- Seed data para Saúde Pet
-- Admin
INSERT INTO users (full_name, email, phone, role, "isActive", "createdAt", "updatedAt")
VALUES ('Administrador Sistema', 'admin@saudepet.com', '11987654321', 'admin', true, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Tutores
INSERT INTO tutors (nome, cpf, email, telefone, endereco, cidade, estado, cep, "isActive", created_at, updated_at)
VALUES
  ('Maria Silva', '12345678900', 'maria@email.com', '11911111111', 'Rua das Flores, 123', 'São Paulo', 'SP', '01234567', true, NOW(), NOW()),
  ('José Santos', '98765432100', 'jose@email.com', '11922222222', 'Av. Paulista, 456', 'São Paulo', 'SP', '01310100', true, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Veterinários
INSERT INTO veterinarians (nome, crmv, especialidade, email, telefone, bio, "isActive", created_at, updated_at)
VALUES
  ('Dr. Carlos Souza', 'CRMV-SP 12345', 'Clínica Geral', 'carlos@clinica.com', '11933333333', 'Veterinário com 10 anos de experiência', true, NOW(), NOW()),
  ('Dra. Ana Lima', 'CRMV-SP 67890', 'Cirurgia', 'ana@clinica.com', '11944444444', 'Especialista em cirurgias', true, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Resultados
SELECT 'Users' as tabela, COUNT(*) as total FROM users
UNION ALL
SELECT 'Tutors', COUNT(*) FROM tutors
UNION ALL
SELECT 'Veterinarians', COUNT(*) FROM veterinarians;
