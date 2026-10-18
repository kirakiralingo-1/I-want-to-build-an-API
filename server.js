const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// --- 静的ファイル配信（修正） ---
function serveStatic(req, res) {
  // クエリストリングを除去
  let urlPath = req.url.split('?')[0];
  
  // '/' なら index.html
  if (urlPath === '/') urlPath = '/index.html';
  
  const filePath = path.join(__dirname, urlPath);
  
  // セキュリティ: 親ディレクトリへの参照を防止
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

// --- YouTube player API ---
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
