package com.duancreate.voiceaccount;

import java.time.ZonedDateTime;
import java.util.TimeZone;

public final class PlanClockTest {
    private static void check(String time, String frequency, int weekday, String after, String expected) {
        long actual = PlanClock.next(time, frequency, weekday, ZonedDateTime.parse(after).toInstant().toEpochMilli());
        if (actual != ZonedDateTime.parse(expected).toInstant().toEpochMilli()) throw new AssertionError("Wrong next occurrence: " + actual);
    }
    public static void main(String[] args) {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
        check("08:30", "daily", 0, "2026-11-13T09:00:00+08:00", "2026-11-14T08:30:00+08:00");
        check("08:30", "weekly", 1, "2026-11-13T09:00:00+08:00", "2026-11-16T08:30:00+08:00");
        check("08:30", "weekly", 0, "2026-11-13T09:00:00+08:00", "2026-11-15T08:30:00+08:00");
        check("08:30", "daily", 0, "2026-12-31T08:30:00+08:00", "2027-01-01T08:30:00+08:00");
        TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"));
        check("08:30", "daily", 0, "2026-03-07T09:00:00-05:00", "2026-03-08T08:30:00-04:00");
        System.out.println("Plan clock tests passed: daily/weekly, Sunday, year boundary, DST.");
    }
}
