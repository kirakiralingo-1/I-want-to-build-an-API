FROM node:18-slim

# WARPインストール
RUN apt-get update && \
    curl -s https://pkg.cloudflareclient.com/pubkey.gpg | gpg --dearmor -o /usr/share/keyrings/cloudflare-warp.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp.gpg] https://pkg.cloudflareclient.com/ noble main" > /etc/apt/sources.list.d/cloudflare-warp.list && \
    apt-get update && \
    apt-get install -y cloudflare-warp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

EXPOSE 3000

# WARP接続 + サーバー起動
CMD ["sh", "-c", "warp-cli registration new 2>/dev/null; warp-cli mode proxy; warp-cli connect && node server.js"]   
