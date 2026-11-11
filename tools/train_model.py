import json, numpy as np, collections, warnings, re, sys
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfTransformer, TfidfVectorizer
from sklearn.svm import LinearSVC
import scipy.sparse as sp
warnings.filterwarnings("ignore")
PRUNE=float(sys.argv[1]) if len(sys.argv)>1 else 0.01
D=[d for d in json.load(open("corpus.json")) if d["topics"]]
def feats(d):
    f=collections.Counter(d["qt"])
    for t in d["st"]: f["s:"+t]+=1; f[t]+=1
    return f
def raw(d): return re.sub(r"\s+"," ",(d["q"]+" "+d["s"]).lower()).strip()
checks=[]
model={"version":2,"trained":"NESA HSC 2019-2025 exams, labelled by marking-guideline mapping grids","subjects":{}}
for s in sorted(set(d["subject"] for d in D)):
    docs=[d for d in D if d["subject"]==s]; X=[];R=[];Y=[];W=[];docs_x=[]
    for d in docs:
        for t in d["topics"]: X.append(feats(d)); R.append(raw(d)); Y.append(t); W.append(1/len(d["topics"])); docs_x.append(d)
    dv=DictVectorizer(); tf=TfidfTransformer(sublinear_tf=True); A=tf.fit_transform(dv.fit_transform(X))
    cv=TfidfVectorizer(analyzer="char_wb",ngram_range=(2,4),sublinear_tf=True,min_df=2); C=cv.fit_transform(R)
    clf=LinearSVC(C=1).fit(sp.hstack([A,C]).tocsr(),Y,sample_weight=W)
    names=["w|"+f for f in dv.feature_names_] + ["c|"+g for g in cv.get_feature_names_out()]
    idf=list(tf.idf_)+list(cv.idf_)
    coef=clf.coef_; topics=list(clf.classes_)
    feat={}
    for j,nm in enumerate(names):
        col=coef[:,j]; keep=[(i,round(float(col[i]),3)) for i in range(len(topics)) if abs(col[i])>=PRUNE]
        feat[nm]=[round(float(idf[j]),3)]+[x for p in keep for x in p]
    model["subjects"][s]={"topics":topics,"b":[round(float(x),4) for x in clf.intercept_],"f":feat}
    Xall=sp.hstack([A,C]).tocsr(); dec=clf.decision_function(Xall[:len(X):7])
    checks.extend({"subject":s,"q":docs_x[i]["q"],"s":docs_x[i]["s"],"dec":dict(zip(topics,[float(v) for v in dec[k]]))} for k,i in enumerate(range(0,len(X),7)))
    print(s, len(topics), "topics,", len(feat), "features kept of", len(names))
json.dump(model, open("model.json","w"), separators=(",",":"), ensure_ascii=False)
import os, gzip; print("model.json", round(os.path.getsize("model.json")/1e6,2), "MB, gzipped", round(len(gzip.compress(open("model.json","rb").read()))/1e6,2), "MB")

json.dump(checks, open("site/checks.json","w"))
print("checks", len(checks))
