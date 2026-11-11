#!/usr/bin/env python3
"""Parse a NESA Stage 6 (2017) science syllabus (.docx) into the same JSON shape as the maths syllabuses.

Only the Year 12 modules (5-8) are kept, since the HSC examines Year 12 content.
IDs: "12.<module>.<inquiry-question>.<dot point>", e.g. 12.5.1.3 = Module 5, first inquiry question, third dot point.

Usage: python3 scripts/parse_science_syllabus.py <syllabus.docx> <course-id> <course-name> <out.json>
"""
import json, re, subprocess, sys

def clean(s):
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?", "", s)      # icons
    s = re.sub(r"\[([^\]]*)\]\{[^}]*\}", r"\1", s)              # [text]{.mark}
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)              # links
    s = re.sub(r"\s*\(AC[A-Z]{2,4}\d+[^)]*\)", "", s)           # (ACSPH099) codes
    s = re.sub(r"(?<!\\)\*\*?([^*]*)\*\*?", r"\1", s)
    s = re.sub(r"\$\$(.+?)\$\$", lambda m: "$" + m.group(1).strip() + "$", s)
    parts = s.split("$")                                       # sub/superscripts only outside maths
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r"~([^~\s]+)~", r"$_{\1}$", parts[i])          # pandoc subscript K~eq~
        parts[i] = re.sub(r"\^([^^\s]+)\^", r"$^{\1}$", parts[i])        # pandoc superscript
    s = "$".join(parts)
    s = s.replace("\\'", "'").replace('\\"', '"').replace("--", "–").replace("\\[", "[").replace("\\]", "]")
    return re.sub(r"\s+", " ", s).strip()

def main(docx, cid, cname, out):
    md = subprocess.run(["pandoc", docx, "-t", "markdown", "--wrap=none"], capture_output=True, text=True).stdout.splitlines()
    topics, topic, sub, in_content, cur = [], None, None, False, None
    for raw in md:
        h = re.match(r"^(#{1,4})\s+(.*)$", raw)
        if h:
            lvl, txt = len(h.group(1)), clean(h.group(2))
            m = re.match(r"Module (\d+): (.*)", txt)
            if lvl == 2 and m and int(m.group(1)) >= 5:
                topic = {"id": f"12.{m.group(1)}", "name": f"Module {m.group(1)}: {m.group(2)}", "subtopics": []}
                topics.append(topic); sub = None; in_content = False
            elif lvl <= 2:
                topic = None
            elif topic and lvl == 3:
                in_content = (txt == "Content"); sub = None
            elif topic and in_content and lvl == 4:
                sub = {"id": f"{topic['id']}.{len(topic['subtopics']) + 1}", "name": txt, "inquiry": "", "dotpoints": []}
                topic["subtopics"].append(sub)
            continue
        if not (topic and in_content and sub):
            continue
        iq = re.match(r"\*\*Inquiry question\*?\*?\s*:?\s*\*?\*?\s*:?\s*(.*)", raw.strip())
        if iq:
            sub["inquiry"] = clean(iq.group(1)); continue
        if raw.startswith("-   "):
            cur = [clean(raw[4:]), []]; sub["dotpoints"].append(cur)
        elif re.match(r"^ {4}-   ", raw) and cur:
            cur[1].append(clean(raw.strip()[4:]))
        elif raw.startswith("    ") and raw.strip() and cur and not cur[1]:
            cur[0] += " " + clean(raw)
    for t in topics:
        for s in t["subtopics"]:
            dps = []
            items = [(t, k) for t, k in s["dotpoints"] if t.strip(" \\")]
            for i, (text, kids) in enumerate(items, 1):
                if kids:
                    text = text.rstrip(":") + ": " + "; ".join(k.rstrip(";.") for k in kids)
                dps.append({"id": f"{s['id']}.{i}", "text": text})
            s["dotpoints"] = dps
    data = {"course": cid, "name": cname, "syllabus": "NESA Stage 6 (2017)", "years": [{"year": 12, "topics": topics}]}
    json.dump(data, open(out, "w"), ensure_ascii=False, indent=1)
    for t in topics:
        print(t["id"], t["name"])
        for s in t["subtopics"]:
            print("   ", s["id"], s["name"], len(s["dotpoints"]), "|", s["inquiry"][:70])

if __name__ == "__main__":
    main(*sys.argv[1:5])
