"""Renomeia as fotos tratadas, grava EXIF/XMP (título, descrição, palavras-chave)
e gera o manifesto fotos-fornecedor-01.json + atualiza o JSON do fornecedor."""
import json, os, sys, shutil, re
from PIL import Image

SP, JSON_PRODUTOS, DESTINO = sys.argv[1], sys.argv[2], sys.argv[3]
mapa = json.load(open(os.path.join(SP, "mapa-recortes.json"), encoding="utf-8"))
dados = json.load(open(JSON_PRODUTOS, encoding="utf-8"))
produtos = {p["referencia"]: p for p in dados["produtos"]}
loja = dados["fornecedor"]["nome_fantasia"]
cidade = f'{dados["fornecedor"]["cidade"]}/{dados["fornecedor"]["estado"]}'
os.makedirs(DESTINO, exist_ok=True)

ESPECIE = {"cao": "cães", "gato": "gatos", "ambos": "cães e gatos", "passaro": "pássaros", "outros": "animais"}
CATEG = {"racao": "Ração", "alimento-umido": "Alimento úmido", "petiscos": "Petisco", "higiene-e-banho": "Higiene e banho",
         "acessorios": "Acessório", "brinquedos": "Brinquedo", "casa-e-conforto": "Casa e conforto", "medicamentos": "Medicamento"}

def nome_arquivo(p):
    return f'{p["referencia"].lower()}-{p["slug"]}'[:110]

def textos(p):
    partes = [p["nome"]]
    if p.get("variacao"): partes.append(p["variacao"])
    titulo = " - ".join(partes)
    m = (p.get("marca") or "").split(" (")[0]
    marca = f" {m}" if m and m.lower() not in p["nome"].lower() and m != "Diversos" else ""
    alt = f'{CATEG.get(p["categoria_slug"], "Produto")}{marca} {p["nome"]} para {ESPECIE.get(p["especie_alvo"], "pets")}'
    if p.get("variacao"): alt += f' - {p["variacao"]}'
    descricao = f'{alt}. Vendido por {loja}, {cidade}, no Saúde Pet Mercado.'
    chaves = [x for x in [p.get("marca"), CATEG.get(p["categoria_slug"]), ESPECIE.get(p["especie_alvo"]),
              p.get("tamanho"), "pet shop", "Ribeirão Preto", "Saúde Pet"] if x]
    return titulo, alt, descricao, chaves

def xmp(titulo, descricao, chaves):
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")
    kw = "".join(f"<rdf:li>{esc(k)}</rdf:li>" for k in chaves)
    return f'''<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
<dc:title><rdf:Alt><rdf:li xml:lang="pt-BR">{esc(titulo)}</rdf:li></rdf:Alt></dc:title>
<dc:description><rdf:Alt><rdf:li xml:lang="pt-BR">{esc(descricao)}</rdf:li></rdf:Alt></dc:description>
<dc:subject><rdf:Bag>{kw}</rdf:Bag></dc:subject>
<dc:creator><rdf:Seq><rdf:li>{esc(loja)}</rdf:li></rdf:Seq></dc:creator>
<dc:rights><rdf:Alt><rdf:li xml:lang="pt-BR">{esc(loja)} / Saúde Pet</rdf:li></rdf:Alt></dc:rights>
<xmp:CreatorTool>Avila Ops removedor-de-fundo</xmp:CreatorTool>
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>'''.encode("utf-8")

def exif(titulo, descricao, chaves):
    ex = Image.Exif()
    # 0x010e ImageDescription, 0x013b Artist, 0x8298 Copyright, 0x9c9b XPTitle, 0x9c9c XPComment, 0x9c9e XPKeywords, 0x0131 Software
    ex[0x010e] = descricao.encode("utf-8")
    ex[0x013b] = loja.encode("utf-8")
    ex[0x8298] = f"{loja} / Saúde Pet".encode("utf-8")
    ex[0x0131] = "Avila Ops removedor-de-fundo"
    ex[0x9c9b] = titulo.encode("utf-16-le") + b"\x00\x00"
    ex[0x9c9c] = descricao.encode("utf-16-le") + b"\x00\x00"
    ex[0x9c9e] = ";".join(chaves).encode("utf-16-le") + b"\x00\x00"
    return ex.tobytes()

relatorio = json.load(open(os.path.join(SP, "tratadas", "_relatorio.json"), encoding="utf-8")) if os.path.exists(os.path.join(SP, "tratadas", "_relatorio.json")) else {}
avisos = {}
for item in relatorio.get("itens", []):
    nome = os.path.splitext(os.path.basename(item.get("relativo", item.get("entrada", ""))))[0]
    if item.get("avisos"): avisos[nome] = item["avisos"]

REVISAR = set("0008 0009 0013 0054 0066 0069 0073 0093 0096 0098 0101 0104 0105 0106 0107 0108 0109 0110 0111 0122 0129 0133 0134 0135 0136 0141 0142 0143 0144 0145 0146 0147 0148 0149 0150 0151 0170 0173 0174 0175".split())
def quadro_branco(caminho, lado=1200, respiro=0.06):
    im = Image.open(caminho).convert("RGB")
    util = int(lado * (1 - 2 * respiro)); im.thumbnail((util, util), Image.LANCZOS)
    q = Image.new("RGB", (lado, lado), "white"); q.paste(im, ((lado - im.width) // 2, (lado - im.height) // 2)); return q

# Fotos em que NÃO aparece etiqueta de preço (revisão visual de 29/08/2026). As
# demais vêm da prateleira com a etiqueta do balcão à vista: publicáveis, mas na
# fila para troca por foto de catálogo quando o EAN chegar.
SEM_ETIQUETA = set("0021 0025 0054 0055 0093 0094 0096 0097 0098 0099 0112".split())

manifesto = []
for ref in sorted(k for k in mapa if not k.startswith("_")):
    p = produtos[ref]
    base = nome_arquivo(p)
    titulo, alt, descricao, chaves = textos(p)
    arquivos = {}
    for ext in ("webp",):
        bruto = ref[-4:] in REVISAR
        origem = os.path.join(SP, "recortes" if bruto else "tratadas", base + (".jpg" if bruto else "." + ext))
        if not os.path.exists(origem):
            continue
        im = quadro_branco(origem) if bruto else Image.open(origem)
        destino = os.path.join(DESTINO, base + "." + ext)
        kw = dict(exif=exif(titulo, descricao, chaves), xmp=xmp(titulo, descricao, chaves))
        if ext == "webp":
            im.save(destino, "WEBP", quality=88, **kw)
        else:
            im.convert("RGB").save(destino, "JPEG", quality=88, optimize=True, **kw)
        arquivos[ext] = base + "." + ext
    img, x0, y0, x1, y1 = mapa[ref]
    manifesto.append({
        "referencia": ref, "slug": p["slug"], "arquivo_webp": arquivos.get("webp"), "arquivo_jpg": arquivos.get("jpg"),
        "titulo": titulo, "alt": alt, "descricao": descricao, "palavras_chave": chaves,
        "origem": {"foto": img + ".HEIC", "recorte": [x0, y0, x1, y1]},
        "tratamento": "recorte bruto em quadro branco (a IA não isolou bem o produto)" if bruto else "removedor-de-fundo, motor ia",
        "status": "revisar" if bruto else "aprovada",
        "tem_etiqueta_preco": ref[-4:] not in SEM_ETIQUETA,
        "avisos_tratamento": avisos.get(base, []),
    })
    p["foto_status"] = "revisar" if bruto else "aprovada"
    p["tem_etiqueta_preco"] = ref[-4:] not in SEM_ETIQUETA
    p["foto_arquivo"] = arquivos.get("webp")
    p["foto_alt"] = alt
    p["foto_titulo"] = titulo

for p in dados["produtos"]:
    p.setdefault("foto_arquivo", None); p.setdefault("foto_alt", None); p.setdefault("foto_titulo", None); p["foto_status"] = p.get("foto_status") or "sem_foto"; p.setdefault("tem_etiqueta_preco", None)

json.dump({"fornecedor": dados["fornecedor"], "gerado_em": "2026-08-29",
           "status_possiveis": ["aprovada", "revisar", "sem_foto", "rejeitada"],
           "origem": "Google Drive, pasta com 55 fotos do levantamento de 26/08/2026 (IMG_4244 a IMG_4298)",
           "tratamento": "removedor-de-fundo (motor ia, U-2-Net), quadro 1200 px, respiro 6%, webp 1200x1200 com fundo branco",
           "total": len(manifesto), "aprovadas": sum(1 for f in manifesto if f["status"] == "aprovada"),
           "revisar": sum(1 for f in manifesto if f["status"] == "revisar"), "fotos": manifesto},
          open(os.path.join(DESTINO, "fotos.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
json.dump(dados, open(JSON_PRODUTOS, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print("fotos no manifesto:", len(manifesto), "| sem foto:", sum(1 for p in dados["produtos"] if not p["foto_arquivo"]))
