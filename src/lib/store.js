import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, addDoc, deleteDoc, collection } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { DEFAULTS } from '../data/defaults.js';
import { position } from './portfolio.js';
import { validateTxn } from './txn.js';

export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signOut = () => fbSignOut(auth);
export const onUser = (cb) => onAuthStateChanged(auth, cb);

const userRef = (uid) => doc(db, 'users', uid);

export async function ensureUserDoc(uid) {
  const snap = await getDoc(userRef(uid));
  if (!snap.exists()) await setDoc(userRef(uid), JSON.parse(JSON.stringify(DEFAULTS)));
}

export async function getUser(uid) {
  const snap = await getDoc(userRef(uid));
  return snap.exists() ? snap.data() : null;
}

export const saveSettings = (uid, patch) => {
  const p = { ...patch };
  if (typeof p.finnhubKey === 'string') p.finnhubKey = p.finnhubKey.trim();
  return setDoc(userRef(uid), { settings: p }, { merge: true });
};
export const saveGoals = (uid, patch) => setDoc(userRef(uid), { goals: patch }, { merge: true });
export const setWatchlist = (uid, list) => setDoc(userRef(uid), { watchlist: list }, { merge: true });

export async function listTxns(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'txns'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addTxn(uid, txn) {
  const t = validateTxn(txn);
  const existing = await listTxns(uid);
  position([...existing, t], t.symbol); // throws on oversell
  return addDoc(collection(db, 'users', uid, 'txns'), t);
}
export const deleteTxn = (uid, id) => deleteDoc(doc(db, 'users', uid, 'txns', id));

const sub = (uid, col, id) => doc(db, 'users', uid, col, id);
async function getSub(uid, col, id) {
  const s = await getDoc(sub(uid, col, id));
  return s.exists() ? s.data() : null;
}
export const getHalal = (uid, sym) => getSub(uid, 'halal', sym);
export const saveHalal = (uid, sym, data) => setDoc(sub(uid, 'halal', sym), data);
export const getPlan = (uid, sym) => getSub(uid, 'plans', sym);
export const savePlan = (uid, sym, plan) => setDoc(sub(uid, 'plans', sym), plan);
