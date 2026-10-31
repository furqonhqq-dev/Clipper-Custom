import test from "node:test";
import assert from "node:assert/strict";
import { parseCaptionTime, parseCaptions, rankCaptionClips, P0_SCORING_METHOD } from "../src/modules/p0-candidate-engine.js";

const srt = Array.from({ length: 64 }, (_,i) => {
  const stamp = (seconds) => `00:00:${String(seconds % 60).padStart(2,"0")},000`;
  const from = i * 2;
  const fromTime = from >= 60
    ? `00:01:${String(from-60).padStart(2,"0")},000`
    : stamp(from);
  const next = from + 2;
  const toTime = next >= 120
    ? `00:02:${String(next-120).padStart(2,"0")},000`
    : next >= 60 ? `00:01:${String(next-60).padStart(2,"0")},000` : stamp(next);
  const quote = i > 12 && i < 38
    ? "Kenapa cara belajar yang efektif itu penting? Karena kebiasaan kecil memberikan hasil yang besar."
    : "Pada video kali ini kita membahas contoh pengalaman dan langkah yang bisa dilakukan.";
  return `${i+1}\n${fromTime} --> ${toTime}\n${quote}\n`;
}).join("\n");

test("P0 supports timestamp variations and rejects invalid clocks", () => {
  assert.equal(parseCaptionTime("00:01:05,250"), 65.25);
  assert.equal(parseCaptionTime("01:05.25"), 65.25);
  assert.equal(parseCaptionTime("99:60.000"), null);
  assert.equal(parseCaptionTime("not-a-time"), null);
});
test("P0 parses real SRT and WebVTT cue lines safely", () => {
  const segments = parseCaptions(srt);
  assert.equal(segments.length,64);
  assert.equal(segments[0].start,0);
  assert.equal(segments[63].end,128);
  const vtt = "WEBVTT\n\nsegmentA\n00:00:01.200 --> 00:00:04.800 align:start\n<i>Hai &amp; selamat datang!</i>\n\n00:00:04.800 --> 00:00:06.000\nLanjut\n";
  assert.deepEqual(parseCaptions(vtt), [
    {start:1.2,end:4.8,text:"Hai & selamat datang!"},
    {start:4.8,end:6,text:"Lanjut"},
  ]);
  assert.throws(()=>parseCaptions("bad data"),/Tidak ditemukan subtitle/);
});
test("P0 scores and deduplicates transcript-supported candidates only", () => {
  const clips=rankCaptionClips(parseCaptions(srt),{count:5});
  assert.ok(clips.length>=2 && clips.length<=5);
  assert.ok(clips[0].score>=clips[clips.length-1].score);
  for(const clip of clips) {
    assert.ok(clip.start>=0 && clip.end<=128);
    assert.ok(clip.end>clip.start);
    assert.ok(clip.score>=0 && clip.score<=100);
    assert.ok(clip.title.length>3 && clip.title.length<=84);
    assert.ok(clip.excerpt.length>0);
  }
  for (let i=0;i<clips.length;i++) for(let j=i+1;j<clips.length;j++) {
    const a=clips[i],b=clips[j];
    const overlap=Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start));
    assert.ok(overlap<=Math.min(a.end-a.start,b.end-b.start)*0.22);
  }
});
test("P0 transparently identifies rule-based ranking, not neural AI", () => {
  assert.match(P0_SCORING_METHOD,/bukan model AI/);
  assert.deepEqual(rankCaptionClips([]),[]);
  assert.throws(()=>parseCaptions("x".repeat(3_000_001)),/3 MB/);
});
