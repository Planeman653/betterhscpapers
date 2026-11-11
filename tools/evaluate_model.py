import json, numpy as np, collections, warnings, re, scipy.sparse as sp
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfTransformer, TfidfVectorizer
from sklearn.svm import LinearSVC
warnings.filterwarnings("ignore")
D=[d for d in json.load(open("corpus.json")) if d["topics"]]
SUBJ=sorted(set(d["subject"] for d in D))
def feats(d):
    f=collections.Counter(d["qt"])
    for t in d["st"]: f["s:"+t]+=1; f[t]+=1
    return f
def raw(d): return re.sub(r"\s+"," ",(d["q"]+" "+d["s"]).lower())
def run(C, char, cw):
    out={}
    for s in SUBJ:
        docs=[d for d in D if d["subject"]==s]; years=sorted(set(d["year"] for d in docs)); hit=hit2=n=0
        for y in years:
            tr=[d for d in docs if d["year"]!=y]; te=[d for d in docs if d["year"]==y]
            X=[];R=[];Y=[];W=[]
            for d in tr:
                for t in d["topics"]: X.append(feats(d)); R.append(raw(d)); Y.append(t); W.append(1/len(d["topics"]))
            dv=DictVectorizer(); tf=TfidfTransformer(sublinear_tf=True)
            A=tf.fit_transform(dv.fit_transform(X)); At=tf.transform(dv.transform([feats(d) for d in te]))
            if char:
                cv=TfidfVectorizer(analyzer="char_wb",ngram_range=char,sublinear_tf=True,min_df=2)
                A=sp.hstack([A,cw*cv.fit_transform(R)]).tocsr(); At=sp.hstack([At,cw*cv.transform([raw(d) for d in te])]).tocsr()
            clf=LinearSVC(C=C).fit(A,Y,sample_weight=W); sc=clf.decision_function(At)
            for d,row in zip(te,sc):
                p=[clf.classes_[i] for i in np.argsort(-row)]; n+=1; hit+=p[0] in d["topics"]; hit2+=bool(set(p[:2])&set(d["topics"]))
        out[s]=(hit/n,hit2/n,n)
    return out
def show(name,r):
    avg=sum(v[0]*v[2] for v in r.values())/sum(v[2] for v in r.values())
    print(f"{name:30} overall={avg:.1%} | "+"  ".join(f"{k.replace('Mathematics ','')[:9]}:{v[0]:.0%}/{v[1]:.0%}" for k,v in r.items()), flush=True)
show("words only C=1", run(1,None,0))
show("words + char3-5 w=1 C=1", run(1,(3,5),1.0))
show("words + char3-5 w=0.7 C=1", run(1,(3,5),0.7))
show("words + char2-4 w=1 C=1", run(1,(2,4),1.0))
