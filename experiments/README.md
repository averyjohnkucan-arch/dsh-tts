# Optional Qwen3-TTS NPU experiment

This experiment is separate from the DSH plugin's CPU model selector. It is not a permanent NPU option or an automatic fallback. Fish S2-Pro is on hold.

It uses Intel's pinned [Qwen3-TTS OpenVINO notebook helper](https://github.com/openvinotoolkit/openvino_notebooks/tree/b2aa290400902c713ae0ca727211cdae4d3dfaaa/notebooks/qwen3-tts). That notebook excludes NPU in its usual device selector. This experiment attempts the main talker on NPU while keeping embeddings, the code predictor and waveform decoder on CPU. It never selects GPU, and a failed NPU talker must fail rather than secretly execute on CPU.

On this user's Ubuntu 26.04 x86_64 machine, the NPU kernel device already existed. User-space Intel NPU driver/Level Zero libraries were extracted into the experiment folder, without system installation or firmware changes. A standalone OpenVINO test confirmed actual NPU execution. A short real speech test also succeeded with the main talker on NPU and auxiliaries on CPU. It generated 2.777 seconds of audio in 31.803 seconds, so this is not a real-time speed claim. CPU transcription matched the script, with no clipping. Full evidence and limits are recorded in `../VALIDATION.md`.

After the normal Qwen CPU setup:

```sh
python3 experiments/setup_npu.py
```

Convert the downloaded checkpoint using CPU only:

```sh
~/.dsh/dsh-tts/npu-lab/run-env.sh \
  ~/.dsh/dsh-tts/qwen-venv/bin/python experiments/qwen_npu.py convert
```

Run a short isolated test. Choose an output location inside your own workspace:

```sh
~/.dsh/dsh-tts/npu-lab/run-env.sh \
  ~/.dsh/dsh-tts/qwen-venv/bin/python experiments/qwen_npu.py generate \
  --text 'Hello. This is a voice test.' \
  --output /absolute/workspace/dsh-audio/npu-test.wav
```

The adapter packs the final talker hidden states together with logits because the NPUW LLM request exposes only the logits output. It removes unused intermediate outputs and disables shared-head extraction. These are local runtime graph adaptations; the downloaded helper source is not edited.

The JSON sidecar records which components compiled for NPU/CPU, execution devices and measured load/generation times. A WAV alone is not proof of NPU execution. Driver compatibility and model compilation are required; the small NPU probe does not establish speech-model support. Do not infer NPU support from the `.xml` or ONNX file extension.

Downloaded Intel/OpenVINO components retain their upstream licenses. No model or driver binaries are bundled in this Git repository. GPU testing and Fish integration are intentionally deferred.
