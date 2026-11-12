#include <jni.h>
#include <android/asset_manager_jni.h>
#include <whisper.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <memory>
#include <string>
#include <vector>

namespace {
std::atomic<jlong> active_session{0};
std::atomic<jlong> cancelled_session{0};

void fail(JNIEnv * env, const char * message) {
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), message);
}

void quiet_log(ggml_log_level, const char *, void *) {}

struct AbortState {
    jlong session;
    std::chrono::steady_clock::time_point deadline;
};

bool should_abort(void * data) {
    auto * state = static_cast<AbortState *>(data);
    return active_session.load() != state->session || cancelled_session.load() == state->session
        || std::chrono::steady_clock::now() >= state->deadline;
}

size_t read_asset(void * context, void * output, size_t bytes) {
    auto * asset = static_cast<AAsset *>(context);
    size_t total = 0;
    while (total < bytes) {
        int read = AAsset_read(asset, static_cast<char *>(output) + total,
                              std::min<size_t>(bytes - total, 1024 * 1024));
        if (read <= 0) break;
        total += read;
    }
    return total;
}
bool asset_eof(void * context) { return AAsset_getRemainingLength64(static_cast<AAsset *>(context)) == 0; }
void close_asset(void * context) { AAsset_close(static_cast<AAsset *>(context)); }
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_duancreate_voiceaccount_WhisperNative_load(JNIEnv * env, jclass, jobject manager) {
    try {
        whisper_log_set(quiet_log, nullptr);
        auto * assets = AAssetManager_fromJava(env, manager);
        if (!assets) { fail(env, "Asset manager unavailable."); return 0; }
        AAsset * asset = AAssetManager_open(assets, "models/ggml-base-q5_1.bin", AASSET_MODE_STREAMING);
        if (!asset) { fail(env, "Bundled model missing."); return 0; }
        whisper_model_loader loader{asset, read_asset, asset_eof, close_asset};
        auto parameters = whisper_context_default_params();
        parameters.use_gpu = false;
        auto * context = whisper_init_with_params(&loader, parameters);
        if (!context) { fail(env, "Bundled model could not be loaded."); return 0; }
        if (!whisper_is_multilingual(context)) {
            whisper_free(context);
            fail(env, "A multilingual model is required.");
            return 0;
        }
        return reinterpret_cast<jlong>(context);
    } catch (...) { fail(env, "Model initialization failed."); return 0; }
}

extern "C" JNIEXPORT void JNICALL
Java_com_duancreate_voiceaccount_WhisperNative_begin(JNIEnv *, jclass, jlong session) {
    active_session.store(session);
    cancelled_session.store(0);
}

extern "C" JNIEXPORT void JNICALL
Java_com_duancreate_voiceaccount_WhisperNative_cancel(JNIEnv *, jclass, jlong session) {
    cancelled_session.store(session);
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_duancreate_voiceaccount_WhisperNative_recognize(
    JNIEnv * env, jclass, jlong handle, jfloatArray input, jlong session, jint threads) {
    try {
        auto * context = reinterpret_cast<whisper_context *>(handle);
        int count = input ? env->GetArrayLength(input) : 0;
        if (!context || count <= 0 || count > 480000) {
            fail(env, "Invalid recognition input."); return nullptr;
        }
        AbortState abort{session, std::chrono::steady_clock::now() + std::chrono::seconds(120)};
        if (should_abort(&abort)) return nullptr;
        std::vector<float> audio(count);
        env->GetFloatArrayRegion(input, 0, count, audio.data());
        if (env->ExceptionCheck()) return nullptr;
        auto params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
        params.n_threads = std::max(1, std::min(4, static_cast<int>(threads)));
        params.language = "zh";
        params.translate = false;
        params.no_context = true;
        params.no_timestamps = true;
        params.print_realtime = false;
        params.print_progress = false;
        params.print_timestamps = false;
        params.print_special = false;
        params.suppress_nst = true;
        params.temperature_inc = 0;
        params.abort_callback = should_abort;
        params.abort_callback_user_data = &abort;
        int code = whisper_full(context, params, audio.data(), count);
        std::fill(audio.begin(), audio.end(), 0);
        if (should_abort(&abort)) { fail(env, "Local recognition cancelled or timed out."); return nullptr; }
        if (code != 0) { fail(env, "Local inference failed."); return nullptr; }
        std::string text;
        for (int i = 0; i < whisper_full_n_segments(context); i++) {
            if (whisper_full_get_segment_no_speech_prob(context, i) < 0.6f) {
                text += whisper_full_get_segment_text(context, i);
            }
        }
        // Byte[] preserves ordinary UTF-8; JNI NewStringUTF uses modified UTF-8.
        jbyteArray result = env->NewByteArray(static_cast<jsize>(text.size()));
        if (result) env->SetByteArrayRegion(result, 0, static_cast<jsize>(text.size()),
                                          reinterpret_cast<const jbyte *>(text.data()));
        return result;
    } catch (...) { fail(env, "Local inference failed."); return nullptr; }
}

extern "C" JNIEXPORT void JNICALL
Java_com_duancreate_voiceaccount_WhisperNative_release(JNIEnv *, jclass, jlong context) {
    if (context) whisper_free(reinterpret_cast<whisper_context *>(context));
}
