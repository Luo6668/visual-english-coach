#!/usr/bin/env python3
import argparse
import base64
import io
import json
import os
import shutil
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")


def configure_espeak():
    try:
        import espeakng_loader

        library_path = espeakng_loader.get_library_path()
        packaged_data_path = Path(espeakng_loader.get_data_path())
        data_path = Path(tempfile.gettempdir()) / "visual-english-espeak-data"
        shutil.copytree(packaged_data_path, data_path, dirs_exist_ok=True)
        os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", library_path)
        os.environ["PHONEMIZER_ESPEAK_DATA_PATH"] = str(data_path)
        try:
            from phonemizer.backend.espeak.wrapper import EspeakWrapper

            EspeakWrapper.set_library(library_path)
            EspeakWrapper.set_data_path(str(data_path))
        except (ImportError, AttributeError):
            pass
    except ImportError:
        pass


import numpy as np
import soundfile as sf
from kokoro import KPipeline

configure_espeak()


class KokoroEngine:
    sample_rate = 24000

    def __init__(self):
        self.english_voice = os.environ.get("KOKORO_EN_VOICE", os.environ.get("KOKORO_VOICE", "af_heart"))
        self.chinese_voice = os.environ.get("KOKORO_ZH_VOICE", "zf_xiaoxiao")
        self.device = os.environ.get("KOKORO_DEVICE", "cpu")
        print(
            f"Loading Kokoro-82M ({self.device}, voices={self.english_voice}/{self.chinese_voice})...",
            flush=True,
        )
        self.english_pipeline = KPipeline(
            lang_code="a", repo_id="hexgrad/Kokoro-82M", device=self.device
        )
        self.chinese_pipeline = KPipeline(
            lang_code="z",
            repo_id="hexgrad/Kokoro-82M",
            model=self.english_pipeline.model,
            en_callable=lambda text: self.english_pipeline.g2p(text)[0],
        )
        self.lock = threading.Lock()
        print("Kokoro-82M is ready.", flush=True)

    @staticmethod
    def split_language_segments(text):
        segments = []
        current_language = None
        current_text = []

        for character in text:
            if "\u3400" <= character <= "\u9fff":
                language = "zh-CN"
            elif character.isascii() and character.isalpha():
                language = "en-US"
            else:
                language = None

            if language is None or current_language in (None, language):
                if language is not None:
                    current_language = language
                current_text.append(character)
                continue

            segment = "".join(current_text).strip()
            if segment:
                segments.append((current_language, segment))
            current_language = language
            current_text = [character]

        segment = "".join(current_text).strip()
        if segment:
            segments.append((current_language or "en-US", segment))
        return segments

    def synthesize(self, text):
        segments = self.split_language_segments(text)
        languages = []
        voices = []
        with self.lock:
            chunks = []
            for language, segment in segments:
                chinese = language == "zh-CN"
                pipeline = self.chinese_pipeline if chinese else self.english_pipeline
                voice = self.chinese_voice if chinese else self.english_voice
                if chunks:
                    chunks.append(np.zeros(round(self.sample_rate * 0.06), dtype=np.float32))
                for _, _, audio in pipeline(segment, voice=voice, speed=0.95):
                    if hasattr(audio, "detach"):
                        audio = audio.detach().cpu().numpy()
                    chunks.append(np.asarray(audio, dtype=np.float32))
                if language not in languages:
                    languages.append(language)
                if voice not in voices:
                    voices.append(voice)
        if not chunks:
            raise ValueError("Kokoro did not produce audio")
        waveform = np.concatenate(chunks)
        output = io.BytesIO()
        sf.write(output, waveform, self.sample_rate, format="WAV", subtype="PCM_16")
        duration = round(len(waveform) / self.sample_rate * 1000)
        language = languages[0] if len(languages) == 1 else "mixed"
        return output.getvalue(), duration, "+".join(voices), language


class Handler(BaseHTTPRequestHandler):
    engine = None

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {
                "ok": True,
                "provider": "Kokoro-82M",
                "voices": {
                    "en-US": self.engine.english_voice,
                    "zh-CN": self.engine.chinese_voice,
                },
            })
            return
        self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/tts":
            self.send_json(404, {"error": "Not found"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 128_000:
                self.send_json(413, {"error": "朗读内容过长"})
                return
            payload = json.loads(self.rfile.read(content_length))
            text = " ".join(str(payload.get("text", "")).split())[:2000]
            if not text:
                self.send_json(400, {"error": "朗读内容不能为空"})
                return
            audio, duration, voice, language = self.engine.synthesize(text)
            self.send_json(200, {
                "audioData": "data:audio/wav;base64," + base64.b64encode(audio).decode("ascii"),
                "audioLength": duration,
                "voice": voice,
                "language": language,
                "provider": "Kokoro-82M",
            })
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except Exception as error:
            print(f"TTS error: {error}", flush=True)
            self.send_json(500, {"error": f"本地语音合成失败：{error}"})

    def log_message(self, format_string, *args):
        print(f"Kokoro {self.address_string()} {format_string % args}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--warmup", action="store_true")
    parser.add_argument("--output")
    args = parser.parse_args()

    engine = KokoroEngine()
    if args.warmup:
        output_path = Path(args.output or ".local-speech/kokoro-smoke.wav")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        english_audio, _, _, _ = engine.synthesize("A clear and natural English voice is ready.")
        chinese_audio, _, _, _ = engine.synthesize("你好，普通话语音已经准备好了。")
        chinese_output_path = output_path.with_name(f"{output_path.stem}-zh{output_path.suffix}")
        output_path.write_bytes(english_audio)
        chinese_output_path.write_bytes(chinese_audio)
        print(f"Kokoro warmup audio: {output_path}, {chinese_output_path}", flush=True)
        return

    Handler.engine = engine
    host = "127.0.0.1"
    port = int(os.environ.get("LOCAL_TTS_PORT", "8766"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Local TTS server: http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
