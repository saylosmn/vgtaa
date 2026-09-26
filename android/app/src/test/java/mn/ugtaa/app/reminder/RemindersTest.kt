package mn.ugtaa.app.reminder

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class RemindersTest {
    private val ub = ZoneId.of("Asia/Ulaanbaatar")

    private fun at(h: Int, m: Int) = ZonedDateTime.of(2026, 9, 26, h, m, 0, 0, ub)

    @Test
    fun beforeEightPmRemindsTonight() {
        assertEquals(at(20, 0).toInstant().toEpochMilli(), Reminders.nextRemindMillis(at(9, 15)))
    }

    @Test
    fun afterEightPmRemindsTomorrow() {
        assertEquals(at(20, 0).plusDays(1).toInstant().toEpochMilli(), Reminders.nextRemindMillis(at(21, 30)))
    }

    @Test
    fun exactlyEightPmRemindsTomorrow() {
        assertEquals(at(20, 0).plusDays(1).toInstant().toEpochMilli(), Reminders.nextRemindMillis(at(20, 0)))
    }
}
