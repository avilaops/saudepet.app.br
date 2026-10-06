# Pipeline editorial Saúde Pet 2027

O estado operacional da fila fica no n8n, na Data Table `saudepet_blog_editorial_2027` (ID `WAub4XkIWn76sy2o`). Ela contém as 365 datas, horários, pautas, metadados SEO, caminhos das artes e status editorial.

O primeiro orquestrador está criado no n8n:

- **Nome:** Saúde Pet - Pipeline Editorial 2027
- **ID:** `iShsvzJWwrBV13V3`
- **URL:** https://n8n.avilaops.com/workflow/iShsvzJWwrBV13V3
- **Estado:** ativo com execução manual e diária; o gate final impede publicação sem aprovação
- **Etapa atual:** lê a fila completa, valida campos obrigatórios e separa os próximos itens por estágio (`gerar_imagem`, `redigir_texto` ou `revisar`)
- **Falhas:** encaminhadas ao Handler de Erro Central `dtk7UwKorqvDIqfu`

## Próximas etapas do fluxo

1. Selecionar o lote devido ou solicitado.
2. Chamar a redação existente e gravar título, texto, resumo, slug e SEO.
3. Gerar ou associar a arte principal e a imagem social.
4. Encaminhar temas clínicos para revisão veterinária.
5. Gerar previews de artigo, Google, WhatsApp, Facebook e Instagram.
6. Aguardar aprovação editorial.
7. Publicar no blog e atualizar cards, Open Graph e `/llms-full.txt`.
8. Registrar artigo publicado, data, revisão e próxima atualização na Data Table.

## Operação consolidada no n8n

- **Saúde Pet - Editorial 2027 - Fluxo mestre** (`zUIfjOPkqHhCgTlb`): reúne leitura, validação, redação Groq, aprovação automática de marketing, autenticação do robô, criação e agendamento do artigo no CMS para 08:00 de `America/Sao_Paulo`, registro do retorno e relatório por e-mail. Possui execução manual e gatilho diário às 08:00.

Os seis workflows Saúde Pet anteriores foram arquivados depois da incorporação. `Conteúdo - Redigir post (Groq)` e `Conector: e-mail padrão` permanecem como dependências compartilhadas chamadas pelo mestre, e não como operações separadas do Saúde Pet.
- O mestre também monta um relatório de cada ciclo e o envia pelo conector `Conector: e-mail padrão` para `abraao@avilaops.com` e `nicolas@avilaops.com`, usando o SMTP de `mail.avilaops.com`.

Todos os módulos estão inativos e encaminham falhas para o Handler de Erro Central.

Os scripts versionados em `scripts/` continuam como fonte reproduzível e backup local. O n8n é o operador do processo; nenhum post foi publicado automaticamente nesta etapa.
