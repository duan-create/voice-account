package com.duancreate.voiceaccount;

public final class PcmCaptureTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        short[] silent = new short[320];
        short[] voice = new short[320];
        java.util.Arrays.fill(voice, (short) 2000);
        PcmCapture empty = new PcmCapture();
        for (int i = 0; i < 149; i++) check(!empty.append(silent, 320), "premature initial silence");
        check(empty.append(silent, 320), "initial silence must stop after 3 seconds");
        check(empty.finish().length == 0, "silence must not reach Whisper");

        PcmCapture trailing = new PcmCapture();
        for (int i = 0; i < 15; i++) trailing.append(voice, 320);
        for (int i = 0; i < 74; i++) check(!trailing.append(silent, 320), "premature trailing silence");
        check(trailing.append(silent, 320), "trailing silence must stop after 1.5 seconds");
        float[] pcm = trailing.finish();
        check(pcm.length == 28800, "preserve PCM duration");
        check(Math.abs(pcm[0] - 2000f / 32768f) < 0.00001, "normalize PCM16");
        byte[] cloud = PcmCapture.pcm16(new float[] { -1, 0, 2000f / 32768f, 32767f / 32768f });
        check(java.util.Arrays.equals(cloud, new byte[] { 0, -128, 0, 0, -48, 7, -1, 127 }), "cloud PCM must be signed little-endian PCM16");
        check(PcmCapture.pcm16(null).length == 0, "missing audio is silent");

        PcmCapture maximum = new PcmCapture();
        for (int i = 0; i < 1499; i++) check(!maximum.append(voice, 320), "premature max duration");
        check(maximum.append(voice, 320), "30 seconds must stop");
        maximum.append(voice, 320);
        check(maximum.finish().length == 480000, "buffer must never exceed 30 seconds");

        PcmCapture click = new PcmCapture();
        click.append(voice, 320);
        check(click.finish().length == 0, "isolated click is not speech");
        System.out.println("PCM tests passed: initial/trailing silence, duration, normalization, noise click.");
    }
}
