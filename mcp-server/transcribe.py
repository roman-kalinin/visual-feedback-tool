#!/usr/bin/env python3
"""Local speech-to-text for the visual-feedback-tool, via faster-whisper.

Usage:
    python transcribe.py <audio_file> [model_size] [language]

Prints the plain transcript to stdout. All local: no API keys, nothing leaves
the machine. faster-whisper decodes the input itself (via PyAV/ffmpeg), so any
common audio container works — including the browser's webm/opus recordings.
The model is downloaded once on first use and cached by faster-whisper.

Exit codes: 0 ok, 2 bad usage, 3 missing dependency, 4 transcription error.
"""
import sys

_MODEL_CACHE = {}


def _load(model_size):
    from faster_whisper import WhisperModel  # heavy import, kept lazy
    if model_size not in _MODEL_CACHE:
        # device/compute auto-selected; int8 keeps it fast + light on CPU.
        _MODEL_CACHE[model_size] = WhisperModel(
            model_size, device="auto", compute_type="int8"
        )
    return _MODEL_CACHE[model_size]


def main(argv):
    if len(argv) < 2:
        sys.stderr.write("usage: transcribe.py <audio_file> [model_size] [language]\n")
        return 2
    audio = argv[1]
    model_size = argv[2] if len(argv) > 2 and argv[2] else "base"
    # Optional ISO language pin (e.g. 'en', 'ru', 'uk'). Empty => auto-detect.
    language = argv[3] if len(argv) > 3 and argv[3] else None

    try:
        model = _load(model_size)
    except ImportError as e:
        sys.stderr.write(f"faster-whisper not installed: {e}\n")
        return 3

    try:
        segments, _info = model.transcribe(
            audio,
            language=language,
            vad_filter=True,          # drop long silences → cleaner output
            beam_size=5,
        )
        text = " ".join(s.text.strip() for s in segments).strip()
    except Exception as e:  # noqa: BLE001 — surface any decode/runtime failure
        sys.stderr.write(f"transcription failed: {e}\n")
        return 4

    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
