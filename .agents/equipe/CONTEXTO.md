# Contexto verificavel

- Identificador: `avila-saudepet-app-br`.
- Origem: raiz deste checkout; nao depende de um caminho absoluto.
- Fontes encontradas: `package.json`, `AGENTS.md`.
- Gerenciador declarado: nao declarado no package.json; conferir lockfile e regras locais.

## Estrutura observada

- `automations/`
- `backend/`
- `content/`
- `deploy/`
- `docs/`
- `frontend/`
- `marketplace/`
- `scripts/`
- `tests/`
- `transcricao-service/`

## Scripts de verificacao declarados

- `verificar:dados-falsos`: `tsx scripts/verificar-dados-falsos.mts`
- `verificar:rotas`: `tsx scripts/verificar-rotas.mts`

Esta lista e um retrato de 15/10/2026, nao uma prova de que os comandos passaram.
Confirme os comandos e seus efeitos antes de executa-los. Alguns testes dependem de servicos externos.
Nao execute deploy, migracao ou envio como parte de uma consulta de status.
