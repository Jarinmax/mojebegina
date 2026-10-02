# Jednorázový nástroj (3. 10. 2026): z výřezu krabice z PDF návrhu „Hero e-shopu
# Begina.cz“ (x23.png) vyrobil public/eshop/hero/bag-in-box.webp — krabice
# prodloužená z krychle do obdélníku. Spuštění: python3 stretch_box.py 125 115 out.png
# Prodloužení krabice (bag-in-box) z návrhu: vloží plochu kartonu vlevo a vpravo
# od nápisu a zachová perspektivu (horní a dolní hrana přední stěny pokračují
# v původním sklonu). Nápis, ucho a kohoutek se jen posunou, nedeformují.
import sys
import numpy as np
from PIL import Image

src = np.array(Image.open("x23.png").convert("RGBA")).astype(np.float64)
H, W, _ = src.shape
# premultiplied alpha kvůli čisté interpolaci okrajů
pm = src.copy(); pm[:, :, :3] *= pm[:, :, 3:4] / 255.0

# přední stěna: horní hrana (20,62)→(355,90), dolní hrana z alfa kanálu (30,456)→(345,515)
X0 = 20.0
T0, ST = 62.0, (90 - 62) / (355 - 20)
B0, SB = 456 - (30 - X0) * ((515 - 456) / (345 - 30)), (515 - 456) / (345 - 30)
T = lambda x: T0 + ST * (x - X0)
B = lambda x: B0 + SB * (x - X0)

nL, nR = int(sys.argv[1]), int(sys.argv[2])
aL, bR = 80, 349            # místa vložení (zdrojové x) — vpravo až za uchem
WIN = 36                    # okno čistého kartonu pro vzorkování
TOP_SRC = 120               # sloupec s čistou horní stěnou (bez ucha a rohu)
out_w = W + nL + nR
out_h = int(np.ceil(B(W + nL + nR) + 30))
out = np.zeros((out_h, out_w, 4))
ys_out = np.arange(out_h, dtype=np.float64)

def sample(window_end, t):
    # zrcadlové opakování okna, ať karton nemá pruhy
    k = t % (2 * WIN)
    off = k if k < WIN else 2 * WIN - 1 - k
    return window_end - WIN + off

for xo in range(out_w):
    if xo < aL:
        xs, xv = xo, xo
    elif xo < aL + nL:
        xs, xv = sample(aL, xo - aL), xo
    elif xo < bR + nL:
        xs, xv = xo - nL, xo
    elif xo < bR + nL + nR:
        xs, xv = sample(bR, xo - bR - nL), xo
    else:
        xs, xv = xo - nL - nR, xo
    s = (B(xv) - T(xv)) / (B(xs) - T(xs))
    rel = (ys_out - T(xv)) / s
    inserted = (aL <= xo < aL + nL) or (bR + nL <= xo < bR + nL + nR)
    y_src = T(xs) + rel
    for c in range(4):
        col = np.interp(y_src, np.arange(H), pm[:, xs, c])
        if inserted:
            # nad přední hranou (horní stěna krabice) brát čistý karton bez ucha
            tsrc = aL if xo < aL + nL else bR
            top = np.interp(T(tsrc) + rel, np.arange(H), pm[:, tsrc, c])
            col = np.where(rel < 0, top, col)
            y_ok = np.where(rel < 0, T(tsrc) + rel, y_src)
        else:
            y_ok = y_src
        out[:, xo, c] = np.where((y_ok >= 0) & (y_ok <= H - 1), col, 0)

a = out[:, :, 3:4]
rgb = np.where(a > 0, out[:, :, :3] * 255.0 / np.maximum(a, 1e-6), 0)
res = np.concatenate([np.clip(rgb, 0, 255), np.clip(a, 0, 255)], axis=2).astype(np.uint8)
img = Image.fromarray(res, "RGBA")
img = img.crop(img.getbbox())
img.save(sys.argv[3])
print(img.size)
