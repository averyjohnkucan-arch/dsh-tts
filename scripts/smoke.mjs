import {mkdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {TtsRuntime} from '../lib/runtime.js';
const workspace=resolve(process.argv[2]||'outputs');await mkdir(workspace,{recursive:true});
const runtime=new TtsRuntime({attachments:{saveFileStream:async({data,name})=>{let bytes=0;for await(const chunk of data)bytes+=chunk.length;return {attachmentId:'sha256:'+'0'.repeat(64),name,bytes};}}});
const result=await runtime.render({text:process.argv[3]||'Hello. This is a test of local text to speech in DeepSeek Harness.',seed:42},{workspace,callId:'smoke',signal:new AbortController().signal});
console.log(JSON.stringify({...result,absolutePath:resolve(workspace,result.path),diskBytes:(await stat(resolve(workspace,result.path))).size},null,2));runtime.dispose();
