package com.duancreate.voiceaccount;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WhisperPlugin.class);
        registerPlugin(DocumentsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
