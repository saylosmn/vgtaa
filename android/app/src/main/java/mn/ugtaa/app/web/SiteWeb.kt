package mn.ugtaa.app.web

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Toast
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import mn.ugtaa.app.BuildConfig
import mn.ugtaa.app.R

/** Сайтын хаяг: апп зөвхөн энэ origin-ийг WebView дотор нээнэ, бусдыг гадагш гаргана. */
class Site(url: String) {
    val start: Uri = Uri.parse(url)
    val origin: String = "${start.scheme}://${start.authority}"

    init {
        require(start.scheme == "https" || BuildConfig.DEBUG) { "Release-д ugtaa.siteUrl заавал https байна: $url" }
    }

    /** Release-д SITE_URL нь https тул зөвхөн https; debug-д локал http://10.0.2.2 сервер ашиглаж болно. */
    fun owns(uri: Uri): Boolean = uri.scheme == start.scheme && uri.authority.equals(start.authority, ignoreCase = true)
}

object SiteWeb {

    @SuppressLint("SetJavaScriptEnabled")
    fun configure(web: WebView, versionName: String) {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true            // нэвтрэлтийн token, тохиргоо localStorage-д
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = true
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)     // target=_blank холбоос мөн shouldOverrideUrlLoading-оор орно
            setGeolocationEnabled(false)
            // Тоглоомын хавтан px хэмжээтэй — системийн томруулалт текстийг хавтангаас гаргадаг.
            // Chrome-той адил 100% байлгана (хэрэглэгч сайтын «Тод өнгө» тохиргоог ашиглаж болно).
            textZoom = 100
            // Сайт үүгээр апп-ыг таниж, Google-ийн вэб товчны оронд натив товч харуулна
            userAgentString = "$userAgentString UgTaaApp/$versionName"
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(web.settings, true)
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, false)
        }
        web.overScrollMode = WebView.OVER_SCROLL_NEVER
        web.setBackgroundColor(ContextCompat.getColor(web.context, R.color.bg))
    }

    /** Сайтаас гадуурх холбоосыг (Facebook, имэйл, банкны апп…) зохих апп-аар нээнэ. */
    fun openExternal(activity: Activity, uri: Uri) {
        try {
            when (uri.scheme?.lowercase()) {
                "http", "https" -> CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .setDefaultColorSchemeParams(
                        CustomTabColorSchemeParams.Builder()
                            .setToolbarColor(ContextCompat.getColor(activity, R.color.bg))
                            .build(),
                    )
                    .build()
                    .launchUrl(activity, uri)
                "mailto" -> activity.startActivity(Intent(Intent.ACTION_SENDTO, uri))
                "intent" -> openIntentUri(activity, uri)
                else -> activity.startActivity(
                    Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE),
                )
            }
        } catch (e: ActivityNotFoundException) {
            Log.w("SiteWeb", "no handler for $uri", e)
            Toast.makeText(activity, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    /** intent:// холбоос — зөвхөн BROWSABLE, тодорхой компонентгүйгээр (өөр апп-ын дотоод Activity-г дуудахгүй). */
    private fun openIntentUri(activity: Activity, uri: Uri) {
        val intent = try {
            Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
        } catch (e: Exception) {
            return
        }
        intent.addCategory(Intent.CATEGORY_BROWSABLE)
        intent.component = null
        intent.selector = null
        try {
            activity.startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            val fallback = intent.getStringExtra("browser_fallback_url")?.let(Uri::parse)
            if (fallback != null && (fallback.scheme == "https" || fallback.scheme == "http")) {
                openExternal(activity, fallback)
            } else {
                throw e
            }
        }
    }
}
