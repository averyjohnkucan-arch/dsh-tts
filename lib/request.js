export const description = 'TTS: text-to-speech, read aloud, narration, voiceover or a spoken audio clip. Generate a local WAV using the CPU model selected in Settings → Text to Speech: Qwen3-TTS 1.7B CustomVoice or Audio8 0.1B. Return the exact words in text; do not embellish or rewrite unless asked. The result has a saved workspace path, chat audio player and download link. Use delivery for natural-language tone, pace, emotion or inflection instructions, separate from spoken words. Example: text="But I wanted to go with you.", delivery="A mildly whiny, pleading tone with a disappointed ending." Qwen supports these delivery requests, with variable results; no fixed cough/yawn/laugh tag vocabulary or SSML is promised. Audio8 supports plain text only and rejects delivery controls. Never put stage directions, markup or tags in text. For Qwen, optional speaker and language select supported presets; omit them for saved defaults. The response reports the actual model. Long text is segmented and joined into one file, up to 12,000 characters per call. Generation can be slow on CPU. Models load only for this call and unload afterward; CPU synthesis keeps the chat model loaded and uses no GPU. Stop cancels synthesis. This tool does not clone voices, transcribe, edit/mix audio or synchronize video dubbing. Present the finished audio to the user. Fish S2-Pro expressive generation is not available in this release.';
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
export function request(args, backend='audio8') {
 if (typeof args.text !== 'string' || !args.text.trim()) throw Error('text must contain the words to speak.');
 if (Array.from(args.text).length > 12000) throw Error('Use at most 12,000 characters per call.');
 if (/<\/?(?:speak|prosody|break|voice|emotion)\b|\[[^\]\n]{1,100}\]/i.test(args.text)) throw Error('Do not put SSML or expression tags in spoken text. For Qwen3 use the separate delivery field. Audio8 supports plain text only.');
 const seed = args.seed ?? 42;
 if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw Error('seed must be an integer from 0 to 2147483647.');
 const delivery = args.delivery ?? '';
 if (typeof delivery !== 'string' || delivery.length > 1000) throw Error('delivery must be at most 1,000 characters.');
 if (backend === 'audio8' && (delivery || args.speaker || args.language)) throw Error('Audio8 supports plain text only. Select Qwen3-TTS in Settings → Text to Speech to use delivery, speaker or language controls.');
 return {chunks: splitText(args.text, backend === 'qwen3' ? 300 : 150), seed, delivery, ...(args.speaker ? {speaker:args.speaker} : {}), ...(args.language ? {language:args.language} : {})};
}
