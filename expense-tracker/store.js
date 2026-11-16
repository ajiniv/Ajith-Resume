// Storage + sign-in. Two interchangeable backends with the same interface:
//   - Firebase (email/password auth + Firestore), used when firebase-config.js is filled in
//   - Local demo (this device only), used otherwise
import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "10.12.2";
const cdn = (name) =>
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-${name}.js`;

export async function createStore() {
  return firebaseConfig.apiKey ? firebaseStore() : localStore();
}

// ---------------------------------------------------------------- Firebase
async function firebaseStore() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(cdn("app")),
    import(cdn("auth")),
    import(cdn("firestore")),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);

  const userDoc = (...path) => F.doc(db, "users", auth.currentUser.uid, ...path);
  const userCol = (name) => F.collection(db, "users", auth.currentUser.uid, name);
  const readAll = async (name) =>
    (await F.getDocs(userCol(name))).docs.map((d) => ({ ...d.data(), id: d.id }));

  const messages = {
    "auth/invalid-credential": "Wrong email or password.",
    "auth/wrong-password": "Wrong email or password.",
    "auth/user-not-found": "No account with that email. Sign up first.",
    "auth/email-already-in-use": "That email already has an account. Log in instead.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/network-request-failed": "No internet connection.",
    "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
  };
  const friendly = async (promise) => {
    try {
      return await promise;
    } catch (e) {
      throw new Error(messages[e.code] || e.message);
    }
  };

  return {
    mode: "firebase",
    onAuth: (cb) =>
      A.onAuthStateChanged(auth, (u) => cb(u ? { email: u.email } : null)),
    signUp: (email, pw) => friendly(A.createUserWithEmailAndPassword(auth, email, pw)),
    signIn: (email, pw) => friendly(A.signInWithEmailAndPassword(auth, email, pw)),
    signOut: () => A.signOut(auth),
    resetPassword: (email) => friendly(A.sendPasswordResetEmail(auth, email)),
    async load() {
      const [expenses, categories, settings] = await Promise.all([
        readAll("expenses"),
        readAll("categories"),
        F.getDoc(userDoc("meta", "settings")),
      ]);
      return { expenses, categories, settings: settings.exists() ? settings.data() : null };
    },
    saveExpense: (e) => F.setDoc(userDoc("expenses", e.id), e),
    deleteExpense: (id) => F.deleteDoc(userDoc("expenses", id)),
    saveCategory: (c) => F.setDoc(userDoc("categories", c.id), c),
    deleteCategory: (id) => F.deleteDoc(userDoc("categories", id)),
    saveSettings: (s) => F.setDoc(userDoc("meta", "settings"), s),
  };
}

// -------------------------------------------------------------- Local demo
function localStore() {
  const get = (k, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const norm = (email) => email.trim().toLowerCase();

  async function hash(salt, pw) {
    const bytes = new TextEncoder().encode(salt + ":" + pw);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  let listener = () => {};
  const current = () => get("et.session", null);
  const dataKey = () => "et.data." + current();
  const data = () => get(dataKey(), { expenses: [], categories: [], settings: null });
  const mutate = (fn) => {
    const d = data();
    fn(d);
    set(dataKey(), d);
  };
  const upsert = (list, item) => {
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = item;
    else list.push(item);
  };
  const emit = () => listener(current() ? { email: current() } : null);

  return {
    mode: "local",
    onAuth(cb) {
      listener = cb;
      emit();
    },
    async signUp(email, pw) {
      email = norm(email);
      if (pw.length < 6) throw new Error("Password must be at least 6 characters.");
      const accounts = get("et.accounts", {});
      if (accounts[email]) throw new Error("That email already has an account. Log in instead.");
      const salt = crypto.randomUUID();
      accounts[email] = { salt, hash: await hash(salt, pw) };
      set("et.accounts", accounts);
      set("et.session", email);
      emit();
    },
    async signIn(email, pw) {
      email = norm(email);
      const acct = get("et.accounts", {})[email];
      if (!acct || acct.hash !== (await hash(acct.salt, pw)))
        throw new Error("Wrong email or password.");
      set("et.session", email);
      emit();
    },
    async signOut() {
      localStorage.removeItem("et.session");
      emit();
    },
    async resetPassword() {
      throw new Error("Password reset emails need Firebase to be connected.");
    },
    async load() {
      return data();
    },
    async saveExpense(e) {
      mutate((d) => upsert(d.expenses, e));
    },
    async deleteExpense(id) {
      mutate((d) => (d.expenses = d.expenses.filter((x) => x.id !== id)));
    },
    async saveCategory(c) {
      mutate((d) => upsert(d.categories, c));
    },
    async deleteCategory(id) {
      mutate((d) => (d.categories = d.categories.filter((x) => x.id !== id)));
    },
    async saveSettings(s) {
      mutate((d) => (d.settings = s));
    },
  };
}
