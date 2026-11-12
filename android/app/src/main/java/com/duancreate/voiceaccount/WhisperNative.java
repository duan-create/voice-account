package com.duancreate.voiceaccount;

import android.content.res.AssetManager;

final class WhisperNative {
    static { System.loadLibrary("voice_whisper"); }

    static native long load(AssetManager assets);
    static native void begin(long session);
    static native void cancel(long session);
    static native byte[] recognize(long context, float[] samples, long session, int threads);
    static native void release(long context);
}
