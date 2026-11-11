import json, requests, re, sys
from playwright.sync_api import sync_playwright
CA="/root/.ccr/ca-bundle.crt"; cache={}
def cdn(route):
    u=route.request.url
    if u not in cache:
        r=requests.get(u,verify=CA,timeout=120); cache[u]=(r.status_code,r.content,r.headers.get("content-type","application/javascript"))
    s,b,ct=cache[u]; route.fulfill(status=s,body=b,headers={"content-type":ct,"access-control-allow-origin":"*"})
SUBJ={"mathematics-advanced":"Mathematics Advanced","mathematics-extension-1":"Mathematics Extension 1","mathematics-extension-2":"Mathematics Extension 2","physics":"Physics","chemistry":"Chemistry"}
pairs={}
for line in open("../real/links.txt"):
    s,y,path=line.split(); f=path.split("/")[-1]
    if "feedback" in f: continue
    k=(s,y); pairs.setdefault(k,{})["mg" if re.search(r"-mg\.pdf$",f) else "ex"]=f
out=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome"); ctx=b.new_context()
    ctx.route("https://cdnjs.cloudflare.com/**",cdn); ctx.route("https://fonts.googleapis.com/**",lambda r:r.abort())
    pg=ctx.new_page(); pg.goto("http://localhost:8765/#build"); pg.wait_for_timeout(1000)
    for (s,y),d in sorted(pairs.items()):
        subj=SUBJ[s]
        res=pg.evaluate("""async ([subj, ex, mg]) => {
          const f = async u => new File([await (await fetch(u)).blob()], u, {type:'application/pdf'});
          const pages = await renderPdfPages(await f(ex),'exam',{textOnly:true});
          const gpages = await renderPdfPages(await f(mg),'guide',{textOnly:true});
          const items = splitExam(pages, SUBJECTS[subj].split);
          const g = parseGuide(gpages); applyGuide(items, g, subj);
          return items.map(it=>({label:it.label, type:it.type, marks:it.marks, topics: it.topicSource==='grid'?it.topics:[], q:it.text.join(' '), s:(it.solText||[]).join(' '), qt:tokenize(it.text.join(' ')), st:tokenize((it.solText||[]).join(' '))}));
        }""", [subj, "corpus/"+d["ex"], "corpus/"+d["mg"]])
        tot=sum(i["marks"] for i in res); lab=sum(1 for i in res if i["topics"])
        print(f"{subj:25} {y}: {len(res):3} items, {tot:3} marks, {lab:3} labelled", flush=True)
        for i in res: i.update(subject=subj, year=int(y))
        out+=res
    b.close()
json.dump(out, open("corpus.json","w"))
print("total", len(out))
