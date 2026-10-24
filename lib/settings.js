import {readFile,writeFile,rename,mkdir,readdir,stat,access} from 'node:fs/promises';
import {join,dirname,isAbsolute,resolve} from 'node:path';import {homedir} from 'node:os';import {randomUUID} from 'node:crypto';
export const defaults={threads:1,seed:42,temperature:0.7,topP:0.9,topK:50,pauseMs:180};
export function validate(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid TTS settings.');
 const out={...defaults};for(const key of ['python','runtimeDir','modelDir','voicesDir']){const p=value[key];if(typeof p!=='string'||!isAbsolute(p)||/[\0\r\n]/.test(p))throw Error(key+' must be an absolute host path.');out[key]=p;}
 for(const [key,min,max,integer] of [['threads',1,4,true],['seed',0,2147483647,true],['temperature',0.1,1,false],['topP',0.1,1,false],['topK',1,100,true],['pauseMs',0,1000,true]]){const v=value[key]??defaults[key];if(!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))throw Error('Invalid '+key+'; use '+min+'–'+max+'.');out[key]=v;}
 return out;
}
export async function checkModel(settings){
 const manifest=JSON.parse(await readFile(join(settings.modelDir,'runtime_manifest.json'),'utf8'));
 if(manifest.model_fingerprint!=='audio8-tts-preview-0.1b-int8-v1'||manifest.default_precision!=='int8')throw Error('Select the Audio8 0.1B ONNX INT8 folder. PyTorch, 0.6B and individual ONNX files are not compatible with this runtime.');
 for(const file of ['runtime_manifest.json','slow_ar_int8.onnx','slow_ar_int8.onnx.data','fast_ar_int8.onnx','fast_ar_int8.onnx.data','codec_decoder_fp16.onnx','codec_decoder_fp16.onnx.data','tokenizer/tokenizer.json'])await access(join(settings.modelDir,file));
 await access(settings.python);await access(join(settings.runtimeDir,'arktts_runtime/runtime.py'));await access(join(settings.voicesDir,'default/codes.npy'));
 const voice=JSON.parse(await readFile(join(settings.voicesDir,'default/meta.json'),'utf8'));
 if(voice.model_fingerprint!==manifest.model_fingerprint)throw Error('The saved default voice does not match this model. Re-run setup with the selected data directory.');
 return {ready:true,model:manifest.model_id,provider:'CPUExecutionProvider',sampleRate:manifest.sample_rate};
}
export class Settings{
 constructor(root){this.root=root;this.queue=Promise.resolve();}
 async load(){return validate(JSON.parse(await readFile(join(this.root,'runtime.json'),'utf8').catch(()=>{throw Error('Install the CPU runtime first: npm run setup in dsh-tts.');})));}
 async list(){try{const settings=await this.load();let status;try{status=await checkModel(settings);}catch(e){status={ready:false,error:e.message};}return {settings,status};}catch(e){return {settings:{...defaults,python:join(this.root,'venv/bin/python'),runtimeDir:join(this.root,'Audio8_TTS/onnx_runtime_0_1b_int8'),modelDir:join(this.root,'model'),voicesDir:join(this.root,'voices')},status:{ready:false,error:e.message}};}}
 async save(value){const v=validate(value);await checkModel(v);this.queue=this.queue.catch(()=>{}).then(async()=>{await mkdir(this.root,{recursive:true,mode:0o700});const temp=join(this.root,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(v,null,2)+'\n',{mode:0o600});await rename(temp,join(this.root,'runtime.json'));});await this.queue;return this.list();}
 async browse(location){const path=location||this.root;if(typeof path!=='string'||!isAbsolute(path)||path.includes('\0'))throw Error('Use an absolute folder path on the DSH host.');const full=resolve(path);if(!(await stat(full)).isDirectory())throw Error('Choose a folder, not an individual model file.');const entries=await readdir(full,{withFileTypes:true});return {path:full,parent:dirname(full),entries:entries.filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>({name:e.name,path:join(full,e.name)})).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,300),modelFolder:entries.some(e=>e.name==='runtime_manifest.json')};}
}
