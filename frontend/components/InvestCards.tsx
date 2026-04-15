"use client";

import React, { useState } from "react";
import { Button } from "../components/ui/button";

export function InvestCard({ movie, loading, onInvest }: any) {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const handleClick = async () => {
    setStatus("⏳ Sending...");
    try {
      await onInvest(movie, amount);
      setStatus("✅ Investment sent!");
      setAmount("");
    } catch {
      setStatus("❌ Failed");
    }
  };

  return (
    <div className="card invest-card">
      <header className="card-header">
        <span className={`invest-badge ${movie?.onChainReady ? 'live' : 'pre'}`}>{movie?.onChainReady ? 'LIVE ON CHAIN' : 'PRE-RELEASE'}</span>
        <div className="invest-title">{movie?.title}</div>
        <div className="invest-meta">{movie?.genre} · {movie?.creatorWallet?.slice(0,6)}...{movie?.creatorWallet?.slice(-4)}</div>
      </header>

      <div className="card-content">
        <p className="invest-description line-clamp-3">{movie?.description}</p>

        <div className="fundraising">
          <div className="label">Fundraising</div>
          <div className="fundraising-row">
            <div className="fundraising-percent">{Math.min(100, ((movie?.pledgedTotalHsk || 0) / Math.max(1, movie?.targetAmountHsk || 1) * 100)).toFixed(1)}%</div>
            <div style={{flex:1, marginLeft:12}}>
              <div className="fundraising-bar-shell"><div className="fundraising-bar-fill" style={{width:`${Math.min(100, ((movie?.pledgedTotalHsk || 0) / Math.max(1, movie?.targetAmountHsk || 1) * 100))}%`}}/></div>
              <div className="fundraising-stats"><span>PLEDGED: {(Number(movie?.pledgedTotalHsk || 0)).toFixed(2)} HSK</span><span>GOAL: {movie?.targetAmountHsk}</span></div>
            </div>
          </div>
        </div>
      </div>

      <footer className="card-footer">
        <input className="invest-input" type="text" placeholder="Investment Amount (HSK)" value={amount} onChange={(e)=>setAmount(e.target.value)} />
        <button className="primary-cta" disabled={loading || !amount} onClick={handleClick}>{loading ? 'Processing...' : 'Invest Now'}</button>
        {status && <p className="small" style={{textAlign:'center', marginTop:6, color: status.startsWith('✅')? '#4ade80':'#f87171'}}>{status}</p>}
      </footer>
    </div>
  );
}

export function UpcomingInvestCard({ movie, loading, onInvest }: any) {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const isPublished = movie?.status === "published" || Boolean(movie?.linkedMovieId);
  const canInvestOnChain = Boolean(movie?.onChainReady && movie?.onChainId && movie.onChainId > 0);

  const handleClick = async () => {
    if (isPublished) {
      setStatus("❌ This upcoming movie is already published");
      return;
    }
    if (!canInvestOnChain) {
      setStatus("❌ On-chain ID not ready yet");
      return;
    }
    setStatus("⏳ Sending...");
    try {
      await onInvest(movie, amount);
      setStatus("✅ On-chain investment sent and recorded!");
      setAmount("");
    } catch (e: any) {
      // Extract user-friendly error message
      let errorMsg = "Transaction failed";
      if (e?.message) {
        if (e.message.includes("not found on this contract")) {
          errorMsg = "Movie not registered on-chain yet";
        } else if (e.message.includes("No funds")) {
          errorMsg = "Invalid investment amount";
        } else if (e.message.includes("connect wallet")) {
          errorMsg = "Please connect your wallet first";
        } else if (e.message.includes("estimateGas") || e.message.includes("CALL_EXCEPTION")) {
          errorMsg = "Movie not available for investment";
        } else {
          errorMsg = e.message.split("\n")[0].substring(0, 80);
        }
      }
      setStatus(`❌ ${errorMsg}`);
    }
  };

  const progressPercent = Math.min(100, (Number(movie?.pledgedTotalHsk || 0) / Number(movie?.targetAmountHsk || 1)) * 100);

  return (
    <div className="card invest-card">
      <header className="card-header">
        <span className={`invest-badge ${canInvestOnChain ? 'live' : 'pre'}`}>{canInvestOnChain ? 'LIVE ON CHAIN' : 'PRE-RELEASE'}</span>
        <div className="invest-title">{movie?.title}</div>
        <div style={{ fontSize: "0.75rem", color: "#a78bfa", fontWeight: 600, marginBottom: "6px", letterSpacing: "0.5px" }}>
          INVESTMENT ID: {movie?.id}
        </div>
        <div className="invest-meta">{movie?.genre} · CREATOR: {movie?.creatorWallet?.slice(0,6)}...{movie?.creatorWallet?.slice(-4)}</div>
      </header>

      <div className="card-content">
        <p className="invest-description line-clamp-3">{movie?.description}</p>

        <div className="fundraising">
          <div className="label">Fundraising</div>
          <div className="fundraising-row">
            <div className="fundraising-percent">{progressPercent.toFixed(1)}%</div>
            <div style={{flex:1, marginLeft:12}}>
              <div className="fundraising-bar-shell"><div className="fundraising-bar-fill" style={{width:`${progressPercent}%`}}/></div>
              <div className="fundraising-stats"><span>PLEDGED: {(Number(movie?.pledgedTotalHsk || 0)).toFixed(2)} HSK</span><span>GOAL: {movie?.targetAmountHsk}</span></div>
            </div>
          </div>
        </div>
      </div>

      <footer className="card-footer">
        <input className="invest-input" type="text" placeholder="Investment Amount (HSK)" value={amount} onChange={(e)=>setAmount(e.target.value)} disabled={isPublished || !canInvestOnChain} />
        <button className="primary-cta" disabled={loading || !amount || isPublished || !canInvestOnChain} onClick={handleClick}>{isPublished ? 'Published' : !canInvestOnChain ? 'Awaiting Chain Sync' : loading ? 'Processing...' : 'Confirm Investment'}</button>
        {status && <p className={`mt-3 text-[10px] font-bold text-center ${status.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{status}</p>}
      </footer>
    </div>
  );
}
