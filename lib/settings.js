import {readFile, writeFile, rename, mkdir, readdir, stat, access} from 'node:fs/promises';
import {join, dirname, isAbsolute, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

export const defaults = {threads: 2, seed: 42, temperature: 0.7, topP: 0.9, topK: 50, pauseMs: 180};
export const modelNames = {audio8: 'Audio8 0.1B · CPU', qwen3: 'Qwen3-TTS 1.7B CustomVoice · CPU'};
export const speakers = ['Vivian', 'Serena', 'Uncle_Fu', 'Dylan', 'Eric', 'Ryan', 'Aiden', 'Ono_Anna', 'Sohee'];
export const languages = ['Auto', 'Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'];

export function initial(root) {
 return {...defaults, version: 2, model: 'qwen3', profiles: {
  audio8: {python: join(root, 'venv/bin/python'), runtimeDir: join(root, 'Audio8_TTS/onnx_runtime_0_1b_int8'), modelDir: join(root, 'model'), voicesDir: join(root, 'voices'), temperature: 0.7, topP: 0.9, topK: 50},
  qwen3: {python: join(root, 'qwen-venv/bin/python'), runtimeDir: join(root, 'Qwen3-TTS'), modelDir: join(root, 'models/qwen3'), speaker: 'Ryan', language: 'English', temperature: 0.9, topP: 1.0, topK: 50},
 }};
}

export function validate(value, root = '') {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid TTS settings.');
 // Preserve the original Audio8 settings when migrating; installation never replaces them.
 const legacy = !value.profiles;
 const v = legacy ? {...initial(root), ...value, model: 'audio8', profiles: {...initial(root).profiles, audio8: Object.fromEntries(['python','runtimeDir','modelDir','voicesDir'].map(k => [k, value[k]]))}} : value;
 if (!Object.hasOwn(modelNames, v.model)) throw Error('Choose Audio8 or Qwen3-TTS.');
 const out = {version: 2, model: v.model, profiles: {}};
 for (const [key, min, max, integer] of [['threads',1,8,true],['seed',0,2147483647,true],['temperature',0.1,1,false],['topP',0.1,1,false],['topK',1,100,true],['pauseMs',0,1000,true]]) {
  const n = v[key] ?? defaults[key];
  if (!Number.isFinite(n) || n < min || n > max || integer && !Number.isInteger(n)) throw Error('Invalid '+key+'; use '+min+'–'+max+'.');
  out[key] = n;
 }
 for (const name of Object.keys(modelNames)) {
  const p = v.profiles[name];
  if (!p || typeof p !== 'object') throw Error('Missing '+name+' profile.');
  const profile = {};
  for (const key of ['python', 'runtimeDir', 'modelDir', ...(name === 'audio8' ? ['voicesDir'] : [])]) {
   if (typeof p[key] !== 'string' || !isAbsolute(p[key]) || /[\0\r\n]/.test(p[key])) throw Error(name+'.'+key+' must be an absolute host path.');
   profile[key] = p[key];
  }
  if (name === 'qwen3') {
   if (!speakers.includes(p.speaker) || !languages.includes(p.language)) throw Error('Choose a supported Qwen speaker and language.');
   profile.speaker = p.speaker; profile.language = p.language;
  }
  for (const [key,fallback,min,max,integer] of [['temperature',name==='qwen3'?0.9:out.temperature,0.1,1,false],['topP',name==='qwen3'?1.0:out.topP,0.1,1,false],['topK',out.topK,1,100,true]]) {
   const n=p[key]??fallback;
   if(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n))throw Error('Invalid '+name+'.'+key+'.');
   profile[key]=n;
  }
  out.profiles[name] = profile;
 }
 return out;
}

export async function checkModel(settings, selected = settings.model) {
 const p = settings.profiles[selected];
 await access(p.python);
 if (selected === 'qwen3') {
  const config = JSON.parse(await readFile(join(p.modelDir, 'config.json'), 'utf8'));
  if (config.model_type !== 'qwen3_tts' || config.tts_model_type !== 'custom_voice' || config.tts_model_size !== '1b7') throw Error('Select the complete Qwen3-TTS-12Hz-1.7B-CustomVoice folder.');
  for (const file of ['model.safetensors','tokenizer_config.json','vocab.json','merges.txt','speech_tokenizer/config.json','speech_tokenizer/model.safetensors']) await access(join(p.modelDir, file));
  await access(join(p.runtimeDir, 'qwen_tts/__init__.py'));
  return {ready: true, model: 'Qwen3-TTS 1.7B CustomVoice', provider: 'PyTorch CPU', sampleRate: 24000};
 }
 const manifest = JSON.parse(await readFile(join(p.modelDir, 'runtime_manifest.json'), 'utf8'));
 if (manifest.model_fingerprint !== 'audio8-tts-preview-0.1b-int8-v1' || manifest.default_precision !== 'int8') throw Error('Select the Audio8 0.1B ONNX INT8 folder.');
 for (const file of ['slow_ar_int8.onnx','slow_ar_int8.onnx.data','fast_ar_int8.onnx','fast_ar_int8.onnx.data','codec_decoder_fp16.onnx','codec_decoder_fp16.onnx.data','tokenizer/tokenizer.json']) await access(join(p.modelDir, file));
 await access(join(p.runtimeDir, 'arktts_runtime/runtime.py')); await access(join(p.voicesDir, 'default/codes.npy'));
 const voice = JSON.parse(await readFile(join(p.voicesDir,'default/meta.json'), 'utf8'));
 if (voice.model_fingerprint !== manifest.model_fingerprint) throw Error('The saved default voice does not match this model.');
 return {ready: true, model: manifest.model_id, provider: 'CPUExecutionProvider', sampleRate: manifest.sample_rate};
}

export class Settings {
 constructor(root) {this.root = root; this.queue = Promise.resolve();}
 async load() {
  return validate(JSON.parse(await readFile(join(this.root,'runtime.json'), 'utf8').catch(() => {throw Error('Install a CPU runtime first: npm run setup in dsh-tts.');})), this.root);
 }
 async list() {
  let settings; try {settings = await this.load();} catch {settings = initial(this.root);}
  const status = {};
  for (const name of Object.keys(modelNames)) {
   try {status[name] = await checkModel(settings, name);} catch (e) {status[name] = {ready: false, error: e.message};}
  }
  return {settings, status, modelNames, speakers, languages};
 }
 async save(value) {
  const v = validate(value, this.root); await checkModel(v);
  this.queue = this.queue.catch(() => {}).then(async () => {
   await mkdir(this.root, {recursive: true, mode: 0o700}); const temp = join(this.root,randomUUID()+'.tmp');
   await writeFile(temp, JSON.stringify(v,null,2)+'\n', {mode: 0o600}); await rename(temp, join(this.root,'runtime.json'));
  });
  await this.queue; return this.list();
 }
 async browse(location) {
  const path = location || this.root;
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) throw Error('Use an absolute folder path on the DSH host.');
  const full = resolve(path); if (!(await stat(full)).isDirectory()) throw Error('Choose a folder, not an individual model file.');
  const entries = await readdir(full, {withFileTypes: true});
  return {path: full, parent: dirname(full), entries: entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => ({name:e.name,path:join(full,e.name)})).sort((a,b) => a.name.localeCompare(b.name)).slice(0,300), modelFolder: entries.some(e => ['runtime_manifest.json','config.json'].includes(e.name))};
 }
}
