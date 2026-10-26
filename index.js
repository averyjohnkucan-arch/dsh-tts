import {recommendedFor} from './lib/recommended-models.mjs';
import Schema from '@deepseek-ai/schemastery';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {TtsRuntime} from './lib/runtime.js';
import {description} from './lib/request.js';
import {speakers,languages,modelNames} from './lib/settings.js';
import {serveAudio} from './lib/playback.js';
export const inject=['tools','attachments','webServer'];
export const Config=Schema.object({dataDir:Schema.string().default('')});
export async function apply(ctx,config){
 const runtime=new TtsRuntime(ctx,config.dataDir);
 let unregister=()=>{};
 const initial=await runtime.settings.list();
 const token=randomBytes(32).toString('hex'),connection={path:'/plugins/dsh-tts/action',token};
 ctx.on('webserver/index-inject',items=>items.push({kind:'global',name:'__DSH_TTS__',value:connection}));
 ctx.inject(['connection'],scope=>{
  scope.effect(()=>ctx.webServer.register({kind:'exact',path:'/plugins/dsh-tts/audio',handler:async(req,res)=>{if(!scope.connection.authorizeIndex(req,res))return;await serveAudio(ctx.attachments,req,res);}}));
  scope.effect(()=>ctx.webServer.register({kind:'exact',path:'/plugins/dsh-tts/connection',handler:async(req,res)=>{res.setHeader('Cache-Control','no-store');if(req.method!=='GET'||req.headers.origin&&req.headers.origin!==ctx.webServer.getOrigin()){res.writeHead(403);res.end();return;}if(!scope.connection.authorizeIndex(req,res))return;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(connection));}}));
 });
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:connection.path,handler:async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const a=Buffer.from(String(req.headers.authorization||'').replace(/^Bearer /,'')),b=Buffer.from(token);
  if(a.length!==b.length||!timingSafeEqual(a,b)){res.writeHead(401);res.end('{}');return;}
  if(req.method!=='POST'||!String(req.headers['content-type']).startsWith('application/json')||req.headers.origin&&req.headers.origin!==ctx.webServer.getOrigin()){res.writeHead(403);res.end('{}');return;}
  try{let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw Error('Request too large.');body+=chunk;}const {action,payload={}}=JSON.parse(body);let result;if(['recommended','recommendedDownload','recommendedCancel'].includes(action))result=await recommendedFor(runtime,new URL('./lib/runtime.js',import.meta.url),runtime.root).action(action,payload);else if(action==='progress')result=runtime.progress(payload.callId);else if(action==='list')result=await runtime.settings.list();else if(action==='browse')result=await runtime.settings.browse(payload.path);else if(action==='configure'){if(runtime.busy)throw Error('Wait for the current TTS call before changing its runtime.');result=await runtime.settings.save(payload.settings);registerTool(result.settings.model);}else throw Error('Unknown TTS settings operation.');res.end(JSON.stringify({result}));}catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}
 }}));
 function registerTool(selected){unregister();
 const tool=defineTool({name:'text_to_speech',description:description+' Currently selected: '+modelNames[selected]+(selected==='qwen3'?'. Delivery instructions, speaker and language controls are available.':'. Plain text only; delivery/speaker/language controls are unavailable until the user selects Qwen3 in Settings.'),
  parameters:{text:{type:'string',required:true,description:'Exact words to speak, up to 12,000 characters. No inline tags, SSML or stage directions. Use the separate delivery field for Qwen emotion/tone instructions. Long scripts are automatically segmented.'},delivery:{type:'string',description:'Qwen3 1.7B only: natural-language performance direction, up to 1,000 characters. For example: warm and conversational, a mildly whiny pleading tone, or calm with a slower pace. These are style requests, not guaranteed effects. Keep the actual spoken words in text. Audio8 does not support this field.'},speaker:{type:'string',enum:speakers,description:'Qwen3 preset voice. Ryan and Aiden are native English presets. Omit for the saved voice.'},language:{type:'string',enum:languages,description:'Qwen3 spoken language. Omit for the saved language.'},seed:{type:'integer',description:'Optional reproducible random seed, 0–2147483647. Omit to use Settings → Text to Speech.'}},
  timeoutMs:3600000,isConcurrencySafe:()=>false,
  presentCall:args=>({card:'generic',title:'Text to speech',kind:'other',rawInput:args}),
  output:{schema:{type:'object',additionalProperties:false,properties:{data:{type:'string',required:true},file:{type:'object',additionalProperties:false,properties:{attachmentId:{type:'string',required:true},name:{type:'string',required:true},bytes:{type:'integer',required:true}}}}},render:(_args,value)=>[{type:'text',text:value.data},...(value.file?[{type:'file',attachment:value.file}]:[])]},
  execute:async(args,exec)=>{if(!exec.agent)throw Error('Run TTS from an active conversation.');const {file,...data}=await runtime.render(args,exec);return {data:JSON.stringify(data)+'\nPresent the generated audio to the user. The audio player and download link are shown in chat. If linking the file, use the returned path; do not claim a link is above unless it is displayed.',file};}
 });
 unregister=ctx.tools.register(tool);
 }
 ctx.effect(()=>{registerTool(initial.settings.model);return()=>unregister();});ctx.effect(()=>()=>runtime.dispose());
}
