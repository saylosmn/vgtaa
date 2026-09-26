package mn.ugtaa.app

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.getSystemService
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.core.view.updateLayoutParams
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import mn.ugtaa.app.auth.GoogleAuth
import mn.ugtaa.app.mascot.MascotView
import mn.ugtaa.app.reminder.Reminders
import mn.ugtaa.app.web.NativeBridge
import mn.ugtaa.app.web.Site
import mn.ugtaa.app.web.SiteWeb
import org.json.JSONObject
import kotlin.math.max

/**
 * Үг Таа — Android апп.
 *
 * Тоглоом, хэтэвч, админ зэрэг бүх боломж сайтынхаа (index.html/js) кодоор ажиллана — сайт
 * шинэчлэгдэхэд апп өөрөө шинэчлэгдэнэ. Апп нь натив хэсгүүдийг нэмнэ:
 *  • Google-ээр нэвтрэх (Credential Manager) — WebView-д вэб нэвтрэлт хоригдсон тул
 *  • 3D «Таа» дүртэй ачааллын/офлайн дэлгэц (OpenGL ES 3, assets/models/taa.glb)
 *  • Хуваалцах цонх, сайтын холбоос (дуэлийн урилга) апп-д нээгдэх, гадны холбоос Custom Tab-д
 */
class MainActivity : ComponentActivity() {

    private val site = Site(BuildConfig.SITE_URL)
    private val main = Handler(Looper.getMainLooper())

    private lateinit var root: View
    private lateinit var web: WebView
    private lateinit var overlay: View
    private lateinit var overlayContent: View
    private lateinit var mascot: MascotView
    private lateinit var mascotStill: ImageView
    private lateinit var status: TextView
    private lateinit var progress: ProgressBar
    private lateinit var retry: Button

    private lateinit var bridge: NativeBridge
    private lateinit var auth: GoogleAuth

    private var overlayShownAt = 0L
    private var pageFinishedAt = 0L
    private var offline = false
    private var pageReady = false
    private var signingIn = false
    private var siteDark = true
    private var modalOpen = false
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private val hideLater = Runnable { hideOverlay() }
    private val bootCheck = Runnable { checkBooted() }

    /** Мэдэгдлийн зөвшөөрөл (Android 13+). Татгалзвал сануулга зүгээр л гарахгүй. */
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /**
     * Сайтад нээлттэй цонх эсвэл буцах түүх байхад л идэвхтэй — эс бөгөөс
     * системийн predictive back (нүүр дэлгэц рүү) хэвийн ажиллана.
     */
    private val backCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            when {
                modalOpen -> bridge.post("back")
                web.canGoBack() -> web.goBack()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        setContentView(R.layout.activity_main)

        root = findViewById(R.id.root)
        web = findViewById(R.id.web)
        overlay = findViewById(R.id.overlay)
        overlayContent = findViewById(R.id.overlay_content)
        mascot = findViewById(R.id.mascot)
        mascotStill = findViewById(R.id.mascot_still)
        status = findViewById(R.id.status)
        progress = findViewById(R.id.progress)
        retry = findViewById(R.id.retry)

        applyInsets()
        auth = GoogleAuth(this)

        SiteWeb.configure(web, BuildConfig.VERSION_NAME)
        bridge = NativeBridge(web, site.origin, ::onBridgeMessage)
        if (!bridge.install()) Log.w(TAG, "WebView хуучин байна — натив нэвтрэлт идэвхгүй")
        web.webViewClient = Client()
        web.webChromeClient = WebChromeClient()

        mascot.onFirstFrame = { mascotStill.animate().alpha(0f).setDuration(250).start() }
        retry.setOnClickListener { reload() }
        onBackPressedDispatcher.addCallback(this, backCallback)
        watchNetwork()
        Reminders.schedule(this) // утас унтарч асаад, эсвэл апп шинэчлэгдэхэд alarm-ыг сэргээнэ

        showLoading()
        web.loadUrl(deepLink(intent)?.toString() ?: BuildConfig.SITE_URL)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val uri = deepLink(intent) ?: return
        val current = web.url?.let(Uri::parse)
        val fragment = uri.fragment
        val sameDocument = current != null && site.owns(current) &&
            (current.path ?: "/").ifEmpty { "/" } == (uri.path ?: "/").ifEmpty { "/" } &&
            uri.query.isNullOrEmpty()
        if (sameDocument && pageReady && fragment != null && fragment.startsWith("/")) {
            bridge.post("route", "hash" to "#$fragment") // хуудсыг дахин ачаалалгүй шилжинэ
        } else {
            web.loadUrl(uri.toString())
        }
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        if (overlay.isVisible) mascot.setPaused(false)
    }

    override fun onPause() {
        mascot.setPaused(true)
        web.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        networkCallback?.let { getSystemService<ConnectivityManager>()?.unregisterNetworkCallback(it) }
        (web.parent as? ViewGroup)?.removeView(web)
        web.destroy()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- сайтын мессеж
    private fun onBridgeMessage(type: String, data: JSONObject) {
        when (type) {
            "ready" -> {
                pageReady = true
                main.removeCallbacks(bootCheck)
                hideOverlay()
            }
            "signIn" -> signIn()
            "signOut" -> {
                Reminders.onSignOut(this)
                lifecycleScope.launch { auth.signOut() }
            }
            "share" -> share(data.optString("text").take(4000), data.optString("title").take(200))
            "theme" -> {
                siteDark = data.optBoolean("dark", true)
                if (!overlay.isVisible) applySystemBars(siteDark)
            }
            "modal" -> {
                modalOpen = data.optBoolean("open")
                updateBack()
            }
            "daily" -> {
                val date = data.optString("date")
                if (!DATE.matches(date)) return
                val done = data.optBoolean("done")
                Reminders.onDaily(this, date, done)
                // Анхны үгээ дуусгасан агшин — сануулга хэрэгтэй эсэхийг асуухад тохиромжтой
                if (done && Reminders.shouldAskPermission(this)) {
                    notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        }
    }

    private fun updateBack() {
        backCallback.isEnabled = !offline && (modalOpen || web.canGoBack())
    }

    private fun signIn() {
        if (signingIn) return
        signingIn = true
        lifecycleScope.launch {
            when (val r = auth.signIn()) {
                is GoogleAuth.Result.Success -> bridge.post("credential", "credential" to r.idToken)
                is GoogleAuth.Result.Cancelled -> bridge.post("signin_error")
                is GoogleAuth.Result.Failure -> bridge.post("signin_error", "message" to r.message)
            }
            signingIn = false
        }
    }

    private fun share(text: String, title: String) {
        if (text.isBlank()) return
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, text)
            .putExtra(Intent.EXTRA_TITLE, title.ifBlank { getString(R.string.app_name) })
        startActivity(Intent.createChooser(send, getString(R.string.share_title)))
    }

    // ---------------------------------------------------------------- ачааллын / офлайн дэлгэц
    private fun showLoading() {
        offline = false
        updateBack()
        status.setText(R.string.tagline)
        progress.isVisible = true
        retry.isVisible = false
        showOverlay()
    }

    private fun showOffline(message: String) {
        offline = true
        updateBack()
        main.removeCallbacks(hideLater)
        main.removeCallbacks(bootCheck)
        status.text = message
        progress.isVisible = false
        retry.isVisible = true
        showOverlay()
    }

    private fun showOverlay() {
        overlay.animate().cancel()
        if (!overlay.isVisible || overlay.alpha < 1f) overlayShownAt = SystemClock.uptimeMillis()
        overlay.alpha = 1f
        overlay.isVisible = true
        mascot.setPaused(false)
        applySystemBars(dark = true)
    }

    private fun hideOverlay() {
        main.removeCallbacks(hideLater)
        if (offline || !overlay.isVisible) return
        // Хэт богино анивчихгүйн тулд дүр дор хаяж 0.7 секунд харагдана
        val wait = MIN_OVERLAY_MS - (SystemClock.uptimeMillis() - overlayShownAt)
        if (wait > 0) {
            main.postDelayed(hideLater, wait)
            return
        }
        overlay.animate().alpha(0f).setDuration(280).withEndAction {
            if (offline) return@withEndAction
            overlay.isVisible = false
            mascot.setPaused(true)
            applySystemBars(siteDark)
        }.start()
    }

    /**
     * "ready" ирээгүй үед (гүүргүй хуучин сайт, эсвэл JS ачаалагдаагүй) хуудас өөрөө
     * нүүр/апп хэсгээ харуулсан эсэхийг шалгана. Удаан гацвал дахин оролдох товч гаргана.
     */
    private fun checkBooted() {
        if (offline || pageReady || !overlay.isVisible) return
        web.evaluateJavascript(BOOT_PROBE) { result ->
            when {
                pageReady || offline -> Unit
                result == "true" -> hideOverlay()
                SystemClock.uptimeMillis() - pageFinishedAt > BOOT_TIMEOUT_MS -> showOffline(
                    if (!isOnline()) "${getString(R.string.offline_title)}\n${getString(R.string.offline_text)}"
                    else getString(R.string.load_slow),
                )
                else -> main.postDelayed(bootCheck, BOOT_POLL_MS)
            }
        }
    }

    private fun reload() {
        showLoading()
        pageReady = false
        if (web.url.isNullOrEmpty() || web.url == "about:blank") web.loadUrl(BuildConfig.SITE_URL) else web.reload()
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService<ConnectivityManager>() ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    /** Интернэт эргэж ирмэгц офлайн дэлгэцээс өөрөө дахин ачаална. */
    private fun watchNetwork() {
        val cm = getSystemService<ConnectivityManager>() ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                main.post { if (offline && !isFinishing) reload() }
            }
        }
        cm.registerDefaultNetworkCallback(cb)
        networkCallback = cb
    }

    // ---------------------------------------------------------------- дэлгэцийн ирмэг
    private fun applyInsets() {
        val pad = resources.getDimensionPixelSize(R.dimen.overlay_padding)
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            web.updateLayoutParams<ViewGroup.MarginLayoutParams> {
                setMargins(bars.left, bars.top, bars.right, max(bars.bottom, ime.bottom))
            }
            overlayContent.setPadding(bars.left + pad, bars.top, bars.right + pad, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    /** Системийн мөрний өнгийг сайтын гэрэл/харанхуй горимд тааруулна. */
    private fun applySystemBars(dark: Boolean) {
        root.setBackgroundColor(ContextCompat.getColor(this, if (dark) R.color.bg else R.color.bg_light))
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    private fun deepLink(intent: Intent?): Uri? =
        intent?.takeIf { it.action == Intent.ACTION_VIEW }?.data?.takeIf(site::owns)

    // ---------------------------------------------------------------- WebView
    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (site.owns(uri) || !request.isForMainFrame) return false
            SiteWeb.openExternal(this@MainActivity, uri)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            pageReady = false
            modalOpen = false
            main.removeCallbacks(bootCheck)
            updateBack()
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (offline || pageReady) return
            pageFinishedAt = SystemClock.uptimeMillis()
            main.removeCallbacks(bootCheck)
            main.postDelayed(bootCheck, READY_FALLBACK_MS)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            showOffline(
                if (!isOnline()) "${getString(R.string.offline_title)}\n${getString(R.string.offline_text)}"
                else getString(R.string.load_error, error.description),
            )
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            updateBack()
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // WebView-ийн процесс унасан (санах ой дутсан г.м.) — шинэ WebView-тэйгээр дахин эхлүүлнэ
            Log.w(TAG, "WebView renderer gone, crashed=${detail.didCrash()}")
            recreate()
            return true
        }
    }

    private companion object {
        const val TAG = "UgTaa"
        const val MIN_OVERLAY_MS = 700L
        const val READY_FALLBACK_MS = 1500L
        const val BOOT_POLL_MS = 700L
        const val BOOT_TIMEOUT_MS = 10_000L

        /** Сайтын нүүр эсвэл апп хэсэг харагдаж эхэлсэн үү (index.html-ийн бүтцээс) */
        const val BOOT_PROBE =
            "!!document.querySelector('#landing:not([hidden]), #app:not([hidden])')"

        val DATE = Regex("""\d{4}-\d{2}-\d{2}""")
    }
}
