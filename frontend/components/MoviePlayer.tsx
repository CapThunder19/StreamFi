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
  creatorWallet?: string;
};

export default function MoviePlayer({ movieId, onChainId, videoUrl, title, pricePerSecond, creatorWallet }: Props) {
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
        setSettleStatus("Payment canceled.");
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

    // If there is an unpaid bill for a different movie, block playback
    const previousUnpaid = bills.find(
      (b: ViewerBill) => b.onChainId !== onChainId && dueAmountHsk(b) > 0
    );
    if (previousUnpaid) {
      setBlockedBill(previousUnpaid);
      setPlaying(false);
      setSettleStatus("Payment is pending. Please settle to continue.");
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

  const creatorLabel = creatorWallet
    ? `${creatorWallet.slice(0, 6)}...${creatorWallet.slice(-4)}`
    : "";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "#0a0a0c",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.65), rgba(0,0,0,0))",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
          <button
            type="button"
            onClick={() => window.history.back()}
            aria-label="Close player"
            style={{
              height: 40,
              width: 40,
              borderRadius: 999,
              border: `1px solid ${"rgba(255,255,255,0.12)"}`,
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            ✕
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {title}
            </div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              StreamFi Cinema Session
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1.25rem",
            padding: "0.5rem 0.85rem",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.05)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {creatorLabel && (
            <span style={{ opacity: 0.8 }}>
              Creator: <span style={{ fontFamily: "monospace" }}>{creatorLabel}</span>
            </span>
          )}
          <span style={{ color: "var(--primary)" }}>
            Price: {Number(pricePerSecond || 0).toFixed(4)} HSK/s
          </span>
        </div>
      </div>

      <div
        style={{
          width: "min(1100px, 100%)",
          aspectRatio: "16 / 9",
          borderRadius: "1.5rem",
          overflow: "hidden",
          background: "#000",
          border: "1px solid rgba(255,255,255,0.08)",
          position: "relative",
        }}
      >
        {paymentRequired && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.85)",
            }}
          >
            <div
              style={{
                minWidth: 360,
                maxWidth: 520,
                padding: "2.25rem 2.5rem",
                borderRadius: "1.75rem",
                background: "#121018",
                boxShadow: "0 40px 120px rgba(0,0,0,0.85)",
                border: "1px solid rgba(255,255,255,0.08)",
                textAlign: "center",
                color: "#fff",
              }}
            >
              <div
                style={{
                  fontSize: "1.35rem",
                  fontWeight: 700,
                  marginBottom: "0.5rem",
                }}
              >
                Settlement Required
              </div>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: "#e5e7eb",
                  marginBottom: "1.5rem",
                }}
              >
                Payment is pending. Please settle to continue.
              </div>

              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.3rem",
                  borderRadius: 999,
                  background: "#1f102f",
                  overflow: "hidden",
                  border: "1px solid #4c1d95",
                }}
              >
                <div
                  style={{
                    height: 40,
                    borderRadius: 999,
                    background: isSettling ? "#6d28d9" : "#4c1d95",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#f9fafb",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                  }}
                >
                  {isSettling ? "Processing..." : "Settle now"}
                </div>
              </div>

              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#a855f7",
                  fontWeight: 600,
                  marginBottom: "0.75rem",
                }}
              >
                {settleStatus || "Settling pending amount..."}
              </div>

              {blockedBill && !isSettling && (
                <button
                  type="button"
                  onClick={() => void payBillNow(blockedBill)}
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.55rem 1.4rem",
                    borderRadius: 999,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#e5e7eb",
                    background: "#181022",
                    border: "1px solid #4c1d95",
                    cursor: "pointer",
                  }}
                >
                  Pay {dueAmountHsk(blockedBill).toFixed(6)} HSK to unlock
                </button>
              )}
            </div>
          </div>
        )}
        <ReactPlayer
          url={videoUrl}
          playing={playing && !paymentRequired}
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
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 20,
          right: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          color: "#e5e7eb",
          opacity: 0.8,
        }}
      >
        <div>
          <span>
            Session: {sessionSeconds}s · {sessionAmount.toFixed(4)} HSK
          </span>
          <span style={{ marginLeft: 12 }}>
            Pending current: {totalDue.toFixed(4)} HSK
          </span>
          {settleStatus && (
            <span style={{ marginLeft: 12, color: "#a855f7" }}>{settleStatus}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span>Vol</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span>Speed</span>
            <select
              value={playbackRate}
              onChange={(e) => setPlaybackRate(Number(e.target.value))}
              style={{
                background: "#020617",
                borderRadius: 6,
                border: "1px solid rgba(148,163,184,0.7)",
                padding: "2px 6px",
                color: "#e5e7eb",
              }}
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
  );
}
