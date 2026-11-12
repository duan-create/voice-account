package com.duancreate.voiceaccount;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import android.content.res.AssetManager;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.security.MessageDigest;
import org.junit.Test;

public class WhisperAssetsTest {
    @Test
    public void packagedModelMatchesAndNativeLibraryLoads() throws Exception {
        AssetManager assets = InstrumentationRegistry.getInstrumentation().getTargetContext().getAssets();
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long length = 0;
        try (InputStream stream = assets.open("models/ggml-base-q5_1.bin")) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                length += count;
                digest.update(buffer, 0, count);
            }
        }
        assertEquals(59707625L, length);
        StringBuilder hash = new StringBuilder();
        for (byte value : digest.digest()) hash.append(String.format("%02x", value & 0xff));
        assertEquals("422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898", hash.toString());
        long context = WhisperNative.load(assets);
        assertNotEquals(0, context);
        try {
            WhisperNative.begin(1);
            WhisperNative.cancel(1);
        } finally {
            WhisperNative.release(context);
        }
    }
}
