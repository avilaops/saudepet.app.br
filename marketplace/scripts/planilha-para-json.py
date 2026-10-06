#!/usr/bin/env python3
"""
Converte o levantamento de campo (.xlsx) no JSON que o seed do backend importa.

Por que existe um passo intermediário em vez de o Node ler o .xlsx direto: ler
planilha em Node exigiria uma dependência nova no backend (xlsx/exceljs) só para
rodar uma vez por fornecedor. O JSON gerado aqui fica versionado no repositório,
é revisável em diff e não precisa que ninguém tenha a planilha para reproduzir o
seed.

Uso:
    python marketplace/scripts/planilha-para-json.py \
        marketplace/dados/levantamento-fornecedor-01.xlsx \
        marketplace/dados/fornecedor-01-filhos-de-4-patas.json

O que a conversão decide (e por quê):

- **Espécie não é categoria.** A planilha traz "Ração cão" e "Ração gato" como
  categorias diferentes. Na plataforma isso vira UMA prateleira ("Ração") mais
  `especie_alvo`. Fosse categoria, quem tem cão e gato procuraria ração duas
  vezes.

- **Sem preço, sem vitrine.** O levantamento tem 175 itens e só 109 com preço de
  etiqueta. Os outros entram no catálogo como INATIVOS, com a pendência escrita
  em `nota_interna`. Publicar produto sem preço é convidar o tutor a chegar até o
  carrinho para descobrir que não dá.

- **O preço da etiqueta não é custo.** A coluna "Preço na loja" é o que a loja
  cobra hoje no balcão, e é esse o preço de venda no marketplace. `custo` e
  `margem_pct` ficam vazios até o fornecedor passar a tabela dele — inventar
  margem sobre um número que ninguém confirmou seria fabricar contabilidade.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("Instale openpyxl: pip install openpyxl")


# ── Normalização ─────────────────────────────────────────────────────────────

def sem_acento(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", str(texto or ""))
        if unicodedata.category(c) != "Mn"
    ).lower().strip()


def slug(texto: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", sem_acento(texto)).strip("-")
    return base[:60] or "produto"


# A prateleira da plataforma, com a espécie separada. As nove categorias são as
# mesmas criadas pela migração.
CATEGORIAS = {
    "racao cao": ("racao", "cao", False),
    "racao cao granel": ("racao", "cao", True),
    "racao gato": ("racao", "gato", False),
    "racao gato granel": ("racao", "gato", True),
    "alimento umido cao": ("alimento-umido", "cao", False),
    "alimento umido gato": ("alimento-umido", "gato", False),
    "petisco cao": ("petiscos", "cao", False),
    "petisco gato": ("petiscos", "gato", False),
    "higiene": ("higiene-e-banho", "ambos", False),
    "higiene e banho": ("higiene-e-banho", "ambos", False),
    "brinquedo": ("brinquedos", "ambos", False),
    "acessorio": ("acessorios", "ambos", False),
    "comedouro": ("acessorios", "ambos", False),
    "vestuario": ("acessorios", "ambos", False),
    "casa e conforto": ("casa-e-conforto", "ambos", False),
}

# A unidade da planilha é como a loja VENDE. A plataforma precisa dela para
# escrever "1 saco" em vez de "1 un" no carrinho.
UNIDADES = {
    "saco": "saco",
    "pacote": "pacote",
    "unidade": "un",
    "quilo": "kg",
    "sache": "sache",
    "sache ou caixa": "sache",
    "lata": "lata",
    "pote": "pote",
    "caixa": "caixa",
    "kit": "kit",
    "conjunto": "conjunto",
    "par": "par",
    "rolo": "rolo",
}

# Peso bruto, para frete e para a logística de retirada: saco de 15 kg não sai
# na mochila de ninguém.
PADRAO_PESO = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b", re.IGNORECASE)


def peso_em_gramas(tamanho: str):
    achado = PADRAO_PESO.search(str(tamanho or ""))
    if not achado:
        return None
    valor = float(achado.group(1).replace(",", "."))
    unidade = achado.group(2).lower()
    if unidade == "kg":
        return int(round(valor * 1000))
    if unidade == "g":
        return int(round(valor))
    # Líquido: 1 ml de ração úmida pesa perto de 1 g, e para frete isso basta.
    if unidade == "l":
        return int(round(valor * 1000))
    return int(round(valor))


def classificar_outros_animais(produto: str, variacao: str):
    """
    "Outros animais" na planilha é pássaro em três casos de quatro; o quarto é
    um suplemento vitamínico que não é ração de ninguém.
    """
    texto = sem_acento(f"{produto} {variacao}")
    if "suplemento" in texto or "vitamin" in texto:
        return ("medicamentos", "outros", False)
    granel = "granel" in texto or "por kg" in texto
    return ("racao", "passaro", granel)


def dinheiro(valor):
    if valor in (None, ""):
        return None
    try:
        return round(float(str(valor).replace(",", ".")), 2)
    except ValueError:
        return None


def limpo(valor):
    texto = str(valor or "").strip()
    return texto or None


def converter(caminho_planilha: Path):
    livro = openpyxl.load_workbook(caminho_planilha, data_only=True)
    aba = livro["Catálogo"]

    linhas = list(aba.iter_rows(values_only=True))
    cabecalho = [str(c or "").strip() for c in linhas[0]]

    produtos = []
    for linha in linhas[1:]:
        item = dict(zip(cabecalho, linha))
        identificador = str(item.get("ID") or "").strip()
        # "EX" é a linha de exemplo que a própria planilha manda apagar.
        if not identificador or identificador == "EX":
            continue

        categoria_planilha = sem_acento(item.get("Categoria"))
        if categoria_planilha == "outros animais":
            categoria, especie, granel = classificar_outros_animais(
                item.get("Produto"), item.get("Variação / Sabor")
            )
        else:
            categoria, especie, granel = CATEGORIAS.get(
                categoria_planilha, ("acessorios", "ambos", False)
            )

        tamanho = limpo(item.get("Peso / Tamanho"))
        variacao = limpo(item.get("Variação / Sabor"))
        marca = limpo(item.get("Marca"))
        nome_base = limpo(item.get("Produto")) or "Produto"
        unidade = UNIDADES.get(sem_acento(item.get("Unidade de venda")), "un")

        if unidade == "kg":
            granel = True

        preco = dinheiro(item.get("Preço na loja (R$)"))
        observacao = limpo(item.get("Observações"))

        # O nome que vai para a vitrine é o que a pessoa lê na prateleira:
        # marca + produto + tamanho. "CONFIRMAR" nunca entra no nome — é recado
        # interno, e apareceria na tela do tutor como se fosse parte do item.
        partes = [nome_base]
        if tamanho and "confirmar" not in sem_acento(tamanho):
            partes.append(tamanho)
        nome = " ".join(partes)

        pendencias = []
        if observacao and "confirmar" in sem_acento(observacao):
            pendencias.append(observacao)
        elif observacao:
            pendencias.append(observacao)
        if tamanho and "confirmar" in sem_acento(tamanho):
            pendencias.append(f'Peso/tamanho a confirmar: "{tamanho}"')
        if variacao and "confirmar" in sem_acento(variacao):
            pendencias.append("Sabor/variação a confirmar")
        if marca and "confirmar" in sem_acento(marca):
            pendencias.append("Marca a confirmar")
        if preco is None:
            pendencias.append("Sem preço no levantamento — cadastrar antes de publicar")

        produtos.append({
            "referencia": f"FOR01-{identificador.zfill(4)}",
            "nome": nome,
            "slug": slug(f"{marca or ''} {nome}"),
            "marca": None if (marca and "confirmar" in sem_acento(marca)) else marca,
            "variacao": None if (variacao and "confirmar" in sem_acento(variacao)) else variacao,
            "tamanho": None if (tamanho and "confirmar" in sem_acento(tamanho)) else tamanho,
            "categoria_slug": categoria,
            "especie_alvo": especie,
            "unidade": unidade,
            "granel": granel,
            "peso_gramas": peso_em_gramas(tamanho),
            "preco": preco,
            "custo": dinheiro(item.get("Custo fornecedor (R$)")),
            "margem_pct": dinheiro(item.get("Margem")),
            "ean": limpo(item.get("Código de barras (EAN)")),
            "estoque": int(item["Estoque"]) if str(item.get("Estoque") or "").strip().isdigit() else 0,
            # Sem preço não vai para a vitrine. Fica no catálogo do lojista, com
            # a pendência escrita, esperando o número.
            "ativo": preco is not None,
            "nota_interna": " · ".join(pendencias) or None,
            "foto_referencia": limpo(item.get("Foto")),
        })

    return produtos


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)

    entrada, saida = Path(sys.argv[1]), Path(sys.argv[2])
    produtos = converter(entrada)

    pacote = {
        "fornecedor": {
            "referencia": "FOR01",
            "nome_fantasia": "Casa de Rações Filhos de 4 Patas",
            "cidade": "Ribeirão Preto",
            "estado": "SP",
            "telefone": "(16) 99428-8613",
        },
        "levantamento": {
            "data": "2026-08-26",
            "origem": "50 fotos tiradas na loja; preços são etiquetas visíveis nas fotos",
            "total_itens": len(produtos),
            "com_preco": sum(1 for p in produtos if p["preco"] is not None),
            "sem_preco": sum(1 for p in produtos if p["preco"] is None),
        },
        "produtos": produtos,
    }

    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(pacote, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"{len(produtos)} produtos -> {saida}")
    print(f"  com preço: {pacote['levantamento']['com_preco']}")
    print(f"  sem preço (inativos): {pacote['levantamento']['sem_preco']}")


if __name__ == "__main__":
    main()
