package com.duancreate.voiceaccount;

import static org.junit.Assert.*;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.junit.Test;

public class SpeechVaultTest {
    private static final class ResultCall extends PluginCall {
        JSObject value;
        String error;
        ResultCall(JSObject input) { super(null, "SpeechVaultPlugin", "test", "test", input); }
        @Override public void resolve(JSObject result) { value = result; }
        @Override public void resolve() { value = new JSObject(); }
        @Override public void reject(String message, String code) { error = code; }
    }

    @Test
    public void keystoreCiphertextRoundTripsRejectsTamperingAndDiesWithKey() throws Exception {
        SpeechVaultPlugin vault = new SpeechVaultPlugin();
        String plain = "{\"apiSecret\":\"instrumentation-placeholder\"}";
        vault.clearKey(new ResultCall(new JSObject()));
        try {
            JSObject input = new JSObject(); input.put("json", plain);
            ResultCall sealed = new ResultCall(input); vault.seal(sealed);
            assertNull(sealed.error); assertFalse(input.has("json"));
            String ciphertext = sealed.value.getString("sealed");
            assertFalse(ciphertext.contains("instrumentation-placeholder"));
            ResultCall read = new ResultCall(new JSObject().put("sealed", ciphertext));
            new SpeechVaultPlugin().unseal(read);
            assertNull(read.error); assertEquals(plain, read.value.getString("json"));
            String corrupt = (ciphertext.startsWith("A") ? "B" : "A") + ciphertext.substring(1);
            ResultCall tampered = new ResultCall(new JSObject().put("sealed", corrupt)); vault.unseal(tampered);
            assertEquals("VAULT_FAILED", tampered.error);
            vault.clearKey(new ResultCall(new JSObject()));
            ResultCall erased = new ResultCall(new JSObject().put("sealed", ciphertext)); vault.unseal(erased);
            assertEquals("VAULT_FAILED", erased.error);
        } finally { vault.clearKey(new ResultCall(new JSObject())); }
    }
}
