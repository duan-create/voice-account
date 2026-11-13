package com.duancreate.voiceaccount;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class PlannerReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        PendingResult result = goAsync();
        new Thread(() -> {
            try { LocalPlanner.tick(context.getApplicationContext()); }
            catch (Exception error) { Log.e("LocalPlanner", "Scheduled records retained for retry", error); }
            finally { result.finish(); }
        }, "ledger-planner").start();
    }
}
