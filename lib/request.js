export const description = 'TTS: text-to-speech, text to speech, speak, read aloud, narration, voiceover, spoken phrase or long audio clip. Generate a local Audio8 WAV audio file from the exact words in text. The finished file has an inline audio player and download link. Long text is automatically split at sentence/word boundaries into segments of at most 150 characters. Expression tags: NONE are documented or supported by this Audio8 runtime. Do not use SSML, [laugh], [cough], [yawn], emotion/style labels, stage directions or instructions such as "say cheerfully" inside text; they may be read literally or reduce quality. Punctuation can suggest ordinary phrasing but is not a guaranteed emotion control. Use only the words the user wants spoken; do not expand or rewrite them unless asked. CPU-only; no chat-model switching. This tool does not clone voices, edit audio, or synchronize dubbing to video.';
export function splitText(text, limit=150) {
 const chars=Array.from(text.trim()), chunks=[];
 while(chars.length){
  let end=Math.min(limit,chars.length);
  if(chars.length>limit){
   const head=chars.slice(0,limit).join('');
   const sentences=[...head.matchAll(/[.!?。！？](?:\s|$)/gu)];
   const last=sentences.at(-1);
   if(last&&Array.from(head.slice(0,last.index+last[0].length)).length>=limit/3)end=Array.from(head.slice(0,last.index+last[0].length)).length;
   else {const space=chars.slice(0,limit+1).map((c,i)=>/\s/u.test(c)?i:-1).filter(i=>i>0).at(-1);if(space)end=space;}
  }
  const piece=chars.splice(0,end).join('').trim();if(piece)chunks.push(piece);
  while(chars.length&&/\s/u.test(chars[0]))chars.shift();
 }
 return chunks;
}
export function request(args){
 if(typeof args.text!=='string'||!args.text.trim())throw Error('text must contain the words to speak.');
 if(Array.from(args.text).length>12000)throw Error('Use at most 12,000 characters per call. Split longer scripts into separate calls.');
 if(/<\/?(?:speak|prosody|break|voice|emotion)\b|\[(?:laugh(?:ing)?|cough(?:ing)?|yawn(?:ing)?|whisper(?:ing)?|happy|sad|angry|excited)\]/i.test(args.text))throw Error('Audio8 does not document expression tags or SSML. Remove the markup and provide only the words to speak.');
 const seed=args.seed??42;
 if(!Number.isInteger(seed)||seed<0||seed>2147483647)throw Error('seed must be an integer from 0 to 2147483647.');
 return {chunks:splitText(args.text),seed};
}
