from flask import Flask, jsonify
import yt_dlp, json

app = Flask(__name__)

@app.route("/api/search?q=<query>")
def search(query):
    opts = {"quiet": True, "extract_flat": True, "skip_download": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        result = ydl.extract_info(f"ytsearch10:{query}", download=False)
    return jsonify(result.get("entries", []))

@app.route("/api/video/<video_id>")
def video(video_id):
    opts = {"quiet": True, "skip_download": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://youtube.com/watch?v={video_id}", download=False)
    return jsonify({
        "title": info["title"],
        "formats": [f for f in info.get("formats", []) if f.get("url")]
    })

if __name__ == "__main__":
    app.run(port=10000)   
