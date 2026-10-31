// P0-01: deterministic, local caption-based discovery.
// This is NOT speech recognition, a trained AI scorer or a virality predictor.
// Source text is never sent over the network.
const MAX_TEXT_BYTES = 3_000_000;
const TIME = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/;
const HOOK = /\b(kenapa|mengapa|bagaimana|cara|rahasia|ternyata|jangan|harus|penting|kesalahan|tips|contoh|masalah|solusi|pertama|kedua|ketiga|bayangkan|alasan|belajar|why|how|secret|mistake|never|always|important|because|here's|imagine|first|second|third)\b/i;
const FILLER = /^(?:ee+|eh+|emm+|hmm+|anu|ya|iya|oke|okay|jadi|nah|apa|gitu|kan|you\s+know)$/i;
const COMMON = new Set(["yang","dan","di","ke","dari","ini","itu","ada","untuk","dengan","atau","pada","saya","aku","kamu","kita","mereka","dalam","the","and","is","are","you","your","for","in","on","to","of","a","an","it"]);
const tidy = (value) => String(value).replace(/<[^>]*>/g, "").replace(/\{\\[^}]*\}/g, "").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g, " ").trim();
const words = (text) => (text.toLocaleLowerCase("id-ID").match(/[\p{L}\p{N}]+/gu) || []);
export function parseCaptionTime(value) {
  const match = String(value).trim().match(TIME);
  if (!match) return null;
  const hours = Number(match[1] || 0), mins = Number(match[2]), secs = Number(match[3]);
  if (mins > 59 || secs > 59) return null;
  const millis = Number(match[4].padEnd(3, "0"));
  return (hours * 3600 + mins * 60 + secs) + millis / 1000;
}
export function parseCaptions(raw) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > MAX_TEXT_BYTES)
    throw new Error("Transkrip kosong atau melebihi batas 3 MB.");
  const blocks = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  const segments = [];
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const index = lines.findIndex((line) => /-->/.test(line));
    if (index < 0) continue;
    const parts = lines[index].split(/\s*-->\s*/);
    if (parts.length !== 2) continue;
    const start = parseCaptionTime(parts[0]);
    const end = parseCaptionTime(parts[1].trim().split(/\s+/)[0]);
    const text = tidy(lines.slice(index + 1).join(" "));
    if (start === null || end === null || end <= start || end - start > 180 || !text) continue;
    segments.push({ start, end, text });
  }
  segments.sort((a,b) => a.start - b.start || a.end - b.end);
  if (!segments.length) throw new Error("Tidak ditemukan subtitle SRT/VTT dengan waktu yang valid.");
  return segments;
}
function pickTitle(segments) {
  const text = segments.map(s=>s.text).join(" ");
  const sentences = (text.match(/[^.!?]+[.!?]?/g) || [text]).map(s=>s.trim()).filter(Boolean);
  const preferred = sentences.find(s=>HOOK.test(s) && words(s).length >= 5)
    || sentences.find(s=>words(s).length >= 6) || sentences[0];
  let title = preferred.replace(/^[\s,.!?\-:]+|[\s,.!?\-:]+$/g,"").trim();
  if (title.length > 84) title = title.slice(0,81).replace(/\s+\S*$/,"") + "…";
  return title ? title[0].toUpperCase() + title.slice(1) : "Klip menarik";
}
function evaluate(segments, start, end) {
  const duration = end - start;
  const text = segments.map(s=>s.text).join(" ");
  const tokens = words(text);
  const meaningful = tokens.filter(w=>w.length > 3 && !COMMON.has(w) && !FILLER.test(w));
  const unique = new Set(meaningful);
  const density = meaningful.length / Math.max(1,duration) * 60;
  const hook = HOOK.test(text);
  const sentences = (text.match(/[.!?]/g)||[]).length;
  const repeats = meaningful.length ? unique.size / meaningful.length : 0;
  const fillerRatio = tokens.length ? tokens.filter(w=>FILLER.test(w)).length / tokens.length : 0;
  const score = Math.round(Math.min(100,Math.max(0,
    18 + Math.min(24,density*0.46) + (hook ? 17:0)
    + Math.min(14,unique.size*0.58)
    + Math.min(8,sentences*2)
    + Math.max(0,10-Math.abs(duration-38)*0.35)
    + repeats*8 - fillerRatio*30
  )));
  const reasons = [];
  if (hook) reasons.push("Ada kata pengantar/topik yang kuat");
  if (unique.size >= 16) reasons.push("Memuat banyak informasi");
  if (sentences >= 2) reasons.push("Memiliki beberapa kalimat lengkap");
  if (!reasons.length) reasons.push("Rentang transkrip dengan isi percakapan");
  return { score, reason: reasons.join(" · "), title: pickTitle(segments), excerpt: text.slice(0,370) };
}
export function rankCaptionClips(segments, { count = 8, minSeconds = 15, maxSeconds = 65 } = {}) {
  if (!Array.isArray(segments) || !segments.length) return [];
  const ordered = [...segments].filter(s=>Number.isFinite(s.start) && Number.isFinite(s.end) && s.end>s.start && typeof s.text==="string").sort((a,b)=>a.start-b.start);
  if (!ordered.length) return [];
  const candidates = [];
  const targetLengths = [25,38,52,65].filter(x=>x<=maxSeconds);
  for (let i=0; i<ordered.length; i++) {
    // Bounded windows. No scanning of file system and no hallucinated timestamps.
    for (const wanted of targetLengths) {
      const start = ordered[i].start;
      let last = i;
      for(let j=i;j<ordered.length;j++){
        if(ordered[j].end-start>maxSeconds+0.001)break;
        if(ordered[j].end-start<=wanted+5)last=j;
        if(ordered[j].end-start>=wanted)break;
      }
      const slice = ordered.slice(i,last+1);
      if(!slice.length)continue;
      const end = Math.max(...slice.map(s=>s.end));
      if(end-start<minSeconds || end-start>maxSeconds)continue;
      const content = evaluate(slice,start,end);
      candidates.push({start,end,...content,segmentCount:slice.length});
    }
  }
  candidates.sort((a,b)=>b.score-a.score || a.start-b.start);
  const selected=[];
  for(const item of candidates){
    if(selected.length>=Math.max(1,Math.min(30,Math.floor(count))))break;
    // Avoid near-duplicates and significant overlap across proposed clips.
    if(selected.some(s=>Math.max(0,Math.min(s.end,item.end)-Math.max(s.start,item.start)) >
      Math.min(s.end-s.start,item.end-item.start)*0.22))continue;
    selected.push({...item,id:"p0-"+String(selected.length+1)});
  }
  return selected;
}
export const P0_SCORING_METHOD = "Ranking awal berbasis aturan teks (bukan model AI)";
