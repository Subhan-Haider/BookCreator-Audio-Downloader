from PIL import Image, ImageDraw, ImageFont
import os

def create_gradient_bg(width, height, color1, color2):
    """Creates a simple horizontal gradient image (no alpha)"""
    base = Image.new('RGB', (width, height), color1)
    draw = ImageDraw.Draw(base)
    
    # Parse hex
    r1, g1, b1 = tuple(int(color1.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
    r2, g2, b2 = tuple(int(color2.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
    
    # Draw gradient lines
    for x in range(width):
        # Calculate intermediate color
        r = int(r1 + (r2 - r1) * (x / width))
        g = int(g1 + (g2 - g1) * (x / width))
        b = int(b1 + (b2 - b1) * (x / width))
        draw.line([(x, 0), (x, height)], fill=(r, g, b))
        
    return base

def add_text_and_icon(img, icon_path, title, subtitle, font_size_title, font_size_subtitle, is_marquee=False):
    width, height = img.size
    draw = ImageDraw.Draw(img)
    
    try:
        # Load the 128x128 icon, ensuring it has alpha for pasting, but paste it onto our RGB background
        icon = Image.open(icon_path).convert("RGBA")
        if is_marquee:
            icon = icon.resize((192, 192), Image.Resampling.LANCZOS)
        else:
            icon = icon.resize((96, 96), Image.Resampling.LANCZOS)
    except Exception as e:
        print(f"Could not load icon: {e}")
        icon = None

    # Load default font (fallback if no TrueType available)
    try:
        # Try to use Arial or Segoe UI
        font_title = ImageFont.truetype("arialbd.ttf", font_size_title)
        font_sub = ImageFont.truetype("arial.ttf", font_size_subtitle)
    except:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        
    # Calculate positions
    if is_marquee:
        # Center horizontally, a bit above center vertically
        # Icon
        if icon:
            icon_x = (width - icon.width) // 2
            icon_y = (height // 2) - icon.height - 20
            img.paste(icon, (icon_x, icon_y), icon)
            
        # Title
        try:
            # Pillow >= 8.0.0
            tw = draw.textlength(title, font=font_title)
        except:
            tw = font_title.getsize(title)[0]
        tx = (width - tw) // 2
        ty = (height // 2) + 20
        draw.text((tx, ty), title, fill="white", font=font_title)
        
        # Subtitle
        try:
            sw = draw.textlength(subtitle, font=font_sub)
        except:
            sw = font_sub.getsize(subtitle)[0]
        sx = (width - sw) // 2
        sy = ty + font_size_title + 10
        draw.text((sx, sy), subtitle, fill="#e0e7ff", font=font_sub)
        
    else:
        # Small tile: Icon left, text right, or Icon top, text bottom
        if icon:
            icon_x = (width - icon.width) // 2
            icon_y = (height - icon.height) // 2 - 30
            img.paste(icon, (icon_x, icon_y), icon)
            
        try:
            tw = draw.textlength(title, font=font_title)
        except:
            tw = font_title.getsize(title)[0]
        tx = (width - tw) // 2
        ty = height // 2 + 30 if icon else height // 2
        draw.text((tx, ty), title, fill="white", font=font_title)
        
    return img

def main():
    # Colors matching UI gradient: #6366f1 to #8b5cf6
    c1, c2 = "#6366f1", "#8b5cf6"
    icon_path = os.path.join("icons", "icon128.png")
    
    # 1. Small Promo Tile (440x280)
    print("Generating Small Promo Tile (440x280)...")
    img_small = create_gradient_bg(440, 280, c1, c2)
    img_small = add_text_and_icon(
        img_small, icon_path, 
        "BookCreator Downloader", "", 
        font_size_title=28, font_size_subtitle=14
    )
    img_small.save("promo_small_440x280.png", format="PNG") # RGB mode = no alpha

    # 2. Marquee Promo Tile (1400x560)
    print("Generating Marquee Promo Tile (1400x560)...")
    img_marquee = create_gradient_bg(1400, 560, c1, c2)
    img_marquee = add_text_and_icon(
        img_marquee, icon_path, 
        "BookCreator Audio Downloader", 
        "The fastest way to save audiobooks locally.", 
        font_size_title=64, font_size_subtitle=32, 
        is_marquee=True
    )
    img_marquee.save("promo_marquee_1400x560.png", format="PNG") # RGB mode = no alpha

    print("Done! Generated promo_small_440x280.png and promo_marquee_1400x560.png.")

if __name__ == "__main__":
    main()
