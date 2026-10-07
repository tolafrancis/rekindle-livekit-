# Renders the illustrated meeting backgrounds in apps/*/public/backgrounds/
# (library, beach, mountains, sanctuary, living room, garden). Needs Pillow and numpy.
# Usage: python3 scripts/generate-meeting-backgrounds.py <out-dir>

import math, random, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 2560, 1440  # render at 2x, downscale to 1280x720
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))

def vgrad(w, h, stops):
    """stops: list of (pos 0..1, (r,g,b))"""
    arr = np.zeros((h, w, 3), dtype=np.float32)
    ys = np.linspace(0, 1, h)
    for c in range(3):
        arr[:, :, c] = np.interp(ys, [s[0] for s in stops], [s[1][c] for s in stops])[:, None]
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGB')

def glow(img, cx, cy, r, color, strength=1.0):
    w, h = img.size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
    a = np.clip(1 - d, 0, 1) ** 2 * strength
    base = np.asarray(img).astype(np.float32)
    col = np.array(color, dtype=np.float32)
    out = base + (col - base) * a[:, :, None] * 0.0 + col * a[:, :, None] * 0.6
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGB')

def vignette(img, strength=0.35):
    w, h = img.size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / math.sqrt(2)
    m = 1 - strength * np.clip(d, 0, 1) ** 2
    out = np.asarray(img).astype(np.float32) * m[:, :, None]
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGB')

def grain(img, amount=4, seed=1):
    rng = np.random.default_rng(seed)
    a = np.asarray(img).astype(np.float32)
    a += rng.normal(0, amount, a.shape[:2])[:, :, None]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGB')

def overlay(img, draw_fn, blur=0):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer), layer)
    if blur:
        # premultiplied blur, so soft edges don't pick up dark fringes
        a = np.asarray(layer).astype(np.float32)
        alpha = a[:, :, 3:4] / 255.0
        pre = Image.fromarray((a[:, :, :3] * alpha).clip(0, 255).astype(np.uint8), 'RGB').filter(ImageFilter.GaussianBlur(blur))
        al = Image.fromarray(a[:, :, 3].astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(blur))
        al_f = np.asarray(al).astype(np.float32)[:, :, None] / 255.0
        rgb = np.asarray(pre).astype(np.float32) / np.maximum(al_f, 1e-3)
        layer = Image.fromarray(np.concatenate([rgb.clip(0, 255), al_f * 255], axis=2).astype(np.uint8), 'RGBA')
    base = img.convert('RGBA'); base.alpha_composite(layer)
    return base.convert('RGB')

def finish(img, name, dof=0, vig=0.35, seed=1):
    if dof: img = img.filter(ImageFilter.GaussianBlur(dof))
    img = vignette(img, vig)
    img = img.resize((1280, 720), Image.LANCZOS)
    img = grain(img, 2.5, seed)
    img.save(os.path.join(OUT, name + '.jpg'), quality=86, optimize=True, progressive=True)
    print('wrote', name)

# ── Library ──────────────────────────────────────────────────────────────
def library():
    rnd = random.Random(7)
    img = vgrad(W, H, [(0, (52, 32, 22)), (1, (30, 18, 12))])
    d = ImageDraw.Draw(img)
    book_cols = [(122, 30, 34), (34, 52, 92), (40, 78, 52), (176, 128, 52), (214, 200, 168), (96, 58, 36),
                 (64, 32, 60), (150, 70, 40), (28, 70, 80), (190, 160, 110), (80, 24, 24)]
    shelf_h, plank = 300, 26
    bay_w = 640
    for bx in range(0, W, bay_w):
        # bay back panel
        d.rectangle([bx, 0, bx + bay_w, H], fill=(44, 27, 18))
        y = 40
        while y < H:
            x = bx + 34
            while x < bx + bay_w - 40:
                if rnd.random() < 0.06:  # gap / bookend
                    x += rnd.randint(30, 70); continue
                bw = rnd.randint(22, 46); bh = rnd.randint(int(shelf_h * 0.62), int(shelf_h * 0.86))
                col = rnd.choice(book_cols)
                shade = rnd.uniform(0.8, 1.1)
                col = tuple(min(255, int(c * shade)) for c in col)
                top = y + shelf_h - plank - bh
                if rnd.random() < 0.05 and x + bh < bx + bay_w - 40:  # a short stack lying flat
                    for k in range(rnd.randint(2, 4)):
                        c2 = rnd.choice(book_cols); th = rnd.randint(22, 34)
                        yb = y + shelf_h - plank - (k + 1) * th
                        d.rectangle([x, yb, x + bh * 0.8, yb + th - 2], fill=c2)
                        d.line([x, yb + th // 2, x + bh * 0.8, yb + th // 2], fill=tuple(min(255, int(v * 1.25)) for v in c2), width=2)
                    x += int(bh * 0.8) + 8; continue
                d.rectangle([x, top, x + bw - 3, y + shelf_h - plank], fill=col)
                light = tuple(min(255, int(c * 1.35)) for c in col)
                dark = tuple(int(c * 0.7) for c in col)
                d.rectangle([x, top, x + 3, y + shelf_h - plank], fill=light)
                d.rectangle([x + bw - 7, top, x + bw - 3, y + shelf_h - plank], fill=dark)
                for band in (0.12, 0.18, 0.82):
                    by = top + int(bh * band)
                    d.line([x + 4, by, x + bw - 7, by], fill=(200, 170, 90) if rnd.random() < 0.5 else light, width=3)
                x += bw + rnd.randint(0, 3)
            # shelf plank with lip highlight
            d.rectangle([bx, y + shelf_h - plank, bx + bay_w, y + shelf_h], fill=(92, 58, 34))
            d.rectangle([bx, y + shelf_h - plank, bx + bay_w, y + shelf_h - plank + 5], fill=(128, 84, 50))
            d.rectangle([bx, y + shelf_h, bx + bay_w, y + shelf_h + 14], fill=(26, 15, 10))
            y += shelf_h
        # vertical uprights
        d.rectangle([bx, 0, bx + 30, H], fill=(86, 54, 32))
        d.rectangle([bx + 4, 0, bx + 10, H], fill=(118, 78, 46))
    img = glow(img, W * 0.25, H * 0.15, W * 0.55, (255, 190, 110), 0.55)
    img = glow(img, W * 0.85, H * 0.4, W * 0.35, (255, 170, 90), 0.3)
    finish(img, 'library', dof=7, vig=0.5, seed=2)

# ── Beach ────────────────────────────────────────────────────────────────
def beach():
    horizon = int(H * 0.5)
    img = vgrad(W, H, [(0, (84, 156, 214)), (0.42, (176, 214, 236)), (0.5, (226, 236, 238)),
                       (0.5001, (46, 140, 168)), (0.62, (72, 176, 190)), (0.70, (120, 206, 200)),
                       (0.705, (214, 196, 160)), (0.76, (196, 172, 132)), (1, (232, 212, 172))])
    img = glow(img, W * 0.72, H * 0.22, W * 0.25, (255, 244, 214), 0.9)
    def clouds(d, layer):
        rnd = random.Random(3)
        for _ in range(9):
            cx, cy = rnd.uniform(0, W), rnd.uniform(H * 0.06, H * 0.36)
            for _ in range(7):
                rx, ry = rnd.uniform(90, 220), rnd.uniform(40, 80)
                ox, oy = rnd.uniform(-180, 180), rnd.uniform(-30, 30)
                d.ellipse([cx + ox - rx, cy + oy - ry, cx + ox + rx, cy + oy + ry], fill=(255, 255, 255, 120))
    img = overlay(img, clouds, blur=28)
    def sea(d, layer):
        rnd = random.Random(5)
        # sun glitter on water
        for _ in range(500):
            x = rnd.gauss(W * 0.72, W * 0.06); y = rnd.uniform(horizon + 6, H * 0.66)
            l = rnd.uniform(8, 40)
            d.line([x - l, y, x + l, y], fill=(255, 250, 230, rnd.randint(60, 150)), width=3)
        # foam lines near shore
        for k, yb in enumerate([0.66, 0.685, 0.70]):
            pts = []
            for x in range(-20, W + 40, 20):
                pts.append((x, H * yb + 10 * math.sin(x / 140 + k * 1.7) + 6 * math.sin(x / 47 + k)))
            d.line(pts, fill=(255, 255, 255, 170 - k * 30), width=10 - k * 2)
        # wet sand sheen
        d.rectangle([0, H * 0.705, W, H * 0.735], fill=(150, 130, 100, 70))
    img = overlay(img, sea, blur=2)
    def palm(d, layer):
        # trunk curving up and left from the right edge
        base = (W * 0.93, H * 1.02)
        pts = [(base[0] - 380 * t ** 1.6 + 30 * math.sin(t * 5), base[1] - H * 0.82 * t) for t in np.linspace(0, 1, 40)]
        for i in range(len(pts) - 1):
            w = 46 - 26 * i / len(pts)
            d.line([pts[i], pts[i + 1]], fill=(98, 72, 48, 255), width=int(w))
            if i % 2 == 0:
                d.line([(pts[i][0] - w / 2, pts[i][1]), (pts[i][0] + w / 2, pts[i][1] - 6)], fill=(74, 52, 34, 255), width=4)
        top = pts[-1]
        rnd = random.Random(11)
        for ang in [-170, -150, -125, -100, -70, -40, -15, 10, 200, 160]:
            a = math.radians(ang)
            length = rnd.uniform(380, 520)
            spine = []
            for t in np.linspace(0, 1, 24):
                droop = 260 * t ** 2
                spine.append((top[0] + math.cos(a) * length * t, top[1] + math.sin(a) * length * t + droop))
            for i in range(1, len(spine) - 1):
                x, y = spine[i]; t = i / len(spine)
                lw = 70 * math.sin(math.pi * t)
                nx, ny = spine[i + 1][0] - x, spine[i + 1][1] - y
                n = math.hypot(nx, ny) or 1
                px, py = -ny / n, nx / n
                col = (36, 92, 52, 255) if i % 2 else (52, 116, 62, 255)
                d.line([(x, y), (x + px * lw + nx * 0.6, y + py * lw + 30)], fill=col, width=7)
                d.line([(x, y), (x - px * lw + nx * 0.6, y - py * lw + 30)], fill=col, width=7)
            d.line(spine, fill=(40, 84, 44, 255), width=8)
    img = overlay(img, palm, blur=3)
    finish(img, 'beach', dof=3, vig=0.25, seed=3)

# ── Mountains & lake ─────────────────────────────────────────────────────
def mountains():
    img = vgrad(W, H, [(0, (64, 96, 150)), (0.4, (196, 170, 180)), (0.62, (250, 206, 160)), (1, (40, 52, 70))])
    img = glow(img, W * 0.5, H * 0.52, W * 0.3, (255, 220, 170), 0.8)
    horizon = H * 0.62
    layers = [((150, 140, 170), 0.30, 3), ((108, 108, 140), 0.38, 5), ((70, 78, 104), 0.46, 7), ((44, 56, 74), 0.54, 9)]
    def ridge(seed, base, amp):
        rnd = random.Random(seed)
        ph = [rnd.uniform(0, 6.28) for _ in range(4)]
        return [(x, H * base - amp * (0.55 * math.sin(x / 520 + ph[0]) + 0.3 * math.sin(x / 210 + ph[1]) + 0.15 * math.sin(x / 90 + ph[2]) + 1))
                for x in range(-10, W + 20, 10)]
    for i, (col, base, seed) in enumerate(layers):
        pts = ridge(seed, base + 0.06, 160 - i * 18)
        d = ImageDraw.Draw(img)
        d.polygon(pts + [(W + 20, horizon), (-10, horizon)], fill=col)
    # mirror everything above the horizon into the lake, darker and softer
    hz = int(horizon)
    top = img.crop((0, max(0, 2 * hz - H), W, hz)).transpose(Image.FLIP_TOP_BOTTOM)
    water = vgrad(W, top.size[1], [(0, (90, 100, 130)), (1, (30, 40, 58))])
    top = Image.blend(top, water, 0.45).filter(ImageFilter.GaussianBlur(6))
    img.paste(top, (0, hz))
    def ripples(d, layer):
        rnd = random.Random(9)
        for _ in range(260):
            y = rnd.uniform(horizon + 10, H); x = rnd.uniform(0, W); l = rnd.uniform(20, 120)
            d.line([x - l, y, x + l, y], fill=(255, 230, 200, rnd.randint(20, 60)), width=2)
    img = overlay(img, ripples, blur=1)
    def pines(d, layer):
        rnd = random.Random(21)
        for side in (0, 1):
            for _ in range(9):
                x = rnd.uniform(0, W * 0.2) if side == 0 else rnd.uniform(W * 0.8, W)
                h = rnd.uniform(H * 0.35, H * 0.7); base = H * rnd.uniform(0.98, 1.05)
                w = h * 0.28
                for k in range(8):
                    t0 = k / 8
                    y = base - h * t0
                    ww = w * (1 - t0) * 1.1
                    d.polygon([(x - ww, y), (x + ww, y), (x, y - h / 5)], fill=(18, 32, 30, 255))
                d.rectangle([x - 8, base - 40, x + 8, base + 40], fill=(24, 20, 18, 255))
    img = overlay(img, pines, blur=6)
    finish(img, 'mountains', dof=2, vig=0.35, seed=4)

# ── Sanctuary ───────────────────────────────────────────────────────────
def sanctuary():
    img = vgrad(W, H, [(0, (70, 52, 44)), (0.7, (120, 92, 70)), (0.7001, (90, 62, 44)), (1, (54, 36, 26))])
    d = ImageDraw.Draw(img)
    # wall panels
    for x in range(0, W, 320):
        d.rectangle([x, 0, x + 8, H * 0.7], fill=(84, 62, 50))
    # stained glass arched windows
    rnd = random.Random(4)
    glass = [(196, 54, 60), (44, 92, 168), (230, 180, 60), (60, 140, 90), (140, 70, 150), (240, 220, 180)]
    def window(cx, top, w, h):
        d.rectangle([cx - w / 2 - 18, top + w / 2, cx + w / 2 + 18, top + h + 18], fill=(58, 42, 36))
        d.ellipse([cx - w / 2 - 18, top - 18, cx + w / 2 + 18, top + w + 18], fill=(58, 42, 36))
        cell = 34
        for yy in range(int(top), int(top + h), cell):
            for xx in range(int(cx - w / 2), int(cx + w / 2), cell):
                in_arch = yy >= top + w / 2 or (xx + cell / 2 - cx) ** 2 + (yy + cell / 2 - (top + w / 2)) ** 2 <= (w / 2) ** 2
                if in_arch:
                    d.rectangle([xx + 2, yy + 2, xx + cell - 2, yy + cell - 2], fill=rnd.choice(glass))
    for cx in (W * 0.16, W * 0.32, W * 0.68, W * 0.84):
        window(cx, H * 0.12, 200, 420)
    # light beams
    def beams(dd, layer):
        for cx in (W * 0.16, W * 0.32, W * 0.68, W * 0.84):
            dd.polygon([(cx - 100, H * 0.2), (cx + 100, H * 0.2), (cx + 460 * (1 if cx > W / 2 else -1) * -0.2 + 260, H), (cx - 260 + 460 * (1 if cx > W / 2 else -1) * -0.2, H)],
                       fill=(255, 230, 180, 40))
    img = overlay(img, beams, blur=40)
    d = ImageDraw.Draw(img)
    # cross with backlight
    img = glow(img, W * 0.5, H * 0.38, W * 0.2, (255, 214, 150), 0.9)
    d = ImageDraw.Draw(img)
    cx = W * 0.5
    d.rectangle([cx - 26, H * 0.14, cx + 26, H * 0.66], fill=(92, 58, 36))
    d.rectangle([cx - 150, H * 0.27, cx + 150, H * 0.27 + 50], fill=(92, 58, 36))
    d.rectangle([cx - 26, H * 0.14, cx - 14, H * 0.66], fill=(128, 86, 54))
    # platform and pews hint
    d.rectangle([W * 0.3, H * 0.66, W * 0.7, H * 0.7], fill=(110, 76, 52))
    for i in range(4):
        y = H * (0.78 + i * 0.07)
        for side in (0, 1):
            x0 = 0 if side == 0 else W * 0.56
            x1 = W * 0.44 if side == 0 else W
            d.rectangle([x0, y, x1, y + 40], fill=(70, 44, 30))
            d.rectangle([x0, y, x1, y + 8], fill=(104, 68, 46))
    # plants at the platform
    def plants(dd, layer):
        rnd2 = random.Random(8)
        for px in (W * 0.33, W * 0.67):
            for _ in range(60):
                a = rnd2.uniform(math.pi * 1.05, math.pi * 1.95); l = rnd2.uniform(60, 170)
                dd.line([(px, H * 0.67), (px + math.cos(a) * l, H * 0.67 + math.sin(a) * l)], fill=(50, 100, 54, 230), width=12)
            for _ in range(14):
                fx, fy = px + rnd2.uniform(-110, 110), H * 0.67 - rnd2.uniform(40, 150)
                dd.ellipse([fx - 14, fy - 14, fx + 14, fy + 14], fill=(250, 246, 236, 240))
    img = overlay(img, plants, blur=2)
    finish(img, 'sanctuary', dof=6, vig=0.45, seed=5)

# ── Living room ─────────────────────────────────────────────────────────
def living_room():
    img = vgrad(W, H, [(0, (206, 210, 196)), (0.74, (186, 192, 176)), (0.7401, (150, 116, 86)), (1, (120, 90, 64))])
    d = ImageDraw.Draw(img)
    # window with daylight on the left
    wx0, wy0, wx1, wy1 = W * 0.06, H * 0.12, W * 0.32, H * 0.62
    d.rectangle([wx0 - 20, wy0 - 20, wx1 + 20, wy1 + 20], fill=(244, 244, 238))
    sky = vgrad(int(wx1 - wx0), int(wy1 - wy0), [(0, (160, 204, 234)), (0.45, (206, 228, 236)), (0.46, (126, 170, 104)), (1, (96, 146, 84))])
    img.paste(sky, (int(wx0), int(wy0)))
    d = ImageDraw.Draw(img)
    def trees(dd, layer):
        rnd = random.Random(2)
        for _ in range(40):
            x, y = rnd.uniform(wx0, wx1), rnd.uniform(wy0 + (wy1 - wy0) * 0.45, wy1)
            r = rnd.uniform(40, 90)
            dd.ellipse([x - r, y - r, x + r, y + r], fill=(rnd.randint(84, 120), rnd.randint(140, 170), rnd.randint(80, 100), 220))
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0)); trees(ImageDraw.Draw(lay), lay)
    lay = lay.filter(ImageFilter.GaussianBlur(14)).crop((int(wx0), int(wy0), int(wx1), int(wy1)))
    reg = img.crop((int(wx0), int(wy0), int(wx1), int(wy1))).convert('RGBA'); reg.alpha_composite(lay)
    img.paste(reg.convert('RGB'), (int(wx0), int(wy0)))
    d = ImageDraw.Draw(img)
    d.rectangle([(wx0 + wx1) / 2 - 8, wy0, (wx0 + wx1) / 2 + 8, wy1], fill=(244, 244, 238))
    d.rectangle([wx0, (wy0 + wy1) / 2 - 8, wx1, (wy0 + wy1) / 2 + 8], fill=(244, 244, 238))
    # curtains
    d.rectangle([wx0 - 90, wy0 - 60, wx0 - 10, H * 0.74], fill=(222, 206, 180))
    d.rectangle([wx1 + 10, wy0 - 60, wx1 + 90, H * 0.74], fill=(222, 206, 180))
    # daylight glow
    img = glow(img, W * 0.2, H * 0.4, W * 0.45, (255, 248, 226), 0.5)
    d = ImageDraw.Draw(img)
    # framed art on the right
    fx0, fy0 = W * 0.62, H * 0.16
    d.rectangle([fx0, fy0, fx0 + 440, fy0 + 300], fill=(60, 44, 32))
    art = vgrad(400, 260, [(0, (236, 196, 150)), (0.6, (214, 150, 110)), (1, (120, 110, 120))])
    img.paste(art, (int(fx0 + 20), int(fy0 + 20)))
    d = ImageDraw.Draw(img)
    d.polygon([(fx0 + 20, fy0 + 280), (fx0 + 160, fy0 + 160), (fx0 + 260, fy0 + 230), (fx0 + 330, fy0 + 180), (fx0 + 420, fy0 + 280)], fill=(90, 84, 100))
    # bookshelf / sideboard with plant and lamp
    d.rectangle([W * 0.56, H * 0.56, W * 0.94, H * 0.74], fill=(140, 100, 66))
    d.rectangle([W * 0.56, H * 0.56, W * 0.94, H * 0.575], fill=(166, 122, 82))
    for i, col in enumerate([(70, 90, 120), (170, 60, 50), (220, 200, 160), (60, 100, 80), (190, 150, 70)]):
        d.rectangle([W * 0.60 + i * 44, H * 0.45, W * 0.60 + i * 44 + 36, H * 0.56], fill=col)
    # plant pot
    d.rectangle([W * 0.86, H * 0.47, W * 0.92, H * 0.56], fill=(230, 226, 214))
    def plant(dd, layer):
        rnd = random.Random(6)
        px, py = W * 0.89, H * 0.47
        for _ in range(26):
            a = rnd.uniform(math.pi * 1.1, math.pi * 1.9); l = rnd.uniform(90, 230)
            ex, ey = px + math.cos(a) * l, py + math.sin(a) * l
            dd.line([(px, py), (ex, ey)], fill=(70, 120, 70, 255), width=6)
            dd.ellipse([ex - 34, ey - 18, ex + 34, ey + 18], fill=(62, 132, 74, 255))
    img = overlay(img, plant)
    # floor lamp glow
    d = ImageDraw.Draw(img)
    d.rectangle([W * 0.47, H * 0.2, W * 0.475, H * 0.74], fill=(60, 56, 52))
    d.polygon([(W * 0.44, H * 0.2), (W * 0.505, H * 0.2), (W * 0.49, H * 0.12), (W * 0.455, H * 0.12)], fill=(246, 232, 204))
    img = glow(img, W * 0.4725, H * 0.2, W * 0.16, (255, 214, 150), 0.6)
    finish(img, 'living-room', dof=6, vig=0.3, seed=6)

# ── Garden (bokeh) ──────────────────────────────────────────────────────
def garden():
    img = vgrad(W, H, [(0, (150, 196, 120)), (0.5, (84, 140, 76)), (1, (40, 80, 44))])
    img = glow(img, W * 0.78, H * 0.12, W * 0.45, (255, 246, 200), 0.7)
    def leaves(dd, layer):
        rnd = random.Random(12)
        for _ in range(220):
            x, y = rnd.uniform(-100, W + 100), rnd.uniform(-100, H + 100)
            r = rnd.uniform(60, 200)
            g = rnd.choice([(46, 100, 50), (70, 130, 60), (100, 150, 70), (30, 70, 40)])
            dd.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=g + (rnd.randint(60, 140),))
    img = overlay(img, leaves, blur=30)
    def bokeh(dd, layer):
        rnd = random.Random(13)
        for _ in range(140):
            x, y = rnd.gauss(W * 0.65, W * 0.25), rnd.gauss(H * 0.3, H * 0.25)
            r = rnd.uniform(16, 70)
            col = rnd.choice([(255, 250, 220), (240, 255, 210), (255, 236, 190)])
            dd.ellipse([x - r, y - r, x + r, y + r], fill=col + (rnd.randint(40, 110),))
        # a few flowers out of focus near the bottom
        for _ in range(30):
            x, y = rnd.uniform(0, W), rnd.uniform(H * 0.75, H)
            r = rnd.uniform(30, 70)
            col = rnd.choice([(240, 120, 150), (250, 220, 90), (250, 250, 250), (190, 120, 220)])
            dd.ellipse([x - r, y - r, x + r, y + r], fill=col + (110,))
    img = overlay(img, bokeh, blur=14)
    finish(img, 'garden', dof=4, vig=0.35, seed=7)

for fn in (library, beach, mountains, sanctuary, living_room, garden):
    fn()
