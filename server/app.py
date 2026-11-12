import io
import os
from fractions import Fraction
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit

import av
import numpy as np
from dotenv import load_dotenv
from flask import Flask, Request, Response, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge


ROOT = Path(__file__).resolve().parent
MAX_AUDIO_BYTES = 5 * 1024 * 1024
SAMPLE_RATE = 16000
MAX_SECONDS = 30
DEFAULT_ORIGINS = ",".join(
    f"http://{host}{port}"
    for host in ("localhost", "127.0.0.1")
    for port in ("", ":8000", ":8100", ":5173")
)


class MemoryRequest(Request):
    def _get_file_stream(self, total_content_length, content_type,
                         filename=None, content_length=None):
        # Werkzeug's default upload stream spills to disk above 500 KB.
        stream = io.BytesIO()
        if not hasattr(self, "_audio_streams"):
            self._audio_streams = []
        self._audio_streams.append(stream)
        return stream

    def close(self):
        try:
            super().close()
        finally:
            # Also close partially parsed uploads when multipart parsing fails.
            for stream in getattr(self, "_audio_streams", []):
                stream.close()


class AudioError(ValueError):
    pass


def decode_audio(stream):
    chunks = []
    samples = 0
    duration = Fraction(0)
    resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)

    def collect(frames):
        nonlocal samples
        for frame in frames:
            samples += frame.samples
            if samples > SAMPLE_RATE * MAX_SECONDS:
                raise AudioError("Audio must not exceed 30 seconds.")
            chunks.append(frame.to_ndarray().reshape(-1))

    try:
        with av.open(stream, mode="r", options={
            "format_whitelist": "wav,matroska,webm", "protocol_whitelist": "file,pipe",
        }) as container:
            if not set(container.format.name.split(",")) & {"wav", "matroska", "webm"}:
                raise AudioError("Only WebM and WAV recordings are supported.")
            if not container.streams.audio:
                raise AudioError("No audio track found.")
            for frame in container.decode(audio=0):
                duration += Fraction(frame.samples, frame.sample_rate)
                if duration > MAX_SECONDS:
                    raise AudioError("Audio must not exceed 30 seconds.")
                frame.pts = None
                collect(resampler.resample(frame))
            collect(resampler.resample(None))
    except (av.FFmpegError, EOFError, ValueError) as error:
        if isinstance(error, AudioError):
            raise
        raise AudioError("Invalid audio. Please upload a WebM or WAV recording.") from None
    if not samples:
        raise AudioError("The recording is empty.")
    return np.concatenate(chunks).astype(np.float32) / 32768.0


def allowed_origins():
    origins = set(filter(None, (
        value.strip() for value in os.getenv("ASR_ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",")
    )))
    for origin in origins:
        parsed = urlsplit(origin)
        if (parsed.scheme not in ("http", "https")
                or parsed.hostname not in ("localhost", "127.0.0.1")
                or parsed.username or parsed.password
                or parsed.path or parsed.query or parsed.fragment):
            raise ValueError("ASR_ALLOWED_ORIGINS must contain exact local HTTP(S) origins.")
    return origins


def load_model():
    load_dotenv(ROOT / ".env")
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    from faster_whisper import WhisperModel
    from faster_whisper.utils import download_model

    model_name = os.getenv("WHISPER_MODEL", "base").strip() or "base"
    candidate = ROOT / model_name
    if candidate.is_dir():
        model_path = candidate.resolve()
    else:
        model_path = Path(download_model(
            model_name,
            cache_dir=str(ROOT / "models"),
            local_files_only=os.getenv("WHISPER_LOCAL_FILES_ONLY", "0") == "1",
        ))
    if not (model_path / "tokenizer.json").is_file():
        raise ValueError("Model directory must include tokenizer.json; refusing a remote tokenizer fallback.")
    return WhisperModel(
        str(model_path),
        device="cpu",
        compute_type="int8",
        local_files_only=True,
        cpu_threads=min(4, os.cpu_count() or 1),
    )


def create_app(model=None):
    load_dotenv(ROOT / ".env")
    app = Flask(__name__)
    app.request_class = MemoryRequest
    app.config.update(
        MAX_CONTENT_LENGTH=MAX_AUDIO_BYTES + 64 * 1024,
        MAX_FORM_MEMORY_SIZE=128 * 1024,
        MAX_FORM_PARTS=2,
        TRUSTED_HOSTS=["localhost", "127.0.0.1"],
    )
    origins = allowed_origins()
    CORS(app, resources={r"/api/asr": {
        "origins": sorted(origins), "methods": ["POST"], "allow_headers": ["Content-Type"],
    }})
    model = model if model is not None else load_model()
    inference_lock = Lock()

    def text_response(text, status=200):
        response = Response(text, status=status, mimetype="text/plain")
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.before_request
    def restrict_origin():
        origin = request.headers.get("Origin")
        if origin is not None and origin not in origins:
            return text_response("This origin is not allowed to access the local ASR service.", 403)

    @app.errorhandler(HTTPException)
    def http_error(error):
        message = "Maximum audio file size is 5 MiB." if error.code == 413 else error.description
        return text_response(message, error.code)

    @app.post("/api/asr")
    def transcribe():
        if not inference_lock.acquire(blocking=False):
            return text_response("ASR is busy. Please retry after the current recording finishes.", 429)
        try:
            files = list(request.files.items(multi=True))
            if len(files) != 1 or files[0][0] != "audio":
                return text_response("Upload exactly one audio file using the 'audio' field.", 400)
            upload = files[0][1]
            upload.stream.seek(0, io.SEEK_END)
            size = upload.stream.tell()
            if size > MAX_AUDIO_BYTES:
                raise RequestEntityTooLarge()
            if not size:
                return text_response("The recording is empty.", 400)
            upload.stream.seek(0)
            try:
                audio = decode_audio(upload.stream)
            except AudioError as error:
                return text_response(str(error), 422)
            try:
                segments, _ = model.transcribe(
                    audio, language="zh", task="transcribe", beam_size=5,
                    vad_filter=True, condition_on_previous_text=False,
                )
                text = "".join(segment.text for segment in segments).strip()
            except Exception:
                # Do not log audio, transcript, filenames, or exception payloads.
                app.logger.error("Local speech inference failed.")
                return text_response("Speech recognition failed. Please retry or enter the bill manually.", 503)
            finally:
                del audio
            if not text:
                return text_response("No speech detected. Please record again or enter the bill manually.", 422)
            return text_response(text)
        finally:
            inference_lock.release()

    return app


if __name__ == "__main__":
    load_dotenv(ROOT / ".env")
    port = int(os.getenv("ASR_PORT", "5000"))
    if not 1 <= port <= 65535:
        raise ValueError("ASR_PORT must be between 1 and 65535.")
    print("Loading local Whisper model (the first launch may download model files)...", flush=True)
    application = create_app()
    application.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)
