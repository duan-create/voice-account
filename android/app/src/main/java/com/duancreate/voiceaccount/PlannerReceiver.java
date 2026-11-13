package com.duancreate.voiceaccount;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class PlannerReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        PendingResult result = goAsync();
        new Thread(() -> {
            try {
                if (Intent.ACTION_TIME_CHANGED.equals(intent.getAction()) || Intent.ACTION_TIMEZONE_CHANGED.equals(intent.getAction())) LocalPlanner.resetClock(context.getApplicationContext());
                else LocalPlanner.tick(context.getApplicationContext());
            }
            catch (Exception error) { Log.e("LocalPlanner", "Scheduled records retained for retry", error); }
            finally { result.finish(); }
        }, "ledger-planner").start();
    }
}
