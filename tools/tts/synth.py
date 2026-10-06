"""用 Kokoro（Apache 2.0）把 texts.json 的句子和單字做成 mp3，輸出到 App 的 audio/，並寫 audio/index.json（文字 → 檔名）"""
import json, hashlib, pathlib, sys
import numpy as np
import lameenc
from kokoro_onnx import Kokoro

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent.parent / "audio"
MODELS = HERE / "models"  # 模型檔太大，不上傳（.gitignore）
OUT.mkdir(exist_ok=True)
VOICE = {"W": "af_heart", "M": "am_michael", "G": "af_bella", "B": "am_puck", "A": "af_heart", "w": "af_heart"}

k = Kokoro(str(MODELS / "kokoro-v1.0.int8.onnx"), str(MODELS / "voices-v1.0.bin"))
texts = json.loads((HERE / "texts.json").read_text(encoding="utf-8"))
index_path = OUT / "index.json"
index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}


def mp3(samples, sr):
    pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(48)
    enc.set_in_sample_rate(sr)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode(pcm) + enc.flush()


jobs = [(l.split("|", 1)[0], l.split("|", 1)[1], l) for l in texts["lines"]] + [("w", w, "w|" + w) for w in texts["words"]]
done = 0
for sp, text, key in jobs:
    voice = VOICE.get(sp, "af_heart")
    name = hashlib.sha1(f"{voice}|{text}".encode()).hexdigest()[:12]
    f = OUT / f"{name}.mp3"
    if not f.exists():
        samples, sr = k.create(text, voice=voice, speed=0.95, lang="en-us")
        f.write_bytes(mp3(samples, sr))
    index[key] = name
    done += 1
    if done % 25 == 0:
        print(done, "/", len(jobs), flush=True)
index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
total = sum(p.stat().st_size for p in OUT.glob("*.mp3"))
print("done", len(index), "files", round(total / 1e6, 2), "MB")
