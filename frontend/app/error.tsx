"use client";

import { useEffect } from "react";
import { Button } from "../components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="fixed inset-0 bg-[#050505] flex flex-col items-center justify-center p-6 text-center z-[500]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,242,255,0.05)_0%,transparent_70%)]" />
      
      <div className="relative z-10 max-w-md">
        <div className="h-24 w-24 bg-[var(--primary)]/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-[var(--primary)]/20">
          <span className="text-5xl">⚡</span>
        </div>
        
        <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight">Signal Interrupted</h1>
        <p className="text-slate-400 text-lg mb-8 leading-relaxed">
          We've encountered a glitch in the StreamFi network. The cinematic feed has been temporarily paused.
        </p>
        
        <div className="flex flex-col gap-3">
          <Button 
            variant="default" 
            size="lg" 
            onClick={() => reset()}
            className="w-full py-6 text-lg font-bold shadow-2xl shadow-[var(--primary)]/20"
          >
            Attempt Reconnection
          </Button>
          <Button 
            variant="outline" 
            size="lg" 
            onClick={() => window.location.href = '/'}
            className="w-full py-6 border-white/10 text-white"
          >
            Return to Dashboard
          </Button>
        </div>
        
        <p className="mt-8 text-[10px] text-slate-600 uppercase tracking-widest font-bold">
          ERROR_CODE: {error.digest || "FETCH_STREAM_FAILURE"}
        </p>
      </div>
    </div>
  );
}
