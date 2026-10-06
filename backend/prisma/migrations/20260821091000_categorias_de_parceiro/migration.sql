-- Categorias de serviço dos parceiros.
--
-- `PartnerService.categoryId` é obrigatório e a tabela nascia vazia: mesmo com a
-- rota de cadastro de serviço pronta, não havia como cadastrar serviço nenhum
-- porque não existia uma única categoria no banco. Estas são as categorias
-- padrão da rede; o painel permite criar outras.
INSERT INTO "partner_categories" ("id", "name", "slug", "description", "icon", "active", "displayOrder", "createdAt")
VALUES
  ('cat_consulta',   'Consulta veterinária', 'consulta-veterinaria', 'Consultas clínicas em unidade',                  'stethoscope', true, 1,  NOW()),
  ('cat_exames',     'Exames laboratoriais', 'exames-laboratoriais', 'Sangue, urina, fezes e afins',                   'flask',       true, 2,  NOW()),
  ('cat_imagem',     'Diagnóstico por imagem','diagnostico-por-imagem','Raio-X, ultrassom, tomografia',                 'scan',        true, 3,  NOW()),
  ('cat_cirurgia',   'Cirurgia',             'cirurgia',             'Procedimentos cirúrgicos',                        'scalpel',     true, 4,  NOW()),
  ('cat_internacao', 'Internação',           'internacao',           'Internação e observação',                         'bed',         true, 5,  NOW()),
  ('cat_vacinacao',  'Vacinação',            'vacinacao',            'Vacinas e reforços',                              'syringe',     true, 6,  NOW()),
  ('cat_odonto',     'Odontologia',          'odontologia',          'Limpeza e tratamento dentário',                   'tooth',       true, 7,  NOW()),
  ('cat_reabilita',  'Reabilitação',         'reabilitacao',         'Fisioterapia e reabilitação',                     'activity',    true, 8,  NOW()),
  ('cat_farmacia',   'Farmácia',             'farmacia',             'Medicamentos e manipulados',                      'pill',        true, 9,  NOW()),
  ('cat_banho',      'Banho e tosa',         'banho-e-tosa',         'Higiene e estética',                              'scissors',    true, 10, NOW())
ON CONFLICT ("slug") DO NOTHING;
