#!/usr/bin/env python3
"""The solution queue: questions people submitted on submit.html WITHOUT a solution (Firestore collection `queue`).
The daily task writes the worked solution, difficulty and dot points, then publishes them into
data/papers/<course>/community-<course>.json (the site then shows them as "Live" to the submitter).

    python3 scripts/queue.py list                  # queued questions not yet published
    python3 scripts/queue.py get <id>              # -> work/queue/<id>.json (+ diagrams saved under assets/img/community-<course>/)
    python3 scripts/queue.py add work/queue/<id>.json   # publish it (after you have completed the JSON)
    python3 scripts/queue.py skip <id> "reason"    # record a rejected item so it is not listed again

The queue is publicly readable (see firestore.rules), so no credentials are needed.
"""
import base64, datetime, json, os, re, sys, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COURSES = ["advanced", "extension1", "extension2", "physics", "chemistry", "biology"]
SKIPPED = os.path.join(ROOT, "data/queue_skipped.json")


def project():
    cfg = open(os.path.join(ROOT, "assets/firebase-config.js")).read()
    m = re.search(r"projectId\s*:\s*[\"']([^\"']+)", cfg)
    if not m:
        sys.exit("Logins are not configured (assets/firebase-config.js has no projectId).")
    return m.group(1)


def base():
    emu = os.environ.get("FIRESTORE_EMULATOR_HOST")
    host = f"http://{emu}" if emu else "https://firestore.googleapis.com"
    return f"{host}/v1/projects/{project()}/databases/(default)/documents"


def val(v):
    """Decode a Firestore REST value."""
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "nullValue" in v: return None
    if "timestampValue" in v: return v["timestampValue"]
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return {k: val(x) for k, x in v["mapValue"].get("fields", {}).items()}
    return None


def fetch_queue():
    items, token = [], ""
    while True:
        url = base() + "/queue?pageSize=300" + (f"&pageToken={token}" if token else "")
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "betterhscpapers"}), timeout=60) as r:
            d = json.load(r)
        for doc in d.get("documents", []):
            x = {k: val(v) for k, v in doc.get("fields", {}).items()}
            x["_id"] = doc["name"].rsplit("/", 1)[1]
            items.append(x)
        token = d.get("nextPageToken")
        if not token:
            return items


def community_path(c):
    return os.path.join(ROOT, "data/papers", c, f"community-{c}.json")


def load_paper(c):
    fp = community_path(c)
    if os.path.exists(fp):
        return json.load(open(fp))
    return {"id": f"community-{c}", "course": c, "school": "Community", "year": datetime.date.today().year,
            "type": "Submitted", "label": "Community submissions", "community": True, "answers": "worked", "questions": []}


def published():
    ids = set()
    for c in COURSES:
        ids |= {q.get("queue_id") for q in load_paper(c)["questions"] if q.get("queue_id")}
    return ids


def skipped():
    return json.load(open(SKIPPED)) if os.path.exists(SKIPPED) else {}


def pending():
    done, skip = published(), skipped()
    return [x for x in fetch_queue() if x["_id"] not in done and x["_id"] not in skip and x.get("course") in COURSES]


def save_image(data_url, dest):
    m = re.match(r"data:image/(png|jpe?g|webp|gif);base64,(.+)", data_url or "", re.S)
    if not m:
        return None
    ext = {"jpeg": "jpg"}.get(m.group(1), m.group(1))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(f"{dest}.{ext}", "wb").write(base64.b64decode(m.group(2)))
    return os.path.relpath(f"{dest}.{ext}", ROOT)


def cmd_list():
    if not re.search(r"projectId", open(os.path.join(ROOT, "assets/firebase-config.js")).read()):
        return print("Logins are not configured yet — the queue is empty.")
    try:
        items = pending()
    except urllib.error.HTTPError as e:
        return print(f"Could not read the queue (HTTP {e.code}) — check the Firestore rules are published. Skipping the queue this run.")
    for x in sorted(items, key=lambda x: x.get("created") or 0):
        q = re.sub(r"\s+", " ", x.get("question", ""))[:90]
        print(f"{x['_id']}  {x['course']:<10} by {x.get('author', '?')}  images={len(x.get('images') or [])}  {q}")
    print(f"{len(items)} queued question(s) waiting")


def cmd_get(qid):
    x = next((i for i in fetch_queue() if i["_id"] == qid), None)
    if not x:
        sys.exit(f"{qid} is not in the queue")
    folder = os.path.join(ROOT, "assets/img", f"community-{x['course']}")
    for key in ("images", "answer_images"):
        x[key] = [p for k, d in enumerate(x.get(key) or [], 1) if (p := save_image(d, os.path.join(folder, f"q-{qid}-{key[0]}{k}")))]
    for j, p in enumerate(x.get("prev") or [], 1):
        p["images"] = [s for k, d in enumerate(p.get("images") or [], 1) if (s := save_image(d, os.path.join(folder, f"q-{qid}-p{j}-{k}")))]
    out = {k: x.get(k) for k in ("course", "kind", "question", "options", "correct", "answer", "answer_type", "difficulty",
                                 "dotpoints", "images", "answer_images", "prev", "source", "author") if x.get(k) not in (None, "", [])}
    out["queue_id"] = qid
    os.makedirs(os.path.join(ROOT, "work/queue"), exist_ok=True)
    path = os.path.join(ROOT, f"work/queue/{qid}.json")
    json.dump(out, open(path, "w"), ensure_ascii=False, indent=2)
    print(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\nwrote {os.path.relpath(path, ROOT)} — complete answer, answer_type, marks (you decide), difficulty and dotpoints, then `add` it")


def cmd_add(path):
    x = json.load(open(path))
    c, qid = x.get("course"), x.get("queue_id")
    missing = [k for k in ("question", "answer", "marks", "difficulty", "dotpoints") if not x.get(k)]
    if c not in COURSES or not qid or missing:
        sys.exit(f"cannot add: course={c} queue_id={qid} missing={missing}")
    if x.get("kind") == "mc" and (len(x.get("options") or []) != 4 or x.get("correct") not in list("ABCD")):
        sys.exit("cannot add: multiple choice needs 4 options and a correct letter")
    paper = load_paper(c)
    if any(q.get("queue_id") == qid for q in paper["questions"]):
        sys.exit(f"{qid} is already published")
    item = {"ref": f"Q-{qid[:6]}", "kind": x.get("kind", "written"), "marks": int(x["marks"]), "difficulty": int(x["difficulty"]),
            "dotpoints": x["dotpoints"], "question": x["question"], "answer": x["answer"],
            "answer_type": x.get("answer_type") or ("sample" if c in ("physics", "chemistry", "biology") else "worked"),
            "images": x.get("images") or [], "answer_images": x.get("answer_images") or [],
            "source": x.get("source") or "Community question", "queue_id": qid}
    if x.get("author"):
        item["credit"] = re.sub(r"[<>]", "", x["author"])[:40]
    if item["kind"] == "mc":
        item["options"], item["correct"] = x["options"], x["correct"]
    if x.get("prev"):
        item["prev"] = [dict({k: p[k] for k in ("ref", "marks", "question", "answer", "images") if p.get(k) not in (None, "")}, kind="written")
                        for p in x["prev"]]
        for p in item["prev"]:
            p.setdefault("marks", 1)
    paper["questions"].append(item)
    paper["indexed"] = datetime.date.today().isoformat()
    os.makedirs(os.path.dirname(community_path(c)), exist_ok=True)
    json.dump(paper, open(community_path(c), "w"), ensure_ascii=False, indent=1)
    print(f"published {qid} to {os.path.relpath(community_path(c), ROOT)} — now run scripts/build.py")


def cmd_skip(qid, reason):
    s = skipped()
    s[qid] = {"reason": reason, "date": datetime.date.today().isoformat()}
    json.dump(s, open(SKIPPED, "w"), indent=1)
    print(f"skipped {qid}: {reason}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] == "list":
        cmd_list()
    elif a[0] == "get" and len(a) > 1:
        cmd_get(a[1])
    elif a[0] == "add" and len(a) > 1:
        cmd_add(a[1])
    elif a[0] == "skip" and len(a) > 2:
        cmd_skip(a[1], a[2])
    else:
        sys.exit(__doc__)
