package com.duancreate.voiceaccount;

import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

@CapacitorPlugin(name = "CloudSpeechPlugin")
public class CloudSpeechPlugin extends Plugin {
    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS).readTimeout(45, TimeUnit.SECONDS)
        .followRedirects(false).followSslRedirects(false).build();
    private WebSocket socket;
    private String sessionId;

    private synchronized void event(String id, String type, String text) {
        if (!id.equals(sessionId)) return;
        JSObject data = new JSObject(); data.put("sessionId", id); data.put("type", type);
        if (text != null) data.put("data", text);
        notifyListeners("cloudSocket", data);
    }

    @PluginMethod
    public synchronized void connect(PluginCall call) {
        try {
            String id = call.getString("sessionId", ""), url = call.getString("url", "");
            Uri uri = Uri.parse(url);
            if (id.isEmpty() || url.length() > 4096 || !"wss".equals(uri.getScheme())
                || !"iat-api.xfyun.cn".equals(uri.getHost()) || !"/v2/iat".equals(uri.getPath())
                || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getFragment() != null) {
                call.reject("Unsupported speech endpoint.", "CLOUD_FAILED"); return;
            }
            closeSocket(); sessionId = id;
            socket = client.newWebSocket(new Request.Builder().url(url).build(), new WebSocketListener() {
                @Override public void onOpen(WebSocket webSocket, Response response) { event(id, "open", null); }
                @Override public void onMessage(WebSocket webSocket, String text) {
                    if (text.length() > 65536) { event(id, "error", null); webSocket.cancel(); }
                    else event(id, "message", text);
                }
                @Override public void onFailure(WebSocket webSocket, Throwable error, Response response) {
                    // Never forward exceptions: they can contain the signed request URL.
                    event(id, "error", null);
                }
                @Override public void onClosing(WebSocket webSocket, int code, String reason) {
                    event(id, "closed", null); webSocket.close(1000, null);
                }
            });
            call.resolve();
        } catch (Exception error) { closeSocket(); call.reject("Cloud connection unavailable.", "CLOUD_FAILED"); }
    }

    @PluginMethod
    public synchronized void send(PluginCall call) {
        String text = call.getString("text", "");
        if (socket == null || !call.getString("sessionId", "").equals(sessionId)
            || text.length() > 16000 || !socket.send(text)) {
            call.reject("Cloud transmission unavailable.", "CLOUD_FAILED"); return;
        }
        call.resolve();
    }

    private synchronized void closeSocket() {
        sessionId = null;
        if (socket != null) { socket.cancel(); socket = null; }
    }

    @PluginMethod
    public synchronized void close(PluginCall call) {
        if (call.getString("sessionId", "").equals(sessionId)) closeSocket();
        call.resolve();
    }

    @Override protected void handleOnStop() { closeSocket(); }
    @Override protected void handleOnDestroy() {
        closeSocket(); client.dispatcher().executorService().shutdown(); client.connectionPool().evictAll();
    }
}
