#!/usr/bin/env python3
"""Community questions sent from submit.html as GitHub issues titled "[Submission] ...".

They are published automatically by .github/workflows/submissions.yml (no review):
    python3 scripts/submissions.py event          # run by the workflow; reads $GITHUB_EVENT_PATH
To remove a published question (repo owner/collaborators): delete its issue, add the label `remove`,
or comment `/delete` on it.  The question is taken off the site within a couple of minutes.

Manual tools:
    python3 scripts/submissions.py list           # open/failed submissions
    python3 scripts/submissions.py publish 12     # (re)publish issue #12 (writes files only; no commit)
    python3 scripts/submissions.py remove 12      # take issue #12's question off the site (files only)
"""
import json, os, re, subprocess, sys, datetime, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.environ.get("GITHUB_REPOSITORY", "Planeman653/betterhscpapers")
COURSES = ["advanced", "extension1", "extension2", "physics", "chemistry"]
KEEP = ("kind", "marks", "difficulty", "dotpoints", "question", "options", "correct", "answer",
        "answer_type", "source", "credit", "prev")
STAFF = ("OWNER", "MEMBER", "COLLABORATOR")


def gh(*args):
    r = subprocess.run(["gh", "api", *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip())
    return json.loads(r.stdout) if r.stdout.strip() else None


def comment(n, body):
    try:
        gh(f"repos/{REPO}/issues/{n}/comments", "-f", f"body={body}")
    except Exception as e:
        print("comment failed:", e)


def paper_path(c):
    return os.path.join(ROOT, "data/papers", c, f"community-{c}.json")


def load_paper(c):
    fp = paper_path(c)
    if os.path.exists(fp):
        return json.load(open(fp))
    return {"id": f"community-{c}", "course": c, "school": "Community", "year": datetime.date.today().year,
            "type": "Submitted", "label": "Community submissions", "community": True, "answers": "worked",
            "questions": []}


def save_paper(c, paper):
    fp = paper_path(c)
    if not paper["questions"]:
        if os.path.exists(fp):
            os.remove(fp)
        return
    paper["indexed"] = datetime.date.today().isoformat()
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    json.dump(paper, open(fp, "w"), ensure_ascii=False, indent=1)


def parse(body):
    m = re.search(r"```json\s*(\{.*?\})\s*```", body or "", re.S)
    if not m:
        return None, "I couldn't find the question data (the ```json block) in this issue."
    try:
        return json.loads(m.group(1)), None
    except Exception as e:
        return None, f"The question data isn't valid JSON ({e}). Please submit again from the site."


def image_urls(body):
    body = re.sub(r"```.*?```", "", body or "", flags=re.S)
    urls = re.findall(r"!\[[^\]]*\]\((https://[^)\s]+)\)", body) + re.findall(r'<img[^>]+src="(https://[^"]+)"', body)
    return list(dict.fromkeys(urls))


def download(url, dest):
    tok = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    last = None
    for hdr in ({}, {"Authorization": f"token {tok}"} if tok else None):
        if hdr is None:
            continue
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "betterhscpapers", **hdr})
            with urllib.request.urlopen(req, timeout=60) as r:
                data, ctype = r.read(), r.headers.get("Content-Type", "")
            if not ctype.startswith("image/"):
                raise ValueError(f"not an image ({ctype})")
            ext = {"image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp"}.get(ctype.split(";")[0], ".png")
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            open(dest + ext, "wb").write(data)
            return os.path.relpath(dest + ext, ROOT)
        except Exception as e:
            last = e
    raise RuntimeError(f"{url}: {last}")


def find(n):
    """(course, paper, index) of the question published from issue n, if any."""
    for c in COURSES:
        p = load_paper(c)
        for i, q in enumerate(p["questions"]):
            if q.get("issue") == n:
                return c, p, i
    return None, None, None


def drop_images(q):
    for x in [q] + list(q.get("prev") or []):
        for img in (x.get("images") or []) + (x.get("answer_images") or []):
            if img.startswith("assets/img/community-") and os.path.exists(os.path.join(ROOT, img)):
                os.remove(os.path.join(ROOT, img))


def remove(n):
    c, p, i = find(n)
    if c is None:
        return False
    drop_images(p["questions"][i])
    del p["questions"][i]
    save_paper(c, p)
    return True


def build_item(n, q, body, author):
    if q.get("course") not in COURSES:
        raise ValueError(f"unknown subject '{q.get('course')}'")
    item = {k: q[k] for k in KEEP if k in q and q[k] not in (None, "", [])}
    if item.get("kind") == "mc" and not item.get("answer") and item.get("correct"):
        item["answer"] = f"**{item['correct']}**"
    item["ref"] = f"S{n}"
    item["issue"] = n
    item["author"] = author
    if q.get("client_id"):
        item["client_id"] = str(q["client_id"])[:40]
    item.setdefault("source", "Community question")
    item.setdefault("answer_type", "sample" if q["course"] in ("physics", "chemistry") else "worked")
    if isinstance(item.get("difficulty"), str) and item["difficulty"].isdigit():
        item["difficulty"] = int(item["difficulty"])
    if item.get("credit"):
        item["credit"] = re.sub(r"[<>]", "", item["credit"])[:40]
    # diagrams, in the order they were dragged into the issue
    urls = image_urls(body)
    folder = os.path.join(ROOT, "assets/img", f"community-{q['course']}")
    paths = [download(u, os.path.join(folder, f"s{n}-{k}")) for k, u in enumerate(urls, 1)]
    want = q.get("diagrams") or {}
    nq, na, np_ = want.get("question", len(paths)), want.get("answer", 0), list(want.get("prev", []))
    item["images"], item["answer_images"] = paths[:nq], paths[nq:nq + na]
    rest = paths[nq + na:]
    prev = []
    for k, x in enumerate(item.get("prev") or []):
        cnt = np_[k] if k < len(np_) else 0
        part = {kk: x[kk] for kk in ("ref", "marks", "question", "answer") if x.get(kk) not in (None, "")}
        part["kind"] = "written"
        part["images"], rest = rest[:cnt], rest[cnt:]
        prev.append(part)
    if prev:
        item["prev"] = prev
    item["images"] += rest
    return q["course"], item


def publish(n, issue=None):
    issue = issue or gh(f"repos/{REPO}/issues/{n}")
    q, err = parse(issue.get("body"))
    if err:
        raise ValueError(err)
    c_old, p_old, i_old = find(n)
    if c_old is not None:            # an edit: replace the earlier version
        drop_images(p_old["questions"][i_old])
        del p_old["questions"][i_old]
        save_paper(c_old, p_old)
    c, item = build_item(n, q, issue.get("body"), issue["user"]["login"])
    p = load_paper(c)
    p["questions"].append(item)
    save_paper(c, p)
    return c, item


def check():
    r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts/build.py")], capture_output=True, text=True, cwd=ROOT)
    return r.returncode == 0, (r.stdout + r.stderr).strip()


def site_url(c, item):
    return f"https://planeman653.github.io/betterhscpapers/{c}.html#community-{c}-{item['issue']}"


def event():
    ev = json.load(open(os.environ["GITHUB_EVENT_PATH"]))
    name, action = os.environ.get("GITHUB_EVENT_NAME"), ev.get("action")
    issue = ev.get("issue") or {}
    n = issue.get("number")
    if not issue.get("title", "").startswith("[Submission]") or "pull_request" in issue:
        return print("not a submission")
    removing = (name == "issues" and action == "deleted") \
        or (name == "issues" and action == "labeled" and ev.get("label", {}).get("name") == "remove") \
        or (name == "issue_comment" and action == "created" and ev["comment"]["body"].strip().lower().startswith("/delete")
            and ev["comment"].get("author_association") in STAFF)
    if removing:
        if remove(n):
            ok, out = check()
            print(out)
            if not ok:
                sys.exit(1)
            write_out(f"Remove community question #{n}")
            if action != "deleted":
                comment(n, "Removed from the site.")
        return print(f"removed #{n}")
    if name == "issues" and action in ("opened", "edited", "reopened"):
        if any(l.get("name") == "remove" for l in issue.get("labels", [])):
            return print("labelled remove; not publishing")
        try:
            c, item = publish(n, issue)
        except Exception as e:
            comment(n, f"⚠️ This question couldn't be published: {e}\n\nEdit the issue to fix it, or submit again from the site.")
            return print("failed:", e)
        ok, out = check()
        if not ok:
            subprocess.run(["git", "checkout", "--", "."], cwd=ROOT)
            subprocess.run(["git", "clean", "-fdq", "data/papers", "assets/img"], cwd=ROOT)
            errs = "\n".join(l for l in out.splitlines() if "community-" in l) or out[-1500:]
            comment(n, f"⚠️ This question couldn't be published because it didn't pass the site's checks:\n\n```\n{errs}\n```\n\n"
                       "Edit the issue to fix it (the JSON block), or submit again from the site.")
            return print(out)
        write_out(f"Publish community question #{n} ({c})")
        if action == "opened":
            comment(n, f"✅ Published: {site_url(c, item)}\n\nIt will be live within a couple of minutes. "
                       "Editing this issue updates the question.\n\n"
                       "_Site owner: to remove it, delete this issue, add the `remove` label, or comment `/delete`._")
        return print(f"published #{n}")


def write_out(msg):
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        open(out, "a").write(f"commit_message={msg}\n")


def cmd_list():
    out = gh(f"repos/{REPO}/issues?state=all&per_page=100")
    live = {q.get("issue") for c in COURSES for q in load_paper(c)["questions"]}
    for i in out:
        if "pull_request" in i or not i["title"].startswith("[Submission]"):
            continue
        print(f"#{i['number']}  {'LIVE ' if i['number'] in live else 'not live'}  @{i['user']['login']}  {i['title'][:80]}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] == "list":
        cmd_list()
    elif a[0] == "event":
        event()
    elif a[0] == "publish":
        c, item = publish(int(a[1])); print("published to", c, "— now run scripts/build.py")
    elif a[0] == "remove":
        print("removed" if remove(int(a[1])) else "not found", "— now run scripts/build.py")
    else:
        sys.exit(__doc__)
