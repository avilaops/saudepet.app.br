# Acervo editorial do Saúde Pet

[Abrir a galeria unificada](index.html) · [Direção visual](../BLOG_DIRECAO_VISUAL.md) · [Calendário anual](../BLOG_CALENDARIO_ANUAL.md)

**Em 13/09/2026:** 62 artes finais, 52 âncoras completas, oito capas de perguntas, quatro coleções e sete proporções. A
[coleção inicial](2026-09-12/README.md) tem 12 artes; a [segunda coleção](2026-09-12-ancoras/README.md), 42.
O [lote de perguntas](2026-09-13-perguntas/README.md) acrescenta PER-001 a PER-004.
O [segundo lote de perguntas](2026-09-13-perguntas-2/README.md) acrescenta PER-005 a PER-008.
As âncoras aparecem na ordem dos IDs do calendário, seguidas das demais famílias.

O acervo reúne as artes finais das coleções em `docs/blog-artes/*/entregas.json`. A galeria tem busca por tema, linguagem ou ID e filtros por coleção e formato. Os PNGs aparecem inteiros, com suas dimensões e texto alternativo; abrir ou baixar uma imagem preserva o arquivo original.

A galeria é um artefato local de criação. As informações de associação ao post e publicação continuam nos manifestos de cada coleção. A existência da arte aqui não indica publicação no blog.

## Regenerar

Na raiz do repositório, com Node.js 24:

```powershell
node scripts/gerar-galeria-blog-artes.ts
```

Alternativa com o `tsx` já instalado no projeto:

```powershell
npx tsx scripts/gerar-galeria-blog-artes.ts
```

O script não usa dependências externas, não gera imagens e só escreve `docs/blog-artes/index.html`. Pode ser executado de qualquer diretório pelo caminho absoluto. A galeria abre diretamente no navegador, sem servidor. Regenerar com os mesmos manifestos produz o mesmo HTML.

## Adicionar uma coleção

Salve o manifesto em uma nova subpasta de `docs/blog-artes/`. Use o mesmo formato da [primeira coleção](2026-09-12/entregas.json):

```json
{
  "colecao": "Nome da coleção",
  "data": "2026-09-12",
  "imagens": [
    {
      "id": "ID-DO-CALENDARIO",
      "tema": "Tema do post",
      "linguagem": "Linguagem visual utilizada",
      "proporcao_nominal": "3:2",
      "caminho": "frontend/public/blog-media/editorial/colecao/arquivo.png",
      "largura": 1536,
      "altura": 1024,
      "texto_alternativo": "Descrição objetiva da cena e dos elementos relevantes.",
      "status": "gerada_localmente",
      "publicada": false,
      "associada_ao_post": false
    }
  ]
}
```

O campo `caminho` é relativo à raiz do repositório. O gerador verifica que o PNG existe, permanece dentro do repositório e possui as dimensões informadas. Os links das coleções abrem seu `index.html`, quando existe, ou o manifesto. Não é preciso criar uma galeria individual para incluir outra coleção.

O registro pelo `scripts/registrar-arte-blog.ts` ocorre depois da inspeção visual manual do PNG gerado. **Execute um registro por vez, aguardando o comando terminar antes de registrar a próxima arte.** O registrador compartilha o manifesto e seu arquivo temporário e não usa trava entre processos; registros simultâneos podem perder entradas. A repetição sequencial da mesma arte, com o mesmo ID, caminho e hash, é idempotente.

Só entram registros com status `gerada_localmente`, `final` ou `aprovada`, sem `final: false`. Os demais são excluídos da galeria e da contagem. Registre rascunhos e versões anteriores em `historico`, ou marque-os com `final: false`; o total declarado no manifesto não substitui a contagem dos arquivos finais verificados.

Cada ID pode ter uma única arte final no conjunto das coleções. IDs finais duplicados interrompem a geração com a localização dos dois registros. Ao substituir uma versão, marque a antiga com `final: false`; assim o histórico permanece e o total não cresce artificialmente. Uma falha de validação preserva a galeria anterior.

As proporções nominais são filtros de navegação. A largura e a altura reais são as usadas na imagem, sem recorte para encaixar um formato nominal.
