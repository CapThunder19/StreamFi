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
            <div className="movie-sub" style={{ fontSize: "0.7rem", fontWeight: 600, color: "#a78bfa", marginBottom: "4px" }}>
              ID: {m.id}
            </div>
            <div className="movie-sub">
              {Math.round(m.duration)} min · 💰 {m.pricePerSecond.toFixed?.(2) ?? m.pricePerSecond} HSK/s
            </div>
          </div>
        </div>
      ))}

      <AnimatePresence>
        {selectedMovie && (
          <motion.div
            className="movie-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="movie-modal-backdrop"
              aria-label="Close details"
              onClick={() => setSelectedMovie(null)}
            />

            <motion.div
              className="movie-modal-card"
              initial={{ opacity: 0, scale: 0.95, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <div
                className="movie-modal-cover"
                style={{
                  backgroundImage: `linear-gradient(to top, #110d18 0%, transparent 80%), url(${selectedMovie.thumbnailUrl})`,
                }}
              />

              <div className="movie-modal-body">
                <div className="movie-modal-header-row">
                  <h3 className="movie-modal-title">{selectedMovie.title}</h3>
                  <button
                    type="button"
                    className="movie-modal-close-pill"
                    onClick={() => setSelectedMovie(null)}
                  >
                    CLOSE
                  </button>
                </div>

                <div className="movie-modal-subtitle">
                  {selectedMovie.genre} · {Math.round(selectedMovie.duration)} min
                </div>

                <div className="movie-modal-meta-row">
                  <span style={{ fontSize: "0.85rem", color: "#a78bfa", fontWeight: 600 }}>
                    PAYMENT ID: {selectedMovie.id}
                  </span>
                </div>
                <div className="movie-modal-meta-row">
                  <span className="movie-modal-creator">
                    Creator: {selectedMovie.creatorWallet.slice(0, 6)}...{selectedMovie.creatorWallet.slice(-4)}
                  </span>
                  <span className="movie-modal-price">
                    Price: {selectedMovie.pricePerSecond} HSK/sec
                  </span>
                </div>

                <button
                  type="button"
                  className="movie-modal-play-btn"
                  onClick={() => router.push(`/watch/${selectedMovie.id}`)}
                >
                  PLAY MOVIE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
