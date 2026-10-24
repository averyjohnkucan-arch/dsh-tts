window.__ModuleLoader__.load({id:'dsh-tts',factory(require){
 const React=require('react'),h=React.createElement,{useState,useEffect}=React;
 const {DisclosureRow,IconSparkleRegular}=require('@deepseek-ai/dsh-client-ui-primitives');
 let connection=window.__DSH_TTS__;
 async function api(action,payload={},signal){
  const connect=async()=>connection=await fetch('/plugins/dsh-tts/connection',{signal}).then(r=>{if(!r.ok)throw Error('TTS connection unavailable');return r.json();});
  if(!connection)await connect();
  const send=()=>fetch(connection.path,{method:'POST',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:JSON.stringify({action,payload}),signal});
  let r=await send();if(r.status===401){await connect();r=await send();}const body=await r.json();if(!r.ok)throw Error(body.error||'TTS settings unavailable');return body.result;
 }
 function AudioCard({file}){
  const url='/plugins/dsh-tts/audio?'+new URLSearchParams({id:file.attachmentId,name:file.name});
  return h('figure',{style:{margin:'12px 0'}},h('audio',{controls:true,preload:'metadata',src:url,style:{display:'block',maxWidth:'100%',width:420},'aria-label':'Generated speech'}),h('figcaption',{style:{fontSize:13,marginTop:6}},h('a',{href:url+'&download=1',download:file.name},'Download audio')));
 }
 function TtsResult({phase,block,useDisclosure,callId}){
  const {expanded,toggle}=useDisclosure(),settled=phase==='result';const [percent,setPercent]=useState(null);
  useEffect(()=>{if(settled||!callId){setPercent(null);return;}let alive=true,timer;const c=new AbortController();const refresh=async()=>{try{const p=await api('progress',{callId},c.signal);if(alive)setPercent(p?.percent??null);}catch{}finally{if(alive)timer=setTimeout(refresh,2000);}};void refresh();return()=>{alive=false;clearTimeout(timer);c.abort();};},[settled,callId]);
  const parts=settled&&Array.isArray(block.content)?block.content:[],text=parts.filter(p=>p.type==='text').map(p=>p.text).join('\n');
  const files=parts.filter(p=>p.type==='file'&&p.attachment?.name==='generated-speech.wav');
  return h('div',null,h(DisclosureRow,{icon:h(IconSparkleRegular,{size:14}),title:'Tool call',open:expanded,expandable:phase!=='preparing',running:!settled,expandOnRowClick:true,onToggle:toggle,collapsedContent:h('span',{style:{marginLeft:8,color:'var(--dsw-alias-label-secondary)'}},'text_to_speech'+(block.isError?' · failed':!settled&&Number.isFinite(percent)?' | '+percent+'%':''))},expanded&&h('pre',{style:{whiteSpace:'pre-wrap',maxHeight:200,overflow:'auto',fontSize:13}},settled?text:'Generating speech…')),...files.map(p=>h(AudioCard,{key:p.attachment.attachmentId,file:p.attachment})));
 }
 function CompletedAudio({turn,useTtsChat}){
  const snapshot=useTtsChat(v=>v),files=new Map();
  for(const key of snapshot?.locations.getTurn(turn)||[]){const node=snapshot.nodes.get(key),root=node?.kind==='tool-call'?node.data.root:null;if(root?.kind!=='tool-result'||root.isError||root.name!=='text_to_speech')continue;for(const p of root.content||[])if(p.type==='file'&&p.attachment?.name==='generated-speech.wav')files.set(p.attachment.attachmentId,p.attachment);}
  return files.size?h('section',{'data-generated-speech':true,'aria-label':'Generated speech'},...Array.from(files.values(),file=>h(AudioCard,{key:file.attachmentId,file}))):null;
 }
 function Page(){
  const [draft,setDraft]=useState(null),[status,setStatus]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[browser,setBrowser]=useState(null),[location,setLocation]=useState('');
  useEffect(()=>{const c=new AbortController();api('list',{},c.signal).then(v=>{setDraft(v.settings);setStatus(v.status);},e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[]);
  const change=(key,value)=>setDraft(d=>({...d,[key]:value}));
  async function save(){setBusy(true);setError('');setNotice('');try{const v=await api('configure',{settings:draft});setDraft(v.settings);setStatus(v.status);setNotice('Text to Speech settings saved. New calls use these settings.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function browse(path){setError('');try{const v=await api('browse',{path});setBrowser(v);setLocation(v.path);}catch(e){setError(e.message);}}
  const field=(key,label,type='text',min,max,step)=>h('label',{key,style:{display:'flex',flexDirection:'column',gap:6,margin:'12px 0'}},label,h('input',{type,min,max,step,value:draft[key],onChange:e=>change(key,type==='number'?Number(e.target.value):e.target.value)}));
  return h('section',{className:'dsh-tts-settings'},h('style',null,'.dsh-tts-settings{font:inherit;color:var(--dsw-alias-label-primary)}.dsh-tts-settings h2{font-size:18px;font-weight:500}.dsh-tts-settings p{line-height:1.5;color:var(--dsw-alias-label-secondary)}.dsh-tts-settings button,.dsh-tts-settings input{font:inherit;color:inherit;padding:8px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}.dsh-tts-settings button{cursor:pointer}.dsh-tts-settings [role=alert]{color:var(--dsw-alias-state-error-primary)}.dsh-tts-settings :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary)}'),h('h2',null,'Text to Speech'),h('p',null,'Audio8 runs locally on the CPU. Enable or disable the tool in Plugins. Search for TTS, text-to-speech, narration or voiceover when Tool Manager is enabled.'),error&&h('p',{role:'alert'},error),notice&&h('p',{role:'status'},notice),!draft?h('p',null,'Loading TTS settings…'):h(React.Fragment,null,
   h('p',{role:'status'},status?.ready?'Model files ready · Audio8 0.1B ONNX INT8 · CPU':status?.error||'Runtime not installed'),
   field('modelDir','Audio8 model folder on the DSH host'),h('button',{disabled:busy,onClick:()=>browse(draft.modelDir)},'Choose model folder'),h('p',null,'Select the complete 0.1B ONNX INT8 folder containing runtime_manifest.json, tokenizer and all three model components. A single ONNX file, PyTorch checkpoint or 0.6B model cannot be used with this runtime.'),
   browser&&h('div',{style:{border:'1px solid var(--dsw-alias-border-l3)',padding:12,borderRadius:8,margin:'12px 0'}},h('label',null,'Folder location',h('input',{value:location,onChange:e=>setLocation(e.target.value),onKeyDown:e=>{if(e.key==='Enter')void browse(location);},style:{width:'100%'}})),h('div',{style:{display:'flex',gap:8,margin:'8px 0'}},h('button',{onClick:()=>browse(location)},'Open'),h('button',{onClick:()=>browse(browser.parent)},'Up'),h('button',{onClick:()=>{change('modelDir',browser.path);setBrowser(null);}},'Use this folder'),h('button',{onClick:()=>setBrowser(null)},'Close')),browser.modelFolder&&h('p',null,'Audio8 manifest found here.'),h('div',{style:{maxHeight:240,overflow:'auto',display:'flex',flexDirection:'column',gap:4}},...browser.entries.map(e=>h('button',{key:e.path,onClick:()=>browse(e.path),style:{textAlign:'left'}},e.name)))),
   field('threads','CPU threads (1 minimizes interference with other work)','number',1,4,1),field('seed','Default random seed','number',0,2147483647,1),field('pauseMs','Pause between text segments (milliseconds)','number',0,1000,10),
   h('details',null,h('summary',null,'Sampling and runtime paths'),h('p',null,'Sampling changes variation and stability; it does not provide emotion tags. These paths are on the computer running DSH.'),field('temperature','Temperature','number',0.1,1,0.05),field('topP','Top P','number',0.1,1,0.05),field('topK','Top K','number',1,100,1),field('python','CPU Python executable'),field('runtimeDir','Audio8 ONNX runtime folder'),field('voicesDir','Saved default voice folder')),
   h('p',null,'Expression tags: none documented by Audio8. Cough, yawn, laugh, emotion tags and SSML are not supported controls. Only the words to be spoken belong in the text.'),h('button',{disabled:busy,onClick:save},busy?'Saving…':'Validate files and save')
  ));
 }
 return {inject:['slots','sessions','uiConversation'],apply(ctx){ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'dsh-tts',order:68,label:()=> 'Text to Speech'},Page));ctx.slots.inject('tool.call.toolview',()=>ctx.slots.register({name:'tool.call.toolview',key:'text_to_speech'},TtsResult));ctx.slots.inject('conversation.chat.turnTail',()=>ctx.slots.register({name:'conversation.chat.turnTail',id:'dsh-tts.outputs',order:62,inject:sessionId=>({hooks:{ttsChat:ctx.uiConversation.binding(ctx.sessions.binding(sessionId)).target('chat')}})},CompletedAudio));}};
}});
