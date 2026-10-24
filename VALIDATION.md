# Version 0.2 qualification — 2026-10-23

Qwen3-TTS 1.7B CustomVoice was installed and selected in the existing plugin. Audio8 remains installed and selectable. Fish S2-Pro implementation/download/testing was explicitly put on hold by the user. No GPU inference or managed chat-model unload was performed.

## CPU plugin

- Downloaded the complete pinned Qwen checkpoint and speech tokenizer (about 4.2 GiB). Source: `022e286b98fbec7e1e916cb940cdf532cd9f488e`; model: `0c0e3051f131929182e2c023b9537f8b1c68adfe`.
- Isolated PyTorch `2.8.0+cpu`; `torch.version.cuda` is `None`. Transformers 4.57.3, Qwen package 0.1.1. `pip check` reports no broken requirements.
- Thirteen automated tests passed, including the real process-cancellation test. Syntax checks and the real Cordis/DSH Tool Manager discovery/selection/disposal check passed.
- Existing Audio8 configuration migrates with its original model/source/voice paths and selection preserved. Saved Qwen and Audio8 profiles remain independent. Each model has separate sampling settings; Qwen defaults match the upstream temperature 0.9 / top P 1.0 / top K 50.
- Re-ran real Audio8 inference through DSH Tools and LocalAttachmentStore after the changes: 4.505-second WAV, matching SHA-256 attachment and workspace file.
- Real Qwen CPU generation through DSH Tools and LocalAttachmentStore: 3.920-second, 24 kHz WAV, 188,204 bytes. CPU transcription recovered the words “Hello. Your audio file is saved in this workspace.” (ASR punctuation differed).
- Real Qwen CPU expressive call used a separate `delivery` field: “Warm, relaxed and conversational with a gentle smile. Natural pacing and varied intonation.” The spoken text remained separate. Produced a 7.440-second, 24 kHz WAV, 357,164 bytes. CPU transcription matched all words exactly after normalization:

> Hello! It's lovely to hear from you. Take a breath, settle in, and let's make something wonderful together.

- Measured expressive clip: peak 0.47198, RMS −22.66 dBFS, zero clipped samples. A correct transcript and unclipped signal do not prove subjective naturalness or emotion fidelity; the audio is available for listening.
- An isolated live DSH web profile loaded only base/web/TTS bundles, with no local chat/GPU providers. Browser testing verified Settings → Text to Speech, both model choices, per-model folder changes, Qwen voice/language presets, and successful validation/save with “Model files ready · PyTorch CPU.” The normal DSH stack was not restarted.
- The user-facing file remains `<chat workspace>/dsh-audio/tts-<job-id>/generated-speech.wav`, accompanied by a durable DSH attachment and existing inline player/download rendering.

## NPU experiment

This is a separate experiment, not a permanent DSH model-selector entry.

- Detected Intel AI Boost NPU architecture `3720`; the kernel device already existed. Downloaded/extracted Intel NPU user-space driver 1.38.0, Level Zero loader 1.34.0 and its TBB dependency into the private experiment directory. No root package install, kernel change, firmware replacement or service restart.
- OpenVINO `2026.4.1-22982-e213a147257-releases/2026/4` passed an actual NPU numerical probe.
- Converted Qwen using the official OpenVINO notebook helper pinned at `b2aa290400902c713ae0ca727211cdae4d3dfaaa`. The original notebook excludes NPU in its normal selector; direct compilation failed on dynamic shapes.
- Experimental adapter fixes: remove unused intermediate hidden outputs; pack required final hidden states together with logits so the NPUW LLM request transports both, then split on CPU without recomputing the talker; disable NPUW shared-LM-head extraction. Source/helper files are not silently modified. NPUW devices are restricted to NPU, so talker failure cannot silently fall back to CPU.
- Successful **real speech generation with main talker on NPU**. Component evidence reports `execution_devices: NPU` for the talker and explicit CPU execution for embeddings, code predictor and speech codec. This is a hybrid NPU/CPU pipeline, not all-NPU inference.
- Generated “Hello. It is lovely to hear from you.” as 2.776875 seconds of 24 kHz PCM WAV. CPU transcription matched every word after normalization. Peak 0.67413, RMS −18.37 dBFS, zero clipped samples.
- Recorded load time 5.467 s and generation time 31.803 s for that run. This is slower than real time; it is proof of working hardware execution, not a speed claim or recommendation to make NPU the default. Cache state, two-thread CPU auxiliaries and machine load affect timing.
- WAV JSON sidecar records component execution targets, timing, script, delivery and helper revision. Both CPU and NPU audio are available in the local workspace for comparison. No GPU was used.

## Remaining boundaries

No Fish S2-Pro tool or GPU handoff path was added while that work is on hold. The NPU experiment has only short-clip qualification; arbitrary long scripts, all voices/languages, concurrency and permanent DSH integration are not qualified. Qwen delivery instructions are performance requests, not a guaranteed `[whining]`/cough/yawn tag vocabulary. Neither transcript matching nor benchmark error rates establish universal voice naturalness.

---

# Historical v0.1 qualification — 2026-10-23

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
