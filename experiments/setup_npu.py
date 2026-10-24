#!/usr/bin/env python3
"""Provision this optional Ubuntu 26.04 x86_64 NPU experiment locally.
No root install, kernel change, firmware replacement, service restart or GPU use.
"""
import argparse
import hashlib
import os
from pathlib import Path
import platform
import subprocess
import tarfile
import urllib.request

DRIVER_URL = 'https://github.com/intel/linux-npu-driver/releases/download/v1.38.0/linux-npu-driver-v1.38.0.20260910-34487311128-ubuntu2604.tar.gz'
LOADER_URL = 'https://github.com/oneapi-src/level-zero/releases/download/v1.34.0/libze1_1.34.0%2Bu22.04_amd64.deb'
DRIVER_SHA = '83685e6d92f4db1ca65e442846d487c7feb1335634b33994292ceb38f933bcc7'
LOADER_SHA = '86b94be6f9b9e7a6738f56636f694bf2b42206297c2eb3d0dd5f78aa149a7c13'


def fetch(url, dest, sha):
    if not dest.exists():
        urllib.request.urlretrieve(url,dest)
    if hashlib.sha256(dest.read_bytes()).hexdigest() != sha:
        raise RuntimeError('Download checksum mismatch: '+str(dest))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,default=Path.home()/'.dsh/dsh-tts')
    args=p.parse_args()
    if platform.machine() != 'x86_64' or 'VERSION_ID="26.04"' not in Path('/etc/os-release').read_text():
        raise RuntimeError('This local driver recipe is qualified only for Ubuntu 26.04 x86_64.')
    root=args.root.resolve()
    driver=root/'npu-lab/driver'
    driver.mkdir(parents=True,exist_ok=True)
    env={**os.environ,'CUDA_VISIBLE_DEVICES':'','HIP_VISIBLE_DEVICES':'','ROCR_VISIBLE_DEVICES':''}
    subprocess.run([str(root/'qwen-venv/bin/python'),'-m','pip','install','openvino==2026.4.1','nncf==3.4.0'],check=True,env=env)
    fetch(DRIVER_URL,driver/'driver.tar.gz',DRIVER_SHA)
    fetch(LOADER_URL,driver/'libze1.deb',LOADER_SHA)
    with tarfile.open(driver/'driver.tar.gz') as archive:
        archive.extractall(driver,filter='data')
    packages=[next(driver.glob('intel-level-zero-npu_*.deb')),next(driver.glob('intel-driver-compiler-npu_*.deb')),driver/'libze1.deb']
    subprocess.run(['apt-get','download','libtbb12=2022.3.0-2'],cwd=driver,check=True)
    packages.append(next(driver.glob('libtbb12_*.deb')))
    for package in packages:
        subprocess.run(['dpkg-deb','-x',str(package),str(driver/'userspace')],check=True)
    script=root/'npu-lab/run-env.sh'
    script.write_text('''#!/usr/bin/env bash
set -euo pipefail
lab="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export LD_LIBRARY_PATH="$lab/driver/userspace/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export ZE_ENABLE_ALT_DRIVERS="$lab/driver/userspace/usr/lib/x86_64-linux-gnu/libze_intel_npu.so.1"
export CUDA_VISIBLE_DEVICES=''
export HIP_VISIBLE_DEVICES=''
export ROCR_VISIBLE_DEVICES=''
export OMP_NUM_THREADS=2
export OPENBLAS_NUM_THREADS=1
exec nice -n 15 "$@"
''')
    script.chmod(0o700)
    print('Local NPU environment prepared: '+str(script))


if __name__ == '__main__':
    main()
