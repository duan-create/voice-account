package com.duancreate.voiceaccount;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "DocumentsPlugin")
public class DocumentsPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("base64");
        if (data == null || data.length() > 40000000) { call.reject("Export is missing or too large."); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "voice-account.json"));
        startActivityForResult(call, intent, "saved");
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { call.reject("Save cancelled."); return; }
        getBridge().execute(() -> {
            try (OutputStream out = getContext().getContentResolver().openOutputStream(result.getData().getData(), "w")) {
                if (out == null) throw new IllegalStateException("No output stream.");
                out.write(Base64.decode(call.getString("base64"), Base64.DEFAULT));
                out.flush(); call.resolve();
            } catch (Exception e) { call.reject("File save failed."); }
        });
    }
}
