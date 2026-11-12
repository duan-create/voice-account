import io
import os
import tempfile
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import av
import numpy as np
from werkzeug.datastructures import FileStorage, MultiDict
from werkzeug.test import encode_multipart

from app import create_app, load_model


def wav_audio(seconds=1, rate=48000, channels=2, silent=False):
    samples = np.zeros(round(seconds * rate), dtype=np.int16)
    if not silent:
        samples = (np.sin(np.arange(len(samples)) * 2 * np.pi * 440 / rate) * 8000).astype(np.int16)
    samples = np.repeat(samples[:, None], channels, axis=1)
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(samples.tobytes())
    return output.getvalue()


def webm_audio(seconds=1):
    output = io.BytesIO()
    with av.open(output, "w", format="webm") as container:
        stream = container.add_stream("libopus", rate=48000)
        stream.layout = "mono"
        samples = (np.sin(np.arange(round(seconds * 48000)) * 2 * np.pi * 440 / 48000) * 8000).astype(np.int16)
        frame = av.AudioFrame.from_ndarray(samples[None, :], format="s16", layout="mono")
        frame.sample_rate = 48000
        for packet in stream.encode(frame):
            container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)
    return output.getvalue()


class ModelBoundary:
    """Replace only expensive inference; exercise real upload and audio decoding."""

    def __init__(self, text="午饭花了二十八块"):
        self.text = text
        self.calls = []
        self.error = False

    def transcribe(self, audio, **options):
        self.calls.append((audio.copy(), options))
        if self.error:
            raise RuntimeError("private model details")
        return iter([SimpleNamespace(text=self.text)]), SimpleNamespace(language="zh")


class AsrTests(unittest.TestCase):
    def setUp(self):
        self.model = ModelBoundary()
        self.app = create_app(self.model)
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def upload(self, data=None, name="voice.wav", **kwargs):
        if data is None:
            data = wav_audio()
        with io.BytesIO(data) as stream:
            boundary, body = encode_multipart({"audio": FileStorage(stream=stream, filename=name)})
        return self.client.post("/api/asr", data=body,
                                content_type=f"multipart/form-data; boundary={boundary}", **kwargs)

    def test_wav_normalized_to_mono_16khz_and_plain_chinese_response(self):
        response = self.upload()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "text/plain")
        self.assertEqual(response.get_data(as_text=True), "午饭花了二十八块")
        audio, options = self.model.calls[0]
        self.assertEqual(audio.shape, (16000,))
        self.assertEqual(audio.dtype, np.float32)
        self.assertGreater(np.max(np.abs(audio)), 0.1)
        self.assertLessEqual(np.max(np.abs(audio)), 1)
        self.assertEqual(options["language"], "zh")
        self.assertTrue(options["vad_filter"])
        self.assertFalse(options["condition_on_previous_text"])
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_real_webm_opus_decoding(self):
        response = self.upload(webm_audio(), "voice.webm")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.model.calls[0][0].shape, (16000,))

    def test_decodes_content_not_untrusted_extension(self):
        self.assertEqual(self.upload(name="voice.webm").status_code, 200)

    def test_requires_one_audio_file(self):
        response = self.client.post("/api/asr", data={})
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/api/asr", data=MultiDict([
            ("audio", (io.BytesIO(wav_audio()), "first.wav")),
            ("audio", (io.BytesIO(wav_audio()), "second.wav")),
        ]))
        self.assertIn(response.status_code, (400, 413))
        self.assertFalse(self.model.calls)

    def test_empty_and_corrupt_uploads_never_reach_model(self):
        for audio in (b"", b"not an audio file", wav_audio(seconds=0)):
            with self.subTest(length=len(audio)):
                response = self.upload(audio)
                self.assertIn(response.status_code, (400, 422))
                self.assertEqual(response.mimetype, "text/plain")
        self.assertFalse(self.model.calls)

    def test_exact_30_second_wav_is_accepted(self):
        self.assertEqual(self.upload(wav_audio(30, rate=16000, channels=1)).status_code, 200)
        self.assertEqual(self.model.calls[0][0].size, 480000)

    def test_exact_30_second_webm_is_accepted(self):
        self.assertEqual(self.upload(webm_audio(30), "voice.webm").status_code, 200)
        self.assertEqual(self.model.calls[0][0].size, 480000)

    def test_long_wav_is_rejected_before_inference(self):
        self.assertEqual(self.upload(wav_audio(30.1, rate=16000, channels=1)).status_code, 422)
        self.assertFalse(self.model.calls)

    def test_long_compressed_webm_is_rejected_before_inference(self):
        self.assertEqual(self.upload(webm_audio(31), "voice.webm").status_code, 422)
        self.assertFalse(self.model.calls)

    def test_file_over_5mib_rejected_despite_room_for_multipart_headers(self):
        response = self.upload(b"x" * (5 * 1024 * 1024 + 1))
        self.assertEqual(response.status_code, 413)
        self.assertFalse(self.model.calls)

    def test_exact_5mib_file_is_accepted_with_multipart_overhead(self):
        audio = wav_audio()
        padded = audio + b"\0" * (5 * 1024 * 1024 - len(audio))
        self.assertEqual(self.upload(padded).status_code, 200)

    def test_malformed_multipart_closes_partially_created_streams(self):
        streams = []
        factory = self.app.request_class._get_file_stream

        def record(request, *args, **kwargs):
            stream = factory(request, *args, **kwargs)
            streams.append(stream)
            return stream

        body = b'--test\r\nContent-Disposition: form-data; name="audio"; filename="a.wav"\r\n\r\nbroken'
        with patch.object(self.app.request_class, "_get_file_stream", record):
            response = self.client.post("/api/asr", data=body,
                                        content_type="multipart/form-data; boundary=test")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(streams), 1)
        self.assertTrue(streams[0].closed)

    def test_non_audio_playlist_is_not_allowed(self):
        playlist = b"#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nfile:///not-a-recording.wav\n#EXT-X-ENDLIST\n"
        self.assertEqual(self.upload(playlist, "voice.webm").status_code, 422)
        self.assertFalse(self.model.calls)

    def test_non_webm_wav_container_is_rejected_even_if_decodable(self):
        output = io.BytesIO()
        with av.open(output, "w", format="aiff") as container:
            stream = container.add_stream("pcm_s16be", rate=16000)
            stream.layout = "mono"
            frame = av.AudioFrame.from_ndarray(np.zeros((1, 16000), dtype=np.int16),
                                             format="s16", layout="mono")
            frame.sample_rate = 16000
            for packet in stream.encode(frame):
                container.mux(packet)
            for packet in stream.encode(None):
                container.mux(packet)
        self.assertEqual(self.upload(output.getvalue(), "voice.wav").status_code, 422)
        self.assertFalse(self.model.calls)

    def test_oversized_request_is_plain_text_413(self):
        response = self.upload(b"x" * (6 * 1024 * 1024))
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.mimetype, "text/plain")

    def test_upload_over_spooling_threshold_stays_in_memory_and_closes(self):
        streams = []
        factory = self.app.request_class._get_file_stream

        def record(request, *args, **kwargs):
            stream = factory(request, *args, **kwargs)
            streams.append(stream)
            self.assertIsInstance(stream, io.BytesIO)
            return stream

        with patch.object(self.app.request_class, "_get_file_stream", record):
            self.assertEqual(self.upload(wav_audio(4)).status_code, 200)
            self.assertEqual(self.upload(b"x" * (5 * 1024 * 1024 + 1)).status_code, 413)
        self.assertEqual(len(streams), 2)
        self.assertTrue(all(stream.closed for stream in streams))

    def test_silence_without_detected_speech_does_not_invent_text(self):
        self.model.text = " "
        response = self.upload(wav_audio(silent=True))
        self.assertEqual(response.status_code, 422)

    def test_inference_failure_is_private_and_next_request_can_run(self):
        self.model.error = True
        with self.assertLogs(self.app.logger, level="ERROR"):
            response = self.upload()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private model details", response.get_data(as_text=True))
        self.model.error = False
        self.assertEqual(self.upload().status_code, 200)

    def test_untrusted_origin_is_rejected_not_just_missing_cors_header(self):
        response = self.upload(headers={"Origin": "https://untrusted.example"})
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)
        self.assertFalse(self.model.calls)

    def test_local_origin_allowed_and_preflight_does_not_run_model(self):
        origin = "http://localhost:8000"
        response = self.client.options("/api/asr", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], origin)
        self.assertFalse(self.model.calls)
        response = self.upload(headers={"Origin": origin})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], origin)

    def test_rejects_dns_rebinding_host(self):
        response = self.upload(base_url="http://untrusted.example")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.model.calls)

    def test_busy_model_rejects_overlapping_request_then_recovers(self):
        original = self.model.transcribe
        nested = []

        def while_busy(audio, **options):
            nested.append(self.upload().status_code)
            return original(audio, **options)

        self.model.transcribe = while_busy
        self.assertEqual(self.upload().status_code, 200)
        self.assertEqual(nested, [429])
        self.model.transcribe = original
        self.assertEqual(self.upload().status_code, 200)


class ModelPreparationTests(unittest.TestCase):
    def test_incomplete_local_model_fails_before_tokenizer_download_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"WHISPER_MODEL": directory, "WHISPER_LOCAL_FILES_ONLY": "1"}):
                with self.assertRaisesRegex(ValueError, "tokenizer.json"):
                    load_model()
            self.assertEqual(list(Path(directory).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
