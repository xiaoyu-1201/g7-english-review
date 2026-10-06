# 把「英文教材」資料夾的 PDF（含 zip 裡的 PDF）轉成純文字，給編題目時查閱。
# 教材有版權：PDF 和轉出的文字都只放在 英文教材\，不要放進這個 repo。
# 需要：pip install pymupdf
import pymupdf, pathlib, zipfile
M = pathlib.Path(__file__).resolve().parents[2] / "英文教材"  # App 資料夾旁邊
out = M / "文字檔"
out.mkdir(exist_ok=True)


def dump(src, name):
    doc = pymupdf.open(stream=src, filetype="pdf") if isinstance(src, bytes) else pymupdf.open(src)
    parts = [f"\n===== PAGE {i+1} =====\n{p.get_text()}" for i, p in enumerate(doc)]
    (out / f"{name}.txt").write_text("".join(parts), encoding="utf-8")
    print(name, "pages", len(doc), flush=True)


for f in sorted(M.glob("*段考/*.pdf")) + sorted(M.glob("共用/*.pdf")):
    name = f.stem.split("-", 1)[-1].split("(")[0]
    if not (out / f"{name}.txt").exists():
        dump(f, name)
for z in sorted(M.glob("卷類資源/*.zip")):
    kind = z.stem.split("_")[-2]
    with zipfile.ZipFile(z) as zf:
        for m in zf.infolist():
            if m.filename.lower().endswith(".pdf"):
                name = kind + "_" + pathlib.Path(m.filename).stem.split("(")[0]
                if not (out / f"{name}.txt").exists():
                    dump(zf.read(m), name)
