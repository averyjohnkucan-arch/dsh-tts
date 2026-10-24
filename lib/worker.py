"""Per-call CPU worker. Never load CUDA or keep speech weights after the call."""
import json
import os
from pathlib import Path
import sys

os.environ['CUDA_VISIBLE_DEVICES'] = ''
os.environ['HIP_VISIBLE_DEVICES'] = ''
os.environ['ROCR_VISIBLE_DEVICES'] = ''
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
import numpy as np
import soundfile as sf


def load_backend(cfg, task):
    sys.path.insert(0, cfg['runtimeDir'])
    if cfg['backend'] == 'qwen3':
        import torch
        torch.set_num_threads(cfg.get('threads', 2))
        torch.set_num_interop_threads(1)
        from qwen_tts import Qwen3TTSModel
        model = Qwen3TTSModel.from_pretrained(cfg['modelDir'], device_map='cpu',
                    dtype=torch.float32, attn_implementation='sdpa', local_files_only=True)
        if next(model.model.parameters()).device.type != 'cpu':
            raise RuntimeError('Qwen3 TTS must run on CPU in this plugin.')

        def generate(text, index):
            torch.manual_seed(task['seed'] + index)
            waves, rate = model.generate_custom_voice(text=text,
                language=task.get('language', cfg.get('language', 'English')),
                speaker=task.get('speaker', cfg.get('speaker', 'Ryan')),
                instruct=task.get('delivery', ''), max_new_tokens=2048,
                temperature=cfg.get('temperature', 0.7), top_p=cfg.get('topP', 0.9),
                top_k=cfg.get('topK', 50))
            return np.asarray(waves[0], dtype=np.float32), int(rate)
        return generate, 'PyTorch CPU'

    from arktts_runtime.runtime import ArkTtsRuntime
    model = ArkTtsRuntime(Path(cfg['modelDir']), Path(cfg['voicesDir']), threads=cfg.get('threads', 1))
    for session in (model.slow, model.fast, model.decoder):
        if session.get_providers() != ['CPUExecutionProvider']:
            raise RuntimeError('Audio8 requires CPUExecutionProvider only.')

    def generate(text, index):
        frames = list(model.iter_codes(text=text, voice='default', max_new_tokens=1024,
                temperature=cfg.get('temperature', 0.7), top_p=cfg.get('topP', 0.9),
                top_k=cfg.get('topK', 50), seed=task['seed']+index))
        if not frames:
            raise RuntimeError('Audio8 generated no audio for segment '+str(index+1))
        if len(frames) >= 1024:
            raise RuntimeError('Audio8 reached its token limit; shorten the segment.')
        return model.decode_codes(np.stack(frames, axis=1)), int(model.manifest['sample_rate'])
    return generate, 'CPUExecutionProvider'


def main():
    task = json.loads(Path(sys.argv[1]).read_text())
    cfg = task['runtime']
    print(json.dumps({'phase':'loading', 'model':cfg['backend']}), flush=True)
    generate, provider = load_backend(cfg, task)
    print(json.dumps({'phase':'generating'}), flush=True)
    target = Path(task['output'])
    temporary = target.with_suffix('.partial.wav')
    frames_total, sample_rate, out = 0, None, None
    try:
        for index, text in enumerate(task['chunks']):
            audio, rate = generate(text, index)
            if not audio.size or not np.isfinite(audio).all():
                raise RuntimeError('The model produced empty or non-finite audio.')
            if out is None:
                sample_rate = rate
                out = sf.SoundFile(temporary, mode='w', samplerate=rate, channels=1, subtype='PCM_16')
            if rate != sample_rate:
                raise RuntimeError('Sample rate changed between segments.')
            if index:
                pause = np.zeros(int(rate*cfg.get('pauseMs',180)/1000), dtype=np.float32)
                out.write(pause)
                frames_total += pause.size
            out.write(audio)
            frames_total += audio.size
            print(json.dumps({'completed':index+1,'total':len(task['chunks'])}), flush=True)
        if out is None:
            raise RuntimeError('No text segments were generated.')
        out.close()
        out = None
        temporary.replace(target)
        print(json.dumps({'durationSeconds':frames_total/sample_rate,'sampleRate':sample_rate,'provider':provider}), flush=True)
    finally:
        if out is not None:
            out.close()
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
