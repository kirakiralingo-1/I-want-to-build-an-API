const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// --- 静的ファイル配信 ---
function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// --- YouTube player API を叩いてストリームURLを取得 ---
function getStreamUrl(videoId, callback) {
  const postData = JSON.stringify({
    videoId,
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "20.10.38"
      }
    }
  });

  const options = {
    hostname: 'www.youtube.com',
    path: '/youtubei/v1/player',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        const formats = data?.streamingData?.formats || [];
        // 最高画質のプログレッシブ（音声+動画統合）形式を選ぶ
        const best = formats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
        if (best?.url) {
          callback(null, best.url);
        } else {
          callback(new Error('Stream URL not found'));
        }
      } catch (e) {
        callback(e);
      }
    });
  });

  req.on('error', callback);
  req.write(postData);
  req.end();
}

// --- サーバー ---
const server = http.createServer((req, res) => {
  // API エンドポイント
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
      if (err) {
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.end(JSON.stringify({ streamUrl }));
      }
    });
    return;
  }

  // それ以外は静的ファイル
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});   
