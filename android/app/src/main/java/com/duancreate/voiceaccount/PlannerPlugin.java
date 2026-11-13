package com.duancreate.voiceaccount;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "PlannerPlugin", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class PlannerPlugin extends Plugin {
    @PluginMethod public void configure(PluginCall call) {
        getBridge().execute(() -> {
            try {
                String epoch = call.getString("epoch"); JSArray schedules = call.getArray("schedules");
                if (epoch == null || epoch.isEmpty() || schedules == null) throw new IllegalArgumentException("Missing schedules.");
                LocalPlanner.configure(getContext(), epoch, schedules); call.resolve();
            } catch (Exception error) { call.reject(error.getMessage()); }
        });
    }
    @PluginMethod public void pending(PluginCall call) {
        getBridge().execute(() -> {
            try { JSObject result = new JSObject(); result.put("items", LocalPlanner.pending(getContext())); call.resolve(result); }
            catch (Exception error) { call.reject(error.getMessage()); }
        });
    }
    @PluginMethod public void acknowledge(PluginCall call) {
        getBridge().execute(() -> {
            try { String id = call.getString("id"); if (id == null) throw new IllegalArgumentException("Missing occurrence ID."); LocalPlanner.acknowledge(getContext(), id); call.resolve(); }
            catch (Exception error) { call.reject(error.getMessage()); }
        });
    }
    @PluginMethod public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) notificationsPermission(call);
        else requestPermissionForAlias("notifications", call, "notificationsPermission");
    }
    @PermissionCallback private void notificationsPermission(PluginCall call) {
        JSObject result = new JSObject(); result.put("granted", Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED); call.resolve(result);
    }
}
