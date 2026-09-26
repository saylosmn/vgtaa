package mn.ugtaa.app.mascot

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.util.AttributeSet
import android.util.Log
import android.view.MotionEvent
import android.view.TextureView
import android.view.ViewConfiguration
import kotlin.math.abs

/**
 * 3D «Таа» дүр. TextureView тул бусад View-тэй адил alpha/анимацид оролцоно
 * (SurfaceView-ээс ялгаатай нь ачааллын дэлгэцтэй хамт уусаж алга болно).
 *
 * Чирвэл эргэнэ, товшвол үсэрнэ, хүүхэн хараа нь хуруу руу харна.
 */
class MascotView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : TextureView(context, attrs), TextureView.SurfaceTextureListener {

    /** Анхны кадр зурагдмагц (UI урсгал дээр) — статик зургийг нуухад */
    var onFirstFrame: (() -> Unit)? = null

    private val renderer = MascotRenderer { context.assets.open(MODEL).use { it.readBytes() } }
    private var thread: RenderThread? = null
    private var paused = false

    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private var downX = 0f
    private var downY = 0f
    private var lastX = 0f
    private var lastT = 0L
    private var moved = false

    init {
        isOpaque = false
        surfaceTextureListener = this
        renderer.onFirstFrame = { post { onFirstFrame?.invoke() } }
        renderer.onFailure = { Log.w(TAG, "3D дүр ачаалагдсангүй, зураг харуулна", it) }
    }

    /** Ачааллын дэлгэц нуугдсан үед батарей хэмнэж зурахаа зогсооно. */
    fun setPaused(value: Boolean) {
        paused = value
        thread?.setPaused(value)
    }

    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
        thread = RenderThread(surface, renderer).also {
            it.resize(width, height)
            it.setPaused(paused)
            it.start()
        }
    }

    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {
        thread?.resize(width, height)
    }

    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        thread?.quit()
        thread = null
        return true
    }

    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) = Unit

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        val w = width.coerceAtLeast(1)
        val h = height.coerceAtLeast(1)
        renderer.lookX = ((e.x / w) * 2f - 1f).coerceIn(-1f, 1f)
        renderer.lookY = (1f - (e.y / h) * 2f).coerceIn(-1f, 1f)
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = e.x; downY = e.y; lastX = e.x; lastT = e.eventTime
                moved = false
                renderer.dragging = true
                renderer.dragVelocity = 0f
                parent?.requestDisallowInterceptTouchEvent(true)
            }
            MotionEvent.ACTION_MOVE -> {
                if (!moved && (abs(e.x - downX) > touchSlop || abs(e.y - downY) > touchSlop)) moved = true
                val dx = (e.x - lastX) / w * ROTATE_PER_WIDTH
                val dt = ((e.eventTime - lastT).coerceAtLeast(1)) / 1000f
                renderer.dragDelta += dx
                renderer.dragVelocity = dx / dt
                lastX = e.x; lastT = e.eventTime
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                renderer.dragging = false
                renderer.lookX = 0f; renderer.lookY = 0f
                if (e.actionMasked == MotionEvent.ACTION_UP && !moved) {
                    renderer.tapRequested = true
                    performClick()
                }
            }
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    /** GL урсгал: EGL контекст, ~60 кадр/сек, түр зогсоох. */
    private class RenderThread(
        private val surface: SurfaceTexture,
        private val renderer: MascotRenderer,
    ) : Thread("taa-mascot-gl") {
        private val lock = Object()
        @Volatile private var running = true
        @Volatile private var paused = false
        @Volatile private var width = 1
        @Volatile private var height = 1
        @Volatile private var sizeChanged = true

        fun resize(w: Int, h: Int) { width = w; height = h; sizeChanged = true }

        fun setPaused(p: Boolean) {
            paused = p
            if (!p) synchronized(lock) { lock.notifyAll() }
        }

        fun quit() {
            running = false
            synchronized(lock) { lock.notifyAll() }
            try { join(1000) } catch (_: InterruptedException) { }
        }

        override fun run() {
            val egl = Egl()
            if (!egl.create(surface)) {
                renderer.onFailure?.invoke(IllegalStateException("OpenGL ES 3 алга"))
                egl.release()
                return
            }
            try {
                renderer.onCreated()
                while (running) {
                    if (paused) {
                        synchronized(lock) { while (paused && running) lock.wait() }
                        continue
                    }
                    if (sizeChanged) { sizeChanged = false; renderer.onSize(width, height) }
                    val start = System.nanoTime()
                    renderer.onFrame(start)
                    if (!egl.swap()) break
                    val spentMs = (System.nanoTime() - start) / 1_000_000
                    if (spentMs < FRAME_MS) sleep(FRAME_MS - spentMs)
                }
            } catch (_: InterruptedException) {
            } catch (t: Throwable) {
                renderer.onFailure?.invoke(t)
            } finally {
                renderer.onDestroyed()
                egl.release()
            }
        }
    }

    /** EGL14: RGBA8888 + depth, эхлээд 4×MSAA-г оролдоно. */
    private class Egl {
        private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
        private var context: EGLContext = EGL14.EGL_NO_CONTEXT
        private var surface: EGLSurface = EGL14.EGL_NO_SURFACE

        fun create(texture: SurfaceTexture): Boolean {
            display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
            val version = IntArray(2)
            if (display == EGL14.EGL_NO_DISPLAY || !EGL14.eglInitialize(display, version, 0, version, 1)) return false
            val config = choose(4) ?: choose(0) ?: return false
            context = EGL14.eglCreateContext(
                display, config, EGL14.EGL_NO_CONTEXT,
                intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 3, EGL14.EGL_NONE), 0,
            )
            if (context == EGL14.EGL_NO_CONTEXT) return false
            surface = EGL14.eglCreateWindowSurface(display, config, texture, intArrayOf(EGL14.EGL_NONE), 0)
            if (surface == EGL14.EGL_NO_SURFACE) return false
            return EGL14.eglMakeCurrent(display, surface, surface, context)
        }

        private fun choose(samples: Int): EGLConfig? {
            val attrs = mutableListOf(
                EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
                EGL14.EGL_DEPTH_SIZE, 16,
                EGL14.EGL_RENDERABLE_TYPE, EGLExt.EGL_OPENGL_ES3_BIT_KHR,
                EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT,
            )
            if (samples > 0) attrs += listOf(EGL14.EGL_SAMPLE_BUFFERS, 1, EGL14.EGL_SAMPLES, samples)
            attrs += EGL14.EGL_NONE
            val configs = arrayOfNulls<EGLConfig>(1)
            val count = IntArray(1)
            val ok = EGL14.eglChooseConfig(display, attrs.toIntArray(), 0, configs, 0, 1, count, 0)
            return if (ok && count[0] > 0) configs[0] else null
        }

        fun swap(): Boolean = EGL14.eglSwapBuffers(display, surface)

        fun release() {
            if (display == EGL14.EGL_NO_DISPLAY) return
            EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
            if (surface != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, surface)
            if (context != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, context)
            // eglTerminate дуудахгүй: default display-г апп-ын UI (HWUI) хуваалцдаг
            EGL14.eglReleaseThread()
            display = EGL14.EGL_NO_DISPLAY
        }
    }

    private companion object {
        const val TAG = "MascotView"
        const val MODEL = "models/taa.glb"
        const val FRAME_MS = 16L
        const val ROTATE_PER_WIDTH = 4.5f // бүтэн өргөнөөр чирэхэд ≈ 260°
    }
}
