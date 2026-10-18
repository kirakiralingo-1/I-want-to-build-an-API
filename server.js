const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// --- 静的ファイル配信 ---
function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(__dirname, urlPath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: ' + filePath);
      return;
    }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// --- YouTube player API（複数クライアントフォールバック） ---
function getStreamUrl(videoId, callback) {
  const clients = [
    {
      clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
      clientVersion: "2.0",
      hl: "en",
      gl: "US"
    },
    {
      clientName: "WEB_EMBEDDED_PLAYER",
      clientVersion: "1.20240101.00.00",
      hl: "en",
      gl: "US"
    },
    {
      clientName: "ANDROID",
      clientVersion: "20.10.38",
      androidSdkVersion: 34,
      hl: "en",
      gl: "US"
    }
  ];

  const uaMap = {
    "TVHTML5_SIMPLY_EMBEDDED_PLAYER": 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
    "WEB_EMBEDDED_PLAYER": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    "ANDROID": 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip'
  };

  let idx = 0;

  function tryNext() {
    if (idx >= clients.length) {
      callback(new Error('All clients blocked (LOGIN_REQUIRED)'));
      return;
    }
    const client = clients[idx];
    idx++;

    const postData = JSON.stringify({
      videoId,
      context: { client }
    });

    const options = {
      hostname: 'www.youtube.com',
      path: '/youtubei/v1/player',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': uaMap[client.clientName] || 'Mozilla/5.0'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const status = data?.playabilityStatus?.status;
          console.log(`[${client.clientName}] status: ${status}`);

          if (status !== 'OK') {
            tryNext();
            return;
          }

          const formats = data?.streamingData?.formats || [];
          const adaptive = data?.streamingData?.adaptiveFormats || [];

          // 1) プログレッシブ（音声+動画統合）
          let best = formats
            .filter(f => f.url)
            .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

          if (best?.url) {
            callback(null, best.url);
            return;
          }

          // 2) adaptive: video + audio
          const video = adaptive
            .filter(f => f.url && f.mimeType?.startsWith('video/'))
            .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

          const audio = adaptive
            .filter(f => f.url && f.mimeType?.startsWith('audio/'))
            .sort((a, b) => (b.audioQuality?.length || 0) - (a.audioQuality?.length || 0))[0];

          if (video?.url && audio?.url) {
            callback(null, { videoUrl: video.url, audioUrl: audio.url });
          } else if (video?.url) {
            callback(null, video.url);
          } else {
            const any = adaptive.find(f => f.url);
            if (any) {
              callback(null, any.url);
            } else {
              tryNext();
            }
          }
        } catch (e) {
          tryNext();
        }
      });
    });

    req.on('error', () => tryNext());
    req.write(postData);
    req.end();
  }

  tryNext();
}

// --- サーバー ---
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/stream')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const videoId = url.searchParams.get('id');

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid video ID' }));
      return;
    }

    getStreamUrl(videoId, (err, streamUrl) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(err ? { error: err.message } : { streamUrl }));
    });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`__dirname = ${__dirname}`);
  console.log(`index.html exists = ${fs.existsSync(path.join(__dirname, 'index.html'))}`);
});   
