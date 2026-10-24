# DSH Text to Speech

Local speech generation for DeepSeek Harness. The **`text_to_speech`** tool creates a WAV in your chat workspace with an inline player and download link. Search for **TTS**, **text-to-speech**, **read aloud**, **narration** or **voiceover** when Tool Manager is enabled. Without Tool Manager, the enabled plugin exposes the tool directly.

Version 0.2 adds **Qwen3-TTS 1.7B CustomVoice on CPU** alongside the original **Audio8 0.1B ONNX INT8**. Choose the model in **Settings → Text to Speech**. Both load only for a call and unload when the worker exits. They do not unload your chat model, reserve the GPU or depend on other media plugins.

Fish S2-Pro is on hold at the user's request. The separate [NPU experiment](experiments/README.md) is not a permanent plugin option, and no GPU inference is implemented or tested in this release.

## Installation

Requires DSH `0.2.1-rc.2`, Node 22.19+, Git and Python 3.11/3.12 with venv support. Linux x86_64 is the tested platform.

```sh
git clone https://github.com/averyjohnkucan-arch/dsh-tts.git
cd dsh-tts
dsh plugin --profile web add link:/absolute/path/dsh-tts
npm run setup:qwen -- --python python3.12 --select
```

Or install the plugin bundle directly:

```sh
dsh plugin --profile web add github:averyjohnkucan-arch/dsh-tts
```

Run `scripts/setup_qwen.py` from a checkout to provision the isolated runtime. It downloads the pinned Qwen3 CustomVoice model and its speech tokenizer, approximately 4.2 GiB, into `~/.dsh/dsh-tts/models/qwen3`. It installs CPU-only PyTorch wheels, not CUDA. The optional `--select` flag makes Qwen the saved default. Without it, an existing Audio8 selection is preserved.

For Audio8 instead:

```sh
npm run setup -- --python python3.12
```

Runtime data lives under `$DSH_HOME/dsh-tts`, default `~/.dsh/dsh-tts`. Both setup scripts accept `--data-dir`; set the plugin's `dataDir` configuration to match a custom directory. Model weights and Python environments are not stored in the plugin repository. No service API key is needed.

Start/restart DSH at a suitable time to load an installed or updated bundle, then enable **dsh-tts** in Plugins. Setup does not restart DSH, modify inference services or launch a chat model.

## Settings and migration

Open **Settings → Text to Speech**:

- **Speech model** dropdown: Qwen3-TTS 1.7B CustomVoice or Audio8 0.1B.
- **Model folder**: browse host directories or enter a complete local model path. Each model keeps its own folder and runtime paths.
- **Qwen voice and language**: nine presets and ten languages plus automatic selection. Ryan and Aiden are native English presets; using a voice's native language is recommended upstream.
- **CPU threads**, **seed**, **pause between segments**, temperature, top P and top K.
- **Advanced paths**: isolated Python executable and source directory; Audio8 also has its saved default voice-profile folder.

Existing Audio8 settings migrate without replacing paths or changing the selected model. Switching models preserves both profiles. The selected profile's files are checked before saving, and writes are atomic. This is file validation, not proof of inference quality. Installing Qwen does not require removing Audio8.

The model's live tool description is refreshed when settings are saved, so the language model sees whether Qwen delivery controls or Audio8 plain-text mode is selected. Enable/disable uses the standard Plugins checkbox and context disposal.

## Tool interface and expression controls

```json
{
  "text": "But I really wanted to go with you.",
  "delivery": "A mildly whiny, pleading tone with a disappointed ending.",
  "speaker": "Ryan",
  "language": "English",
  "seed": 42
}
```

Only `text` is required. The words in `text` are the spoken script. `delivery` is a separate Qwen natural-language performance instruction, up to 1,000 characters. It can request tone, emotion, inflection or pacing; results vary by speaker and script and are not guaranteed sound effects. Never put the directions into the spoken text.

Qwen's `speaker`, `language` and `seed` can override saved defaults per call. The tool schema lists valid choices. For Audio8, omit `delivery`, `speaker` and `language`; unsupported controls fail clearly instead of pretending to work.

Neither backend here promises a fixed vocabulary of inline `[cough]`, `[yawn]`, `[laugh]` or SSML tags. Inline bracketed directions and SSML controls are rejected. Fish-style tag support is not advertised while Fish integration is on hold.

The tool description also tells the language model how to preserve the script, use controls, respect limits, present the file, and avoid claiming cloning, transcription, mixing, editing or synchronized video dubbing.

## Files, playback, progress and Stop

Generated speech is saved at:

```text
<active chat workspace>/dsh-audio/tts-<job-id>/generated-speech.wav
```

A chat without a workspace fails instead of saving output into an unexpected runtime folder. DSH also stores its normal content-addressed attachment copy for durable history playback.

The result returns the actual model, provider, preset voice, segment count, duration, sample rate, file attachment and workspace-relative path. The client renders an audio player and download link beneath the tool result and at the turn tail, including collapsed process groups and saved history. Seeking, HEAD and downloads use an owner-authorized media route. Playback is not forced automatically.

Text is limited to 12,000 Unicode characters and split at sentence/word boundaries: at most 300 characters per Qwen segment or 150 per Audio8 segment. Segments are joined into one 16-bit PCM WAV with a configurable pause. CPU inference can be slow. Progress reflects completed segments, not an invented ETA. One call runs at a time to bound memory.

**Stop** aborts the execution signal and terminates the worker; a cancelled call does not publish a completed attachment. Disabling the plugin also cancels active workers. Calls have a one-hour deadline. Completed files remain; cancellation can leave an empty job directory. Audio8 fails if it reaches its token cap rather than publishing a capped segment.

## Public plugin interfaces

The implementation uses `defineTool`/`ctx.tools.register`, `ctx.effect` cleanup, `webserver/index-inject`, `webServer.register`, `connection.authorizeIndex`, the public `settings.section`/tool-view/turn-tail slots and session chat bindings. No DSH core patches or private registry modifications are needed.

Only the authenticated owner settings API can change runtime/model paths. Tool arguments cannot choose Python executables or arbitrary model locations. Settings actions cannot synthesize speech. Owner capability, origin checks and bounded request bodies protect settings operations; owner authorization protects playback. Tool Manager remains an optional independent plugin.

## Testing

```sh
npm test
npm run check
TTS_TEST_PYTHON="$HOME/.dsh/dsh-tts/venv/bin/python" npm test
DSH_ROOT=/path/to/deepseek-harness npm run check:discovery
npm run smoke
```

Tests cover migration, independent profiles, model selection, Qwen delivery separation, Audio8 control rejection, Unicode chunking, validation, settings authentication/origin checks, cancellation/concurrency, model/voice settings controls, inline output cards, seeking and downloads. The real child-process cancellation test explicitly skips when the optional test Python is unavailable.

Local qualification also generates real speech through DSH's Tools and LocalAttachmentStore, verifies attachment digests and workspace files, uses CPU transcription to compare the script, and measures signal levels/clipping through `dsh-audio`. A correct transcript does not establish natural-sounding delivery. See [VALIDATION.md](VALIDATION.md) for measured results and limitations.

## Upstream and licenses

- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS), source revision `022e286b98fbec7e1e916cb940cdf532cd9f488e`; [1.7B CustomVoice checkpoint](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice), revision `0c0e3051f131929182e2c023b9537f8b1c68adfe`.
- [Audio8](https://github.com/Edge0-AI/Audio8_TTS), source revision `07e40f5d0b03fc473635ef378654bfb581027ac3`; [0.1B ONNX INT8 checkpoint](https://huggingface.co/Audio8/audio8-TTS-0.1B-ONNX-INT8), revision `317c12d4e0da83847b594fcf8bd74bf2c76615ec`.

The plugin is MIT. These model/source projects are Apache-2.0 per their upstream notices; downloaded source retains its license. Generated audio, private settings, credentials, model weights and runtime binaries are excluded from the repository.
