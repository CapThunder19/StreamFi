"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

interface Movie {
  id: string;
  title: string;
  description: string;
  genre: string;
  duration: number;
  pricePerSecond: number;
  creatorWallet: string;
  videoUrl: string;
  thumbnailUrl: string;
}

export default function MovieGrid() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/movies");
        if (!res.ok) throw new Error("Failed to fetch movies");
        const data = await res.json();
        setMovies(data);
      } catch (err: any) {
        setError(err.message || "Failed to load movies");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-400">
        <div className="h-6 w-6 mr-3 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        Loading the library...
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-500 py-8 text-center">{error}</div>;
  }

  if (movies.length === 0) {
    return <div className="text-sm text-slate-500 py-12 text-center">No cinematic titles found. Upload one to start.</div>;
  }

  return (
    <div className="movie-grid" aria-label="Movies from database">
      {movies.map((m) => (
        <div
          key={m.id}
          className="movie-card"
          onClick={() => setSelectedMovie(m)}
        >
          <div
            className="movie-poster"
            style={{
              backgroundImage: `url(${m.thumbnailUrl})`,
            }}
          />
          <div className="movie-info">
            <span className="movie-title">{m.genre}</span>
            <span className="movie-badge">{m.title}</span>
            <div className="movie-sub">
              {Math.round(m.duration)} min · 💰 {m.pricePerSecond.toFixed?.(2) ?? m.pricePerSecond} HSK/s
            </div>
          </div>
        </div>
      ))}

      <AnimatePresence>
        {selectedMovie && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              aria-label="Close details"
              onClick={() => setSelectedMovie(null)}
            />

            <motion.div
              className="relative w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0a0a]/90 shadow-2xl backdrop-blur-2xl"
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <div
                className="h-80 w-full bg-cover bg-center relative"
                style={{
                  backgroundImage: `linear-gradient(to top, #0a0a0a 0%, transparent 60%), url(${selectedMovie.thumbnailUrl})`,
                }}
              >
                <button
                  type="button"
                  className="absolute top-6 right-6 h-10 w-10 flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors"
                  onClick={() => setSelectedMovie(null)}
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6 p-10">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h3 className="text-3xl font-extrabold text-white mb-2">{selectedMovie.title}</h3>
                    <div className="flex items-center gap-3">
                      <span className="tag-pill" style={{ background: "var(--primary)", color: "#000", border: "none" }}>{selectedMovie.genre}</span>
                      <span className="text-slate-400 font-medium">·</span>
                      <span className="text-slate-400 font-medium">{Math.round(selectedMovie.duration)} Minutes</span>
                      <span className="text-slate-400 font-medium">·</span>
                      <span className="text-[var(--primary)] font-bold">💰 {selectedMovie.pricePerSecond} HSK/s</span>
                    </div>
                  </div>
                </div>

                <p className="text-lg leading-relaxed text-slate-300 max-w-2xl">{selectedMovie.description}</p>

                <div className="flex items-center gap-6 pt-4">
                  <button
                    type="button"
                    className="button px-8 py-3 text-lg"
                    onClick={() => router.push(`/watch/${selectedMovie.id}`)}
                  >
                    Watch Now
                  </button>
                  <div className="text-sm text-slate-500">
                    <p>On-chain streaming secured by StreamFi</p>
                    <p>Creator: {selectedMovie.creatorWallet.slice(0, 10)}...</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
