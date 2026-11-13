package com.duancreate.voiceaccount;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Calendar;

/** Durable outbox: persist an occurrence and advance its cursor in the same preference commit. */
final class LocalPlanner {
    private static final String CHANNEL = "ledger-reminders";
    private static JSONObject load(Context context) throws Exception {
        return new JSONObject(context.getSharedPreferences("local-planner", Context.MODE_PRIVATE).getString("state", "{}"));
    }
    private static void save(Context context, JSONObject state) throws Exception {
        if (!context.getSharedPreferences("local-planner", Context.MODE_PRIVATE).edit().putString("state", state.toString()).commit()) throw new IllegalStateException("Cannot persist scheduled records.");
    }
    static synchronized void configure(Context context, String epoch, JSONArray incoming) throws Exception {
        JSONObject state = load(context);
        boolean reset = !epoch.equals(state.optString("epoch"));
        if (!reset) tick(context);
        state = load(context);
        JSONArray old = state.optJSONArray("schedules"), merged = new JSONArray();
        for (int i = 0; i < incoming.length(); i++) {
            JSONObject item = new JSONObject(incoming.getJSONObject(i).toString());
            if (item.optString("id").isEmpty() || !item.optString("time").matches("([01][0-9]|2[0-3]):[0-5][0-9]") || !(item.optString("frequency").equals("daily") || item.optString("frequency").equals("weekly"))) throw new IllegalArgumentException("Invalid schedule.");
            if (reset) item.put("next", next(item, System.currentTimeMillis()));
            else if (old != null) for (int j = 0; j < old.length(); j++) {
                JSONObject previous = old.getJSONObject(j);
                if (item.getString("id").equals(previous.optString("id")) && item.optString("revision").equals(previous.optString("revision"))) item.put("next", previous.getLong("next"));
            }
            merged.put(item);
        }
        if (reset) state.put("pending", new JSONArray());
        state.put("epoch", epoch).put("schedules", merged); save(context, state); tick(context);
    }
    static long next(JSONObject schedule, long after) throws Exception {
        String[] time = schedule.getString("time").split(":");
        Calendar date = Calendar.getInstance(); date.setTimeInMillis(after);
        date.set(Calendar.HOUR_OF_DAY, Integer.parseInt(time[0])); date.set(Calendar.MINUTE, Integer.parseInt(time[1])); date.set(Calendar.SECOND, 0); date.set(Calendar.MILLISECOND, 0);
        if (date.getTimeInMillis() <= after) date.add(Calendar.DATE, 1);
        if (schedule.getString("frequency").equals("weekly")) {
            int weekday = schedule.getInt("weekday");
            if (weekday < 0 || weekday > 6) throw new IllegalArgumentException("Invalid weekday.");
            while (date.get(Calendar.DAY_OF_WEEK) - 1 != weekday) date.add(Calendar.DATE, 1);
        }
        return date.getTimeInMillis();
    }
    static synchronized void tick(Context context) throws Exception {
        JSONObject state = load(context);
        JSONArray schedules = state.optJSONArray("schedules"), pending = state.optJSONArray("pending"), notifications = new JSONArray();
        if (schedules == null) schedules = new JSONArray();
        if (pending == null) pending = new JSONArray();
        long now = System.currentTimeMillis(), soonest = Long.MAX_VALUE;
        for (int i = 0; i < schedules.length(); i++) {
            JSONObject schedule = schedules.getJSONObject(i);
            if (!schedule.optBoolean("enabled")) continue;
            long due = schedule.getLong("next"); int count = 0;
            while (due <= now && count++ < 366) {
                JSONObject item = new JSONObject().put("id", schedule.getString("id") + ":" + due).put("date", due).put("kind", schedule.getString("kind"));
                if (schedule.has("bill")) item.put("bill", schedule.get("bill"));
                pending.put(item); notifications.put(item); due = next(schedule, due);
            }
            schedule.put("next", due); soonest = Math.min(soonest, due);
        }
        state.put("schedules", schedules).put("pending", pending); save(context, state);
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent intent = PendingIntent.getBroadcast(context, 0, new Intent(context, PlannerReceiver.class).setAction("com.duancreate.voiceaccount.PLANNER"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (soonest == Long.MAX_VALUE) alarm.cancel(intent);
        else alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, Math.max(now + 1000, soonest), intent);
        for (int i = 0; i < notifications.length(); i++) notify(context, notifications.getJSONObject(i));
    }
    static synchronized JSONArray pending(Context context) throws Exception {
        tick(context); JSONArray result = load(context).optJSONArray("pending"); return result == null ? new JSONArray() : result;
    }
    static synchronized void acknowledge(Context context, String id) throws Exception {
        JSONObject state = load(context); JSONArray old = state.optJSONArray("pending"), remaining = new JSONArray();
        if (old != null) for (int i = 0; i < old.length(); i++) if (!id.equals(old.getJSONObject(i).getString("id"))) remaining.put(old.get(i));
        state.put("pending", remaining); save(context, state);
    }
    private static void notify(Context context, JSONObject item) {
        try {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "记账计划", NotificationManager.IMPORTANCE_DEFAULT));
            PendingIntent open = PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            manager.notify(item.getString("id").hashCode(), new NotificationCompat.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_today).setContentTitle("语音记账").setContentText(item.optString("kind").equals("bill") ? "定时账单已记录，打开应用同步入账。" : "记下今天的收支吧。受系统限制，提醒可能延迟。").setContentIntent(open).setAutoCancel(true).build());
        } catch (Exception ignored) { /* Permission denial must not discard the durable occurrence. */ }
    }
}
