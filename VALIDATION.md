# Local qualification — 2026-10-23

Environment: Linux x86_64, Node 22.22.1, Python 3.12, DSH 0.2.1-rc.2. Audio8 0.1B ONNX INT8 and ONNX Runtime CPU 1.23.2. Default one-thread inference at lower process priority. No GPU inference, GPU lease, chat-model unload or benchmark process control was used.

## Passed

- Isolated Python installation; all required model components downloaded at pinned revision. Bundled default voice registered from supplied reference codes. Model folder occupies approximately 423 MiB.
- Plugin added to the existing DSH web profile; composed configuration contains `dsh-tts`.
- Ten automated tests passed, including the real child-process cancellation test with the CPU environment available. JavaScript syntax checks passed.
- Real public Cordis/DSH ToolRuntime integration: one tool appears directly without Tool Manager; with Tool Manager it is hidden, discoverable through `TTS`, `text-to-speech` and `read aloud narration voiceover`, selectable, and removed on plugin disposal.
- Model-folder validation and atomic settings persistence; out-of-range CPU/sampling values and incompatible model precision rejected. Settings routes enforce owner capability and origin, connection/media routes enforce owner authorization, and settings cannot invoke synthesis.
- Inline card rendering tested outside a collapsed tool result and at the turn tail. HTTP tests covered playback, byte ranges, HEAD, download, invalid ranges, invalid filenames and method restrictions.
- Real CPU short-clip generation: 5.712 seconds, 44.1 kHz mono PCM WAV, 503,852 bytes. Measured peak 0.6494, RMS approximately −19.98 dBFS, zero clipped samples.
- Real CPU multi-segment generation: 16.434 seconds, two segments, 44.1 kHz mono PCM WAV, 1,449,520 bytes. Measured peak 0.6674, RMS approximately −21.39 dBFS, zero clipped samples.
- CPU Whisper through the installed `dsh-audio` analysis tooling recovered the entire multi-segment script exactly after case/punctuation normalization:

> The first sentence checks that local speech works. The next sentence checks that longer text is divided into smaller pieces. Finally, this last sentence confirms that the pieces are joined into one audio file.

- Additional real DSH Tools execution with the real LocalAttachmentStore returned a 397,356-byte, 4.505-second WAV attachment. The content-addressed SHA-256 matched the saved bytes. The tool's returned workspace path existed and had the same byte count. This used an isolated DSH Context, not the user's running web stack.

## Limits and deferred checks

The short clip's Whisper transcript misrecognized part of “text to speech” and the product name “DeepSeek Harness.” This is an intelligibility limitation in this sample or ASR, not proof of exact pronunciation. The longer ordinary-language test matched its script. These checks do not establish every-language quality or perfect names/pronunciation.

No GPU backend is exposed in this initial release; GPU qualification is deferred. Voice cloning and timed dubbing are not tool features. Expression tags are not documented controls in the inspected Audio8 runtime and are not advertised as supported.

The existing DSH web stack was stopped during this work. It was intentionally not started or restarted while the user was benchmarking. Full browser interaction in the live DSH settings/chat UI remains a check for the next normal DSH startup; supported hook registration, settings routes, result components and real DSH attachment execution were tested independently.

Reproduce:

```sh
TTS_TEST_PYTHON="$HOME/.dsh/dsh-tts/venv/bin/python" npm test
npm run check
DSH_ROOT=/path/to/deepseek-harness npm run check:discovery
npm run smoke
```
