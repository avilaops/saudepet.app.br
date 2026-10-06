import argparse
from pathlib import Path

from PIL import Image, ImageDraw


SOURCE_FILES = {
    "atendimento-domiciliar-ou-hospital-veterinario-quando-cada-um-e-indicado": "exec-cd156212-015a-40cf-8343-d2c3f8a493de.png",
    "como-funciona-uma-consulta-veterinaria-em-domicilio": "exec-f2d3101d-2879-4148-bee1-ef7d1d0e05b1.png",
    "quando-levar-o-pet-ao-veterinario-mesmo-sem-sintomas": "exec-bb35c9b1-dfc6-47db-b6cc-c465d9b4e242.png",
    "pulgas-e-carrapatos-como-identificar-prevenir-e-proteger": "exec-1b9442b8-a5fa-4d2d-bd4d-e8538cc8242d.png",
    "calendario-de-vacinacao-para-gatos": "exec-cc5e8e75-edd4-473f-a5cb-ae86aab4be33.png",
    "calendario-de-vacinacao-para-cachorros": "exec-bfc4a690-84df-4e4a-b8be-39ab8a70b528.png",
    "como-saber-se-o-pet-esta-com-dor": "exec-125b4191-ff7c-4300-bf8c-0d3c5ce9c083.png",
    "cachorro-ou-gato-intoxicado-o-que-fazer": "exec-7cf7dcef-be4c-489f-8be1-5d6a96b63357.png",
    "pet-com-dificuldade-para-respirar-sinais-de-emergencia": "exec-992f4232-c375-4490-b3a1-92e200a768d1.png",
    "cachorro-com-diarreia-causas-e-sinais-de-emergencia": "exec-efb33f93-07f0-4d58-8d5d-70aa291a5cbd.png",
    "gato-parou-de-comer-quanto-tempo-pode-esperar": "exec-d3cb0dc9-c91a-4eda-aab0-df426aa3bcee.png",
    "cachorro-vomitando-quando-e-preocupante": "exec-00cd625d-70c1-465c-a291-43d80fdeffe9.png",
    "primeira-consulta-do-filhote-o-que-o-tutor-precisa-preparar": "exec-e34304ce-df6f-435e-8ce6-8ce83f9dcd76.png",
    "como-cuidar-de-um-cachorro-ou-gato-idoso": "exec-cdf0121c-53ce-47f5-9260-ab9a0a693af9.png",
    "mau-halito-em-caes-e-gatos-e-normal": "exec-6e1004f4-6258-463b-8ca4-ffb17b81ff67.png",
    "como-saber-se-o-pet-esta-acima-do-peso": "exec-3d8d3ec8-7c03-499f-acff-09fcb4615ec9.png",
    "queda-de-pelo-quando-e-normal-e-quando-pode-indicar-um-problema": "exec-efe6b280-3c6d-4868-8942-672f2a7c51b2.png",
    "coceira-constante-no-cachorro-alergia-pulga-ou-problema-de-pele": "exec-69ad334f-1121-4770-a0ac-248d3ebbeabf.png",
    "cachorro-pode-comer-comida-humana-alimentos-permitidos-e-perigosos": "exec-faa502b4-da1d-4216-a063-0ff986be7805.png",
    "por-que-manter-vacinas-alergias-e-medicamentos-do-pet-registrados": "exec-9b59cffb-7182-4ee3-8ee2-d11cd9334c95.png",
    "plantas-toxicas-para-caes-e-gatos": "exec-4d4f3b20-3889-4e2d-9aef-b5dbe25dd4bc.png",
    "chocolate-faz-mal-para-cachorro-entenda-o-risco": "exec-e5693edf-031c-4ad7-94ea-e501c5688dc6.png",
    "como-proteger-caes-e-gatos-do-calor-excessivo": "exec-c9afe548-7707-482f-a509-e0870be7d0f8.png",
    "fogos-de-artificio-como-reduzir-o-medo-e-a-ansiedade-do-pet": "exec-5c21f0c6-b488-44bc-964a-f21dd8e9c03c.png",
    "frio-em-curitiba-quais-pets-sofrem-mais": "exec-d2c25bdd-2813-492f-8c68-99145813aa44.png",
    "emergencia-veterinaria-em-curitiba-o-plano-antes-de-precisar": "exec-2bd47c47-7397-43fd-beac-01431426f56b.png",
    "passeio-no-inverno-de-curitiba-o-que-muda": "exec-2199434b-a835-4a4a-bfd1-8c6ee8f0035b.png",
    "casa-fechada-no-inverno-pele-e-respiracao-do-pet": "exec-e1681695-8b9a-4356-84a2-1c4527668f3a.png",
}

WATERMARK_POSITIONS = {
    "casa-fechada-no-inverno-pele-e-respiracao-do-pet": "top-left",
}


def contain(image: Image.Image, target_width: int, target_height: int) -> Image.Image:
    source_ratio = image.width / image.height
    target_ratio = target_width / target_height
    if source_ratio > target_ratio:
        crop_width = round(image.height * target_ratio)
        left = (image.width - crop_width) // 2
        image = image.crop((left, 0, left + crop_width, image.height))
    else:
        crop_height = round(image.width / target_ratio)
        top = (image.height - crop_height) // 2
        image = image.crop((0, top, image.width, top + crop_height))
    return image.resize((target_width, target_height), Image.Resampling.LANCZOS)


def add_watermark(cover: Image.Image, logo_path: Path, position: str = "bottom-right") -> Image.Image:
    logo = Image.open(logo_path).convert("RGBA")
    logo_width = max(88, round(cover.width * 0.1375))
    logo_height = round(logo.height * logo_width / logo.width)
    logo = logo.resize((logo_width, logo_height), Image.Resampling.LANCZOS)
    original_alpha = logo.getchannel("A")
    logo.putalpha(original_alpha.point(lambda value: round(value * 235 / 255)))

    scale = cover.width / 1280
    padding_x, padding_y = max(9, round(18 * scale)), max(6, round(12 * scale))
    box_width = logo.width + padding_x * 2
    box_height = logo.height + padding_y * 2
    margin = max(14, round(28 * scale))
    x = margin if position.endswith("left") else cover.width - box_width - margin
    y = margin if position.startswith("top") else cover.height - box_height - margin

    overlay = Image.new("RGBA", cover.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle(
        (x, y, x + box_width, y + box_height),
        radius=max(9, round(18 * scale)),
        fill=(255, 255, 255, 220),
        outline=(255, 255, 255, 235),
        width=1,
    )
    overlay.alpha_composite(logo, (x + padding_x, y + padding_y))
    return Image.alpha_composite(cover.convert("RGBA"), overlay).convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepara capas WebP do blog Saúde PET com marca d'água.")
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("logo", type=Path)
    parser.add_argument(
        "--only",
        nargs="+",
        choices=SOURCE_FILES.keys(),
        help="Processa apenas os slugs informados; útil para acrescentar um novo lote.",
    )
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    selected_files = {
        slug: filename
        for slug, filename in SOURCE_FILES.items()
        if not args.only or slug in args.only
    }

    missing = [filename for filename in selected_files.values() if not (args.source_dir / filename).is_file()]
    if missing:
        raise FileNotFoundError(f"Arquivos de origem ausentes: {', '.join(missing)}")

    for slug, filename in selected_files.items():
        source = Image.open(args.source_dir / filename).convert("RGB")
        watermark_position = WATERMARK_POSITIONS.get(slug, "bottom-right")
        for width, height in ((1280, 853), (960, 640), (640, 427)):
            cover = add_watermark(contain(source, width, height), args.logo, watermark_position)
            suffix = "" if width == 1280 else f"-{width}"
            cover.save(args.output_dir / f"{slug}{suffix}.webp", "WEBP", quality=84, method=6, exif=b"")

        social_dir = args.output_dir / "social"
        social_dir.mkdir(parents=True, exist_ok=True)
        social = add_watermark(contain(source, 1200, 630), args.logo, watermark_position)
        social.save(social_dir / f"{slug}.jpg", "JPEG", quality=88, optimize=True, progressive=True, exif=b"")

    brand_dir = args.logo.parent
    for filename in ("logo-completa.png", "logo-completa-clara.png"):
        original_path = brand_dir / filename
        original = Image.open(original_path).convert("RGBA")
        for width in (290, 580):
            height = round(original.height * width / original.width)
            resized = original.resize((width, height), Image.Resampling.LANCZOS)
            resized.save(brand_dir / f"{original_path.stem}-{width}.png", optimize=True)

    print(f"{len(selected_files)} capas responsivas e imagens sociais preparadas em {args.output_dir}")


if __name__ == "__main__":
    main()
