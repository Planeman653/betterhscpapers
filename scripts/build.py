#!/usr/bin/env python3
"""Validate every paper in data/papers/ and build the per-course files the site loads.

    python3 scripts/build.py          # validate + write data/build/*.json
    python3 scripts/build.py --check  # validate only

Paper file schema (data/papers/<course>/<paper-id>.json):
{
  "id": "ext2-2025-abbotsleigh",            # unique, equals file name
  "course": "extension2",                   # course of the PAPER
  "school": "Abbotsleigh", "year": 2025, "type": "Trial",   # or "HSC"
  "thsc": {"viewno": "5348", "title": "Abbotsleigh 2025 w. sol"},   # optional
  "indexed": "2026-11-11",
  "answers": "worked" | "short",
  "dropped": [{"ref": "Q14(c)", "reason": "Not in 2024 syllabus: ..."}],
  "questions": [{
     "ref": "Q11(b)(ii)",                   # reference in the original paper
     "kind": "mc" | "written",
     "marks": 2,
     "difficulty": 1-5,
     "course": "extension2",                # optional: page it belongs on (defaults to paper course)
     "dotpoints": ["12.3.4.2", ...],        # first one is the primary (used for grouping)
     "question": "Markdown with $LaTeX$",
     "options": ["...", "...", "...", "..."],   # MC only, A-D
     "images": ["assets/img/<paper-id>/q11b.png"],
     "answer": "Markdown with $LaTeX$",     # worked solution (or short answer)
     "answer_images": [],
     "correct": "B"                         # MC only
  }]
}
"""
import json, os, re, sys, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COURSES = ["advanced", "extension1", "extension2", "physics", "chemistry"]
LABEL = {"advanced": "Mathematics Advanced", "extension1": "Mathematics Extension 1",
         "extension2": "Mathematics Extension 2", "physics": "Physics", "chemistry": "Chemistry"}


def load_syllabus(c):
    d = json.load(open(os.path.join(ROOT, "data/syllabus", c + ".json")))
    dps = {}
    for y in d["years"]:
        for t in y["topics"]:
            for s in t["subtopics"]:
                for p in s["dotpoints"]:
                    dps[p["id"]] = (t["id"], s["id"])
    return dps


def balanced_dollars(text):
    t = re.sub(r"\\\$", "", text or "")
    t = t.replace("$$", "")
    return t.count("$") % 2 == 0


ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10}


def ref_key(ref):
    """Q16(a)(iv) -> (16, 1, 4) for ordering parts within a paper."""
    m = re.match(r"\s*Q?(\d+)", ref or "")
    key = [int(m.group(1)) if m else 0]
    for lvl, b in enumerate(re.findall(r"\(([^)]*)\)", ref or "")):
        b = b.strip().lower()
        if lvl >= 1 and b in ROMAN:
            key.append(ROMAN[b])
        elif b.isdigit():
            key.append(int(b))
        else:
            key.append(ord(b[0]) - 96 if b else 0)
    return tuple(key)


def ref_group(ref):
    """Q16(a)(iv) -> 'Q16(a)';  Q23(b) -> 'Q23';  Q7 -> None."""
    m = re.match(r"^(.*)\([^()]*\)\s*$", (ref or "").strip())
    return m.group(1) if m and "(" in ref else None


PREV_FIELDS = ("ref", "kind", "marks", "question", "options", "images", "answer", "answer_images", "correct")


def add_previous_parts(items, dropped):
    """Give each part the earlier parts of the same question (same paper), incl. dropped ones."""
    parts = [(ref_key(it["ref"]), it["ref"], {k: it[k] for k in PREV_FIELDS if k in it}) for it in items]
    for d in dropped:
        # a dropped ref may cover a range, e.g. Q12(a)-(b): file it under its first part
        first = re.split(r"\s*[-\u2013,]\s*", d.get("ref", ""))[0]
        parts.append((ref_key(first), first, {"ref": d.get("ref"), "dropped": d.get("reason", "")}))
    for it in items:
        g = ref_group(it["ref"])
        if not g:
            continue
        k = ref_key(it["ref"])
        prev = sorted((p for p in parts if p[1].startswith(g + "(") and p[0] < k), key=lambda p: p[0])
        if prev:
            it["prev"] = [p[2] for p in prev]


def main():
    check_only = "--check" in sys.argv
    syl = {c: load_syllabus(c) for c in COURSES}
    errors, out = [], {c: {"papers": {}, "questions": []} for c in COURSES}
    papers_meta = []
    for path in sorted(glob.glob(os.path.join(ROOT, "data/papers/*/*.json"))):
        rel = os.path.relpath(path, ROOT)
        try:
            p = json.load(open(path))
        except Exception as e:
            errors.append(f"{rel}: invalid JSON: {e}"); continue
        pid = p.get("id")
        if pid != os.path.splitext(os.path.basename(path))[0]:
            errors.append(f"{rel}: id '{pid}' must equal file name")
        if p.get("course") not in COURSES:
            errors.append(f"{rel}: bad course {p.get('course')}")
            continue
        label = f"{p['school']} {p['year']} {p.get('type', 'Trial')}"
        meta = {"id": pid, "course": p["course"], "school": p["school"], "year": p["year"],
                "type": p.get("type", "Trial"), "label": label, "answers": p.get("answers", "worked"),
                "thsc": p.get("thsc"), "indexed": p.get("indexed"),
                "count": len(p.get("questions", [])), "dropped": len(p.get("dropped", []))}
        papers_meta.append(meta)
        seen, paper_items = set(), []
        for i, q in enumerate(p.get("questions", []), 1):
            where = f"{rel} #{i} ({q.get('ref')})"
            c = q.get("course", p["course"])
            if c not in COURSES:
                errors.append(f"{where}: bad course {c}"); continue
            for k in ("ref", "kind", "marks", "difficulty", "dotpoints", "question", "answer"):
                if k not in q:
                    errors.append(f"{where}: missing '{k}'")
            if q.get("kind") not in ("mc", "written"):
                errors.append(f"{where}: kind must be mc|written")
            if q.get("kind") == "mc" and len(q.get("options", [])) != 4:
                errors.append(f"{where}: MC needs 4 options")
            if not isinstance(q.get("difficulty"), int) or not 1 <= q.get("difficulty", 0) <= 5:
                errors.append(f"{where}: difficulty must be int 1-5")
            if not q.get("dotpoints"):
                errors.append(f"{where}: needs at least one dot point")
            for d in q.get("dotpoints", []):
                if d not in syl[c]:
                    errors.append(f"{where}: dot point {d} not in {c} syllabus")
            for img in q.get("images", []) + q.get("answer_images", []):
                if not os.path.exists(os.path.join(ROOT, img)):
                    errors.append(f"{where}: missing image {img}")
            for fld in ("question", "answer"):
                if not balanced_dollars(q.get(fld)):
                    errors.append(f"{where}: unbalanced $ in {fld}")
            for o in q.get("options", []):
                if not balanced_dollars(o):
                    errors.append(f"{where}: unbalanced $ in option")
            ref = q.get("ref")
            if ref in seen:
                errors.append(f"{where}: duplicate ref {ref}")
            seen.add(ref)
            if q.get("dotpoints") and q["dotpoints"][0] in syl[c]:
                t, s = syl[c][q["dotpoints"][0]]
            else:
                t = s = None
            item = dict(q)
            item.update({"id": f"{pid}-{i:03d}", "paper": pid, "course": c, "topic": t, "subtopic": s, "seq": i})
            item.setdefault("images", []); item.setdefault("answer_images", [])
            out[c]["questions"].append(item)
            out[c]["papers"][pid] = meta
            paper_items.append(item)
        add_previous_parts(paper_items, p.get("dropped", []))
    if errors:
        print("\n".join(errors)); print(f"\n{len(errors)} error(s)"); sys.exit(1)
    total = sum(len(out[c]["questions"]) for c in COURSES)
    print(f"OK: {len(papers_meta)} papers, {total} questions "
          + ", ".join(f"{c}={len(out[c]['questions'])}" for c in COURSES))
    if check_only:
        return
    os.makedirs(os.path.join(ROOT, "data/build"), exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    for c in COURSES:
        out[c]["generated"] = now
        out[c]["course"] = c
        json.dump(out[c], open(os.path.join(ROOT, "data/build", c + ".json"), "w"),
                  ensure_ascii=False, separators=(",", ":"))
    stats = {"generated": now,
             "courses": {c: {"name": LABEL[c], "questions": len(out[c]["questions"]),
                             "papers": len(out[c]["papers"])} for c in COURSES},
             "papers": sorted(papers_meta, key=lambda m: (-m["year"], m["course"], m["school"]))}
    json.dump(stats, open(os.path.join(ROOT, "data/build/stats.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
