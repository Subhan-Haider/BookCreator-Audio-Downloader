"""Generate light-theme extension icons."""
import os
from PIL import Image, ImageDraw

output_dir = r"C:\Users\shah_\Videos\Audio download\icons"
os.makedirs(output_dir, exist_ok=True)

def draw_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # White circle with indigo shadow simulation
    margin = size // 10
    # Shadow layer
    draw.ellipse([margin+1, margin+2, size-margin+1, size-margin+2],
                 fill=(99, 102, 241, 40))
    # White background circle
    draw.ellipse([margin, margin, size-margin, size-margin],
                 fill=(255, 255, 255, 255))
    # Indigo inner circle
    inner = size // 6
    draw.ellipse([inner, inner, size-inner, size-inner],
                 fill=(237, 233, 254, 255))  # purple-100

    # Waveform bars
    bar_heights = [0.35, 0.6, 1.0, 0.6, 0.35]
    total_bars  = len(bar_heights)
    bar_w = max(2, int(size * 0.07))
    spacing = max(2, int(size * 0.05))
    total_w = total_bars * bar_w + (total_bars - 1) * spacing
    start_x = (size - total_w) // 2
    center_y = size // 2

    for i, h_ratio in enumerate(bar_heights):
        bar_h = int(size * 0.38 * h_ratio)
        x0 = start_x + i * (bar_w + spacing)
        y0 = center_y - bar_h // 2
        y1 = center_y + bar_h // 2
        r  = bar_w // 2
        draw.rounded_rectangle([x0, y0, x0 + bar_w, y1], radius=r,
                                fill=(99, 102, 241, 255))   # indigo-500

    return img

for size in [16, 48, 128]:
    icon = draw_icon(size)
    path = os.path.join(output_dir, f"icon{size}.png")
    icon.save(path)
    print(f"Saved {path}")

print("Icons done!")
