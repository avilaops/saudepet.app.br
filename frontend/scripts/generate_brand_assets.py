"""Generate Saúde PET web assets from the approved source without redrawing it."""
from collections import deque
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

ORANGE = "#F58235"
TEAL = "#159FA3"
INK = "#15343A"


def remove_connected_white(source: Image.Image) -> Image.Image:
    image = source.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    outside = bytearray(width * height)
    queue = deque()

    def near_white(x, y):
        r, g, b, _ = pixels[x, y]
        return r >= 205 and g >= 205 and b >= 205 and max(r, g, b) - min(r, g, b) <= 28

    for x in range(width):
        for y in (0, height - 1):
            if near_white(x, y):
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if near_white(x, y):
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if outside[index] or not near_white(x, y):
            continue
        outside[index] = 1
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height and not outside[ny * width + nx]:
                queue.append((nx, ny))

    for y in range(height):
        for x in range(width):
            if outside[y * width + x]:
                pixels[x, y] = (255, 255, 255, 0)

    # Decontaminate the colored anti-aliased edge that was composited on white.
    edge = []
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            r, g, b, a = pixels[x, y]
            if a and any(pixels[nx, ny][3] == 0 for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))):
                edge.append((x, y, r, g, b))
    for x, y, r, g, b in edge:
        alpha = max(1, 255 - min(r, g, b))
        clean = tuple(max(0, min(255, round(255 + (channel - 255) * 255 / alpha))) for channel in (r, g, b))
        pixels[x, y] = (*clean, alpha)
    return image


def fit_symbol(symbol, size, padding=0.1):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    target = int(size * (1 - 2 * padding))
    copy = symbol.copy()
    copy.thumbnail((target, target), Image.Resampling.LANCZOS)
    canvas.alpha_composite(copy, ((size - copy.width) // 2, (size - copy.height) // 2))
    return canvas


def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def wordmark(symbol, text_color, width=1160, height=320):
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    icon = fit_symbol(symbol, 288, 0.04)
    canvas.alpha_composite(icon, (8, 16))
    draw = ImageDraw.Draw(canvas)
    draw.text((310, 70), "Saúde", fill=text_color, font=font(108, True))
    draw.text((310, 176), "PET", fill=ORANGE, font=font(74, True))
    return canvas


def save_png(image, path, size=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    output = image if size is None else image.resize(size, Image.Resampling.LANCZOS)
    output.save(path, optimize=True)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Uso: python generate_brand_assets.py caminho/IMG_7493.png")
    root = Path(__file__).resolve().parents[1]
    public = root / "public"
    brand = public / "brand"
    landing = root.parent / "landing-page" / "assets"
    source = Image.open(sys.argv[1])
    transparent = remove_connected_white(source)
    bbox = transparent.getbbox()
    if not bbox:
        raise RuntimeError("A marca não foi detectada")
    cropped = transparent.crop(bbox)
    pad = max(cropped.size) // 16
    symbol = Image.new("RGBA", (cropped.width + pad * 2, cropped.height + pad * 2), (0, 0, 0, 0))
    symbol.alpha_composite(cropped, (pad, pad))

    save_png(symbol, brand / "logo-symbol.png")
    save_png(wordmark(symbol, INK), brand / "logo-completa.png")
    save_png(wordmark(symbol, "#FFFFFF"), brand / "logo-completa-clara.png")
    for size, name in ((16, "favicon-16x16.png"), (32, "favicon-32x32.png"), (180, "apple-touch-icon.png"), (192, "pwa-192x192.png"), (512, "pwa-512x512.png")):
        save_png(fit_symbol(symbol, size, 0.1), public / name)
    save_png(fit_symbol(symbol, 192, 0.1), public / "logo.png")
    save_png(fit_symbol(symbol, 512, 0.1), public / "logo-512.png")
    fit_symbol(symbol, 64, 0.08).save(public / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    notification = fit_symbol(symbol, 96, 0.14)
    alpha = notification.getchannel("A")
    white = Image.new("RGBA", notification.size, (255, 255, 255, 0))
    white.putalpha(alpha.point(lambda a: 255 if a > 90 else 0))
    save_png(white, public / "notification-icon.png")

    og = Image.new("RGB", (1200, 630), "#F2FBFA")
    draw = ImageDraw.Draw(og)
    draw.rounded_rectangle((60, 60, 1140, 570), 40, fill="#FFFFFF")
    icon = fit_symbol(symbol, 360, 0.05)
    og.paste(icon, (80, 135), icon)
    draw.text((470, 170), "Saúde PET", fill=INK, font=font(82, True))
    draw.text((474, 275), "Cuidado veterinário mais próximo,", fill=TEAL, font=font(36, True))
    draw.text((474, 325), "humano e conectado.", fill=TEAL, font=font(36, True))
    draw.rounded_rectangle((474, 420, 825, 478), 29, fill=ORANGE)
    draw.text((516, 431), "CUIDADO QUE CHEGA", fill="#FFFFFF", font=font(24, True))
    save_png(og, public / "og-default.png")

    landing.mkdir(parents=True, exist_ok=True)
    save_png(wordmark(symbol, INK), landing / "logo-completa.png")
    save_png(symbol, landing / "logo-symbol.png")
    save_png(og, landing / "og-default.png")
    print(f"Assets gerados em {public}")


if __name__ == "__main__":
    main()
