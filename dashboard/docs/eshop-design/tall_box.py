# Jednorázový nástroj (3. 10. 2026): z výřezu krabice z PDF návrhu „Hero e-shopu
# Begina.cz“ (x23.png) vyrobil public/eshop/hero/bag-in-box.webp (479×700).
# Spuštění: python3 tall_box.py 170 out.png
# Krabice z návrhu (x23.png, 479×530) → na výšku: do čisté plochy kartonu
# těsně pod horní hranou (nad nápisem) se vloží N řádků. Přední a boční stěna
# mají vlastní okno vzorkování (boční stěna má kresbu až od y≈115).
import sys
import numpy as np
from PIL import Image
src = np.array(Image.open("x23.png").convert("RGBA")).astype(np.float64)
H, W, _ = src.shape
N = int(sys.argv[1])
EDGE = 357                       # svislá hrana přední / boční stěna
FRONT = (100, 140)               # okno (od, do) — čistý karton přední stěny pod světlou hranou
SIDE = (98, 114)                 # okno boční stěny: pod rohem hrany (≤96), nad kresbou (≥115)
out = np.zeros((H + N, W, 4))
for x in range(W):
    a, b = FRONT if x < EDGE - 14 else SIDE  # celé okolí hrany jedním oknem
    win = b - a
    col = src[:, x, :]
    out[:b, x] = col[:b]
    for k in range(N):
        t = k % (2 * win)
        off = t if t < win else 2 * win - 1 - t
        out[b + k, x] = col[b - 1 - off]  # zrcadlové opakování okna
    out[b + N:, x] = col[b:]
img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")
img.save(sys.argv[2])
print(img.size)
