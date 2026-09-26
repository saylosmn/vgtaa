package mn.ugtaa.app.mascot

import android.opengl.GLES30.*
import android.opengl.Matrix
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan
import kotlin.random.Random

/**
 * «Таа» дүрийг OpenGL ES 3-аар зурна. Зөвхөн GL урсгал дээр дуудагдана (MascotView.RenderThread).
 *
 * Хөдөлгөөн (design/blender/build_taa.py-ийн зангилааны нэрс):
 *  Taa      — хөвөх, зөөлөн найгах, чирэхэд эргэх, товшиход үсэрч нэг эргэнэ
 *  Arm_R    — даллана; Arm_L, Hat — бага зэрэг найгана
 *  Eye_L/R  — 2–5 секунд тутам нүд ирмэнэ; Pupil_L/R — хуруу руу харна
 *  Tile_1…3 — үсгэн хавтангууд хөвж эргэнэ
 */
internal class MascotRenderer(private val loadModel: () -> ByteArray) {

    /** UI урсгалаас бичигдэнэ */
    @Volatile var dragVelocity = 0f
    @Volatile var dragDelta = 0f
    @Volatile var dragging = false
    @Volatile var lookX = 0f
    @Volatile var lookY = 0f
    @Volatile var tapRequested = false

    var onFirstFrame: (() -> Unit)? = null
    var onFailure: ((Throwable) -> Unit)? = null

    private lateinit var model: Gltf
    private var ready = false
    private var failed = false
    private var firstFrameSent = false

    // ---------------------------------------------------------------- GPU нөөц
    private class DrawPrim(val vao: Int, val count: Int, val indexType: Int, val indexOffset: Int, val mode: Int, val material: Int)

    private var meshPrims: List<List<DrawPrim>> = emptyList()
    private val glBuffers = mutableListOf<Int>()
    private val glVaos = mutableListOf<Int>()
    private var prog = 0
    private var shadowProg = 0
    private var shadowVao = 0
    private var shadowVbo = 0

    private var uMvp = 0; private var uModel = 0; private var uNormal = 0; private var uCam = 0
    private var uBase = 0; private var uEmit = 0; private var uRough = 0
    private var sMvp = 0; private var sAlpha = 0

    // ---------------------------------------------------------------- хөдөлгөөний төлөв
    private lateinit var restT: Array<FloatArray>
    private lateinit var restR: Array<FloatArray>
    private lateinit var restS: Array<FloatArray>
    private lateinit var curT: Array<FloatArray>
    private lateinit var curR: Array<FloatArray>
    private lateinit var curS: Array<FloatArray>
    private lateinit var local: Array<FloatArray>
    private lateinit var world: Array<FloatArray>

    private var nRoot = -1; private var nArmR = -1; private var nArmL = -1; private var nHat = -1
    private var nEyeL = -1; private var nEyeR = -1; private var nPupilL = -1; private var nPupilR = -1
    private var tiles = IntArray(0)

    private val center = FloatArray(3)
    private var radius = 1.5f
    private var groundY = 0f
    private val proj = FloatArray(16)
    private val view = FloatArray(16)
    private val viewProj = FloatArray(16)
    private val mvp = FloatArray(16)
    private val shadowModel = FloatArray(16)
    private val normal3 = FloatArray(9)
    private val eye = FloatArray(3)
    private val q = FloatArray(4)
    private val tmpQ = FloatArray(4)
    private val identity = FloatArray(16).also { Matrix.setIdentityM(it, 0) }

    private var startNs = 0L
    private var lastNs = 0L
    private var yaw = 0f
    private var yawVel = 0f
    private var jumpStart = -10f
    private var blinkStart = -10f
    private var nextBlink = 1.5f
    private var lookSmoothX = 0f
    private var lookSmoothY = 0f
    private var width = 1
    private var height = 1

    // ================================================================ GL амьдралын мөчлөг
    fun onCreated() {
        try {
            model = Gltf.parse(loadModel())
            prog = program(VERT, FRAG)
            uMvp = glGetUniformLocation(prog, "uMvp"); uModel = glGetUniformLocation(prog, "uModel")
            uNormal = glGetUniformLocation(prog, "uNormal"); uCam = glGetUniformLocation(prog, "uCam")
            uBase = glGetUniformLocation(prog, "uBase"); uEmit = glGetUniformLocation(prog, "uEmit")
            uRough = glGetUniformLocation(prog, "uRough")
            shadowProg = program(SHADOW_VERT, SHADOW_FRAG)
            sMvp = glGetUniformLocation(shadowProg, "uMvp"); sAlpha = glGetUniformLocation(shadowProg, "uAlpha")
            upload()
            initAnimation()
            computeBounds()
            glEnable(GL_DEPTH_TEST)
            glDisable(GL_CULL_FACE) // зарим меш (үсэг) хоёр талтай — шейдер нормалийг эргүүлнэ
            glClearColor(0f, 0f, 0f, 0f)
            ready = true
        } catch (t: Throwable) {
            failed = true
            onFailure?.invoke(t)
        }
    }

    fun onSize(w: Int, h: Int) {
        width = max(1, w); height = max(1, h)
        glViewport(0, 0, width, height)
        if (!ready) return
        val aspect = width.toFloat() / height
        val fovY = 30f
        val halfY = Math.toRadians(fovY / 2.0)
        val halfX = atan(tan(halfY) * aspect)
        val fit = min(halfY, halfX)
        // Хөвөх, үсрэх зайг тооцож 12% нэмнэ
        val dist = (radius * 1.12f / sin(fit)).toFloat()
        Matrix.perspectiveM(proj, 0, fovY, aspect, dist * 0.1f, dist * 4f)
        eye[0] = center[0]; eye[1] = center[1] + radius * 0.18f; eye[2] = center[2] + dist
        Matrix.setLookAtM(view, 0, eye[0], eye[1], eye[2], center[0], center[1] + radius * 0.02f, center[2], 0f, 1f, 0f)
        Matrix.multiplyMM(viewProj, 0, proj, 0, view, 0)
    }

    fun onFrame(nowNs: Long) {
        glClear(GL_COLOR_BUFFER_BIT or GL_DEPTH_BUFFER_BIT)
        if (!ready) return
        if (startNs == 0L) { startNs = nowNs; lastNs = nowNs }
        val t = (nowNs - startNs) / 1e9f
        val dt = min(0.05f, (nowNs - lastNs) / 1e9f)
        lastNs = nowNs

        animate(t, dt)
        for (r in model.roots) traverse(r, identity)
        drawShadow(t)
        drawNodes()

        if (!firstFrameSent) {
            firstFrameSent = true
            onFirstFrame?.invoke()
        }
    }

    fun onDestroyed() {
        if (glBuffers.isNotEmpty()) glDeleteBuffers(glBuffers.size, glBuffers.toIntArray(), 0)
        if (glVaos.isNotEmpty()) glDeleteVertexArrays(glVaos.size, glVaos.toIntArray(), 0)
        if (prog != 0) glDeleteProgram(prog)
        if (shadowProg != 0) glDeleteProgram(shadowProg)
        glBuffers.clear(); glVaos.clear()
        prog = 0; shadowProg = 0
        ready = false
    }

    // ================================================================ ачаалал
    private fun upload() {
        val m = model
        // bufferView бүрт нэг GL буфер (атрибут ба индекс тусдаа view-д байдаг)
        val vbo = IntArray(m.bufferViews.size)
        val ibo = IntArray(m.bufferViews.size)
        fun buffer(view: Int, target: Int, cache: IntArray): Int {
            if (cache[view] != 0) return cache[view]
            val bv = m.bufferViews[view]
            val data = ByteBuffer.allocateDirect(bv.byteLength).order(ByteOrder.nativeOrder())
            val src = m.bin.duplicate()
            src.position(bv.byteOffset); src.limit(bv.byteOffset + bv.byteLength)
            data.put(src).position(0)
            val ids = IntArray(1)
            glGenBuffers(1, ids, 0)
            glBindBuffer(target, ids[0])
            glBufferData(target, bv.byteLength, data, GL_STATIC_DRAW)
            glBuffers += ids[0]
            cache[view] = ids[0]
            return ids[0]
        }

        meshPrims = m.meshes.map { prims ->
            prims.map { p ->
                val ids = IntArray(1)
                glGenVertexArrays(1, ids, 0)
                val vao = ids[0]
                glVaos += vao
                glBindVertexArray(vao)
                for ((loc, acc) in listOf(0 to p.position, 1 to p.normal)) {
                    val a = m.accessors[acc]
                    glBindBuffer(GL_ARRAY_BUFFER, buffer(a.bufferView, GL_ARRAY_BUFFER, vbo))
                    glEnableVertexAttribArray(loc)
                    val stride = m.bufferViews[a.bufferView].byteStride
                    glVertexAttribPointer(loc, 3, a.componentType, a.normalized, stride, a.byteOffset)
                }
                val ia = m.accessors[p.indices]
                glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, buffer(ia.bufferView, GL_ELEMENT_ARRAY_BUFFER, ibo))
                glBindVertexArray(0)
                DrawPrim(vao, ia.count, ia.componentType, ia.byteOffset, p.mode, p.material)
            }
        }
        glBindBuffer(GL_ARRAY_BUFFER, 0)

        // Газрын сүүдэр: XZ хавтгай дээрх дөрвөлжин, шейдер нь зууван бүдэгрэлт зурна
        val quad = floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)
        val qb = ByteBuffer.allocateDirect(quad.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().put(quad)
        qb.position(0)
        val ids = IntArray(1)
        glGenVertexArrays(1, ids, 0); shadowVao = ids[0]; glVaos += shadowVao
        glGenBuffers(1, ids, 0); shadowVbo = ids[0]; glBuffers += shadowVbo
        glBindVertexArray(shadowVao)
        glBindBuffer(GL_ARRAY_BUFFER, shadowVbo)
        glBufferData(GL_ARRAY_BUFFER, quad.size * 4, qb, GL_STATIC_DRAW)
        glEnableVertexAttribArray(0)
        glVertexAttribPointer(0, 2, GL_FLOAT, false, 0, 0)
        glBindVertexArray(0)
        glBindBuffer(GL_ARRAY_BUFFER, 0)
    }

    private fun initAnimation() {
        val n = model.nodes.size
        restT = Array(n) { model.nodes[it].translation.copyOf() }
        restR = Array(n) { model.nodes[it].rotation.copyOf() }
        restS = Array(n) { model.nodes[it].scale.copyOf() }
        curT = Array(n) { FloatArray(3) }
        curR = Array(n) { FloatArray(4) }
        curS = Array(n) { FloatArray(3) }
        local = Array(n) { FloatArray(16) }
        world = Array(n) { FloatArray(16) }
        nRoot = model.nodeIndex("Taa"); nArmR = model.nodeIndex("Arm_R"); nArmL = model.nodeIndex("Arm_L")
        nHat = model.nodeIndex("Hat")
        nEyeL = model.nodeIndex("Eye_L"); nEyeR = model.nodeIndex("Eye_R")
        nPupilL = model.nodeIndex("Pupil_L"); nPupilR = model.nodeIndex("Pupil_R")
        tiles = (1..9).map { model.nodeIndex("Tile_$it") }.filter { it >= 0 }.toIntArray()
    }

    /** Амралтын байрлал дахь дэлхийн хүрээ (камерын зай, газрын түвшин). */
    private fun computeBounds() {
        for (i in model.nodes.indices) {
            System.arraycopy(restT[i], 0, curT[i], 0, 3)
            System.arraycopy(restR[i], 0, curR[i], 0, 4)
            System.arraycopy(restS[i], 0, curS[i], 0, 3)
        }
        for (r in model.roots) traverse(r, identity)
        val lo = floatArrayOf(Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE)
        val hi = floatArrayOf(-Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE)
        val v = FloatArray(3); val w = FloatArray(3)
        model.nodes.forEachIndexed { i, node ->
            if (node.mesh < 0) return@forEachIndexed
            for (p in model.meshes[node.mesh]) {
                val count = model.accessors[p.position].count
                for (k in 0 until count) {
                    model.readVec(p.position, k, v)
                    Transform.transformPoint(world[i], v, w)
                    for (c in 0..2) { lo[c] = min(lo[c], w[c]); hi[c] = max(hi[c], w[c]) }
                }
            }
        }
        if (lo[0] > hi[0]) return
        for (c in 0..2) center[c] = (lo[c] + hi[c]) / 2
        radius = max(0.5f, sqrt((hi[0] - lo[0]).sq() + (hi[1] - lo[1]).sq() + (hi[2] - lo[2]).sq()) / 2)
        groundY = lo[1]
    }

    // ================================================================ хөдөлгөөн
    private fun animate(t: Float, dt: Float) {
        for (i in model.nodes.indices) {
            System.arraycopy(restT[i], 0, curT[i], 0, 3)
            System.arraycopy(restR[i], 0, curR[i], 0, 4)
            System.arraycopy(restS[i], 0, curS[i], 0, 3)
        }

        // Чирэх: хурдаар эргээд, тавихад инерци нь сулраад анхны байрлал руу пүрш шиг буцна
        val d = dragDelta
        dragDelta -= d
        if (dragging) {
            yaw += d
            yawVel = dragVelocity
        } else {
            yaw += yawVel * dt
            yawVel *= (1f - min(1f, dt * 3.5f))
            yaw = wrapAngle(yaw) // хамгийн богино замаар буцна
            yaw -= yaw * min(1f, dt * 1.6f)
        }
        if (tapRequested) {
            tapRequested = false
            if (t - jumpStart > JUMP) jumpStart = t
        }
        val jp = ((t - jumpStart) / JUMP).coerceIn(0f, 1f)
        val jumping = t - jumpStart < JUMP
        val jumpH = if (jumping) sin(PI.toFloat() * jp) * radius * 0.32f else 0f
        val spin = if (jumping) easeInOut(jp) * 2f * PI.toFloat() else 0f

        if (nRoot >= 0) {
            val bob = (0.5f + 0.5f * sin(t * 2.4f)) * radius * 0.03f
            curT[nRoot][1] += bob + jumpH
            val sway = 0.16f * sin(t * 0.6f)
            Transform.preRotate(restR[nRoot], 0f, 1f, 0f, yaw + sway + spin, tmpQ, curR[nRoot])
            // Газардахад бага зэрэг хавтайна
            if (jumping && jp > 0.85f) {
                val sq = sin((jp - 0.85f) / 0.15f * PI.toFloat()) * 0.07f
                curS[nRoot][0] *= 1 + sq; curS[nRoot][2] *= 1 + sq; curS[nRoot][1] *= 1 - sq
            }
        }
        // Blender-ийн Y тэнхлэг → glTF-ийн −Z: гар Z тэнхлэгийг тойрон даллана
        val waveSpeed = if (jumping) 14f else 7f
        if (nArmR >= 0) Transform.preRotate(restR[nArmR], 0f, 0f, 1f, 0.34f * sin(t * waveSpeed), tmpQ, curR[nArmR])
        if (nArmL >= 0) Transform.preRotate(restR[nArmL], 0f, 0f, 1f, 0.07f * sin(t * 2.4f + 1f), tmpQ, curR[nArmL])
        if (nHat >= 0) Transform.preRotate(restR[nHat], 0f, 0f, 1f, 0.045f * sin(t * 2.4f + 0.6f), tmpQ, curR[nHat])

        // Нүд ирмэх
        val bp = blinkPhase(t)
        if (nEyeL >= 0) curS[nEyeL][1] *= 1f - 0.92f * bp
        if (nEyeR >= 0) curS[nEyeR][1] *= 1f - 0.92f * bp

        // Харц: хуруу руу, эсвэл аяархан тэнүүчилнэ
        val tx = if (dragging || abs(lookX) + abs(lookY) > 0.01f) lookX else 0.55f * sin(t * 0.7f)
        val ty = if (dragging || abs(lookX) + abs(lookY) > 0.01f) lookY else 0.35f * sin(t * 0.43f + 1f)
        val k = min(1f, dt * 8f)
        lookSmoothX += (tx - lookSmoothX) * k
        lookSmoothY += (ty - lookSmoothY) * k
        if (nPupilL >= 0) { curT[nPupilL][0] += lookSmoothX * 0.035f; curT[nPupilL][1] += lookSmoothY * 0.03f }
        if (nPupilR >= 0) { curT[nPupilR][0] += lookSmoothX * 0.035f; curT[nPupilR][1] += lookSmoothY * 0.03f }

        // Үсгэн хавтангууд
        tiles.forEachIndexed { i, n ->
            curT[n][1] += sin(t * 1.6f + i * 2.1f) * radius * 0.04f
            Transform.preRotate(restR[n], 0f, 1f, 0f, 0.35f * sin(t * 0.9f + i * 1.3f), tmpQ, q)
            Transform.preRotate(q, 0f, 0f, 1f, 0.12f * sin(t * 1.1f + i), tmpQ, curR[n])
        }
    }

    /** 0 → нээлттэй, 1 → аньсан. 2–5 секунд тутам 0.16 секундын турш ирмэнэ. */
    private fun blinkPhase(t: Float): Float {
        if (t - blinkStart > BLINK) {
            if (t < nextBlink) return 0f
            blinkStart = t
            nextBlink = t + 2.2f + Random.nextFloat() * 3f
        }
        return sin(((t - blinkStart) / BLINK) * PI.toFloat())
    }

    private fun traverse(i: Int, parent: FloatArray) {
        val node = model.nodes[i]
        if (node.matrix != null) System.arraycopy(node.matrix, 0, local[i], 0, 16)
        else Transform.compose(curT[i], curR[i], curS[i], local[i])
        Transform.mul(parent, local[i], world[i])
        for (c in node.children) traverse(c, world[i])
    }

    // ================================================================ зурах
    private fun drawShadow(t: Float) {
        val jp = ((t - jumpStart) / JUMP).coerceIn(0f, 1f)
        val lift = if (t - jumpStart < JUMP) sin(PI.toFloat() * jp) else 0f
        val bob = 0.5f + 0.5f * sin(t * 2.4f)
        val shrink = 1f - 0.35f * lift - 0.06f * bob
        val m = shadowModel
        Matrix.setIdentityM(m, 0)
        Matrix.translateM(m, 0, center[0], groundY + 0.002f, center[2] + radius * 0.05f)
        Matrix.scaleM(m, 0, radius * 0.62f * shrink, 1f, radius * 0.34f * shrink)
        Matrix.multiplyMM(mvp, 0, viewProj, 0, m, 0)
        glUseProgram(shadowProg)
        glUniformMatrix4fv(sMvp, 1, false, mvp, 0)
        glUniform1f(sAlpha, 0.42f * (1f - 0.55f * lift))
        glEnable(GL_BLEND)
        glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA)
        glDepthMask(false)
        glBindVertexArray(shadowVao)
        glDrawArrays(GL_TRIANGLE_STRIP, 0, 4)
        glDepthMask(true)
        glDisable(GL_BLEND)
    }

    private fun drawNodes() {
        glUseProgram(prog)
        glUniform3f(uCam, eye[0], eye[1], eye[2])
        model.nodes.forEachIndexed { i, node ->
            if (node.mesh < 0) return@forEachIndexed
            val w = world[i]
            Matrix.multiplyMM(mvp, 0, viewProj, 0, w, 0)
            Transform.normalMatrix(w, normal3)
            glUniformMatrix4fv(uMvp, 1, false, mvp, 0)
            glUniformMatrix4fv(uModel, 1, false, w, 0)
            glUniformMatrix3fv(uNormal, 1, false, normal3, 0)
            for (p in meshPrims[node.mesh]) {
                val mat = model.materials.getOrNull(p.material)
                val c = mat?.baseColor ?: WHITE
                val e = mat?.emissive ?: BLACK
                glUniform4f(uBase, c[0], c[1], c[2], c[3])
                glUniform3f(uEmit, e[0], e[1], e[2])
                glUniform1f(uRough, mat?.roughness ?: 1f)
                glBindVertexArray(p.vao)
                glDrawElements(p.mode, p.count, p.indexType, p.indexOffset)
            }
        }
        glBindVertexArray(0)
    }

    // ================================================================ туслах
    private fun program(vs: String, fs: String): Int {
        fun shader(type: Int, src: String): Int {
            val s = glCreateShader(type)
            glShaderSource(s, src)
            glCompileShader(s)
            val ok = IntArray(1)
            glGetShaderiv(s, GL_COMPILE_STATUS, ok, 0)
            if (ok[0] == 0) error("shader: " + glGetShaderInfoLog(s).also { glDeleteShader(s) })
            return s
        }
        val p = glCreateProgram()
        val v = shader(GL_VERTEX_SHADER, vs)
        val f = shader(GL_FRAGMENT_SHADER, fs)
        glAttachShader(p, v); glAttachShader(p, f)
        glBindAttribLocation(p, 0, "aPos"); glBindAttribLocation(p, 1, "aNor")
        glLinkProgram(p)
        glDeleteShader(v); glDeleteShader(f)
        val ok = IntArray(1)
        glGetProgramiv(p, GL_LINK_STATUS, ok, 0)
        if (ok[0] == 0) error("link: " + glGetProgramInfoLog(p))
        return p
    }

    private fun Float.sq() = this * this
    private fun easeInOut(x: Float) = if (x < 0.5f) 2 * x * x else 1 - (-2 * x + 2).let { it * it } / 2
    private fun wrapAngle(a: Float): Float {
        var x = a
        val tau = 2f * PI.toFloat()
        while (x > PI) x -= tau
        while (x < -PI) x += tau
        return x
    }

    companion object {
        private const val JUMP = 0.9f
        private const val BLINK = 0.16f
        private val WHITE = floatArrayOf(1f, 1f, 1f, 1f)
        private val BLACK = floatArrayOf(0f, 0f, 0f)

        private const val VERT = """#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNor;
uniform mat4 uMvp;
uniform mat4 uModel;
uniform mat3 uNormal;
out vec3 vN;
out vec3 vW;
void main() {
    vW = (uModel * vec4(aPos, 1.0)).xyz;
    vN = uNormal * aNor;
    gl_Position = uMvp * vec4(aPos, 1.0);
}"""

        /* Blender-ийн гурван гэрлийн (Key/Fill/Rim) загварчлал: дулаан үндсэн, хүйтэн нөхөх, ягаан арын гэрэл.
           Өнгө шугаман орон зайд тооцогдоод sRGB руу шилжинэ. */
        private const val FRAG = """#version 300 es
precision mediump float;
in vec3 vN;
in vec3 vW;
uniform vec3 uCam;
uniform vec4 uBase;
uniform vec3 uEmit;
uniform float uRough;
out vec4 oColor;
void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(uCam - vW);
    vec3 key = normalize(vec3(-0.55, 0.78, 0.62));
    vec3 fill = normalize(vec3(0.75, 0.22, 0.5));
    vec3 rim = normalize(vec3(0.3, 0.55, -0.85));
    float hemi = 0.5 + 0.5 * n.y;
    vec3 amb = mix(vec3(0.07, 0.08, 0.16), vec3(0.26, 0.28, 0.40), hemi);
    vec3 c = uBase.rgb * (amb
        + max(dot(n, key), 0.0) * vec3(1.0, 0.95, 0.88) * 1.1
        + max(dot(n, fill), 0.0) * vec3(0.55, 0.62, 0.85) * 0.45);
    float shin = mix(90.0, 10.0, uRough);
    float spec = pow(max(dot(n, normalize(key + v)), 0.0), shin) * (1.0 - uRough) * 0.9;
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    c += spec + fres * max(dot(n, rim) * 0.6 + 0.4, 0.0) * vec3(1.0, 0.55, 0.68) * 0.5;
    c += uEmit;
    oColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}"""

        private const val SHADOW_VERT = """#version 300 es
layout(location = 0) in vec2 aPos;
uniform mat4 uMvp;
out vec2 vUv;
void main() {
    vUv = aPos;
    gl_Position = uMvp * vec4(aPos.x, 0.0, aPos.y, 1.0);
}"""

        private const val SHADOW_FRAG = """#version 300 es
precision mediump float;
in vec2 vUv;
uniform float uAlpha;
out vec4 oColor;
void main() {
    float d = length(vUv);
    float a = uAlpha * (1.0 - smoothstep(0.15, 1.0, d));
    oColor = vec4(0.0, 0.0, 0.0, a);
}"""
    }
}
