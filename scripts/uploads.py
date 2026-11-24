#!/usr/bin/env python3
"""Uploaded papers (upload.html -> Firestore `paperUploads` + `paperUploads/<id>/chunks`). Photos/PDFs of a whole paper.
The daily task indexes each one as a proper paper under the uploader's credit (INDEXING.md 5c).

    python3 scripts/uploads.py list                 # complete uploads not yet indexed / skipped
    python3 scripts/uploads.py get <id>             # -> work/uploads/<id>/ (meta.json, paper-NN.jpg|pdf, answers-NN.jpg|pdf)
    python3 scripts/uploads.py done <id> <paper-id> # record that it is indexed as data/papers/<course>/<paper-id>.json
    python3 scripts/uploads.py skip <id> "reason"   # reject (spam, not HSC, unreadable, duplicate)
"""
import base64, json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import queue as _q  # noqa: E402  (scripts/queue.py)

ROOT = _q.ROOT
LEDGER = os.path.join(ROOT, "data/uploads_done.json")   # upload id -> {"paper": paper-id} | {"skipped": reason}


def ledger():
    return json.load(open(LEDGER)) if os.path.exists(LEDGER) else {}


def save(d):
    json.dump(d, open(LEDGER, "w"), indent=1, ensure_ascii=False, sort_keys=True)


def pending():
    led = ledger()
    return [x for x in _q.fetch_queue("paperUploads") if x.get("complete") and x["_id"] not in led and x.get("course") in _q.COURSES]


def cmd_list():
    p = pending()
    for x in p:
        n = len([f for f in x.get("files", []) if f.get("role") == "paper"])
        a = len([f for f in x.get("files", []) if f.get("role") == "answers"])
        print(f"{x['_id']}  {x['course']:11} {x.get('year')} {x.get('ptype')}  {x.get('title')!r}  by {x.get('author') or '?'}  ({n} paper files, {a} marking files)")
    if not p:
        print("No uploaded papers waiting.")


def cmd_get(i):
    x = next((y for y in _q.fetch_queue("paperUploads") if y["_id"] == i), None)
    if not x:
        sys.exit("No such upload")
    out = os.path.join(ROOT, "work/uploads", i)
    os.makedirs(out, exist_ok=True)
    chunks = _q.fetch_queue(f"paperUploads/{i}/chunks")
    n = {"paper": 0, "answers": 0}
    for fi, f in enumerate(x.get("files", [])):
        parts = sorted((c for c in chunks if int(c["f"]) == fi), key=lambda c: int(c["i"]))
        if len(parts) != int(f.get("chunks", len(parts))):
            print(f"WARNING: file {fi} {f.get('name')} incomplete")
        n[f["role"]] += 1
        ext = "pdf" if f.get("type") == "application/pdf" else "jpg"
        fp = os.path.join(out, f"{f['role']}-{n[f['role']]:02d}.{ext}")
        open(fp, "wb").write(base64.b64decode("".join(c["data"] for c in parts)))
        print(fp)
    json.dump({k: v for k, v in x.items() if k != "files"} | {"files": x.get("files", [])}, open(os.path.join(out, "meta.json"), "w"), indent=1)
    print("meta:", os.path.join(out, "meta.json"))


def main(a):
    if not a or a[0] == "list": return cmd_list()
    if a[0] == "get" and len(a) == 2: return cmd_get(a[1])
    if a[0] == "done" and len(a) == 3:
        d = ledger(); d[a[1]] = {"paper": a[2]}; return save(d)
    if a[0] == "skip" and len(a) == 3:
        d = ledger(); d[a[1]] = {"skipped": a[2]}; return save(d)
    sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
