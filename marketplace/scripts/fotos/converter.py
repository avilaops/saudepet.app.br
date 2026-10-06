import os, sys
from PIL import Image, ImageOps, ImageDraw
import pillow_heif
pillow_heif.register_heif_opener()
SP = sys.argv[1]
src = os.path.join(SP, "originais"); full = os.path.join(SP, "convertidas"); mini = os.path.join(SP, "miniaturas")
os.makedirs(full, exist_ok=True); os.makedirs(mini, exist_ok=True)
for f in sorted(os.listdir(src)):
    base, ext = os.path.splitext(f)
    if ext.lower() not in (".heic", ".png", ".jpg"): continue
    im = ImageOps.exif_transpose(Image.open(os.path.join(src, f))).convert("RGB")
    im.save(os.path.join(full, base + ".jpg"), quality=92)
    w, h = im.size
    m = im.copy(); m.thumbnail((1100, 1100))
    d = ImageDraw.Draw(m); mw, mh = m.size
    for i in range(1, 10):
        x = mw * i // 10; y = mh * i // 10
        d.line([(x, 0), (x, mh)], fill=(255, 0, 0), width=1); d.line([(0, y), (mw, y)], fill=(255, 0, 0), width=1)
        d.text((x + 2, 2), str(i), fill=(255, 255, 0)); d.text((2, y + 2), str(i), fill=(255, 255, 0))
    m.save(os.path.join(mini, base + ".jpg"), quality=80)
    print(base, w, h)
