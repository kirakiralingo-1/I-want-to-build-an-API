const express = require('express');
const path = require('path');
const { Readable } = require('stream');
const app = express();

// --- 静的ファイル ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

// --- Innertube player（ANDROID client）---
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

    const headers = { 'User-Agent': 'com.google.android.youtube/20.10.38' };
    if (req.headers.range) headers['Range'] = req.headers.range;

    const upstream = await fetch(url, { headers });
    res.status(upstream.status);
    res.set('Content-Type', mimeType || 'video/mp4');
    if (upstream.headers.get('content-length'))
      res.set('Content-Length', upstream.headers.get('content-length'));
    if (upstream.headers.get('content-range'))
      res.set('Content-Range', upstream.headers.get('content-range'));
    res.set('Accept-Ranges', 'bytes');

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// --- 動画メタ情報（oEmbed）---
app.get('/api/video/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`
    );
    res.json(await r.json());
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// --- 検索（Innertube）---
app.get('/api/search/:query', async (req, res) => {
  const { query } = req.params;
  try {
    const body = {
      context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
      query
    };
    const r = await fetch(
      'https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const data = await r.json();
    const videos = [];
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (o.videoRenderer) {
        const v = o.videoRenderer;
        videos.push({
          id: v.videoId,
          title: v.title?.runs?.[0]?.text || '',
          channel: v.ownerText?.runs?.[0]?.text || '',
          thumb: v.thumbnail?.thumbnails?.at(-1)?.url || ''
        });
      }
      for (const val of Object.values(o)) walk(val);
    };
    walk(data);
    res.json(videos.slice(0, 20));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on :${PORT}`));   
