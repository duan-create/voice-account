package com.duancreate.voiceaccount;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.database.Cursor;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DocumentsPlugin")
public class DocumentsPlugin extends Plugin {
    private final ExecutorService backups = Executors.newSingleThreadExecutor();
    private static final String PREFIX = "voice-account-auto-";
    private static final int LIMIT = 30 * 1024 * 1024;

    private File directory() throws Exception {
        File dir = new File(getContext().getNoBackupFilesDir(), "ledger-backups");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("Backup directory unavailable.");
        return dir;
    }

    private File[] copies() throws Exception {
        File[] files = directory().listFiles((dir, name) -> validId(name));
        if (files == null) throw new IllegalStateException("Cannot list backups.");
        Arrays.sort(files, Comparator.comparing(File::getName).reversed());
        return files;
    }

    private boolean validId(String id) {
        return id != null && id.matches("voice-account-auto-[0-9]{13}-[a-f0-9-]{36}\\.json");
    }

    private String tree() {
        return getContext().getSharedPreferences("backup-directory", 0).getString("uri", null);
    }

    @PluginMethod
    public void backupSave(PluginCall call) {
        backups.execute(() -> {
            File temp = null;
            try {
                String json = call.getString("json");
                if (json == null || json.length() > LIMIT) throw new IllegalArgumentException("Backup too large.");
                byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
                if (bytes.length > LIMIT) throw new IllegalArgumentException("Backup too large.");
                long time = System.currentTimeMillis();
                String id = PREFIX + time + "-" + UUID.randomUUID() + ".json";
                temp = new File(directory(), id + ".tmp");
                try (java.io.FileOutputStream out = new java.io.FileOutputStream(temp)) { out.write(bytes); out.getFD().sync(); }
                if (!temp.renameTo(new File(directory(), id))) throw new IllegalStateException("Backup commit failed.");
                File[] all = copies();
                for (int i = 3; i < all.length; i++) if (!all[i].delete()) throw new IllegalStateException("Backup rotation failed.");
                JSObject result = new JSObject().put("id", id).put("createdAt", time);
                try { syncPublic(); } catch (Exception e) { result.put("warning", "公共目录副本同步失败，私有备份已保留，请重新授权目录。"); }
                call.resolve(result);
            } catch (Exception e) { call.reject("Automatic backup failed: " + e.getMessage()); }
            finally { if (temp != null && temp.exists()) temp.delete(); }
        });
    }

    @PluginMethod
    public void backupList(PluginCall call) {
        backups.execute(() -> {
            try {
                JSArray items = new JSArray();
                for (File f : copies()) items.put(new JSObject().put("id", f.getName()).put("createdAt", Long.parseLong(f.getName().substring(PREFIX.length(), PREFIX.length() + 13))));
                call.resolve(new JSObject().put("items", items));
            } catch (Exception e) { call.reject("Cannot list backups."); }
        });
    }

    @PluginMethod
    public void backupRead(PluginCall call) {
        backups.execute(() -> {
            try {
                String id = call.getString("id");
                if (!validId(id)) throw new IllegalArgumentException("Invalid backup.");
                File file = new File(directory(), id);
                if (!file.isFile() || file.length() > LIMIT) throw new IllegalArgumentException("Backup missing or too large.");
                call.resolve(new JSObject().put("json", new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)));
            } catch (Exception e) { call.reject("Cannot read backup."); }
        });
    }

    @PluginMethod
    public void backupDirectory(PluginCall call) {
        String value = tree();
        boolean granted = value != null && getContext().getContentResolver().getPersistedUriPermissions().stream().anyMatch(p -> p.getUri().toString().equals(value) && p.isWritePermission() && p.isReadPermission());
        call.resolve(new JSObject().put("authorized", granted).put("label", granted ? "已授权公共备份目录" : "未授权公共目录"));
    }

    @PluginMethod
    public void backupChooseDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "backupDirectorySelected");
    }

    @ActivityCallback
    private void backupDirectorySelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { call.reject("Directory selection cancelled."); return; }
        try {
            Uri uri = result.getData().getData();
            int flags = result.getData().getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
            String previous = tree();
            getContext().getSharedPreferences("backup-directory", 0).edit().putString("uri", uri.toString()).apply();
            if (previous != null && !previous.equals(uri.toString())) {
                try { getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(previous), Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception ignored) { }
            }
            backups.execute(() -> {
                try { syncPublic(); call.resolve(new JSObject().put("authorized", true)); }
                catch (Exception e) { call.reject("Directory authorized but copy failed. Private backups are safe."); }
            });
        } catch (Exception e) { call.reject("Cannot authorize backup directory."); }
    }

    private void syncPublic() throws Exception {
        String value = tree(); if (value == null) return;
        Uri tree = Uri.parse(value), parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        Map<String, Uri> existing = new HashMap<>();
        try (Cursor cursor = getContext().getContentResolver().query(children, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (cursor == null) throw new IllegalStateException("Cannot read public directory.");
            while (cursor.moveToNext()) if (validId(cursor.getString(1))) existing.put(cursor.getString(1), DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0)));
        }
        File[] local = copies();
        for (int i = 0; i < Math.min(3, local.length); i++) {
            File file = local[i];
            if (existing.containsKey(file.getName())) continue;
            Uri target = DocumentsContract.createDocument(getContext().getContentResolver(), parent, "application/json", file.getName());
            if (target == null) throw new IllegalStateException("Cannot create public copy.");
            try (OutputStream out = getContext().getContentResolver().openOutputStream(target, "w")) {
                if (out == null) throw new IllegalStateException("Cannot write public copy.");
                Files.copy(file.toPath(), out); out.flush();
            } catch (Exception e) { DocumentsContract.deleteDocument(getContext().getContentResolver(), target); throw e; }
            existing.put(file.getName(), target);
        }
        // Rotate only this app's own files, and only after all new copies succeeded.
        String[] names = existing.keySet().toArray(new String[0]);
        Arrays.sort(names, Comparator.reverseOrder());
        for (int i = 3; i < names.length; i++) DocumentsContract.deleteDocument(getContext().getContentResolver(), existing.get(names[i]));
    }

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
