package com.duancreate.voiceaccount;

import java.util.Arrays;

final class PcmCapture {
    static final int SAMPLE_RATE = 16000;
    private final float[] samples = new float[SAMPLE_RATE * 30];
    private int size;
    private int speechSamples;
    private int quietSamples;

    boolean append(short[] input, int count) {
        int length = Math.min(count, samples.length - size);
        double energy = 0;
        for (int i = 0; i < length; i++) {
            float value = input[i] / 32768f;
            samples[size++] = value;
            energy += value * value;
        }
        // Energy gating detects silence, not words; recognition still needs user review.
        if (length > 0 && Math.sqrt(energy / length) >= 0.01) {
            speechSamples += length;
            quietSamples = 0;
        } else {
            quietSamples += length;
        }
        return size == samples.length || (speechSamples >= 2560
            ? quietSamples >= SAMPLE_RATE * 3 / 2 : size >= SAMPLE_RATE * 3);
    }

    float[] finish() {
        float[] result = speechSamples >= 2560 ? Arrays.copyOf(samples, size) : new float[0];
        Arrays.fill(samples, 0);
        return result;
    }

    static byte[] pcm16(float[] audio) {
        if (audio == null) return new byte[0];
        byte[] result = new byte[audio.length * 2];
        for (int i = 0; i < audio.length; i++) {
            int sample = Math.max(-32768, Math.min(32767, Math.round(audio[i] * 32768f)));
            result[i * 2] = (byte) sample;
            result[i * 2 + 1] = (byte) (sample >> 8);
        }
        return result;
    }
}
