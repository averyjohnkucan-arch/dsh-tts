#!/usr/bin/env python3
"""Install a pinned Audio8 CPU runtime; never install CUDA or load a GPU."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
import urllib.request

SOURCE = 'https://github.com/Edge0-AI/Audio8_TTS.git'
COMMIT = '07e40f5d0b03fc473635ef378654bfb581027ac3'
MODEL = 'Audio8/audio8-TTS-0.1B-ONNX-INT8'
REVISION = '317c12d4e0da83847b594fcf8bd74bf2c76615ec'
FILES = ['runtime_manifest.json', 'slow_ar_int8.onnx', 'slow_ar_int8.onnx.data',
         'fast_ar_int8.onnx', 'fast_ar_int8.onnx.data', 'codec_decoder_fp16.onnx',
         'codec_decoder_fp16.onnx.data', 'reference_codes.npy', 'tokenizer/tokenizer.json']

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data-dir', type=Path, default=Path(os.environ.get('DSH_HOME', Path.home()/'.dsh'))/'dsh-tts')
    p.add_argument('--threads', type=int, default=1)
    p.add_argument('--python', default=shutil.which('python3.12') or shutil.which('python3.11') or sys.executable)
    a = p.parse_args()
    root = a.data_dir.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    source = root/'Audio8_TTS'
    if not source.exists():
        subprocess.run(['git', 'clone', '--no-checkout', SOURCE, str(source)], check=True)
    subprocess.run(['git', '-C', str(source), 'checkout', '--detach', COMMIT], check=True)
    runtime = source/'onnx_runtime_0_1b_int8'
    env = {**os.environ, 'CUDA_VISIBLE_DEVICES': '', 'HIP_VISIBLE_DEVICES': '', 'ROCR_VISIBLE_DEVICES': ''}
    python = root/'venv/bin/python'
    if not python.exists() or subprocess.run([str(python), '-m', 'pip', '--version'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        subprocess.run([a.python, '-m', 'venv', '--clear', str(root/'venv')], check=True, env=env)
    # CPU wheels only. This environment is separate from all existing AI environments.
    subprocess.run([str(python), '-m', 'pip', 'install', 'numpy==2.2.6', 'onnxruntime==1.23.2',
                    'tokenizers==0.22.2', 'soundfile==0.13.1', 'scipy==1.15.3'], check=True, env=env)
    model = root/'model'
    for name in FILES:
        dest = model/name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.is_file():
            continue
        print('Downloading '+name, flush=True)
        temp = dest.with_name(dest.name+'.partial')
        urllib.request.urlretrieve(f'https://huggingface.co/{MODEL}/resolve/{REVISION}/{name}', temp)
        temp.replace(dest)
    voices = root/'voices'
    if not (voices/'default/meta.json').is_file():
        subprocess.run([str(python), str(runtime/'scripts/register_default_voice.py'),
                        '--model-dir', str(model), '--voices-dir', str(voices)], check=True, env=env)
    settings = root/'runtime.json'
    if not settings.exists():
        settings.write_text(json.dumps({'python':str(python), 'runtimeDir':str(runtime),
                                       'modelDir':str(model), 'voicesDir':str(voices),
                                       'threads':max(1,min(4,a.threads))}, indent=2)+'\n')
    print('CPU runtime ready: '+str(settings))

if __name__ == '__main__':
    main()
