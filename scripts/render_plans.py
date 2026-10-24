import pymupdf
import os

SRC = os.path.join("assets", "plans", "plans.pdf")
OUT = os.path.join("public", "plans")

os.makedirs(OUT, exist_ok=True)

doc = pymupdf.open(SRC)
names = ["plan1-studio", "plan2-2bed", "plan3-2bed", "plan4-3bed"]

for i, page in enumerate(doc):
    dpi = 300 if page.rect.width * page.rect.height < 4_000_000 else 200
    zoom = dpi / 72
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
    path = os.path.join(OUT, f"{names[i]}.png")
    pix.save(path)
    print(f"page {i+1}: {pix.width}x{pix.height} -> {path}")

doc.close()
