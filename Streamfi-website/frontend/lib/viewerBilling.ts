export type ViewerBill = {
  movieId: string;
  onChainId: number;
  title: string;
  pricePerSecond: number;
  watchedSeconds: number;
  amountHsk: number;
  paidHsk: number;
  updatedAt: number;
};

function getBillingKey(account: string) {
  return `streamfi.viewerBills.${account.toLowerCase()}`;
}

export function getViewerBills(account: string): ViewerBill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getBillingKey(account));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ViewerBill[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveViewerBills(account: string, bills: ViewerBill[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getBillingKey(account), JSON.stringify(bills));
}

export function upsertWatchTick(
  account: string,
  movie: { movieId: string; onChainId: number; title: string; pricePerSecond: number },
  seconds = 1
) {
  const bills = getViewerBills(account);
  const idx = bills.findIndex((b) => b.onChainId === movie.onChainId);
  const now = Date.now();

  if (idx === -1) {
    bills.unshift({
      movieId: movie.movieId,
      onChainId: movie.onChainId,
      title: movie.title,
      pricePerSecond: movie.pricePerSecond,
      watchedSeconds: seconds,
      amountHsk: movie.pricePerSecond * seconds,
      paidHsk: 0,
      updatedAt: now,
    });
  } else {
    const current = bills[idx];
    bills[idx] = {
      ...current,
      movieId: movie.movieId,
      title: movie.title,
      pricePerSecond: movie.pricePerSecond,
      watchedSeconds: current.watchedSeconds + seconds,
      amountHsk: current.amountHsk + movie.pricePerSecond * seconds,
      updatedAt: now,
    };
  }

  saveViewerBills(account, bills);
  return bills;
}

export function markBillPaid(account: string, onChainId: number, amountHsk: number) {
  const bills = getViewerBills(account);
  const idx = bills.findIndex((b) => b.onChainId === onChainId);
  if (idx === -1) return bills;
  const current = bills[idx];
  bills[idx] = {
    ...current,
    paidHsk: Math.min(current.amountHsk, current.paidHsk + amountHsk),
    updatedAt: Date.now(),
  };
  saveViewerBills(account, bills);
  return bills;
}

export function dueAmountHsk(bill: ViewerBill) {
  return Math.max(0, bill.amountHsk - bill.paidHsk);
}
