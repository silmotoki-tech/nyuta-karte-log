"""PWA用アイコン生成スクリプト。
にゅうたポータルのブランドカラー（緑#6fb82b, 茶#6b4834, クリーム#FBF8F2）を使用し、
カルテ（クリップボード）をモチーフにしたシンプルなアイコンを生成する。
"""
import math
from PIL import Image, ImageDraw

GREEN = (111, 184, 43, 255)
BROWN = (107, 72, 52, 255)
CREAM = (251, 248, 242, 255)
WHITE = (255, 255, 255, 255)


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_base(size, padding_ratio=0.0):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = int(size * padding_ratio)
    s = size - pad * 2
    off = pad

    # 背景（角丸スクエア、緑）
    rounded_rect(draw, (off, off, off + s, off + s), radius=s * 0.22, fill=GREEN)

    # クリップボード本体（クリーム）
    board_w = s * 0.56
    board_h = s * 0.68
    board_x = off + (s - board_w) / 2
    board_y = off + s * 0.20
    rounded_rect(
        draw,
        (board_x, board_y, board_x + board_w, board_y + board_h),
        radius=board_w * 0.12,
        fill=CREAM,
    )

    # クリップボード上部の金具（茶）
    clip_w = board_w * 0.38
    clip_h = s * 0.10
    clip_x = board_x + (board_w - clip_w) / 2
    clip_y = board_y - clip_h * 0.55
    rounded_rect(
        draw,
        (clip_x, clip_y, clip_x + clip_w, clip_y + clip_h),
        radius=clip_h * 0.4,
        fill=BROWN,
    )

    # テキスト行（緑の横線でカルテの記録を表現）
    line_x1 = board_x + board_w * 0.16
    line_x2 = board_x + board_w * 0.84
    line_y_start = board_y + board_h * 0.30
    line_gap = board_h * 0.15
    line_width = max(2, int(s * 0.025))
    for i in range(3):
        y = line_y_start + line_gap * i
        w = line_width
        draw.line((line_x1, y, line_x2 if i != 2 else board_x + board_w * 0.60, y), fill=GREEN, width=w)

    # 肉球（にゅうた=犬猫を想起させるモチーフ）を右下に添える
    paw_cx = board_x + board_w * 0.78
    paw_cy = board_y + board_h * 0.82
    paw_r = board_w * 0.10
    draw.ellipse((paw_cx - paw_r, paw_cy - paw_r, paw_cx + paw_r, paw_cy + paw_r), fill=BROWN)
    for dx, dy, r in [(-0.9, -0.9, 0.55), (0.0, -1.2, 0.55), (0.9, -0.9, 0.55)]:
        cx = paw_cx + dx * paw_r
        cy = paw_cy + dy * paw_r
        rr = paw_r * r
        draw.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=BROWN)

    return img


def main():
    import os

    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out_dir, exist_ok=True)

    # 通常アイコン（パディングなし、角丸背景が縁まで）
    for size in [192, 512]:
        img = draw_base(size, padding_ratio=0.0)
        img.save(os.path.join(out_dir, f"icon-{size}.png"))

    # マスク対応アイコン（周囲に安全マージンを持たせる）
    for size in [192, 512]:
        img = draw_base(size, padding_ratio=0.12)
        img.save(os.path.join(out_dir, f"icon-{size}-maskable.png"))

    # favicon用（小さめでも判別しやすいシンプル版）
    favicon = draw_base(64, padding_ratio=0.0)
    favicon.save(os.path.join(out_dir, "favicon.png"))

    print("done")


if __name__ == "__main__":
    main()
