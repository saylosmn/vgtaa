"""
Үг Таа — «Таа» дүрийг Blender дээр бүтээнэ.

Ногоон үсгэн хавтан (өдрийн үгийн «зөв» өнгө) бие, монгол малгай, гутал,
эргэн тойронд нь Ү / Г / Т үсэгтэй хавтангууд хөвнө.

Ажиллуулах (repo-гийн үндсээс):
  blender --background --factory-startup --python design/blender/build_taa.py -- --out .

Гаргах файлууд:
  design/taa-mascot.blend      — засварлах эх файл (анимацитай)
  design/renders/*.png         — Android дүрс, splash, Play Store-ийн зураг
  assets/taa.glb               — вэб болон апп дахь 3D загвар (build_assets.py шахна)
  assets/taa.png               — 3D ачаалагдах хүртэл харагдах зураг

Вэб дээрх хөдөлгөөн (нүд ирмэх, гар даллах, хавтан хөвөх) нь mascot3d.js-д
кодоор хийгддэг тул GLB-д анимаци оруулахгүй. Зангилааны нэрс чухал:
  Taa, Body, Face, Eye_L/R, Pupil_L/R, Arm_L/R, Hat, Tile_1..3
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOT = os.path.abspath(argv[argv.index('--out') + 1]) if '--out' in argv else os.getcwd()
DO_RENDER = '--no-render' not in argv

DESIGN = os.path.join(ROOT, 'design')
RENDERS = os.path.join(DESIGN, 'renders')
ASSETS = os.path.join(ROOT, 'assets')
for d in (DESIGN, RENDERS, ASSETS):
    os.makedirs(d, exist_ok=True)


# ------------------------------------------------------------------ өнгө
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(hexcol):
    h = hexcol.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


# Сайтын index.css-ийн өнгөнүүд
C = {
    'green': '#22a45d',       # --correct
    'green_dark': '#1a8a4c',
    'gold': '#dba21f',        # --present
    'navy': '#2b3558',        # --absent
    'velvet': '#1b2447',
    'red': '#ef3e55',         # --accent
    'sun': '#f2b21e',         # --gold
    'white': '#f4f6fc',
    'pupil': '#141a33',
    'blush': '#ff7d93',
    'mouth': '#5b1428',
    'tongue': '#ff6b81',
}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection


def material(name, hexcol, rough=0.45, emit=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True  # 5.x-д үргэлж идэвхтэй, хуучин хувилбарт хэрэгтэй
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        nt.nodes.clear()
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        out.location = (300, 0)
        nt.links.new(bsdf.outputs[0], out.inputs[0])
    col = lin(hexcol)

    def put(key, val):
        s = bsdf.inputs.get(key)
        if s is not None:
            s.default_value = val

    put('Base Color', (*col, 1.0))
    put('Roughness', rough)
    put('Coat Weight', coat)
    put('Coat Roughness', 0.15)
    if emit:
        put('Emission Color', (*col, 1.0))
        put('Emission Strength', emit)
    m.diffuse_color = (*col, 1.0)
    m.roughness = rough
    return m


M = {
    'body': material('Taa_Body', C['green'], 0.38, coat=0.25),
    'limb': material('Taa_Limb', C['green_dark'], 0.45),
    'eye': material('Taa_Eye', C['white'], 0.2, coat=0.6),
    'pupil': material('Taa_Pupil', C['pupil'], 0.15, coat=0.8),
    'shine': material('Taa_Shine', C['white'], 0.1, emit=4.0),
    'blush': material('Taa_Blush', C['blush'], 0.7),
    'mouth': material('Taa_Mouth', C['mouth'], 0.6),
    'tongue': material('Taa_Tongue', C['tongue'], 0.5),
    'hat': material('Taa_HatRed', C['red'], 0.5),
    'velvet': material('Taa_Velvet', C['velvet'], 0.85),
    'gold': material('Taa_Gold', C['sun'], 0.3, coat=0.4),
    'boot': material('Taa_Boot', C['navy'], 0.55),
    'tile_green': material('Tile_Green', C['green'], 0.35, coat=0.3),
    'tile_gold': material('Tile_Gold', C['gold'], 0.35, coat=0.3),
    'tile_navy': material('Tile_Navy', C['navy'], 0.35, coat=0.3),
    'letter': material('Tile_Letter', C['white'], 0.3),
}


# ------------------------------------------------------------------ туслах
def link(ob, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    coll.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = scale
    return ob


def empty(name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.15
    return link(e, parent, loc, rot)


def from_bm(name, bm, mat, smooth=True):
    for f in bm.faces:
        f.smooth = smooth
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    return me


def obj(name, me, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return link(bpy.data.objects.new(name, me), parent, loc, rot, scale)


def sphere(name, r, mat, seg=24, rings=12, scl=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=Vector(scl), verts=bm.verts)
    return from_bm(name, bm, mat)


def torus(name, major, minor, mat, seg=40, sides=12, scl=(1, 1, 1)):
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            rr = major + minor * math.cos(b)
            ring.append(bm.verts.new((rr * math.cos(a) * scl[0], rr * math.sin(a) * scl[1],
                                      minor * math.sin(b) * scl[2])))
        rings.append(ring)
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % seg]
        for j in range(sides):
            bm.faces.new((a[j], b[j], b[(j + 1) % sides], a[(j + 1) % sides]))
    bm.normal_update()
    return from_bm(name, bm, mat)


def curl(name, mat, radius=0.1, r0=0.08, r1=0.02, sweep=170, seg=12, sides=8):
    """Монгол гутлын дээшээ эргэсэн хошуу: урагш гараад дээш, хойшоо муруйна."""
    bm = bmesh.new()
    rings = []
    for i in range(seg + 1):
        t = i / seg
        a = math.radians(sweep) * t
        r = r0 + (r1 - r0) * t
        p = Vector((0, -math.sin(a) * radius, radius - math.cos(a) * radius))
        d = Vector((0, -math.sin(a), -math.cos(a)))
        rings.append([bm.verts.new(p + r * (math.cos(b) * Vector((1, 0, 0)) + math.sin(b) * d))
                      for b in (2 * math.pi * j / sides for j in range(sides))])
    for i in range(seg):
        a, b = rings[i], rings[i + 1]
        for j in range(sides):
            bm.faces.new((a[j], a[(j + 1) % sides], b[(j + 1) % sides], b[j]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bm(name, bm, mat)


def rounded_box(name, size, mat):
    """Хайрцаг. Булангийн бөөрөнхийлөлтийг add_bevel модификатороор хийнэ — .blend дээр засварлаж болно."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    return from_bm(name, bm, mat)


def add_bevel(ob, width, segments):
    b = ob.modifiers.new('Bevel', 'BEVEL')
    b.width = width
    b.segments = segments
    b.limit_method = 'NONE'
    try:
        b.harden_normals = True
    except Exception:
        pass
    w = ob.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL')
    w.keep_sharp = True
    return ob


def d_shape(name, r, depth, mat, seg=18, squash=0.85):
    """Инээмсэглэл: доод тал нь дугуй, дээд тал нь шулуун «D» хэлбэр."""
    bm = bmesh.new()
    pts = [(r * math.cos(math.pi + math.pi * i / seg), r * math.sin(math.pi + math.pi * i / seg) * squash)
           for i in range(seg + 1)]
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in pts]
    bm.faces.new(front[::-1])
    bm.faces.new(back)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bm(name, bm, mat, smooth=False)


def box(name, size, mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    return from_bm(name, bm, mat, smooth=False)


def letter_mesh(ch, size, depth, mat):
    """Blender-ийн суурь фонт (Inter, кирилл Ү/Ө-тэй)-оор үсгийг меш болгоно."""
    cu = bpy.data.curves.new('Glyph_' + ch, 'FONT')
    cu.body = ch
    cu.size = size
    cu.extrude = depth / 2
    cu.resolution_u = 3
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    tmp = bpy.data.objects.new('tmp_' + ch, cu)
    coll.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    if not me.vertices:
        raise RuntimeError(f'Фонтод «{ch}» үсэг алга')
    # XY хавтгайгаас урагш (-Y) харуулж, bbox-ийн төвд авчирна
    me.transform(Matrix.Rotation(math.radians(90), 4, 'X'))
    xs = [v.co.x for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    me.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, 0, -(min(zs) + max(zs)) / 2)))
    me.materials.clear()
    me.materials.append(mat)
    me.name = 'Glyph_' + ch
    return me


R = math.radians

# ------------------------------------------------------------------ дүр
root = empty('Taa')

# Бие — ногоон үсгэн хавтан
BODY_W, BODY_D, BODY_H, BODY_Z = 1.5, 1.2, 1.5, 1.0
body = add_bevel(obj('Body', rounded_box('Body', (BODY_W, BODY_D, BODY_H), M['body']), root, (0, 0, BODY_Z)), 0.3, 5)
FRONT = -BODY_D / 2

# Нүүр (урд талын хавтгай дээр)
face = empty('Face', root, (0, FRONT, BODY_Z))
for side, sx in (('L', -1), ('R', 1)):
    eye = empty(f'Eye_{side}', face, (0.33 * sx, 0, 0.17))
    obj(f'Sclera_{side}', sphere(f'Sclera_{side}', 0.21, M['eye'], 24, 12, (1, 0.42, 1.18)), eye, (0, 0.02, 0))
    pupil = empty(f'Pupil_{side}', eye, (0.025 * sx, -0.058, -0.015))
    obj(f'Iris_{side}', sphere(f'Iris_{side}', 0.125, M['pupil'], 20, 10, (1, 0.35, 1.12)), pupil)
    obj(f'Shine_{side}', sphere(f'Shine_{side}', 0.042, M['shine'], 10, 5), pupil, (0.045, -0.04, 0.055))
    obj(f'Glint_{side}', sphere(f'Glint_{side}', 0.02, M['shine'], 8, 4), pupil, (-0.04, -0.04, -0.05))
    obj(f'Blush_{side}', sphere(f'Blush_{side}', 0.1, M['blush'], 14, 7, (1.35, 0.25, 0.8)), face,
        (0.5 * sx, 0.012, -0.12))

mouth = obj('Mouth', d_shape('Mouth', 0.15, 0.05, M['mouth']), face, (0, 0.0, -0.13))
obj('Tongue', sphere('Tongue', 0.07, M['tongue'], 12, 6, (1.2, 0.4, 0.55)), mouth, (0, -0.014, -0.085))

# Гар — мөрний тэнхлэгт эргэнэ. Баруун гар (дэлгэцийн баруун) даллана.
arms = {}
for side, sx, ang in (('L', -1, 25), ('R', 1, -143)):
    arm = empty(f'Arm_{side}', root, (0.74 * sx, 0, 1.08), (0, R(ang), 0))
    obj(f'ArmMesh_{side}', sphere(f'ArmMesh_{side}', 1.0, M['limb'], 16, 8, (0.14, 0.14, 0.3)), arm, (0, 0, -0.24))
    obj(f'Hand_{side}', sphere(f'Hand_{side}', 0.15, M['limb'], 16, 8), arm, (0, 0, -0.52))
    arms[side] = arm

# Монгол гутал — хошуу нь дээшээ эргэсэн
for side, sx in (('L', -1), ('R', 1)):
    foot = empty(f'Foot_{side}', root, (0.36 * sx, -0.08, 0.16))
    obj(f'Boot_{side}', sphere(f'Boot_{side}', 1.0, M['boot'], 18, 9, (0.27, 0.36, 0.17)), foot)
    obj(f'BootTrim_{side}', torus(f'BootTrim_{side}', 0.2, 0.035, M['gold'], 20, 6, (1.05, 1.3, 1)), foot,
        (0, 0.02, 0.1))
    obj(f'Toe_{side}', curl(f'Toe_{side}', M['boot']), foot, (0, -0.26, -0.04))

# Монгол малгай: зузаан хилэн хүрээ, шар орой дээр улаан залаа, алтан сампин, ар талдаа тууз
hat = empty('Hat', root, (0, 0.02, BODY_Z + BODY_H / 2 - 0.03), (0, R(-8), 0))
obj('HatBrim', torus('HatBrim', 0.43, 0.14, M['velvet'], 36, 12, (1, 1, 1.25)), hat, (0, 0, 0.06))
DOME = (0.4, 0.4, 0.44)
DOME_Z = 0.18
obj('HatCrown', sphere('HatCrown', 1.0, M['gold'], 24, 12, DOME), hat, (0, 0, DOME_Z))
for i in range(22):
    phi = 2 * math.pi * i / 22
    th = 0.74
    a, c = DOME[0], DOME[2]
    p = Vector((a * math.sin(th) * math.cos(phi), a * math.sin(th) * math.sin(phi), DOME_Z + c * math.cos(th)))
    tilt = math.atan2(math.sin(th) / a, math.cos(th) / c)
    n = Vector((math.sin(tilt) * math.cos(phi), math.sin(tilt) * math.sin(phi), math.cos(tilt)))
    obj(f'Fringe_{i:02d}', sphere(f'Fringe_{i:02d}', 1.0, M['hat'], 8, 4, (0.27, 0.038, 0.018)), hat,
        tuple(p + n * 0.012), (0, tilt, phi))
obj('HatRing', torus('HatRing', 0.085, 0.028, M['hat'], 16, 6), hat, (0, 0, DOME_Z + DOME[2] - 0.01))
obj('HatKnot', sphere('HatKnot', 0.095, M['gold'], 14, 7), hat, (0, 0, DOME_Z + DOME[2] + 0.07))
for side, sx in (('L', -1), ('R', 1)):
    obj(f'Ribbon_{side}', box(f'Ribbon_{side}', (0.09, 0.02, 0.5), M['hat']), hat,
        (0.1 * sx, 0.44, -0.16), (R(-14), R(6 * sx), 0))

# Хөвөх үсгэн хавтангууд — сайтын лого «ҮГ ТАА»-ийн өнгөөр
TILES = [
    ('Tile_1', 'Ү', M['tile_green'], (-1.32, 0.12, 1.82), (R(8), R(-10), R(16))),
    ('Tile_2', 'Г', M['tile_gold'], (-1.3, 0.0, 0.72), (R(-6), R(12), R(-12))),
    ('Tile_3', 'Т', M['tile_navy'], (1.36, 0.1, 0.56), (R(6), R(-8), R(-18))),
]
TILE = 0.5
tile_objs = []
for name, ch, mat, loc, rot in TILES:
    t = add_bevel(obj(name, rounded_box(name, (TILE, TILE, TILE), mat), root, loc, rot), 0.09, 3)
    obj(f'{name}_Letter', letter_mesh(ch, 0.36, 0.03, M['letter']), t, (0, -TILE / 2 - 0.005, 0))
    tile_objs.append(t)

mascot_objs = [o for o in scene.objects]


def descendants(o):
    out = [o]
    for c in o.children:
        out += descendants(c)
    return out


# ------------------------------------------------------------------ гэрэл, камер
def aim(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def area_light(name, loc, energy, color, size):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy
    ld.color = color
    ld.size = size
    ob = bpy.data.objects.new(name, ld)
    coll.objects.link(ob)
    ob.location = loc
    aim(ob, (0, 0, 1.1))
    return ob


area_light('Key', (-3.2, -4.2, 4.6), 900, (1.0, 0.95, 0.88), 3.0)
area_light('Fill', (4.2, -3.2, 2.0), 380, (0.78, 0.86, 1.0), 3.5)
area_light('Rim', (1.5, 4.5, 4.2), 1100, (1.0, 0.62, 0.72), 2.5)

world = bpy.data.worlds.new('Night')
scene.world = world
try:
    world.use_nodes = True
except Exception:
    pass
bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
if bg is None:
    bg = world.node_tree.nodes.new('ShaderNodeBackground')
    out = world.node_tree.nodes.new('ShaderNodeOutputWorld')
    world.node_tree.links.new(bg.outputs[0], out.inputs[0])
bg.inputs[0].default_value = (*lin('#1a2447'), 1.0)
bg.inputs[1].default_value = 0.8
world.color = lin('#0a0f1f')


def world_bounds(objs):
    bpy.context.view_layer.update()
    pts = []
    for o in objs:
        if o.type != 'MESH':
            continue
        pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def camera(name, direction, objs, lens=55, ortho_fill=None):
    cd = bpy.data.cameras.new(name)
    cam = bpy.data.objects.new(name, cd)
    coll.objects.link(cam)
    lo, hi = world_bounds(objs)
    center = (lo + hi) / 2
    d = Vector(direction).normalized()
    if ortho_fill:
        cd.type = 'ORTHO'
        cd.ortho_scale = max(hi.x - lo.x, hi.z - lo.z) / ortho_fill
        cam.location = center + d * 10
    else:
        cd.lens = lens
        cd.sensor_fit = 'AUTO'
        radius = (hi - lo).length / 2
        fov = 2 * math.atan(cd.sensor_width / 2 / lens)
        cam.location = center + d * (radius / math.sin(fov / 2) * 0.93)
    cd.clip_end = 100
    aim(cam, center)
    return cam


everything = descendants(root)
without_tiles = [o for o in everything if not any(o in descendants(t) for t in tile_objs)]
cam_hero = camera('Cam_Hero', (0.34, -1.0, 0.22), everything, lens=60)
cam_icon = camera('Cam_Icon', (0.0, -1.0, 0.1), without_tiles, ortho_fill=0.62)
cam_store = camera('Cam_Store', (0.0, -1.0, 0.1), without_tiles, ortho_fill=0.84)
scene.camera = cam_hero

# ------------------------------------------------------------------ .blend доторх анимаци (48 кадр, давтагдана)
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 48


def keys(ob, path, index, frames_vals):
    for f, v in frames_vals:
        getattr(ob, path)[index] = v
        ob.keyframe_insert(path, index=index, frame=f)


base_z = root.location.z
keys(root, 'location', 2, [(1, base_z), (13, base_z + 0.07), (25, base_z), (37, base_z + 0.07), (48, base_z)])
wave = arms['R'].rotation_euler[1]
keys(arms['R'], 'rotation_euler', 1,
     [(1, wave), (7, wave + R(18)), (13, wave), (19, wave + R(18)), (25, wave), (48, wave)])
for i, t in enumerate(tile_objs):
    z = t.location.z
    ph = i * 8
    keys(t, 'location', 2, [(1, z), (12 + ph % 24, z + 0.1), (48, z)])
    rz = t.rotation_euler[2]
    keys(t, 'rotation_euler', 2, [(1, rz), (24, rz + R(10)), (48, rz)])
for ob in (root, arms['R'], *tile_objs):
    if ob.animation_data and ob.animation_data.action:
        try:
            for fc in ob.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = 'BEZIER'
        except Exception:
            pass  # 5.x-ийн layered action — анхдагч bezier хэвээр
scene.frame_set(1)

# ------------------------------------------------------------------ рендер тохиргоо
for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try:
        scene.render.engine = eng
        break
    except Exception:
        continue
try:
    scene.eevee.taa_render_samples = 64
except Exception:
    pass
try:
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
except Exception:
    pass
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.resolution_percentage = 100


def render(cam, path, size, hide=()):
    for o in hide:
        o.hide_render = True
    scene.camera = cam
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in hide:
        o.hide_render = False
    print('rendered', path)


tile_parts = [o for t in tile_objs for o in descendants(t)]
if DO_RENDER:
    render(cam_hero, os.path.join(RENDERS, 'taa-hero.png'), 1024)
    render(cam_icon, os.path.join(RENDERS, 'taa-icon-fg.png'), 1024, tile_parts)
    render(cam_store, os.path.join(RENDERS, 'taa-store.png'), 1024, tile_parts)
scene.camera = cam_hero

# ------------------------------------------------------------------ GLB экспорт
bpy.ops.object.select_all(action='DESELECT')
for o in everything:
    o.select_set(True)
bpy.context.view_layer.objects.active = root

wanted = dict(
    filepath=os.path.join(ASSETS, 'taa.raw.glb'),
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_texcoords=False,
    export_normals=True,
    export_tangents=False,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_animations=False,
    export_extras=False,
    export_skins=False,
    export_morph=False,
)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
skipped = [k for k in wanted if k not in props]
bpy.ops.export_scene.gltf(**{k: v for k, v in wanted.items() if k in props})
if skipped:
    print('glTF: unsupported options skipped:', skipped)

# ------------------------------------------------------------------ .blend хадгалах
bpy.ops.object.select_all(action='DESELECT')
try:
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                sp = area.spaces[0]
                sp.shading.type = 'MATERIAL'
                sp.region_3d.view_perspective = 'CAMERA'
except Exception:
    pass
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DESIGN, 'taa-mascot.blend'), compress=True)

verts = sum(len(o.data.vertices) for o in everything if o.type == 'MESH')
print(f'OK: {len(everything)} objects, {verts} base verts, engine={scene.render.engine}')
