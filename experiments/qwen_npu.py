#!/usr/bin/env python3
"""Experimental Qwen3-TTS main-talker NPU execution, with CPU auxiliary models.
This is deliberately separate from DSH settings. It never selects a GPU and
never falls back to CPU for the talker if NPU compilation/inference fails.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import time
import urllib.request

UPSTREAM = 'b2aa290400902c713ae0ca727211cdae4d3dfaaa'
HELPER_SHA256 = 'd054da021f701707072d0b8c7b68fe476a2db20555a5f8b5bbd723af496991c8'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['convert','generate'])
    parser.add_argument('--root', type=Path, default=Path.home()/'.dsh/dsh-tts')
    parser.add_argument('--text', default='Hello. This is a voice test.')
    parser.add_argument('--delivery', default='Warm and conversational.')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--npu-mode', choices=['llm','direct'], default='llm')
    args = parser.parse_args()
    for key in ['CUDA_VISIBLE_DEVICES','HIP_VISIBLE_DEVICES','ROCR_VISIBLE_DEVICES']:
        os.environ[key] = ''
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    import torch
    import openvino as ov
    import numpy as np
    import soundfile as sf
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    lab = args.root/'npu-lab'
    lab.mkdir(parents=True, exist_ok=True)
    helper = lab/'qwen_3_tts_helper.py'
    if not helper.exists():
        urllib.request.urlretrieve(f'https://raw.githubusercontent.com/openvinotoolkit/openvino_notebooks/{UPSTREAM}/notebooks/qwen3-tts/qwen_3_tts_helper.py',helper)
    if hashlib.sha256(helper.read_bytes()).hexdigest() != HELPER_SHA256:
        raise RuntimeError('The local OpenVINO helper differs from the pinned upstream file.')
    spec = importlib.util.spec_from_file_location('qwen_3_tts_helper', helper)
    h = importlib.util.module_from_spec(spec)
    import sys
    sys.modules[spec.name] = h
    spec.loader.exec_module(h)
    model_dir = args.root/'models/qwen3'
    converted = lab/'qwen3-openvino'
    if args.action == 'convert':
        h.convert_qwen3_tts_model(str(model_dir),converted,quantization_config=None)
        print(json.dumps({'converted':str(converted),'upstream':UPSTREAM}),flush=True)
        return
    if args.output is None:
        parser.error('--output must be a WAV path inside your chosen workspace.')
    real_core = h.core
    print(json.dumps({'npu':real_core.get_property('NPU','FULL_DEVICE_NAME'),'architecture':real_core.get_property('NPU','DEVICE_ARCHITECTURE')}),flush=True)
    records = []

    class HybridCore:
        def __init__(self):
            self.paths = {}
        def read_model(self, model, *a, **kw):
            result = real_core.read_model(model,*a,**kw)
            # Inference needs only logits and final hidden states. NPUW's LLM
            # request exposes logits but not this TTS-specific second output.
            # Pack both along the feature axis and split them after real NPU
            # inference. No values are recomputed on CPU.
            if str(model).endswith(h.TALKER_LANGUAGE_NAME):
                from openvino import opset13 as ops
                outputs = list(result.get_results())
                logits, hidden = outputs[0].input_value(0), outputs[1].input_value(0)
                self.logit_width = int(logits.partial_shape[-1].get_length())
                packed = ops.concat([logits, hidden], -1)
                outputs[0].input(0).replace_source_output(packed.output(0))
                for output in outputs[1:]:
                    result.remove_result(output)
                packed.output(0).get_tensor().set_names({'logits'})
                result.output(0).get_tensor().set_names({'logits'})
                result.validate_nodes_and_infer_types()
                print(json.dumps({'packedTalkerOutputs':True,'logitWidth':self.logit_width,'removedUnusedHiddenOutputs':len(outputs)-2}),flush=True)
            self.paths[id(result)] = str(model)
            return result
        def compile_model(self, model, device, config=None):
            path = str(model) if isinstance(model,(str,Path)) else self.paths.get(id(model),'')
            main_talker = path.endswith(h.TALKER_LANGUAGE_NAME)
            target = 'NPU' if main_talker else 'CPU'
            opts = {'CACHE_DIR':str(lab/'compile-cache')}
            if main_talker and args.npu_mode == 'llm':
                opts.update({'NPU_USE_NPUW':'YES','NPUW_LLM':'YES','NPUW_DEVICES':'NPU','NPUW_LLM_SHARED_HEAD':'NO'})
            elif not main_talker:
                opts['INFERENCE_NUM_THREADS'] = 2
            started = time.monotonic()
            print(json.dumps({'compile':Path(path).name,'target':target,'options':opts}),flush=True)
            result = real_core.compile_model(model,target,opts)
            actual = result.get_property('EXECUTION_DEVICES')
            if main_talker and 'NPU' not in str(actual):
                raise RuntimeError('The talker did not compile for NPU.')
            records.append({'model':Path(path).name,'target':target,'execution_devices':actual,'compileSeconds':time.monotonic()-started})
            if main_talker:
                return PackedCompiled(result,self.logit_width)
            return result

    class PackedRequest:
        def __init__(self,request,width):
            self.inner,self.width=request,width
        def __getattr__(self,name):
            return getattr(self.inner,name)
        def get_tensor(self,name):
            from types import SimpleNamespace
            if name in ('logits','hidden_states'):
                data=self.inner.get_tensor('logits').data
                values=data[...,:self.width] if name=='logits' else data[...,self.width:]
                return SimpleNamespace(data=values)
            return self.inner.get_tensor(name)

    class PackedCompiled:
        def __init__(self,compiled,width):
            self.inner,self.width=compiled,width
        def __getattr__(self,name):
            return getattr(self.inner,name)
        def create_infer_request(self):
            return PackedRequest(self.inner.create_infer_request(),self.width)

    h.core = HybridCore()
    started = time.monotonic()
    model = h.OVQwen3TTSModel.from_pretrained(str(converted),device='CPU',checkpoint_path=str(model_dir))
    loaded = time.monotonic()
    torch.manual_seed(42)
    waves, rate = model.generate_custom_voice(text=args.text,language='English',speaker='Ryan',instruct=args.delivery,max_new_tokens=512)
    audio = np.asarray(waves[0],dtype=np.float32)
    if not audio.size or not np.isfinite(audio).all():
        raise RuntimeError('NPU generation returned empty or invalid audio.')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    sf.write(args.output,audio,int(rate),subtype='PCM_16')
    evidence = {'path':str(args.output.resolve()),'sampleRate':rate,'durationSeconds':len(audio)/rate,
                'loadSeconds':loaded-started,'generationSeconds':time.monotonic()-loaded,'components':records,
                'execution':'NPU talker + CPU code predictor/embeddings/audio decoder; no GPU',
                'text':args.text,'delivery':args.delivery,'helperRevision':UPSTREAM}
    args.output.with_suffix('.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence),flush=True)


if __name__ == '__main__':
    main()
