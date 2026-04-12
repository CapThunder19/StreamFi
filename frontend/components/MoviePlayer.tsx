"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { useAccount } from "wagmi";
import { BrowserProvider, Contract, parseEther } from "ethers";
import abiJson from "../abi/StreamFiPayment.json";
import { ViewerBill, dueAmountHsk, getViewerBills, markBillPaid, upsertWatchTick } from "../lib/viewerBilling";

const STREAMFI_ABI = abiJson.abi;

type Props = {
  movieId: string;
  onChainId: number;
  videoUrl: string;
  title: string;
  pricePerSecond: number;
};

export default function MoviePlayer({ movieId, onChainId, videoUrl, title, pricePerSecond }: Props) {
  const { address } = useAccount();
  const [playing, setPlaying] = useState(true);
  const [volume, setVolume] = useState(0.9);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionAmount, setSessionAmount] = useState(0);
  const [totalDue, setTotalDue] = useState(0);
  const [settleStatus, setSettleStatus] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [blockedBill, setBlockedBill] = useState<ViewerBill | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const settlingRef = useRef(false);
  const paymentRequired = Boolean(blockedBill) || isSettling;

  async function payBillNow(bill: ViewerBill) {
    if (settlingRef.current || !address) return false;

    const due = dueAmountHsk(bill);
    if (!due || due <= 0) {
      if (blockedBill && blockedBill.onChainId === bill.onChainId) {
        setBlockedBill(null);
      }
      return true;
    }

    try {
      settlingRef.current = true;
      setIsSettling(true);
      setSettleStatus("Settling pending amount...");

      const anyWin = window as any;
      if (!anyWin.ethereum) throw new Error("Wallet not found for settlement");

      const provider = new BrowserProvider(anyWin.ethereum);
      const signer = await provider.getSigner();

      const contractAddress = process.env.NEXT_PUBLIC_STREAMFI_CONTRACT_ADDRESS;
      if (!contractAddress) throw new Error("Contract address not configured");

      const contract = new Contract(contractAddress, STREAMFI_ABI, signer);
      const amountText = due.toFixed(6);
      const value = parseEther(amountText);

      const tx = await contract.pay(BigInt(bill.onChainId), { value });
      await tx.wait();

      markBillPaid(address, bill.onChainId, due);
      setSettleStatus("Pending amount paid");

      if (bill.onChainId === onChainId) {
        setTotalDue(0);
      }

      if (blockedBill && blockedBill.onChainId === bill.onChainId) {
        setBlockedBill(null);
      }

      return true;
    } catch (err: any) {
      const code = err?.code;
      const msg = err?.reason || err?.message || "Settlement failed";

      if (code === 4001 || code === "ACTION_REJECTED" || String(msg).toLowerCase().includes("rejected")) {
        setSettleStatus("Payment canceled. This movie remains locked until it is paid.");
      } else {
        setSettleStatus(msg);
      }
      return false;
    } finally {
      settlingRef.current = false;
      setIsSettling(false);
    }
  }

  async function settleCurrentMovieDueIfAny() {
    if (!address) return false;
    const bills = getViewerBills(address);
    const currentBill = bills.find((b: ViewerBill) => b.onChainId === onChainId);
    if (!currentBill || dueAmountHsk(currentBill) <= 0) {
      setTotalDue(0);
      return true;
    }
    return payBillNow(currentBill);
  }

  useEffect(() => {
    if (!address) {
      setTotalDue(0);
      setBlockedBill(null);
      return;
    }
    const bills = getViewerBills(address);
    const movieBill = bills.find((b: ViewerBill) => b.onChainId === onChainId);
    setTotalDue(movieBill ? dueAmountHsk(movieBill) : 0);

    const previousUnpaid = bills.find(
      (b: ViewerBill) => b.onChainId !== onChainId && dueAmountHsk(b) > 0
    );
    if (previousUnpaid) {
      setBlockedBill(previousUnpaid);
      setPlaying(false);
      setSettleStatus("Previous movie payment pending. Pay it to continue.");
    } else {
      setBlockedBill(null);
    }
  }, [address, onChainId]);

  useEffect(() => {
    if (playing) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          if (!address) return;
          setSessionSeconds((prev) => prev + 1);
          setSessionAmount((prev) => prev + pricePerSecond);

          const bills = upsertWatchTick(
            address,
            { movieId, onChainId, title, pricePerSecond },
            1
          );
          const movieBill = bills.find((b: ViewerBill) => b.onChainId === onChainId);
          setTotalDue(movieBill ? dueAmountHsk(movieBill) : 0);
        }, 1000);
      }
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [address, playing, movieId, onChainId, title, pricePerSecond]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (totalDue > 0) {
        void settleCurrentMovieDueIfAny();
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [totalDue]);

  useEffect(() => {
    return () => {
      void settleCurrentMovieDueIfAny();
    };
  }, [address, onChainId]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
      <div className="absolute top-4 right-4 flex items-center gap-2 text-xs text-emerald-300 bg-emerald-900/40 border border-emerald-500/60 px-3 py-1 rounded-full">
        <span>💰 {pricePerSecond.toFixed(4)} HSK/sec</span>
        <span>• Session: {sessionAmount.toFixed(4)} HSK</span>
        <span>• Pending Current: {totalDue.toFixed(4)} HSK</span>
        {settleStatus && <span>• {settleStatus}</span>}
      </div>
      <div className="w-full max-w-5xl px-4">
        <div className="mb-2 text-sm text-slate-200">{title}</div>
        <div className="mb-2 text-xs text-slate-400">Watched this session: {sessionSeconds}s</div>
        <div className="aspect-video rounded-xl overflow-hidden bg-black shadow-2xl shadow-black/80">
          {paymentRequired && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0, 0, 0, 0.72)",
              }}
            >
              <div style={{ textAlign: "center", color: "#fff", maxWidth: "28rem", padding: "1rem" }}>
                <div style={{ fontWeight: 700, marginBottom: "0.45rem" }}>Previous Payment Required</div>
                <div style={{ fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "0.85rem" }}>
                  {blockedBill
                    ? `Pay pending due for "${blockedBill.title}" before playing another movie.`
                    : "This movie is locked until pending payment is cleared."}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (blockedBill) {
                      void payBillNow(blockedBill);
                    }
                  }}
                  disabled={isSettling || !blockedBill}
                  className="px-3 py-1 rounded-full bg-orange-500 hover:bg-orange-400 transition text-xs font-semibold disabled:opacity-60"
                >
                  {isSettling
                    ? "Paying..."
                    : blockedBill
                    ? `Pay Now (${dueAmountHsk(blockedBill).toFixed(6)} HSK)`
                    : "Pay Now"}
                </button>
              </div>
            </div>
          )}
          <ReactPlayer
            url={videoUrl}
            playing={playing}
            controls={!paymentRequired}
            width="100%"
            height="100%"
            volume={volume}
            playbackRate={playbackRate}
            onPlay={() => {
              if (paymentRequired) {
                setPlaying(false);
                if (blockedBill) {
                  void payBillNow(blockedBill);
                }
                return;
              }
              setPlaying(true);
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              void settleCurrentMovieDueIfAny();
            }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
          <button
            className="px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 transition"
            type="button"
            onClick={() => {
              if (paymentRequired) {
                if (blockedBill) {
                  void payBillNow(blockedBill);
                }
                return;
              }
              setPlaying((p) => !p);
            }}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1">
              <span>Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-1">
              <span>Speed</span>
              <select
                className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5"
                value={playbackRate}
                onChange={(e) => setPlaybackRate(Number(e.target.value))}
              >
                {[0.5, 1, 1.25, 1.5, 2].map((r) => (
                  <option key={r} value={r}>
                    {r}x
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
