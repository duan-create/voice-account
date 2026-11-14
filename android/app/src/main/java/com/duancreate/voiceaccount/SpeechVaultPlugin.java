package com.duancreate.voiceaccount;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SpeechVaultPlugin")
public class SpeechVaultPlugin extends Plugin {
    private static final String ALIAS = "voice-account-iflytek-v1";
    private static final byte[] AAD = "voice-account-speech-v1".getBytes(StandardCharsets.UTF_8);

    private KeyStore store() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        return store;
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = store();
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        if (!create) throw new IllegalStateException("Key unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    @PluginMethod
    public synchronized void seal(PluginCall call) {
        byte[] plain = null;
        try {
            String json = call.getString("json", "");
            call.getData().remove("json");
            if (json.isEmpty() || json.length() > 2048) throw new IllegalArgumentException();
            plain = json.getBytes(StandardCharsets.UTF_8);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            cipher.updateAAD(AAD);
            String sealed = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "."
                + Base64.encodeToString(cipher.doFinal(plain), Base64.NO_WRAP);
            JSObject result = new JSObject(); result.put("sealed", sealed); call.resolve(result);
        } catch (Exception error) { call.reject("Credential encryption unavailable.", "VAULT_FAILED"); }
        finally { if (plain != null) Arrays.fill(plain, (byte) 0); }
    }

    @PluginMethod
    public synchronized void unseal(PluginCall call) {
        byte[] plain = null;
        try {
            String sealed = call.getString("sealed", "");
            if (sealed.length() > 4096) throw new IllegalArgumentException();
            String[] pieces = sealed.split("\\.", -1);
            if (pieces.length != 2) throw new IllegalArgumentException();
            byte[] iv = Base64.decode(pieces[0], Base64.NO_WRAP);
            if (iv.length != 12) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
            cipher.updateAAD(AAD);
            plain = cipher.doFinal(Base64.decode(pieces[1], Base64.NO_WRAP));
            JSObject result = new JSObject(); result.put("json", new String(plain, StandardCharsets.UTF_8)); call.resolve(result);
        } catch (Exception error) { call.reject("Credential decryption unavailable.", "VAULT_FAILED"); }
        finally { if (plain != null) Arrays.fill(plain, (byte) 0); }
    }

    @PluginMethod
    public synchronized void clearKey(PluginCall call) {
        try { store().deleteEntry(ALIAS); call.resolve(); }
        catch (Exception error) { call.reject("Credential deletion unavailable.", "VAULT_FAILED"); }
    }
}
