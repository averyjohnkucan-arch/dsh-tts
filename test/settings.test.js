import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Settings,validate,defaults,initial} from '../lib/settings.js';
async function fixture(root){
 const cfg=initial(root);cfg.model='audio8';const p=cfg.profiles.audio8;
 for(const dir of [p.modelDir,join(p.modelDir,'tokenizer'),join(p.voicesDir,'default'),join(p.runtimeDir,'arktts_runtime')])await mkdir(dir,{recursive:true});
 for(const file of ['slow_ar_int8.onnx','slow_ar_int8.onnx.data','fast_ar_int8.onnx','fast_ar_int8.onnx.data','codec_decoder_fp16.onnx','codec_decoder_fp16.onnx.data','tokenizer/tokenizer.json'])await writeFile(join(p.modelDir,file),'test');
 await mkdir(join(root,'venv/bin'),{recursive:true});await writeFile(p.python,'test');await writeFile(join(p.runtimeDir,'arktts_runtime/runtime.py'),'test');await writeFile(join(p.voicesDir,'default/codes.npy'),'test');
 const manifest={model_fingerprint:'audio8-tts-preview-0.1b-int8-v1',default_precision:'int8',model_id:'Audio8',sample_rate:44100};await writeFile(join(p.modelDir,'runtime_manifest.json'),JSON.stringify(manifest));await writeFile(join(p.voicesDir,'default/meta.json'),JSON.stringify(manifest));
 return cfg;
}
test('settings validate selected profile, preserve both models and persist atomically',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tts-settings-'));
 try{const cfg=await fixture(root),settings=new Settings(root);const saved=await settings.save({...cfg,threads:2,seed:123,pauseMs:250});assert.equal(saved.status.audio8.ready,true);assert.equal(saved.status.qwen3.ready,false);assert.equal((await settings.load()).threads,2);assert.equal(JSON.parse(await readFile(join(root,'runtime.json'),'utf8')).seed,123);assert.equal((await settings.browse(cfg.profiles.audio8.modelDir)).modelFolder,true);await assert.rejects(settings.browse('relative'),/absolute/);assert.throws(()=>validate({...cfg,threads:40},root),/threads/);assert.throws(()=>validate({...cfg,temperature:0},root),/temperature/);
 const p=cfg.profiles.qwen3;for(const dir of [join(root,'qwen-venv/bin'),join(p.modelDir,'speech_tokenizer'),join(p.runtimeDir,'qwen_tts')])await mkdir(dir,{recursive:true});await writeFile(p.python,'test');await writeFile(join(p.runtimeDir,'qwen_tts/__init__.py'),'test');for(const file of ['model.safetensors','tokenizer_config.json','vocab.json','merges.txt','speech_tokenizer/config.json','speech_tokenizer/model.safetensors'])await writeFile(join(p.modelDir,file),'test');await writeFile(join(p.modelDir,'config.json'),JSON.stringify({model_type:'qwen3_tts',tts_model_type:'custom_voice',tts_model_size:'1b7'}));
 const selected=await settings.save({...cfg,model:'qwen3'});assert.equal(selected.status.qwen3.ready,true);assert.equal(selected.settings.model,'qwen3');assert.deepEqual(selected.settings.profiles.audio8,cfg.profiles.audio8);assert.throws(()=>validate({...cfg,profiles:{...cfg.profiles,qwen3:{...p,speaker:'invented'}}},root),/speaker/);
 await writeFile(join(p.modelDir,'config.json'),JSON.stringify({model_type:'qwen3_tts',tts_model_type:'base',tts_model_size:'0b6'}));await assert.rejects(settings.save({...cfg,model:'qwen3'}),/1.7B/);assert.equal((await settings.load()).model,'qwen3');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('legacy Audio8 settings migrate without changing paths or selection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tts-legacy-'));try{const legacy={...defaults,python:join(root,'old/python'),runtimeDir:join(root,'old/runtime'),modelDir:join(root,'old/model'),voicesDir:join(root,'old/voices')};await writeFile(join(root,'runtime.json'),JSON.stringify(legacy));const migrated=await new Settings(root).load();assert.equal(migrated.model,'audio8');assert.equal(migrated.profiles.audio8.modelDir,legacy.modelDir);assert.ok(migrated.profiles.qwen3.modelDir.startsWith(root));}finally{await rm(root,{recursive:true,force:true});}
});
