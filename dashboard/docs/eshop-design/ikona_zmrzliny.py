"""Ilustrace kategorie Zmrzliny ve stylu ostatních ikon (akvarel).

Miska a snítka jsou převzaté z ikona-polevky.webp (stejný autor/styl), nahoře
tři kopečky zmrzliny malované procedurálně akvarelovou technikou
(nerovnoměrný pigment, ztmavení u okraje, měkké světlo, jemná kresba).
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
S = 6                    # pracovní zvětšení
TOP = 28                 # prostor nad miskou (v původních bodech)
rng = np.random.default_rng(7)

bowl = Image.open(SRC).convert("RGBA")
W0, H0 = bowl.size
W, H = W0 * S, (H0 + TOP) * S
canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
canvas.alpha_composite(bowl.resize((W0 * S, H0 * S), Image.LANCZOS), (0, TOP * S))

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


def noise(scale, octaves=3):
    """Hladký šum 0..1 (součet rozmazaných náhodných polí)."""
    total = np.zeros((H, W), np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        sigma = scale / (2 ** o)
        n = ndimage.gaussian_filter(rng.random((H, W)).astype(np.float32), sigma)
        n = (n - n.min()) / (n.max() - n.min() + 1e-6)
        total += amp * n
        norm += amp
        amp *= 0.5
    return total / norm


# Přední okraj misky = spodní oblouk elipsy polévky; kopečky jsou za ním.
cx, cy, rx, ry = 62.5 * S, (TOP + 27.5) * S, 50.0 * S, 14.0 * S
inside = np.clip(1 - ((xx - cx) / rx) ** 2, 0, None)
rim = np.where(np.abs(xx - cx) < rx, cy + ry * np.sqrt(inside), cy)
clip = (yy < rim).astype(np.float32)

paper_grain = noise(1.2 * S, 2)


def scoop(center, radius, base, shade, seed_shift):
    x0, y0 = center[0] * S, (center[1] + TOP) * S
    r = radius * S
    ang = np.arctan2(yy - y0, xx - x0)
    dist = np.hypot(xx - x0, yy - y0)
    # nepravidelný obrys + „vroubek“ dole, kde lžíce kopeček odřízla
    wobble = 1 + 0.035 * np.sin(5 * ang + seed_shift) + 0.025 * np.sin(11 * ang + 2 * seed_shift)
    lower = np.clip(np.sin(ang), 0, 1)  # 1 = spodní strana
    wobble += lower * (0.05 * np.sin(17 * ang + seed_shift))
    shape = dist < r * wobble
    mask = ndimage.gaussian_filter(shape.astype(np.float32), 0.8 * S) * clip
    # pigment: základ, nerovnoměrnost, ztmavení u okraje a dole, světlo vlevo nahoře
    edge = ndimage.distance_transform_edt(shape) / r
    pooling = np.exp(-edge / 0.09)
    under = np.clip((yy - y0) / r, 0, 1) ** 1.6
    light = np.exp(-(((xx - (x0 - 0.38 * r)) ** 2 + (yy - (y0 - 0.42 * r)) ** 2) / (2 * (0.32 * r) ** 2)))
    var = noise(4 * S) - 0.5
    base = np.array(base, np.float32)
    shade = np.array(shade, np.float32)
    t = np.clip(0.55 * pooling + 0.55 * under + 0.35 * var + 0.12 * (paper_grain - 0.5), 0, 1)[..., None]
    rgb = base * (1 - t) + shade * t
    rgb = rgb * (1 - 0.55 * light[..., None]) + 255 * 0.55 * light[..., None]
    # tenká kresba obrysu (jako tužka pod akvarelem)
    ring = np.abs(dist - r * wobble) < 0.55 * S
    line = ndimage.gaussian_filter(ring.astype(np.float32), 0.45 * S) * clip
    rgb = rgb * (1 - 0.35 * line[..., None]) + shade * 0.35 * line[..., None]
    # akvarel je průsvitný — okraj lehce měkčí, střed plný
    alpha = mask * (0.9 + 0.1 * np.clip(edge * 4, 0, 1))
    layer = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    return Image.fromarray(layer, "RGBA")


# Vnitřek misky místo polévky: světlá glazura s jemným stínem (jako okraj misky)
soup = (((xx - cx) / (rx * 0.99)) ** 2 + ((yy - (cy - 0.2 * S)) / (ry * 1.02)) ** 2) < 1
soup_a = ndimage.gaussian_filter(soup.astype(np.float32), 0.7 * S)
inner = np.array((232, 224, 210), np.float32) * (1 - 0.12 * np.clip((yy - (cy - ry)) / (2 * ry), 0, 1))[..., None]
canvas.alpha_composite(Image.fromarray(np.dstack([inner, soup_a * 255]).astype(np.uint8), "RGBA"))

# Stín kopečků na okraji misky (jemný, teplý)
shadow = np.zeros((H, W), np.float32)
for (x, y, r) in [(40, 21, 26), (85, 21, 25)]:
    shadow += np.hypot(xx - x * S, yy - (y + TOP + 6) * S) < r * S
shadow = ndimage.gaussian_filter(np.clip(shadow, 0, 1), 3 * S) * clip * 0.22
canvas.alpha_composite(
    Image.fromarray(np.dstack([np.full((H, W, 3), (120, 90, 60), np.float32), shadow * 255]).astype(np.uint8), "RGBA")
)

# vanilka vlevo, jahoda vpravo, pistácie nahoře uprostřed
canvas.alpha_composite(scoop((40, 19), 26, (245, 225, 178), (204, 164, 104), 0.3))
canvas.alpha_composite(scoop((85, 19), 25, (238, 166, 162), (194, 100, 98), 1.7))
canvas.alpha_composite(scoop((63, -1), 22, (208, 220, 160), (146, 166, 92), 4.1))

# lístek máty na vrcholu — snítka z téže ikony, zmenšená a pootočená
src = bowl.resize((W0 * S, H0 * S), Image.LANCZOS)
sprig = src.crop((int(96 * S), int(64 * S), int(138 * S), int(92 * S)))
sprig = sprig.resize((int(sprig.width * 0.62), int(sprig.height * 0.62)), Image.LANCZOS).rotate(28, expand=True, resample=Image.BICUBIC)
canvas.alpha_composite(sprig, (int(62 * S), int((TOP - 25) * S)))

# akvarelový „papír“: lehké změkčení a zmenšení zpět na původní měřítko
canvas = canvas.filter(ImageFilter.GaussianBlur(0.35 * S))
bbox = canvas.getbbox()
canvas = canvas.crop(bbox)
out = canvas.resize((round(canvas.width / S), round(canvas.height / S)), Image.LANCZOS)
out.save(OUT, "WEBP", quality=88, method=6)
print(out.size)
