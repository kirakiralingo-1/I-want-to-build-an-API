const express = require('express');
const path = require('path');
const app = express();

// 静的ファイル配信（public/index.html がルートになる）
app.use(express.static(path.join(__dirname, 'public')));

// --- API ---

// GET /api/video/:id
app.get('/api/video/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
    const r = await fetch(url);
    res.json(await r.json());
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

// GET /api/search/:query
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
