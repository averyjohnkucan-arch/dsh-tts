#!/usr/bin/env python3
"""Install Qwen3-TTS 1.7B CustomVoice in an isolated CPU-only environment."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

COMMIT = '022e286b98fbec7e1e916cb940cdf532cd9f488e'
MODEL = 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice'
REVISION = '0c0e3051f131929182e2c023b9537f8b1c68adfe'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path(os.environ.get('DSH_HOME', Path.home()/'.dsh'))/'dsh-tts')
    parser.add_argument('--python', default=shutil.which('python3.12') or shutil.which('python3.11') or sys.executable)
    parser.add_argument('--select', action='store_true', help='Make Qwen the default after installation.')
    args = parser.parse_args()
    root = args.data_dir.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, 'CUDA_VISIBLE_DEVICES':'', 'HIP_VISIBLE_DEVICES':'', 'ROCR_VISIBLE_DEVICES':'', 'HF_HUB_DISABLE_XET':'1'}
    source = root/'Qwen3-TTS'
    if not source.exists():
        subprocess.run(['git','clone','https://github.com/QwenLM/Qwen3-TTS.git',str(source)], check=True)
    head = subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'], text=True).strip()
    if head != COMMIT:
        if subprocess.check_output(['git','-C',str(source),'status','--porcelain'], text=True).strip():
            raise RuntimeError('Preserve your modified Qwen source and select another data directory.')
        subprocess.run(['git','-C',str(source),'fetch','origin',COMMIT], check=True)
        subprocess.run(['git','-C',str(source),'checkout','--detach',COMMIT], check=True)
    python = root/'qwen-venv/bin/python'
    if not python.exists():
        subprocess.run([args.python,'-m','venv',str(root/'qwen-venv')], check=True, env=env)
    subprocess.run([str(python),'-m','pip','install','torch==2.8.0','torchaudio==2.8.0','--index-url','https://download.pytorch.org/whl/cpu'], check=True, env=env)
    subprocess.run([str(python),'-m','pip','install','-e',str(source)], check=True, env=env)
    model = root/'models/qwen3'
    subprocess.run([str(python),'-c',
        'from huggingface_hub import snapshot_download; snapshot_download('+repr(MODEL)+', revision='+repr(REVISION)+', local_dir='+repr(str(model))+', ignore_patterns=[".gitattributes"], max_workers=2)'], check=True, env=env)
    settings = root/'runtime.json'
    old = json.loads(settings.read_text()) if settings.exists() else {}
    if 'profiles' not in old:
        common = {k:old.get(k,v) for k,v in dict(threads=2,seed=42,temperature=0.7,topP=0.9,topK=50,pauseMs=180).items()}
        old = {**common,'version':2,'model':'audio8' if old else 'qwen3','profiles':{'audio8':{
            'python':old.get('python',str(root/'venv/bin/python')),
            'runtimeDir':old.get('runtimeDir',str(root/'Audio8_TTS/onnx_runtime_0_1b_int8')),
            'modelDir':old.get('modelDir',str(root/'model')),
            'voicesDir':old.get('voicesDir',str(root/'voices'))}}}
    old['profiles'].setdefault('qwen3',{'python':str(python),'runtimeDir':str(source),'modelDir':str(model),'speaker':'Ryan','language':'English','temperature':0.9,'topP':1.0,'topK':50})
    if args.select:
        old['model'] = 'qwen3'
    temporary = settings.with_suffix('.setup.tmp')
    temporary.write_text(json.dumps(old,indent=2)+'\n')
    temporary.chmod(0o600)
    temporary.replace(settings)
    print('Qwen3 CPU runtime ready. Select it in DSH Settings → Text to Speech.')


if __name__ == '__main__':
    main()
