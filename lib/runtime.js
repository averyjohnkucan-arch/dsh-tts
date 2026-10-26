import {recommendedFor,disposeRecommended} from './recommended-models.mjs';
import {readFile,writeFile,mkdir,mkdtemp,lstat,realpath,rm,access} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {request} from './request.js';
import {Settings, speakers, languages} from './settings.js';
export class TtsRuntime {
 constructor(ctx,dataDir=''){this.ctx=ctx;this.root=resolve(dataDir||join(process.env.DSH_HOME||join(homedir(),'.dsh'),'dsh-tts'));this.settings=new Settings(this.root);this.jobs=new Map();this.busy=false;this.closed=false;}
 progress(callId){const job=this.jobs.get(callId);return job?{status:job.status,percent:job.percent,completed:job.completed,total:job.total}:null;}
 async dispose(){await disposeRecommended(this);this.closed=true;for(const j of this.jobs.values())j.controller.abort();}
 async render(args,exec){
  exec.signal?.throwIfAborted();
  const settings=await this.settings.load(), runtime={...settings,...settings.profiles[settings.model],backend:settings.model};
  const r=request(args,settings.model);
  if(r.speaker&&!speakers.includes(r.speaker))throw Error('Unsupported Qwen speaker.');
  if(r.language&&!languages.includes(r.language))throw Error('Unsupported Qwen language.');
  if(this.closed)throw Error('TTS is disabled.');
  if(this.busy)throw Error('Another TTS call is running. Wait for it to finish before submitting another.');
  this.busy=true;
  const controller=new AbortController(),signal=exec.signal?AbortSignal.any([exec.signal,controller.signal,AbortSignal.timeout(3600000)]):AbortSignal.any([controller.signal,AbortSignal.timeout(3600000)]);
  const job={controller,status:'running',percent:0,completed:0,total:r.chunks.length};this.jobs.set(exec.callId,job);
  let dir;
  try{
   if(args.seed===undefined)r.seed=runtime.seed;
   for(const key of ['python','runtimeDir','modelDir',...(runtime.backend==='audio8'?['voicesDir']:[])]){if(typeof runtime[key]!=='string')throw Error('Invalid TTS runtime settings.');await access(runtime[key]);}
   const location=exec.workspace||exec.agent?.session.header?.cwd;if(!location)throw Error('This chat has no workspace folder. Open a workspace before generating audio.');
   const workspace=await realpath(location),parent=join(workspace,'dsh-audio');
   await mkdir(parent,{recursive:true,mode:0o700});if((await lstat(parent)).isSymbolicLink())throw Error('Audio output directory cannot be a symlink.');
   dir=await mkdtemp(join(parent,'tts-'));const output=join(dir,'generated-speech.wav'),input=join(dir,'request.json');
   await writeFile(input,JSON.stringify({...r,runtime,output}),{mode:0o600});
   let info={};
   await new Promise((done,fail)=>{
    signal.throwIfAborted();
    const args=['-B',fileURLToPath(new URL('./worker.py',import.meta.url)),input];
    // nice lowers CPU contention with active benchmarking; no scheduler or GPU calls.
    const child=spawn(process.platform==='linux'?'nice':runtime.python,process.platform==='linux'?['-n','15',runtime.python,...args]:args,{env:{...process.env,CUDA_VISIBLE_DEVICES:'',HIP_VISIBLE_DEVICES:'',ROCR_VISIBLE_DEVICES:'',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'},stdio:['ignore','pipe','pipe']});
    let pending='',error='',killTimer;
    const abort=()=>{child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),2000);};
    signal.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',b=>{pending+=b;let pos;while((pos=pending.indexOf('\n'))>=0){const line=pending.slice(0,pos);pending=pending.slice(pos+1);try{const p=JSON.parse(line);if(p.completed){job.completed=p.completed;job.percent=Math.min(99,Math.floor(p.completed/p.total*100));}if(p.durationSeconds)info=p;}catch{}}});
    child.stderr.on('data',b=>{error=(error+b).slice(-5000);});
    child.on('error',fail);
    child.on('close',code=>{clearTimeout(killTimer);signal.removeEventListener('abort',abort);if(signal.aborted)fail(signal.reason);else if(code!==0)fail(Error('TTS synthesis failed: '+error));else done();});
   });
   signal.throwIfAborted();
   const attachment=await this.ctx.attachments.saveFileStream({data:createReadStream(output),signal,name:'generated-speech.wav'});
   signal.throwIfAborted();job.status='complete';job.percent=100;
   return {file:{attachmentId:attachment.attachmentId,name:attachment.name,bytes:attachment.bytes},path:relative(workspace,output).split('\\').join('/'),chunks:r.chunks.length,model:settings.model,speaker:r.speaker||runtime.speaker||'default',...info};
  }catch(e){job.status=signal.aborted?'cancelled':'failed';if(dir)await Promise.all([rm(join(dir,'generated-speech.wav'),{force:true}),rm(join(dir,'generated-speech.partial.wav'),{force:true})]);throw e;}
  finally{this.busy=false;if(dir)await rm(join(dir,'request.json'),{force:true});while(this.jobs.size>50)this.jobs.delete(this.jobs.keys().next().value);}
 }
}
