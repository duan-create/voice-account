package com.duancreate.voiceaccount;

import java.util.Calendar;

final class PlanClock {
    static long next(String time, String frequency, int weekday, long after) {
        String[] parts = time.split(":");
        Calendar date = Calendar.getInstance(); date.setTimeInMillis(after);
        date.set(Calendar.HOUR_OF_DAY, Integer.parseInt(parts[0])); date.set(Calendar.MINUTE, Integer.parseInt(parts[1])); date.set(Calendar.SECOND, 0); date.set(Calendar.MILLISECOND, 0);
        if (date.getTimeInMillis() <= after) date.add(Calendar.DATE, 1);
        if (frequency.equals("weekly")) {
            if (weekday < 0 || weekday > 6) throw new IllegalArgumentException("Invalid weekday.");
            while (date.get(Calendar.DAY_OF_WEEK) - 1 != weekday) date.add(Calendar.DATE, 1);
        }
        return date.getTimeInMillis();
    }
}
