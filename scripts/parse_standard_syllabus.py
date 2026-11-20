#!/usr/bin/env python3
"""Build Mathematics Standard 1 and Standard 2 syllabus JSON from saved NESA curriculum web pages.

The NESA Mathematics Standard 11–12 Syllabus (2024) is only offered as a generated download, so this reads
the focus-area pages of curriculum.nsw.edu.au (saved as HTML) instead.  Each page embeds its focus area
(topic) -> content groups (subtopics) -> content items (dot points) as Next.js JSON; maths is MathML.

Usage: python3 scripts/parse_standard_syllabus.py <dir-with-saved-pages> data/syllabus
  Saved page names: y11_<fa>.html (Year 11, common), t1_<fa>.html (Year 12 Standard 1), t2_<fa>.html (Standard 2)
  in the order the focus areas appear in the syllabus (FA_ORDER below).
Year 12 course names are "TBA 1" / "TBA 2" on the NESA site; they replace Standard 1 / Standard 2.
"""
import html as H, json, os, re, sys
import xml.etree.ElementTree as ET

FA_ORDER = {
    "y11": ["fa346f5353", "fabe84d89c", "faacdf9b3d", "fa8d2fb431", "fad74ae493", "fa136ea49c", "fabf235394", "fa4de413b8"],
    "t1": ["fa493dfdfb", "faf818a3d6", "fa9ea10adb", "fa9c5d0bea", "faf13dc7b0", "faf283a852", "fa473a4513"],
    "t2": ["faf5e47f4a", "fac80cab35", "faa14f8aa3", "fa6dd765ae", "fa96edbda5", "fafe0a915b", "fa9c92c4c6",
           "fadb5e412c", "fae778ced4", "fa92309f60"],
}
OPS = {"×": r"\times", "÷": r"\div", "−": "-", "≤": r"\le", "≥": r"\ge", "≠": r"\ne", "±": r"\pm", "π": r"\pi",
       "θ": r"\theta", "°": r"^\circ", "…": r"\ldots", "⋯": r"\cdots", "∞": r"\infty", "→": r"\to", "σ": r"\sigma",
       "μ": r"\mu", "Σ": r"\Sigma", "≈": r"\approx", "⁡": "", "⁡": "", "⁢": "", " ": " "}


def tex(el):
    tag = el.tag.split("}")[-1]
    kids = list(el)
    t = (el.text or "").strip()
    if tag in ("math", "mrow", "mstyle", "semantics", "mpadded"):
        return "".join(tex(k) for k in kids)
    if tag in ("mi", "mn", "mo", "mtext"):
        s = "".join(OPS.get(c, c) + (" " if OPS.get(c, "").startswith("\\") else "") for c in t)
        if tag == "mtext":
            return r"\text{" + t + "}" if t.strip() else " "
        if tag == "mi" and t in ("sin", "cos", "tan", "log", "ln"):
            return "\\" + t + " "
        if tag == "mi" and (" " in t or len(t) > 3):
            return r"\text{" + t + "}"
        if tag == "mi" and len(t) > 1 and t.isalpha() and t.isupper():
            return r"\mathrm{" + t + "}"
        return s
    if tag == "msup":
        return "{" + tex(kids[0]) + "}^{" + tex(kids[1]) + "}"
    if tag == "msub":
        return "{" + tex(kids[0]) + "}_{" + tex(kids[1]) + "}"
    if tag == "msubsup":
        return "{" + tex(kids[0]) + "}_{" + tex(kids[1]) + "}^{" + tex(kids[2]) + "}"
    if tag == "mfrac":
        return r"\frac{" + tex(kids[0]) + "}{" + tex(kids[1]) + "}"
    if tag == "msqrt":
        return r"\sqrt{" + "".join(tex(k) for k in kids) + "}"
    if tag == "mroot":
        return r"\sqrt[" + tex(kids[1]) + "]{" + tex(kids[0]) + "}"
    if tag == "mfenced":
        return "(" + ",".join(tex(k) for k in kids) + ")"
    if tag == "mover":
        return r"\overline{" + tex(kids[0]) + "}"
    if tag == "munderover" or tag == "munder":
        return "".join(tex(k) for k in kids)
    return "".join(tex(k) for k in kids) or t


def rich(s, comps):
    """Rich-text HTML (with component objects and MathML) -> plain text with $TeX$."""
    s = re.sub(r'<object[^>]*data-codename="([^"]+)"[^>]*></object>', lambda m: comps.get(m.group(1), ""), s)

    def mm(m):
        try:
            x = ET.fromstring(m.group(0).replace("&nbsp;", " "))
            return " $" + re.sub(r"\s+", " ", tex(x)).strip() + "$ "
        except ET.ParseError:
            return re.sub("<[^>]+>", "", m.group(0))
    s = re.sub(r"<math\b.*?</math>", mm, s, flags=re.S)
    s = re.sub(r"<[^>]+>", "", s)
    s = H.unescape(s).replace("\xa0", " ")
    s = re.sub(r"\$\s*\$", "", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+([,.;:)’'\-])", r"\1", s).replace("( ", "(")
    return s.strip()


def focus_area(path):
    s = open(path, encoding="utf-8").read()
    d = json.loads(re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', s, re.S).group(1))
    fa = d["props"]["pageProps"]["data"]["focusArea"]
    li = fa["linkedItems"]
    comps = {k: v["elements"]["content"]["value"] for k, v in li.items() if v["system"]["type"] == "math_content"}
    e = fa["item"]["elements"]
    subs = []
    for cg in e["contentgroups"]["value"]:
        g = li[cg]["elements"]
        dps = [rich(li[ci]["elements"]["title"]["value"], comps) for ci in g["content_items"]["value"] if ci in li]
        nm = rich(g["title"]["value"], comps) or e["title"]["value"].strip()
        subs.append({"name": nm, "dotpoints": [x for x in dps if x]})
    return {"name": e["title"]["value"].strip(), "subtopics": subs}


def year(n, topics):
    for ti, t in enumerate(topics, 1):
        t["id"] = f"{n}.{ti}"
        for si, sb in enumerate(t["subtopics"], 1):
            sb["id"] = f"{t['id']}.{si}"
            sb["dotpoints"] = [{"id": f"{sb['id']}.{di}", "text": x} for di, x in enumerate(sb["dotpoints"], 1)]
    return {"year": n, "topics": topics}


def main(src, out):
    y11 = [focus_area(os.path.join(src, f"y11_{f}.html")) for f in FA_ORDER["y11"]]
    for cid, name, key in [("standard1", "Mathematics Standard 1", "t1"), ("standard2", "Mathematics Standard 2", "t2")]:
        y12 = [focus_area(os.path.join(src, f"{key}_{f}.html")) for f in FA_ORDER[key]]
        doc = {"course": cid, "name": name, "syllabus": "NESA Mathematics Standard 11–12 (2024)",
               "years": [year(11, json.loads(json.dumps(y11))), year(12, y12)]}
        json.dump(doc, open(os.path.join(out, f"{cid}.json"), "w"), ensure_ascii=False, indent=1)
        with open(os.path.join(out, f"{cid}.txt"), "w") as f:
            for y in doc["years"]:
                for t in y["topics"]:
                    f.write(f"## {t['id']} {t['name']}\n")
                    for sb in t["subtopics"]:
                        f.write(f"### {sb['id']} {sb['name']}\n")
                        for p in sb["dotpoints"]:
                            f.write(f"{p['id']} {p['text']}\n")
        print(cid, sum(len(sb["dotpoints"]) for y in doc["years"] for t in y["topics"] for sb in t["subtopics"]), "dot points")


if __name__ == "__main__":
    main(*sys.argv[1:3])
