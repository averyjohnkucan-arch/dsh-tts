import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {TtsRuntime} from '../lib/runtime.js';
test('Stop aborts the real worker process and frees the next call',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'tts-stop-')),root=join(dir,'config'),module=join(dir,'arktts_runtime');await mkdir(root);await mkdir(module);
 await writeFile(join(module,'__init__.py'),'');await writeFile(join(module,'runtime.py'),`import time\nclass Session:\n def get_providers(self): return ['CPUExecutionProvider']\nclass ArkTtsRuntime:\n def __init__(self,*a,**kw):\n  self.manifest={'sample_rate':44100}\n  self.slow=self.fast=self.decoder=Session()\n def iter_codes(self,**kw):\n  time.sleep(30)\n  yield 1\n`);
 // Use the installed CPU environment only for numpy and soundfile. This fake graph tests cancellation without synthesis.
 const python=process.env.TTS_TEST_PYTHON;if(!python){t.skip('Set TTS_TEST_PYTHON after installing the CPU runtime.');await rm(dir,{recursive:true});return;}
 await writeFile(join(root,'runtime.json'),JSON.stringify({python,runtimeDir:dir,modelDir:dir,voicesDir:dir,threads:1}));
 const runtime=new TtsRuntime({attachments:{saveFileStream:()=>{throw Error('A cancelled call must not publish an attachment.');}}},root),controller=new AbortController();
 try{const task=runtime.render({text:'Hello'},{workspace:dir,callId:'stop-test',signal:controller.signal});await new Promise(r=>setTimeout(r,600));await assert.rejects(runtime.render({text:'Second'},{workspace:dir,callId:'second'}),/Another TTS/);controller.abort();await assert.rejects(task,/abort/i);assert.equal(runtime.busy,false);assert.equal(runtime.progress('stop-test').status,'cancelled');}finally{runtime.dispose();await rm(dir,{recursive:true,force:true});}
});
test('missing runtime gives an actionable setup error',async()=>{const dir=await mkdtemp(join(tmpdir(),'tts-no-runtime-'));const runtime=new TtsRuntime({},dir);try{await assert.rejects(runtime.render({text:'hello'},{callId:'missing'}),/npm run setup/);assert.equal(runtime.busy,false);}finally{await rm(dir,{recursive:true});}});
