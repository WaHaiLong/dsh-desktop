#!/usr/bin/env python3
"""生成 1024×1024 应用图标 → build/icon.png。

设计方向「星空 ✨」:深蓝渐变星空底 + 一颗金色四芒星,
呼应「金蝶云星空」与对话界面「金蝶云星空助手」。

做法:4× 超采样绘制,再降采样到 1024 得到平滑抗锯齿边缘。
依赖:仅 Pillow。用法:python3 scripts/generate-icon.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
SCALE = 4
W = SIZE * SCALE  # 4096 超采样画布
C = W // 2        # 中心坐标
RAD = int(W * 0.205)  # 圆角半径(超采样后)

# 星空蓝渐变:顶部 → 中部 → 底部
TOP = (0x21, 0x46, 0x9E)
MID = (0x13, 0x30, 0x6E)
BOT = (0x0A, 0x1A, 0x3F)

# 金星金色系
GOLD_LIGHT = (0xFF, 0xE3, 0x8B)
GOLD = (0xF6, 0xC4, 0x45)
GOLD_DEEP = (0xE8, 0x9B, 0x2C)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_bg():
    """圆角矩形 + 竖向三色渐变,其余透明。"""
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(W):
        t = y / (W - 1)
        if t < 0.5:
            c = lerp(TOP, MID, t * 2)
        else:
            c = lerp(MID, BOT, (t - 0.5) * 2)
        d.line([(0, y), (W, y)], fill=(*c, 255))
    # 圆角遮罩
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, W - 1], radius=RAD, fill=255)
    img.putalpha(mask)
    return img


def make_starfield():
    """上半区散落的星星(白点,大小/透明度渐变)。确定性种子。"""
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    import random
    rng = random.Random(20260815)
    for _ in range(340):
        x = rng.uniform(0, W)
        y = rng.uniform(0, W * 0.72)
        r = rng.uniform(2, 7) * SCALE
        a = rng.randint(90, 230)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))
    return img


def make_glow(radius, color, alpha, blur):
    """中心径向光晕。"""
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([C - radius, C - radius, C + radius, C + radius],
              fill=(*color, alpha))
    img = img.filter(ImageFilter.GaussianBlur(blur * SCALE))
    return img


def star4(d, cx, cy, span, width, fill, outline=None, ow=0):
    """四芒星(两颗细菱形叠加):span=长轴总长, width=短轴总宽。"""
    h = span / 2
    w = width / 2
    vert = [(cx, cy - h), (cx + w, cy), (cx, cy + h), (cx - w, cy)]
    horz = [(cx - h, cy), (cx, cy - w), (cx + h, cy), (cx, cy + w)]
    d.polygon(vert, fill=fill)
    d.polygon(horz, fill=fill)
    if outline and ow:
        d.polygon(vert, outline=outline, width=ow)
        d.polygon(horz, outline=outline, width=ow)


def make_center():
    """中心金色四芒星 + 细环。"""
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 主星:长轴 ~640,短轴 ~212(≈3:1 优雅比例)
    star4(d, C, C, W * 0.625, W * 0.207, GOLD)
    # 渐变高光:在上半局部叠加亮金色
    grad = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(int(C - W * 0.31), int(C)):
        t = (y - (C - W * 0.31)) / (W * 0.31)
        gd.line([(0, y), (W, y)], fill=(*lerp(GOLD_LIGHT, GOLD, t), int(120 * (1 - t))))
    hl_mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(hl_mask).polygon([(C, C - W * 0.3125), (C + W * 0.1035, C),
                                     (C, C + W * 0.3125), (C - W * 0.1035, C)])
    grad.putalpha(Image.composite(hl_mask, Image.new("L", (W, W), 0), hl_mask))
    img.alpha_composite(grad)
    # 细环
    d = ImageDraw.Draw(img)
    ring_r = int(W * 0.335)
    d.ellipse([C - ring_r, C - ring_r, C + ring_r, C + ring_r],
              outline=(255, 255, 255, 70), width=int(11 * SCALE))
    # 右上角小星点缀
    star4(d, int(W * 0.76), int(W * 0.24), W * 0.16, W * 0.055, GOLD_LIGHT)
    return img


def main():
    bg = make_bg()
    stars = make_starfield()
    glow = make_glow(W * 0.30, GOLD_LIGHT, 46, 60)
    center = make_center()
    img = bg
    img.alpha_composite(stars)
    img.alpha_composite(glow)
    img.alpha_composite(center)
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "build", "icon.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "PNG")
    print(f"OK → {out}")


if __name__ == "__main__":
    main()
