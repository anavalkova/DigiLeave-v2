package com.digileave.api.util;

import java.time.LocalDate;
import java.util.Set;

/**
 * Bulgarian public holidays for 2026.
 * Orthodox Easter 2026 falls on 12 April (Gregorian calendar).
 *
 * When a fixed holiday falls on a Sunday, Bulgarian Labour Code (Art. 154)
 * gives the following Monday as the substitute non-working day.
 * When it falls on a Saturday, the following Monday is typically observed
 * per the annual government schedule.
 *
 * Displaced dates for 2026:
 *   - 24 May (Sun)  → 25 May (Mon) observed  [Education & Culture Day]
 *   -  6 Sep (Sun)  →  7 Sep (Mon) observed  [Unification Day]
 *   -  1 Nov (Sun)  →  2 Nov (Mon) observed  [National Enlighteners' Day]
 *   - 26 Dec (Sat)  → 28 Dec (Mon) observed  [Second Day of Christmas]
 */
public final class BulgarianPublicHolidays {

    private static final Set<LocalDate> HOLIDAYS_2026 = Set.of(
        LocalDate.of(2026,  1,  1),  // New Year's Day (Thu)
        LocalDate.of(2026,  3,  3),  // Liberation Day (Tue)
        LocalDate.of(2026,  4, 10),  // Good Friday — Orthodox (Fri)
        LocalDate.of(2026,  4, 11),  // Holy Saturday — Orthodox (Sat, already non-working)
        LocalDate.of(2026,  4, 12),  // Easter Sunday — Orthodox (Sun, already non-working)
        LocalDate.of(2026,  4, 13),  // Easter Monday — Orthodox (Mon)
        LocalDate.of(2026,  5,  1),  // International Labour Day (Fri)
        LocalDate.of(2026,  5,  6),  // St. George's Day / Bulgarian Army Day (Wed)
        LocalDate.of(2026,  5, 25),  // Education & Culture Day — observed Mon (24 May is Sun)
        LocalDate.of(2026,  9,  7),  // Unification Day — observed Mon (6 Sep is Sun)
        LocalDate.of(2026,  9, 22),  // Independence Day (Tue)
        LocalDate.of(2026, 11,  2),  // National Enlighteners' Day — observed Mon (1 Nov is Sun)
        LocalDate.of(2026, 12, 24),  // Christmas Eve (Thu)
        LocalDate.of(2026, 12, 25),  // Christmas Day (Fri)
        LocalDate.of(2026, 12, 28)   // Second Day of Christmas — observed Mon (26 Dec is Sat)
    );

    private BulgarianPublicHolidays() {}

    public static boolean isHoliday(LocalDate date) {
        return HOLIDAYS_2026.contains(date);
    }
}
