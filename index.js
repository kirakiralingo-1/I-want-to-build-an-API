const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

// --- Innertube player 呼び出し（ANDROID client = 直接URLが返る）---
async function getStreamUrl(videoId) {
  const body = {
    context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
    videoId
  };
  const r = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json();

  if (!data.streamingData) throw new Error('No streaming data');

  // 最も高画質の progressive（audio+video 統合）を選ぶ
  const formats = data.streamingData.formats || [];
  const best = formats
    .filter(f => f.url && f.mimeType?.includes('video/mp4'))
    .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

  if (!best) throw new Error('No playable format');
  return { url: best.url, mimeType: best.mimeType, height: best.height };
}

// --- ストリームプロキシ（Range対応）---
app.get('/api/stream/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { url, mimeType } = await getStreamUrl(id);

    // Range ヘッダーをそのまま転送
    const headers = { 'User-Agent': 'com.google.android.youtube/20.10.38' };
    if (req.headers.range) headers['Range'] = req.headers.range;

    const upstream = await fetch(url, { headers });
    res.status(upstream.status);
    res.set('Content-Type', mimeType || 'video/mp4');
    if (upstream.headers.get('content-length'))
      res.set('Content-Length', upstream.headers.get('content-length'));
    if (upstream.headers.get('content-range'))
      res.set('Content-Range', upstream.headers.get('content-range'));
    if (upstream.headers.get('accept-ranges'))
      res.set('Accept-Ranges', 'bytes');

    // ストリームをパイプ
    const { Readable } = require('stream');
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(res);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// --- 動画メタ情報（oEmbed）---
app.get('/api/video/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    res.json(await r.json());
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on :${PORT}`));   
