"""One CPU-only process per tool call; loads once for all text segments."""
import json
import os
from pathlib import Path
import sys

# Set before importing ONNX/Numpy. The runtime explicitly selects CPUExecutionProvider.
os.environ['CUDA_VISIBLE_DEVICES'] = ''
os.environ['HIP_VISIBLE_DEVICES'] = ''
os.environ['ROCR_VISIBLE_DEVICES'] = ''
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
import numpy as np
import soundfile as sf

def main():
    task = json.loads(Path(sys.argv[1]).read_text())
    cfg = task['runtime']
    sys.path.insert(0, cfg['runtimeDir'])
    from arktts_runtime.runtime import ArkTtsRuntime
    runtime = ArkTtsRuntime(Path(cfg['modelDir']), Path(cfg['voicesDir']), threads=cfg.get('threads', 1))
    for session in (runtime.slow, runtime.fast, runtime.decoder):
        if session.get_providers() != ['CPUExecutionProvider']:
            raise RuntimeError('TTS requires CPUExecutionProvider only.')
    rate = int(runtime.manifest['sample_rate'])
    target = Path(task['output'])
    temporary = target.with_suffix('.partial.wav')
    frames_total = 0
    try:
        with sf.SoundFile(temporary, mode='w', samplerate=rate, channels=1, subtype='PCM_16') as out:
            for i, text in enumerate(task['chunks']):
                # iter_codes hides EOS; reaching the cap is treated as failure rather than silently returning a cut-off clip.
                frames = list(runtime.iter_codes(text=text, voice='default', max_new_tokens=1024,
                              temperature=cfg.get('temperature',0.7), top_p=cfg.get('topP',0.9), top_k=cfg.get('topK',50), seed=task['seed']+i))
                if not frames:
                    raise RuntimeError('Audio8 generated no audio for segment '+str(i+1))
                if len(frames) >= 1024:
                    raise RuntimeError('Audio8 reached its token limit; shorten the text segment.')
                audio = runtime.decode_codes(np.stack(frames, axis=1))
                if not audio.size or not np.isfinite(audio).all():
                    raise RuntimeError('Audio8 produced empty or non-finite audio.')
                if i:
                    pause = np.zeros(int(rate*cfg.get('pauseMs',180)/1000), dtype=np.float32)
                    out.write(pause)
                    frames_total += pause.size
                out.write(audio)
                frames_total += audio.size
                print(json.dumps({'completed':i+1, 'total':len(task['chunks'])}), flush=True)
        temporary.replace(target)
        print(json.dumps({'durationSeconds':frames_total/rate,'sampleRate':rate,'provider':'CPUExecutionProvider'}),flush=True)
    finally:
        temporary.unlink(missing_ok=True)

if __name__ == '__main__':
    main()
