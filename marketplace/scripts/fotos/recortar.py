"""Recorta cada produto da foto de prateleira, a partir do mapa de recortes."""
import json, os, sys, re
from PIL import Image

SP = sys.argv[1]
JSON_PRODUTOS = sys.argv[2]
mapa = json.load(open(os.path.join(SP, "mapa-recortes.json"), encoding="utf-8"))
produtos = {p["referencia"]: p for p in json.load(open(JSON_PRODUTOS, encoding="utf-8"))["produtos"]}
saida = os.path.join(SP, "recortes")
os.makedirs(saida, exist_ok=True)

def nome_arquivo(p):
    ref = p["referencia"].lower()
    slug = p["slug"]
    return f"{ref}-{slug}"[:110]

cache = {}
feitos = 0
for ref, val in mapa.items():
    if ref.startswith("_"): continue
    img, x0, y0, x1, y1 = val
    if False:
        continue
    p = produtos[ref]
    if img not in cache:
        cache[img] = Image.open(os.path.join(SP, "convertidas", img + ".jpg"))
    im = cache[img]
    w, h = im.size
    # respiro de 2% para o removedor ter borda de fundo para amostrar
    px, py = 0.02, 0.02
    box = (max(0, int((x0 - px) * w)), max(0, int((y0 - py) * h)),
           min(w, int((x1 + px) * w)), min(h, int((y1 + py) * h)))
    rec = im.crop(box)
    rec.save(os.path.join(saida, nome_arquivo(p) + ".jpg"), quality=95)
    feitos += 1
print("recortes:", feitos)
