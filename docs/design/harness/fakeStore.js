// store จำลองสำหรับหน้าทดลองดีไซน์ (ไม่เชื่อม Firebase)
const txns = [
  { id: 't1', type: 'buy', symbol: 'SPUS', date: '2026-03-02', shares: 48, price: 55.1, seq: 1 },
  { id: 't2', type: 'buy', symbol: 'AVGO', date: '2026-09-15', shares: 2, price: 300.2, seq: 2 },
  { id: 't3', type: 'dividend', symbol: 'SPUS', date: '2026-06-20', amount: 42.3, seq: 3 },
  { id: 't4', type: 'dividend', symbol: 'AVGO', date: '2026-10-01', amount: 2.1, seq: 4 },
];
const plans = { AVGO: { note: 'รอย่อถึงไม้ 1 ค่อยเติม\nดูงบไตรมาสหน้าก่อน' } };
const halal = { AVGO: { interestDebt: 67e9, interestDeposits: 9e9, impermissiblePct: 0.01, source: 'Zoya', enteredAt: '2026-11-20' } };
const wait = (v) => new Promise((r) => setTimeout(() => r(v), 30));
export const signIn = async () => {}; export const signOut = async () => {};
export const currentUser = () => null; export const onUser = () => {};
export const ensureUserDoc = async () => {}; export const getUser = async () => ({});
export const saveSettings = async () => {}; export const saveGoals = async () => {};
export const setWatchlist = async () => wait();
export const listTxns = async () => wait(txns.slice());
export const addTxn = async (uid, t) => { txns.push({ ...t, id: `n${txns.length}` }); };
export const deleteTxn = async () => { throw new Error('ลบไม่ได้ในหน้าทดลอง'); };
export const getHalal = async (uid, s) => wait(halal[s] ?? null);
export const saveHalal = async (uid, s, d) => { halal[s] = d; };
export const getPlan = async (uid, s) => wait(plans[s] ?? null);
export const savePlan = async (uid, s, d) => { plans[s] = d; };
