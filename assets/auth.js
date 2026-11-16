/* Better HSC Papers — optional login (Firebase Google sign-in) and the shared Firestore data layer.
   Collections (see firestore.rules):
     progress/{uid}    {done:{qid:true}, flagged:{qid:true}}          — private to the user
     flags/{id}        {qid, course, label, reason, note, uid, name}  — created by users, managed by admins
     submissions/{id}  full community questions, live on the site immediately
     queue/{id}        question-only submissions; the daily task writes the solution and publishes them
     overrides/{qid}   admin edits/deletions of any question                                            */
const V = "10.14.1";
const CFG = window.HSC_FIREBASE;
const A = window.HSCAuth;
const listeners = new Set();
A.onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const fire = () => { for (const fn of listeners) try { fn(A); } catch (e) { console.error(e); } document.dispatchEvent(new CustomEvent("hscauth")); };

if (!CFG) {
  A.enabled = false;
  A._resolve();
} else {
  const [{ initializeApp }, au, fs] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
  ]);
  const app = initializeApp(CFG);
  const auth = au.getAuth(app);
  const db = fs.getFirestore(app);
  const emulator = String(CFG.projectId || "").startsWith("demo-");
  if (emulator) {
    au.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    fs.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  const { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs, serverTimestamp, deleteField } = fs;
  const ADMINS = (window.HSC_ADMINS || []).map((e) => e.toLowerCase());
  const me = () => A.user;
  const need = () => { if (!A.user) throw new Error("Please sign in first."); return A.user; };
  const rows = (snap) => snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
  const clean = (o) => JSON.parse(JSON.stringify(o));   // drops undefined values (Firestore rejects them)

  A.enabled = true;
  A.emulator = emulator;
  A.signIn = async () => {
    const p = new au.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try { await au.signInWithPopup(auth, p); }
    catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return au.signInWithRedirect(auth, p);
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") alert("Sign-in failed: " + (e.message || e.code));
    }
  };
  A.signOut = () => au.signOut(auth);
  if (emulator) A._testSignIn = (email, name) =>
    au.signInWithCredential(auth, au.GoogleAuthProvider.credential(JSON.stringify({ sub: "u-" + email.replace(/\W/g, ""), email, email_verified: true, name })));

  /* ---- progress: done / flagged ---- */
  A.progress = { done: {}, flagged: {} };
  async function loadProgress() {
    A.progress = { done: {}, flagged: {} };
    if (!A.user) return;
    try { const s = await getDoc(doc(db, "progress", A.user.uid)); if (s.exists()) A.progress = { done: {}, flagged: {}, ...s.data() }; }
    catch (e) { console.warn("progress", e); }
  }
  A.setDone = async (qid, on) => {
    const u = need();
    if (on) A.progress.done[qid] = true; else delete A.progress.done[qid];
    await setDoc(doc(db, "progress", u.uid), { done: { [qid]: on ? true : deleteField() }, updated: serverTimestamp() }, { merge: true });
  };
  A.flag = async (q, reason, note) => {
    const u = need();
    await addDoc(collection(db, "flags"), clean({ qid: q.id, course: q.course, label: q.label || "", reason, note: (note || "").slice(0, 1000),
      uid: u.uid, name: u.name, status: "open", created: Date.now() }));
    A.progress.flagged[q.id] = true;
    await setDoc(doc(db, "progress", u.uid), { flagged: { [q.id]: true } }, { merge: true });
  };

  /* ---- public data merged into the course pages ---- */
  A.liveFor = async (course) => {
    const [subs, ovs] = await Promise.all([
      getDocs(query(collection(db, "submissions"), where("course", "==", course))),
      getDocs(query(collection(db, "overrides"), where("course", "==", course))),
    ]);
    const overrides = {};
    for (const o of rows(ovs)) overrides[o._id] = o;
    return { submissions: rows(subs), overrides };
  };

  /* ---- community questions ---- */
  const stamp = (data, isNew) => {
    const u = need();
    const d = clean(data);
    if (isNew) { d.uid = u.uid; d.created = Date.now(); if (!d.author) d.author = u.name; }
    d.updated = Date.now();
    return d;
  };
  A.getSubmission = async (id) => { const s = await getDoc(doc(db, "submissions", id)); return s.exists() ? { _id: s.id, ...s.data() } : null; };
  A.saveSubmission = async (data, id) => {
    if (id) { const d = stamp(data, false); delete d.uid; delete d.created; await updateDoc(doc(db, "submissions", id), d); return id; }
    return (await addDoc(collection(db, "submissions"), stamp(data, true))).id;
  };
  A.deleteSubmission = (id) => deleteDoc(doc(db, "submissions", id));
  A.getQueued = async (id) => { const s = await getDoc(doc(db, "queue", id)); return s.exists() ? { _id: s.id, ...s.data() } : null; };
  A.addQueue = async (data, id) => {
    if (id) { const d = stamp(data, false); delete d.uid; delete d.created; await updateDoc(doc(db, "queue", id), d); return id; }
    return (await addDoc(collection(db, "queue"), stamp(data, true))).id;
  };
  A.deleteQueue = (id) => deleteDoc(doc(db, "queue", id));
  A.mine = async () => {
    const u = need();
    const [s, q] = await Promise.all([
      getDocs(query(collection(db, "submissions"), where("uid", "==", u.uid))),
      getDocs(query(collection(db, "queue"), where("uid", "==", u.uid))),
    ]);
    return { submissions: rows(s), queue: rows(q) };
  };

  /* ---- admin ---- */
  A.allSubmissions = async () => rows(await getDocs(collection(db, "submissions")));
  A.allQueue = async () => rows(await getDocs(collection(db, "queue")));
  A.allFlags = async () => rows(await getDocs(collection(db, "flags")));
  A.allOverrides = async () => rows(await getDocs(collection(db, "overrides")));
  A.setFlagStatus = (id, status) => updateDoc(doc(db, "flags", id), { status, updated: Date.now() });
  A.deleteFlag = (id) => deleteDoc(doc(db, "flags", id));
  A.getOverride = async (qid) => { const s = await getDoc(doc(db, "overrides", qid)); return s.exists() ? s.data() : null; };
  A.saveOverride = (qid, course, fields) => setDoc(doc(db, "overrides", qid), clean({ course, fields, deleted: false, updated: Date.now(), by: me().email }));
  A.deleteQuestion = (qid, course) => setDoc(doc(db, "overrides", qid), { course, deleted: true, updated: Date.now(), by: me().email }, { merge: true });
  A.revertOverride = (qid) => deleteDoc(doc(db, "overrides", qid));

  /* ---- sign-in state ---- */
  let first = true;
  au.onAuthStateChanged(auth, async (u) => {
    A.user = u ? { uid: u.uid, email: u.email || "", name: u.displayName || (u.email || "").split("@")[0], photo: u.photoURL || "" } : null;
    A.isAdmin = !!(u && u.emailVerified && ADMINS.includes((u.email || "").toLowerCase()));
    await loadProgress();
    renderAccount();
    if (first) { first = false; A._resolve(); }
    fire();
  });
}

/* ---- account button in the top bar (every page) ---- */
function renderAccount() {
  const bar = document.querySelector(".topbar-inner");
  if (!bar || !A.enabled) return;
  let el = document.getElementById("acct");
  if (!el) { el = document.createElement("div"); el.id = "acct"; el.className = "acct"; bar.appendChild(el); }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  if (!A.user) { el.innerHTML = `<button class="btn acct-in" type="button">Sign in</button>`; el.querySelector("button").onclick = () => A.signIn(); return; }
  const initial = esc((A.user.name || "?").trim()[0] || "?").toUpperCase();
  el.innerHTML = `<details class="acct-menu"><summary title="${esc(A.user.email)}">${A.user.photo ? `<img src="${esc(A.user.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="acct-i">${initial}</span>`}<span class="acct-name">${esc(A.user.name)}</span>${A.isAdmin ? '<span class="tag">Admin</span>' : ""}</summary>
    <div class="acct-pop"><div class="soft acct-email">${esc(A.user.email)}</div>
    <a href="submit.html#mine-box">My questions</a>${A.isAdmin ? '<a href="admin.html">Admin</a>' : ""}<button type="button" class="linkish" data-signout>Sign out</button></div></details>`;
  el.querySelector("[data-signout]").onclick = () => A.signOut();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderAccount); else renderAccount();
