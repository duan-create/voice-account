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
}
