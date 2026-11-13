#!/usr/bin/env python3
"""Review questions sent in from submit.html (GitHub issues titled "[Submission] ...").

    python3 scripts/submissions.py list                 # open submissions
    python3 scripts/submissions.py get 12               # -> work/submissions/12.json (+ diagrams downloaded)
    python3 scripts/submissions.py add work/submissions/12.json   # append to data/papers/<course>/community-<course>.json
    python3 scripts/submissions.py close 12 "message"   # comment and close the issue

Review the .json from `get` before `add`: fix maths/wording, check the answer, dot points and difficulty.
Then run scripts/build.py, commit, push, and close the issue with a short note.
"""
import json, os, re, subprocess, sys, datetime, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "Planeman653/betterhscpapers"
COURSES = ["advanced", "extension1", "extension2", "physics", "chemistry"]
KEEP = ("course", "kind", "marks", "difficulty", "dotpoints", "question", "options", "correct", "answer",
        "answer_type", "source", "credit", "prev", "images", "answer_images")


def gh(*args, data=None):
    r = subprocess.run(["gh", "api", *args], capture_output=True, text=True, input=data)
    if r.returncode:
        sys.exit(r.stderr.strip())
    return json.loads(r.stdout) if r.stdout.strip() else None


def issues():
    out = gh(f"repos/{REPO}/issues?state=open&per_page=100")
    return [i for i in out if "pull_request" not in i and i["title"].startswith("[Submission]")]


def parse(body):
    m = re.search(r"```json\s*(\{.*?\})\s*```", body or "", re.S) or re.search(r"(\{.*\})", body or "", re.S)
    if not m:
        return None, "no JSON block"
    try:
        return json.loads(m.group(1)), None
    except Exception as e:
        return None, f"bad JSON: {e}"


def image_urls(body):
    body = re.sub(r"```.*?```", "", body or "", flags=re.S)
    urls = re.findall(r"!\[[^\]]*\]\((https://[^)\s]+)\)", body) + re.findall(r'<img[^>]+src="(https://[^"]+)"', body)
    return list(dict.fromkeys(urls))


def download(url, dest):
    tok = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True).stdout.strip()
    req = urllib.request.Request(url, headers={"Authorization": f"token {tok}", "User-Agent": "betterhscpapers"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data, ctype = r.read(), r.headers.get("Content-Type", "")
    ext = ".jpg" if "jpeg" in ctype else ".gif" if "gif" in ctype else ".webp" if "webp" in ctype else ".png"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest + ext, "wb").write(data)
    return os.path.relpath(dest + ext, ROOT)


def cmd_list():
    for i in issues():
        q, err = parse(i["body"])
        what = err or f"{q.get('course')} {','.join(q.get('dotpoints', []))} {q.get('marks')}m"
        print(f"#{i['number']}  @{i['user']['login']}  {what}  images={len(image_urls(i['body']))}  {i['title'][:70]}")


def cmd_get(n):
    i = gh(f"repos/{REPO}/issues/{n}")
    q, err = parse(i["body"])
    if err:
        sys.exit(f"#{n}: {err}")
    if q.get("course") not in COURSES:
        sys.exit(f"#{n}: bad course {q.get('course')}")
    urls = image_urls(i["body"])
    paths, failed = [], []
    for k, u in enumerate(urls, 1):
        try:
            paths.append(download(u, os.path.join(ROOT, "assets/img", f"community-{q['course']}", f"s{n}-{k}")))
        except Exception as e:
            failed.append(f"{u} ({e})")
    want = q.pop("diagrams", None) or {}
    nq, na = want.get("question", 0), want.get("answer", 0)
    q["images"], q["answer_images"] = paths[:nq], paths[nq:nq + na]
    rest = paths[nq + na:]
    for p, cnt in zip(q.get("prev", []) or [], want.get("prev", [])):
        p["images"], rest = rest[:cnt], rest[cnt:]
    if len(paths) > nq + na + sum(want.get("prev", [])):
        q["images"] += rest
    q["_issue"], q["_author"] = n, i["user"]["login"]
    os.makedirs(os.path.join(ROOT, "work/submissions"), exist_ok=True)
    path = os.path.join(ROOT, f"work/submissions/{n}.json")
    json.dump(q, open(path, "w"), ensure_ascii=False, indent=2)
    print(json.dumps(q, ensure_ascii=False, indent=2))
    print(f"\nwrote {os.path.relpath(path, ROOT)}  ({len(paths)} image(s) downloaded"
          + (f"; FAILED: {failed}" if failed else "")
          + (f"; expected {nq + na + sum(want.get('prev', []))}" if want and len(paths) != nq + na + sum(want.get('prev', [])) else "") + ")")


def cmd_add(path):
    q = json.load(open(path))
    c = q["course"]
    fp = os.path.join(ROOT, "data/papers", c, f"community-{c}.json")
    paper = json.load(open(fp)) if os.path.exists(fp) else {
        "id": f"community-{c}", "course": c, "school": "Community", "year": datetime.date.today().year,
        "type": "Submitted", "label": "Community submissions", "community": True, "answers": "worked", "questions": []}
    n = q.get("_issue")
    if n and any(x.get("issue") == n for x in paper["questions"]):
        sys.exit(f"issue #{n} is already in {os.path.relpath(fp, ROOT)}")
    item = {k: q[k] for k in KEEP if k in q and q[k] not in (None, "", [])}
    item.pop("course", None)
    item["ref"] = f"S{len(paper['questions']) + 1}"
    item.setdefault("source", "Community question")
    item.setdefault("answer_type", "sample" if c in ("physics", "chemistry") else "worked")
    item.setdefault("images", []); item.setdefault("answer_images", [])
    if item.get("prev"):
        item["prev"] = [{k: p[k] for k in ("ref", "marks", "question", "answer", "images") if p.get(k) not in (None, "")} | {"kind": "written"}
                        for p in item["prev"]]
    if n:
        item["issue"] = n
    paper["questions"].append(item)
    paper["indexed"] = datetime.date.today().isoformat()
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    json.dump(paper, open(fp, "w"), ensure_ascii=False, indent=1)
    print(f"added as {item['ref']} to {os.path.relpath(fp, ROOT)} — now run scripts/build.py")


def cmd_close(n, msg):
    gh(f"repos/{REPO}/issues/{n}/comments", "-f", f"body={msg}")
    gh(f"repos/{REPO}/issues/{n}", "-X", "PATCH", "-f", "state=closed")
    print(f"closed #{n}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] == "list":
        cmd_list()
    elif a[0] == "get":
        cmd_get(int(a[1]))
    elif a[0] == "add":
        cmd_add(a[1])
    elif a[0] == "close":
        cmd_close(int(a[1]), a[2] if len(a) > 2 else "Thanks — closing.")
    else:
        sys.exit(__doc__)
