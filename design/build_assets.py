"""
«Таа» дүрийн бүх хөрөнгийг нэг командаар дахин үүсгэнэ.

  python design/build_assets.py            # Blender + GLB шахалт + зургууд
  python design/build_assets.py --no-blender   # зөвхөн зургууд/GLB-г дахин боловсруулна

Шаардлага: Blender 5.x, Node.js (npx), Python Pillow.
BLENDER орчны хувьсагчаар blender.exe-ийн замыг зааж болно.
"""
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGN = os.path.join(ROOT, 'design')
RENDERS = os.path.join(DESIGN, 'renders')
ASSETS = os.path.join(ROOT, 'assets')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

BLENDER = os.environ.get('BLENDER') or next(
    (p for p in (
        r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe',
        '/Applications/Blender.app/Contents/MacOS/Blender',
        shutil.which('blender') or '',
    ) if p and os.path.exists(p)), 'blender')


def run(cmd):
    print('>', ' '.join(cmd))
    subprocess.run(cmd, check=True, shell=(os.name == 'nt' and cmd[0] == 'npx'))


def blender():
    run([BLENDER, '--background', '--factory-startup',
         '--python', os.path.join(DESIGN, 'blender', 'build_taa.py'), '--', '--out', ROOT])


def compress_glb():
    raw = os.path.join(ASSETS, 'taa.raw.glb')
    tmp = os.path.join(ASSETS, 'taa.dedup.glb')
    out = os.path.join(ASSETS, 'taa.glb')
    cli = ['npx', '-y', '@gltf-transform/cli@4']
    run(cli + ['dedup', raw, tmp])
    # KHR_mesh_quantization: байрлал int16, нормаль int8 — mascot3d.js үүнийг уншина
    run(cli + ['quantize', tmp, out, '--quantize-position', '14', '--quantize-normal', '8'])
    os.remove(tmp)
    os.remove(raw)
    print(f'taa.glb: {os.path.getsize(out) / 1024:.1f} KB')


def fit(img, size):
    return img.resize((size, size), Image.LANCZOS)


def monochrome(img):
    """Android 13+ themed icon: цагаан дүрс, нүд нь нүх болж харагдана (систем зөвхөн alpha-г ашиглана)."""
    out = []
    w, h = img.size
    pixels = img.get_flattened_data() if hasattr(img, 'get_flattened_data') else img.getdata()
    for i, (r, g, b, a) in enumerate(pixels):
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        sat = max(r, g, b) - min(r, g, b)
        in_eyes = 0.45 * h < i // w < 0.64 * h  # малгайн гялбааг нүх болгохгүй
        hole = in_eyes and lum > 200 and sat < 40  # нүдний цагаан → нүх, хүүхэн хараа дүүрэн үлдэнэ
        out.append((255, 255, 255, 0 if hole else a))
    m = Image.new('RGBA', img.size)
    m.putdata(out)
    return m


def copy_model_to_app():
    dst = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'models')
    if os.path.isdir(os.path.join(ROOT, 'android', 'app')):
        os.makedirs(dst, exist_ok=True)
        shutil.copyfile(os.path.join(ASSETS, 'taa.glb'), os.path.join(dst, 'taa.glb'))


def images():
    hero = Image.open(os.path.join(RENDERS, 'taa-hero.png')).convert('RGBA')
    icon = Image.open(os.path.join(RENDERS, 'taa-icon-fg.png')).convert('RGBA')
    store = Image.open(os.path.join(RENDERS, 'taa-store.png')).convert('RGBA')

    # Вэб: 3D ачаалагдах хүртэл харагдах зураг
    fit(hero, 640).save(os.path.join(ASSETS, 'taa.webp'), 'WEBP', quality=86, method=6)
    fit(hero, 640).save(os.path.join(ASSETS, 'taa.png'), 'PNG', optimize=True)

    if not os.path.isdir(os.path.dirname(RES)):
        return
    nodpi = os.path.join(RES, 'drawable-nodpi')
    os.makedirs(nodpi, exist_ok=True)
    # Adaptive icon-ы урд давхарга (108dp, агуулга нь төвийн 62%-д)
    fit(icon, 432).save(os.path.join(nodpi, 'ic_launcher_foreground.webp'), 'WEBP', lossless=True, method=6)
    monochrome(fit(icon, 432)).save(os.path.join(nodpi, 'ic_launcher_monochrome.webp'), 'WEBP', lossless=True)
    # Апп доторх офлайн/алдааны дэлгэцийн зураг
    fit(hero, 480).save(os.path.join(nodpi, 'taa_hero.webp'), 'WEBP', quality=88, method=6)

    # Google Play-ийн 512×512 дүрс: хар хөх радиал дэвсгэр + дүр
    bg = Image.new('RGBA', (512, 512), (10, 15, 31, 255))
    glow = Image.new('L', (512, 512), 0)
    ImageDraw.Draw(glow).ellipse((56, 40, 456, 440), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(70))
    bg.paste(Image.new('RGBA', (512, 512), (34, 46, 89, 255)), (0, 0), glow)
    bg.alpha_composite(fit(store, 512))
    bg.convert('RGB').save(os.path.join(ROOT, 'android', 'app', 'src', 'main', 'ic_launcher-playstore.png'),
                           'PNG', optimize=True)
    print('images: ok')


if __name__ == '__main__':
    if '--no-blender' not in sys.argv:
        blender()
        compress_glb()
    copy_model_to_app()
    images()
