package mn.ugtaa.app.auth

import android.app.Activity
import android.util.Log
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import mn.ugtaa.app.BuildConfig
import mn.ugtaa.app.R

/**
 * Google-ээр нэвтрэх — Android Credential Manager.
 *
 * WebView дотор Google-ийн вэб нэвтрэлт (GSI) хоригдсон тул ID token-ыг эндээс авч сайт руу дамжуулна.
 * serverClientId нь сайтын «Web application» client ID тул token-ы `aud` нь сайтынхтай ижил —
 * api.php-ийн google_verify() өөрчлөлтгүйгээр хүлээн авна.
 */
class GoogleAuth(private val activity: Activity) {

    sealed interface Result {
        data class Success(val idToken: String) : Result
        data object Cancelled : Result
        data class Failure(val message: String) : Result
    }

    private val manager = CredentialManager.create(activity)

    suspend fun signIn(): Result {
        val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        return try {
            val credential = manager.getCredential(activity, request).credential
            if (credential is CustomCredential &&
                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                Result.Success(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            } else {
                fail(R.string.signin_failed, "unexpected credential ${credential.type}")
            }
        } catch (_: GetCredentialCancellationException) {
            Result.Cancelled
        } catch (e: NoCredentialException) {
            fail(R.string.signin_no_account, e.message)
        } catch (e: GetCredentialProviderConfigurationException) {
            fail(R.string.signin_no_play, e.message)
        } catch (e: GetCredentialUnsupportedException) {
            fail(R.string.signin_no_play, e.message)
        } catch (e: GoogleIdTokenParsingException) {
            fail(R.string.signin_failed, e.message)
        } catch (e: GetCredentialException) {
            val detail = e.errorMessage?.toString().orEmpty()
            // [28444] / DEVELOPER_ERROR(10): Google Cloud-д энэ апп-ын Android client (багц нэр + SHA-1) бүртгэлгүй
            val notRegistered = "28444" in detail || "Developer console" in detail || detail.startsWith("10:")
            fail(if (notRegistered) R.string.signin_not_registered else R.string.signin_failed, "${e.type}: $detail")
        }
    }

    /** Гарахад дараагийн удаа данс сонгох цонх дахин гарна. */
    suspend fun signOut() {
        try {
            manager.clearCredentialState(ClearCredentialStateRequest())
        } catch (e: Exception) {
            Log.w(TAG, "clearCredentialState", e)
        }
    }

    private fun fail(res: Int, detail: String?): Result.Failure {
        Log.w(TAG, "Google sign-in failed: $detail")
        val text = activity.getString(res)
        return Result.Failure(if (BuildConfig.DEBUG && !detail.isNullOrBlank()) "$text\n($detail)" else text)
    }

    private companion object {
        const val TAG = "GoogleAuth"
    }
}
