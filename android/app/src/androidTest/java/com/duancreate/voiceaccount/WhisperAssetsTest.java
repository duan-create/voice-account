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
        try (InputStream stream = assets.open("models/ggml-tiny-q5_1.bin")) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                length += count;
                digest.update(buffer, 0, count);
            }
        }
        assertEquals(32152673L, length);
        StringBuilder hash = new StringBuilder();
        for (byte value : digest.digest()) hash.append(String.format("%02x", value & 0xff));
        assertEquals("818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7", hash.toString());
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
