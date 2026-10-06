# Operacao do Saude Pet no n8n

## Identidade compartilhada

- Credencial: `Saude Pet - Identidade de Automacao`
- Header: `x-saude-pet-automation-key`
- Segredo: `N8N_AUTOMATION_API_KEY`, apenas no backend e no cofre do n8n
- Base: `https://saudepet.app.br/api/v1/automation`

O PostgreSQL do Saude Pet e a fonte de verdade. Data Tables do n8n guardam
somente estado de orquestracao, deduplicacao, tentativas e proxima acao.

## Portas unicas

- WhatsApp e SMS: `Messageria - Enviar`
- E-mail: `Conector: e-mail padrao`
- Falhas: `Handler de Erro Central -> Todoist`

## Data Tables

- `saudepet_rastreio_estado`
- `saudepet_funil_curitiba`
- `saudepet_eventos_notificacao`

## Fluxos previstos

1. `Saude Pet - Rastreio CepCerto`
2. `Saude Pet - Funil Curitiba`
3. `Saude Pet - Eventos e Notificacoes`
4. `Saude Pet - Lembretes de Cuidado`
5. `Saude Pet - Relatorio Operacional`
6. `Saude Pet - Conteudo e SEO`

Todo envio deve respeitar consentimento, horario adequado e minimizacao de
dados. Mensagens externas nao incluem diagnostico, medicacao, prontuario ou
outro dado clinico sensivel.

