const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── InnerTube でストリームURLを取得 ───
async function getStreamUrl(videoId) {
  const body = {
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "20.10.38",
        androidSdkVersion: 30,
        hl: "ja",
        gl: "JP",
      }
    },
    videoId
  };

  const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();

  if (!data.streamingData?.formats?.length) {
    throw new Error("streamingData not found");
  }

  // itag 22 = 720p mp4 (muxed), 18 = 360p mp4 (muxed)
  // 高品質を優先して選ぶ
  const preferred = [22, 18, 37];
  const formats = data.streamingData.formats;
  const chosen = preferred
    .map(itag => formats.find(f => f.itag === itag))
    .find(Boolean);

  if (!chosen) throw new Error("no suitable format");

  return {
    url: chosen.url,
    mimeType: chosen.mimeType,
    itag: chosen.itag,
    title: data.videoDetails?.title || "Unknown",
    author: data.videoDetails?.author || "Unknown",
    thumbnail: data.videoDetails?.thumbnail?.thumbnails?.at(-1)?.url
  };
}

// ─── 静的ファイル配信 ───
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ─── API: ストリーム情報取得 ───
  if (url.pathname === '/api/info') {
    const videoId = url.searchParams.get('v');
    if (!videoId) { res.writeHead(400); return res.end('missing v'); }
    try {
      const info = await getStreamUrl(videoId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(info));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ─── API: 動画ストリームプロキシ ───
  if (url.pathname === '/api/stream') {
    const videoId = url.searchParams.get('v');
    if (!videoId) { res.writeHead(400); return res.end('missing v'); }
    try {
      const info = await getStreamUrl(videoId);
      const upstream = await fetch(info.url, {
        headers: {
          'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip'
        }
      });

      res.writeHead(200, {
        'Content-Type': info.mimeType,
        'Content-Length': upstream.headers.get('content-length') || '',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      });

      // パイプでストリーム転送
      const { Readable } = require('stream');
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (e) {
      res.writeHead(502);
      res.end('stream error: ' + e.message);
    }
    return;
  }

  // ─── 静的ファイル ───
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.join(__dirname, 'public', file);
  const ext = path.extname(file);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(buf);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`Listening on :${process.env.PORT || 3000}`);
});   
