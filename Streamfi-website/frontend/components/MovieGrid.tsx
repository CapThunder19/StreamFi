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
      <div className="flex items-center justify-center py-8 text-sm text-slate-400">
        <div className="h-5 w-5 mr-2 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        Loading movies...
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-400 py-4">{error}</div>;
  }

  if (movies.length === 0) {
    return <div className="text-sm text-slate-400 py-4">No movies uploaded yet.</div>;
  }

  return (
    <div className="movie-grid" aria-label="Movies from database">
      {movies.map((m) => (
        <button
          key={m.id}
          type="button"
          className="movie-card text-left hover:scale-[1.03] transition-transform"
          onClick={() => setSelectedMovie(m)}
        >
          <div
            className="movie-poster"
            style={{
              backgroundImage: m.thumbnailUrl
                ? `url(${m.thumbnailUrl})`
                : "linear-gradient(135deg,#4f46e5,#22d3ee)",
            }}
          />
          <span className="movie-badge">{m.title}</span>
          <div className="movie-title">{m.genre}</div>
          <div className="movie-sub">
            {Math.round(m.duration)} min · ⭐ 4.7
          </div>
        </button>
      ))}

      <AnimatePresence>
        {selectedMovie && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/70"
              aria-label="Close details"
              onClick={() => setSelectedMovie(null)}
            />

            <motion.div
              className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.22 }}
            >
              <div
                className="h-64 w-full bg-cover bg-center"
                style={{
                  backgroundImage: selectedMovie.thumbnailUrl
                    ? `linear-gradient(180deg, rgba(15,23,42,0.25), rgba(15,23,42,0.9)), url(${selectedMovie.thumbnailUrl})`
                    : "linear-gradient(135deg,#4f46e5,#22d3ee)",
                }}
              />

              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{selectedMovie.title}</h3>
                    <p className="text-sm text-orange-300">
                      {selectedMovie.genre} · {Math.round(selectedMovie.duration)} min
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    onClick={() => setSelectedMovie(null)}
                  >
                    Close
                  </button>
                </div>

                <p className="text-sm leading-6 text-slate-300">{selectedMovie.description}</p>

                <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                  <span>Creator: {selectedMovie.creatorWallet.slice(0, 6)}...{selectedMovie.creatorWallet.slice(-4)}</span>
                  <span>Price: {selectedMovie.pricePerSecond} HSK/sec</span>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    className="rounded-full bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-400"
                    onClick={() => router.push(`/watch/${selectedMovie.id}`)}
                  >
                    Play Movie
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
