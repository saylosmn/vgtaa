package mn.ugtaa.app.web

import android.net.Uri
import android.util.Log
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * Сайт ↔ апп мессеж. index.js-ийн `Native` объекттой хос.
 *
 * `window.UgTaaAndroid`-ийг зөвхөн [origin]-д (жишээ нь https://vgtaa.vercel.app) суулгадаг тул
 * өөр сайт, iframe үүнийг харахгүй. Мессеж бүр JSON: {"type": "...", ...}.
 *
 * Сайтаас: ready, signIn, signOut, share{text,title}, theme{dark}
 * Апп-аас:  credential{credential}, signin_error{message?}, route{hash}
 */
class NativeBridge(
    private val web: WebView,
    private val origin: String,
    private val onMessage: (type: String, data: JSONObject) -> Unit,
) {
    private var reply: JavaScriptReplyProxy? = null

    /** false бол WebView хэт хуучин (Android System WebView-ээ шинэчлэх хэрэгтэй). */
    fun install(): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
        WebViewCompat.addWebMessageListener(web, NAME, setOf(origin)) { _, message, sourceOrigin, isMainFrame, replyProxy ->
            if (!isMainFrame || !sameOrigin(sourceOrigin)) return@addWebMessageListener
            val json = message.data?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return@addWebMessageListener
            val type = json.optString("type")
            if (type.isEmpty()) return@addWebMessageListener
            reply = replyProxy // хуудас дахин ачаалагдах бүрт шинэчлэгдэнэ ("ready")
            onMessage(type, json)
        }
        return true
    }

    fun post(type: String, vararg fields: Pair<String, Any?>) {
        val proxy = reply ?: return
        val json = JSONObject().put("type", type)
        for ((k, v) in fields) if (v != null) json.put(k, v)
        try {
            proxy.postMessage(json.toString())
        } catch (e: Exception) {
            Log.w("NativeBridge", "postMessage", e)
        }
    }

    private fun sameOrigin(source: Uri): Boolean = "${source.scheme}://${source.authority}" == origin

    companion object {
        const val NAME = "UgTaaAndroid"
    }
}
