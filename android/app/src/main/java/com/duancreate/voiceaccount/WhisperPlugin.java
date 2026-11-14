package com.duancreate.voiceaccount;

import android.Manifest;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.SystemClock;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

@CapacitorPlugin(name = "WhisperPlugin", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
})
public class WhisperPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static final AtomicLong sequence = new AtomicLong();
    private Session current;
    private long context;
    private boolean destroyed;

    private static final class Session {
        final String id;
        final long number;
        final PluginCall startCall;
        final AtomicBoolean startSettled = new AtomicBoolean();
        volatile boolean cancelled;
        volatile boolean stop;
        PluginCall resultCall;
        boolean cloud;
        boolean exported;
        float[] audio;
        String failure;

        Session(String id, long number, PluginCall call) {
            this.id = id;
            this.number = number;
            this.startCall = call;
        }

        void rejectStart(String code) {
            if (startSettled.compareAndSet(false, true)) startCall.reject("Local recording unavailable.", code);
        }
    }

    @PluginMethod
    public synchronized void startRecording(PluginCall call) {
        String id = call.getString("sessionId");
        if (id == null || id.isEmpty()) { call.reject("Missing session ID.", "INVALID_SESSION"); return; }
        if (destroyed || current != null) { call.reject("Local recognizer is busy.", "BUSY"); return; }
        current = new Session(id, sequence.incrementAndGet(), call);
        current.cloud = Boolean.TRUE.equals(call.getBoolean("cloud", false));
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermission");
        } else {
            record(current);
        }
    }

    @PermissionCallback
    private synchronized void microphonePermission(PluginCall call) {
        if (current == null || current.startCall != call) return;
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            current.rejectStart("PERMISSION_DENIED");
            current = null;
        } else {
            record(current);
        }
    }

    private void record(Session session) {
        worker.execute(() -> {
            AudioRecord recorder = null;
            PcmCapture capture = new PcmCapture();
            boolean ready = false;
            try {
                if (session.cancelled) return;
                if (!session.cloud) {
                    if (context == 0) context = WhisperNative.load(getContext().getAssets());
                    if (context == 0) throw new IllegalStateException("Model unavailable");
                    WhisperNative.begin(session.number);
                }
                if (session.cancelled) return;
                ready = true;
                int minimum = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
                if (minimum <= 0) throw new IllegalStateException("Unsupported microphone format");
                recorder = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum, 6400));
                if (recorder.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("Microphone unavailable");
                recorder.startRecording();
                if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IllegalStateException("Microphone did not start");
                if (session.startSettled.compareAndSet(false, true)) session.startCall.resolve();
                short[] buffer = new short[320];
                long deadline = SystemClock.elapsedRealtime() + 30000;
                try {
                    while (!session.stop && !session.cancelled && SystemClock.elapsedRealtime() < deadline) {
                        int read = recorder.read(buffer, 0, buffer.length, AudioRecord.READ_NON_BLOCKING);
                        if (read < 0) throw new IllegalStateException("Microphone read failed");
                        if (read == 0) { Thread.sleep(10); continue; }
                        if (capture.append(buffer, read)) break;
                    }
                } finally {
                    Arrays.fill(buffer, (short) 0);
                }
            } catch (SecurityException error) {
                session.failure = "PERMISSION_DENIED";
            } catch (LinkageError error) {
                session.failure = "UNSUPPORTED";
            } catch (Exception | OutOfMemoryError error) {
                session.failure = ready ? "AUDIO_CAPTURE" : "MODEL_UNAVAILABLE";
            } finally {
                if (recorder != null) {
                    try { recorder.stop(); } catch (IllegalStateException ignored) { }
                    recorder.release();
                }
                session.audio = capture.finish();
                synchronized (WhisperPlugin.this) {
                    if (session.cancelled || session.failure != null) {
                        session.rejectStart(session.cancelled ? "CANCELLED" : session.failure);
                        if (!session.cancelled && session.startSettled.get()) {
                            notifyStopped(session);
                        }
                        if (session.resultCall == null) clear(session);
                    } else if (!session.stop) {
                        notifyStopped(session);
                    }
                }
            }
        });
    }

    @PluginMethod
    public synchronized void stopRecordingForCloud(PluginCall call) {
        Session session = matching(call);
        if (session == null) return;
        if (!session.cloud || session.exported || session.resultCall != null) {
            call.reject("Recording already consumed.", "BUSY"); return;
        }
        session.exported = true;
        session.stop = true;
        worker.execute(() -> {
            byte[] pcm = null;
            try {
                if (session.cancelled) { call.reject("Recording cancelled.", "CANCELLED"); return; }
                if (session.failure != null) { call.reject("Recording failed.", session.failure); return; }
                pcm = PcmCapture.pcm16(session.audio);
                JSObject result = new JSObject();
                result.put("pcm", Base64.encodeToString(pcm, Base64.NO_WRAP));
                if (session.cancelled) call.reject("Recording cancelled.", "CANCELLED");
                else call.resolve(result);
            } catch (Exception | OutOfMemoryError error) {
                call.reject("Recording unavailable.", "AUDIO_CAPTURE");
                synchronized (WhisperPlugin.this) { clear(session); }
            } finally { if (pcm != null) Arrays.fill(pcm, (byte) 0); }
        });
    }

    private void notifyStopped(Session session) {
        JSObject event = new JSObject();
        event.put("sessionId", session.id);
        if (session.failure != null) event.put("error", session.failure);
        notifyListeners("recordingStopped", event);
    }

    @PluginMethod
    public synchronized void stopRecordingAndRecognize(PluginCall call) {
        Session session = matching(call);
        if (session == null) return;
        if (session.resultCall != null) { call.reject("Recognition already requested.", "BUSY"); return; }
        session.resultCall = call;
        session.stop = true;
        worker.execute(() -> {
            try {
                if (session.cancelled) { call.reject("Recording cancelled.", "CANCELLED"); return; }
                if (session.failure != null) { call.reject("Recording failed.", session.failure); return; }
                String text = "";
                if (session.audio != null && session.audio.length > 0) {
                    if (context == 0) context = WhisperNative.load(getContext().getAssets());
                    if (context == 0) { call.reject("Model unavailable.", "MODEL_UNAVAILABLE"); return; }
                    WhisperNative.begin(session.number);
                    if (session.cancelled) { call.reject("Recording cancelled.", "CANCELLED"); return; }
                    byte[] result = WhisperNative.recognize(context, session.audio, session.number,
                        Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors())));
                    if (result != null) text = new String(result, StandardCharsets.UTF_8).trim();
                }
                if (session.cancelled) call.reject("Recognition cancelled.", "CANCELLED");
                else { JSObject result = new JSObject(); result.put("text", text); call.resolve(result); }
            } catch (Exception | LinkageError | OutOfMemoryError error) {
                call.reject("Local recognition failed.", "RECOGNITION_FAILED");
            } finally {
                synchronized (WhisperPlugin.this) { clear(session); }
            }
        });
    }

    @PluginMethod
    public synchronized void cancelRecording(PluginCall call) {
        if (current != null && current.id.equals(call.getString("sessionId"))) cancelCurrent();
        call.resolve();
    }

    private Session matching(PluginCall call) {
        if (current == null || !current.id.equals(call.getString("sessionId"))) {
            call.reject("Recording session expired.", "CANCELLED");
            return null;
        }
        return current;
    }

    private void cancelCurrent() {
        Session session = current;
        if (session == null) return;
        session.cancelled = true;
        session.stop = true;
        session.rejectStart("CANCELLED");
        JSObject event = new JSObject();
        event.put("sessionId", session.id);
        event.put("error", "CANCELLED");
        notifyListeners("recordingStopped", event);
        try { WhisperNative.cancel(session.number); } catch (LinkageError ignored) { }
        worker.execute(() -> { synchronized (WhisperPlugin.this) { clear(session); } });
    }

    private void clear(Session session) {
        if (session.audio != null) { Arrays.fill(session.audio, 0); session.audio = null; }
        if (current == session) current = null;
    }

    @Override
    protected synchronized void handleOnStop() { cancelCurrent(); }

    @Override
    protected synchronized void handleOnDestroy() {
        destroyed = true;
        cancelCurrent();
        worker.execute(() -> {
            if (context != 0) { WhisperNative.release(context); context = 0; }
        });
        worker.shutdown();
    }
}
