# 把「英文教材\會考資源包」的 PDF 轉成純文字，給編題目時查閱（node 跑不了 PDF，所以用 python）
# 教材有版權：PDF 和轉出的文字都只放在 英文教材\，不要放進這個 repo。
# 需要：pip install pymupdf
import pymupdf, pathlib, sys
M = pathlib.Path(__file__).resolve().parents[2] / "英文教材" / "會考資源包"
out = M / "文字檔"
out.mkdir(exist_ok=True)
only = sys.argv[1:]  # 只轉檔名含這些字的


def dump(f):
    name = f.stem.replace(" ", "")
    if (out / f"{name}.txt").exists():
        return
    doc = pymupdf.open(f)
    parts = [f"\n===== PAGE {i+1} =====\n{p.get_text()}" for i, p in enumerate(doc)]
    (out / f"{name}.txt").write_text("".join(parts), encoding="utf-8")
    print(name, "pages", len(doc), flush=True)


for f in sorted(M.rglob("*.pdf")):
    if only and not any(k in f.name for k in only):
        continue
    try:
        dump(f)
    except Exception as e:
        print("skip", f.name, e)
