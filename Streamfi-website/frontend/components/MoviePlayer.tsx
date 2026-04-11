"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { useAccount } from "wagmi";
import { dueAmountHsk, getViewerBills, upsertWatchTick } from "../lib/viewerBilling";

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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!address) {
      setTotalDue(0);
      return;
    }
    const bills = getViewerBills(address);
    const movieBill = bills.find((b) => b.onChainId === onChainId);
    setTotalDue(movieBill ? dueAmountHsk(movieBill) : 0);
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
          const movieBill = bills.find((b) => b.onChainId === onChainId);
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

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
      <div className="absolute top-4 right-4 flex items-center gap-2 text-xs text-emerald-300 bg-emerald-900/40 border border-emerald-500/60 px-3 py-1 rounded-full">
        <span>💰 {pricePerSecond.toFixed(4)} HSK/sec</span>
        <span>• Session: {sessionAmount.toFixed(4)} HSK</span>
        <span>• Total Due: {totalDue.toFixed(4)} HSK</span>
      </div>
      <div className="w-full max-w-5xl px-4">
        <div className="mb-2 text-sm text-slate-200">{title}</div>
        <div className="mb-2 text-xs text-slate-400">Watched this session: {sessionSeconds}s</div>
        <div className="aspect-video rounded-xl overflow-hidden bg-black shadow-2xl shadow-black/80">
          <ReactPlayer
            url={videoUrl}
            playing={playing}
            controls
            width="100%"
            height="100%"
            volume={volume}
            playbackRate={playbackRate}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
          <button
            className="px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 transition"
            type="button"
            onClick={() => setPlaying((p) => !p)}
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
