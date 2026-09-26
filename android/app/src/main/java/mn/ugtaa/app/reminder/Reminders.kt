package mn.ugtaa.app.reminder

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.core.content.getSystemService
import mn.ugtaa.app.BuildConfig
import mn.ugtaa.app.MainActivity
import mn.ugtaa.app.R
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Өдрийн үгийн сануулга: Монголын цагаар 20:00-д тухайн өдрийн үгийг таагаагүй бол мэдэгдэл гаргана.
 *
 * Сервер, Firebase шаардлагагүй — сайт өдрийн үгийн төлвөө ("daily" мессеж) дамжуулж,
 * апп үүнийг хадгална. Хэрэглэгч гарвал сануулга зогсоно. Системийн тохиргооноос
 * «Өдрийн үгийн сануулга» сувгийг унтрааж болно.
 */
object Reminders {
    private const val PREFS = "reminders"
    private const val KEY_SIGNED_IN = "signed_in"
    private const val KEY_DONE_DATE = "done_date"
    private const val KEY_NOTIFIED_DATE = "notified_date"
    private const val KEY_ASKED_PERMISSION = "asked_permission"
    private const val CHANNEL = "daily_word"
    private const val NOTIFICATION_ID = 1
    private val ZONE: ZoneId = ZoneId.of("Asia/Ulaanbaatar") // өдрийн үг энэ цагаар солигдоно
    private val REMIND_AT: LocalTime = LocalTime.of(20, 0)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun today(): String = LocalDate.now(ZONE).toString()

    /** Сайтаас: өдрийн үг ачаалагдсан эсвэл дууссан. */
    fun onDaily(context: Context, date: String, done: Boolean) {
        prefs(context).edit {
            putBoolean(KEY_SIGNED_IN, true)
            if (done) putString(KEY_DONE_DATE, date)
        }
        if (done) NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        schedule(context)
    }

    /** Гарахад сануулга зогсоно. */
    fun onSignOut(context: Context) {
        prefs(context).edit { putBoolean(KEY_SIGNED_IN, false) }
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        context.getSystemService<AlarmManager>()?.cancel(alarmIntent(context))
    }

    /** Android 13+: мэдэгдлийн зөвшөөрлийг нэг л удаа, эхний үгээ таасны дараа асууна. */
    fun shouldAskPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false
        if (hasPermission(context)) return false
        val p = prefs(context)
        if (p.getBoolean(KEY_ASKED_PERMISSION, false)) return false
        p.edit { putBoolean(KEY_ASKED_PERMISSION, true) }
        return true
    }

    private fun hasPermission(context: Context) =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    /** Дараагийн 20:00 (Улаанбаатар) — өдөр бүр давтагдана. Дахин дуудахад аюулгүй. */
    fun schedule(context: Context) {
        if (!prefs(context).getBoolean(KEY_SIGNED_IN, false)) return
        val am = context.getSystemService<AlarmManager>() ?: return
        am.setInexactRepeating(
            AlarmManager.RTC_WAKEUP,
            nextRemindMillis(ZonedDateTime.now(ZONE)),
            AlarmManager.INTERVAL_DAY,
            alarmIntent(context),
        )
    }

    internal fun nextRemindMillis(now: ZonedDateTime): Long {
        var next = now.with(REMIND_AT).withSecond(0).withNano(0)
        if (!next.isAfter(now)) next = next.plusDays(1)
        return next.toInstant().toEpochMilli()
    }

    private fun alarmIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context, 0,
        Intent(context, ReminderReceiver::class.java).setAction(ReminderReceiver.ACTION_REMIND),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    /** Alarm дуугарахад: өнөөдрийн үгээ таасан, аль хэдийн сануулсан бол юу ч хийхгүй. */
    internal fun remindIfNeeded(context: Context) {
        val p = prefs(context)
        val today = today()
        if (!p.getBoolean(KEY_SIGNED_IN, false)) return
        if (p.getString(KEY_DONE_DATE, null) == today) return
        if (p.getString(KEY_NOTIFIED_DATE, null) == today) return
        if (!hasPermission(context)) return
        // Alarm хоцорч маргааш өглөө дуугарвал битгий сануул (20:00–23:59 л)
        val hour = ZonedDateTime.now(ZONE).hour
        if (hour < REMIND_AT.hour) return

        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.SITE_URL + "#/play"), context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_taa)
            .setColor(ContextCompat.getColor(context, R.color.correct))
            .setContentTitle(context.getString(R.string.reminder_title))
            .setContentText(context.getString(R.string.reminder_text))
            .setStyle(NotificationCompat.BigTextStyle().bigText(context.getString(R.string.reminder_text)))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, n)
            p.edit { putString(KEY_NOTIFIED_DATE, today) }
        } catch (_: SecurityException) {
            // Зөвшөөрөл яг энэ агшинд цуцлагдсан
        }
    }

    private fun ensureChannel(context: Context) {
        val nm = context.getSystemService<NotificationManager>() ?: return
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, context.getString(R.string.reminder_channel), NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = context.getString(R.string.reminder_channel_desc) },
        )
    }
}

/** 20:00-ийн alarm болон утас асах үеийн (alarm-ууд арилдаг) дахин товлолт. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_REMIND -> Reminders.remindIfNeeded(context)
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Reminders.schedule(context)
        }
    }

    companion object {
        const val ACTION_REMIND = "mn.ugtaa.app.REMIND_DAILY"
    }
}
