#!/usr/bin/env python3
# Generate the DMG window backgrounds:
#   src-tauri/dmg/background.png      660x400 @72dpi  (electron-builder 1x)
#   src-tauri/dmg/background@2x.png   1320x800 @144dpi
#
# Canvas is laid out in points (660x400, electron-builder.yml dmg.window).
# electron-builder 26 sizes the Finder window from the 1x PNG's pixel size,
# then combines the pair into a hidpi TIFF when `@2x` sits next to it.
# A single 1320x800 file named background.png makes the window 2x too big.
#
# Icon anchors must stay in sync with electron-builder.yml dmg.contents:
#   app (180, 196)  Applications (480, 196)  icon size 128
#
# Requires: pip install --user pillow  (macOS system python3 works)

import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 660, 400          # points
S = 2                    # supersample factor
PW, PH = W * S, H * S    # pixels

APP_POS = (180, 196)
APPS_POS = (480, 196)
ARROW_Y = 196

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "dmg")
OUT_1X = os.path.join(OUT_DIR, "background.png")
OUT_2X = os.path.join(OUT_DIR, "background@2x.png")

FONT_CJK = "/System/Library/Fonts/Hiragino Sans GB.ttc"  # W3 idx 0, W6 idx 2


def vgrad(size, top, bottom):
    w, h = size
    base = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        base.putpixel((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return base.resize((w, h)).convert("RGBA")


def glow(size, center, radius, color, alpha):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius],
              fill=color + (alpha,))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.55))


def rounded_line(draw, p0, p1, width, fill):
    draw.line([p0, p1], fill=fill, width=width)
    r = width / 2
    for p in (p0, p1):
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def draw_arrow(img):
    """Right-pointing arrow between the two icons, brand blue, soft shadow."""
    x0, x1 = 258 * S, 386 * S          # shaft
    tip = 412 * S
    y = ARROW_Y * S
    shaft_w = 7 * S
    head_half = 15 * S                 # half-height of the arrowhead

    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(shadow)
    off = 2 * S
    rounded_line(ds, (x0, y + off), (x1, y + off), shaft_w, (18, 34, 76, 60))
    ds.polygon([(x1 - 2 * S, y - head_half + off), (x1 - 2 * S, y + head_half + off),
                (tip, y + off)], fill=(18, 34, 76, 60))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(3 * S)))

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    brand = (42, 90, 201, 235)         # #2A5AC9 @ 92%
    rounded_line(d, (x0, y), (x1, y), shaft_w, brand)
    # Keep the arrowhead as a clean triangle; corner discs become oversized
    # dots after supersampling and make the installation cue look noisy.
    d.polygon([(x1 - 2 * S, y - head_half), (x1 - 2 * S, y + head_half), (tip, y)],
              fill=brand)
    img.alpha_composite(layer)


def draw_text(img):
    d = ImageDraw.Draw(img)
    title = ImageFont.truetype(FONT_CJK, 21 * S, index=2)      # W6
    sub = ImageFont.truetype(FONT_CJK, 12 * S, index=0)        # W3

    t = "安装 Oh My DSH"
    tw = d.textlength(t, font=title)
    d.text(((PW - tw) / 2, 46 * S), t, font=title, fill=(22, 38, 76, 255))

    s = "将左侧应用拖入右侧 Applications 文件夹"
    sw = d.textlength(s, font=sub)
    d.text(((PW - sw) / 2, 84 * S), s, font=sub, fill=(96, 110, 145, 255))


def main():
    img = vgrad((PW, PH), (253, 254, 255), (238, 241, 249))

    # soft glows: white halo behind the white app tile, faint brand tint behind Applications
    img.alpha_composite(glow(img.size, (APP_POS[0] * S, APP_POS[1] * S), 80 * S,
                             (255, 255, 255), 110))
    img.alpha_composite(glow(img.size, (APPS_POS[0] * S, APPS_POS[1] * S), 96 * S,
                             (42, 90, 201), 18))

    draw_arrow(img)
    draw_text(img)

    os.makedirs(OUT_DIR, exist_ok=True)
    rgb = img.convert("RGB")
    rgb.save(OUT_2X, "PNG", dpi=(144, 144))
    rgb.resize((W, H), Image.LANCZOS).save(OUT_1X, "PNG", dpi=(72, 72))
    print(f"wrote {OUT_1X} ({W}x{H} @72dpi)")
    print(f"wrote {OUT_2X} ({PW}x{PH} @144dpi)")


if __name__ == "__main__":
    main()
