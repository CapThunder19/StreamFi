"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserProvider, Contract, isAddress } from "ethers";
import abiJson from "../abi/StreamFiPayment.json";

const STREAMFI_ABI = abiJson.abi;

type Props = {
  creatorWallet: string | null;
  onSuccess?: () => void;
  pushLog?: (text: string) => void;
};

export default function UploadMovieForm({ creatorWallet, onSuccess, pushLog }: Props) {
  const REQUEST_TIMEOUT_MS = 90_000;
  const MAX_MEDIA_UPLOAD_BYTES = 500 * 1024 * 1024;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [duration, setDuration] = useState("");
  const [pricePerSecond, setPricePerSecond] = useState("");
  const [payoutWallet, setPayoutWallet] = useState("");
  const [upcomingIdToConvert, setUpcomingIdToConvert] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<number>(0); // 0=idle, 1=registering, 2=uploading media, 3=uploading thumb, 4=saving DB, 5=done
  const [mediaUploadProgress, setMediaUploadProgress] = useState<{ loaded: number; total: number; percent: number } | null>(null);

  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const posterInputRef = useRef<HTMLInputElement | null>(null);

  const log = (text: string) => {
    if (pushLog) pushLog(text);
  };

  useEffect(() => {
    if (creatorWallet && !payoutWallet) {
      setPayoutWallet(creatorWallet);
    }
  }, [creatorWallet, payoutWallet]);

  function uploadFormDataWithTimeout(
    url: string,
    formData: FormData,
    timeoutMs = REQUEST_TIMEOUT_MS,
    onProgress?: (loaded: number, total: number) => void
  ) {
    return new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.timeout = timeoutMs;

      if (onProgress) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            onProgress(evt.loaded, evt.total);
          }
        };
      }

      xhr.onload = () => {
        try {
          const payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(payload);
            return;
          }
          reject(new Error(payload?.error || `Upload failed with status ${xhr.status}`));
        } catch {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({});
            return;
          }
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.ontimeout = () => reject(new Error("Request timed out. Please try again."));
      xhr.onabort = () => reject(new Error("Request was aborted"));

      xhr.send(formData);
    });
  }

  async function uploadWithRetry(
    url: string,
    formData: FormData,
    label: string,
    onProgress?: (loaded: number, total: number) => void
  ) {
    try {
      return await uploadFormDataWithTimeout(url, formData, REQUEST_TIMEOUT_MS, onProgress);
    } catch (firstErr: any) {
      log(`Retrying ${label} upload once...`);
      return uploadFormDataWithTimeout(url, formData, REQUEST_TIMEOUT_MS, onProgress);
    }
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!creatorWallet) {
      setMessage("Connect your wallet first.");
      return;
    }

    setLoading(true);
    setMessage(null);
    setCurrentStep(0);
    setMediaUploadProgress(null);

    try {
      // --- Step 1: Validate inputs ---
      if (!title || !description || !genre || !duration || !pricePerSecond) {
        throw new Error("Please fill in all fields");
      }
      if (!payoutWallet || !isAddress(payoutWallet)) {
        throw new Error("Enter a valid payout wallet address");
      }
      if (!mediaFile) {
        throw new Error("Please upload a media file");
      }
      if (!thumbnailFile) {
        throw new Error("Please select a thumbnail image");
      }
      if (mediaFile.size > MAX_MEDIA_UPLOAD_BYTES) {
        throw new Error("Media file is too large (max 500MB).");
      }

      // --- Step 2: Register movie on-chain ---
      setCurrentStep(1);
      setStep("Registering movie on-chain...");
      log("Registering movie on-chain...");

      const anyWin = window as any;
      if (!anyWin.ethereum) throw new Error("No wallet found. Install MetaMask.");

      // Auto-switch to HashKey testnet (chain ID 133) before transacting
      try {
        await anyWin.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x85" }], // 133 in hex
        });
      } catch (switchErr: any) {
        if (switchErr.code === 4902) {
          await anyWin.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x85",
              chainName: "HashKey Chain Testnet",
              rpcUrls: ["https://testnet.hsk.xyz"],
              nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
              blockExplorerUrls: ["https://testnet-explorer.hsk.xyz"],
            }],
          });
        } else {
          throw switchErr;
        }
      }

      const provider = new BrowserProvider(anyWin.ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      log(`Connected to chain: ${network.name} (chainId: ${network.chainId})`);

      const contractAddress = process.env.NEXT_PUBLIC_STREAMFI_CONTRACT_ADDRESS;
      if (!contractAddress) throw new Error("Contract address not configured. Set NEXT_PUBLIC_STREAMFI_CONTRACT_ADDRESS in .env.local");

      // Verify contract is deployed on this network
      const code = await provider.getCode(contractAddress);
      if (!code || code === "0x") {
        throw new Error(
          `No contract found at ${contractAddress} on chain ${network.chainId}. ` +
          `Make sure you're connected to the correct network (HashKey testnet) and the contract is deployed.`
        );
      }

      const contract = new Contract(contractAddress, STREAMFI_ABI, signer);

      // Quick sanity check — verify contract responds
      try {
        await contract.platform();
      } catch {
        throw new Error(
          `Contract at ${contractAddress} does not match the StreamFi ABI. ` +
          `Verify the contract address and your network.`
        );
      }

      // Convert price per second: user enters in HSK (like ETH), we convert to wei
      const priceWei = BigInt(Math.round(Number(pricePerSecond) * 1e18));
      if (priceWei <= BigInt(0)) throw new Error("Price per second must be greater than 0");

      const tx = await contract.registerMovie(priceWei, payoutWallet);
      log(`Register tx sent: ${tx.hash}`);
      setStep("Waiting for on-chain confirmation...");
      const receipt = await tx.wait();
      log(`Tx confirmed in block ${receipt?.blockNumber}`);

      // Get the new movie count (= new movie's on-chain ID)
      let onChainId: bigint;
      try {
        onChainId = await contract.movieCount();
      } catch (mcErr: any) {
        throw new Error(
          `Movie registered on-chain but failed to read movieCount: ${mcErr.message}. ` +
          `The contract may not match the expected ABI, or you may be on the wrong network.`
        );
      }
      log(`Movie registered on-chain with ID: ${onChainId.toString()}`);

      // --- Step 3: Upload media file ---
      setCurrentStep(2);
      setStep("Uploading media file...");
      log("Uploading media file...");

      const mediaUploadData = new FormData();
      mediaUploadData.append("file", mediaFile);

      const mediaUploadResult = await uploadWithRetry(
        "/api/upload-media",
        mediaUploadData,
        "media",
        (loaded, total) => {
          const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
          setMediaUploadProgress({ loaded, total, percent });
        }
      );
      const uploadedMediaUrl = mediaUploadResult?.url;
      if (!uploadedMediaUrl) throw new Error("Media upload succeeded but URL was not returned");
      setMediaUploadProgress({ loaded: mediaFile.size, total: mediaFile.size, percent: 100 });
      log("Media file uploaded");

      // --- Step 4: Upload thumbnail ---
      setCurrentStep(3);
      setStep("Uploading thumbnail...");
      log("Uploading thumbnail...");

      const uploadData = new FormData();
      uploadData.append("file", thumbnailFile);

      const thumbnailUploadResult = await uploadWithRetry("/api/upload-thumbnail", uploadData, "thumbnail");
      const uploadedThumbnailUrl = thumbnailUploadResult?.url;
      if (!uploadedThumbnailUrl) throw new Error("Thumbnail upload succeeded but URL was not returned");
      log("Thumbnail uploaded");

      // --- Step 5: Save metadata to database ---
      setCurrentStep(4);
      setStep("Saving movie metadata...");
      log("Saving metadata to database...");

      const res = await fetchWithTimeout("/api/movies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onChainId: Number(onChainId),
          title,
          description,
          genre,
          duration: Number(duration),
          pricePerSecond: Number(pricePerSecond),
          creatorWallet: payoutWallet,
          videoUrl: uploadedMediaUrl,
          thumbnailUrl: uploadedThumbnailUrl,
          sourceUpcomingId: upcomingIdToConvert.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save movie metadata");
      }

      if (upcomingIdToConvert.trim()) {
        log(`✅ Linked upcoming ID ${upcomingIdToConvert.trim()} to this uploaded movie.`);
      }

      setCurrentStep(5);
      log(`✅ Movie "${title}" created successfully (on-chain ID: ${onChainId.toString()})`);
      setMessage(`✅ Movie created! On-chain ID: ${onChainId.toString()}`);
      setStep("");

      // Reset form
      setTitle("");
      setDescription("");
      setGenre("");
      setDuration("");
      setPricePerSecond("");
      setPayoutWallet(creatorWallet || "");
      setUpcomingIdToConvert("");
      setMediaFile(null);
      setThumbnailFile(null);
      setThumbnailPreview(null);

      if (onSuccess) onSuccess();
    } catch (err: any) {
      const errMsg =
        err?.name === "AbortError"
          ? "Request timed out. Please try again with a smaller file or better network."
          : err.reason || err.message || "Upload failed";
      setMessage(`❌ ${errMsg}`);
      log(`Error: ${errMsg}`);
      setStep("");
      setCurrentStep(0);
    } finally {
      setLoading(false);
    }
  }

  const stepLabels = [
    "",
    "Step 1/4: Registering on blockchain...",
    "Step 2/4: Uploading media file...",
    "Step 3/4: Uploading thumbnail...",
    "Step 4/4: Saving metadata...",
    "Done!",
  ];

  return (
    <form onSubmit={handleSubmit} className="commercial-form">
      <div className="space-y-2 mb-8">
        <div className="dashboard-section-title">Upload new title</div>
        <p style={{ fontSize: "0.9rem", color: "var(--text-dim)" }}>
          Provide the core details and source assets for this release before it
          goes live on StreamFi.
        </p>
      </div>

      {/* Cinematic Progress indicator */}
      {loading && currentStep > 0 && (
        <div className="upload-progress p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl mb-8">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-[var(--primary)] uppercase tracking-[0.2em]">{stepLabels[currentStep]}</span>
            <span className="text-[10px] text-slate-500 font-mono">STEP {currentStep} OF 4</span>
          </div>
          <div className="upload-progress-bar h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="upload-progress-fill h-full bg-[var(--primary)] transition-all duration-700 ease-out"
              style={{ width: `${(Math.min(currentStep, 4) / 4) * 100}%` }}
            />
          </div>

          {currentStep === 2 && mediaFile && (
            <div className="mt-4 p-4 rounded-xl bg-black/40 border border-white/5">
              <div className="flex justify-between text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
                <span>Transmitting Media Data</span>
                <span className="text-[var(--primary)]">{mediaUploadProgress?.percent || 0}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-[var(--primary)]"
                  style={{ width: `${mediaUploadProgress?.percent || 0}%` }}
                />
              </div>
              <div className="flex justify-between mt-3 text-[10px] text-slate-500 font-mono">
                <span>{formatBytes(mediaUploadProgress?.loaded || 0)}</span>
                <span>TOTAL: {formatBytes(mediaUploadProgress?.total || mediaFile.size)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="form-group-grid">
        <div className="space-y-2">
          <label className="label">Production Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Interstellar Odyssey" disabled={loading} />
        </div>
        <div className="space-y-2">
          <label className="label">Genre / Category</label>
          <input className="input" value={genre} onChange={(e) => setGenre(e.target.value)} required placeholder="Sci-Fi, Action..." disabled={loading} />
        </div>
      </div>

      <div className="space-y-2 mb-6">
        <label className="label">Cinematic Description</label>
        <textarea
          className="input min-h-[120px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          placeholder="A brief overview of your masterpiece..."
          disabled={loading}
        />
      </div>

      <div className="form-group-grid">
        <div className="space-y-2">
          <label className="label">Runtime (minutes)</label>
          <input
            className="input"
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <label className="label">Rate (HSK per second)</label>
          <input
            className="input"
            type="number"
            step="0.0001"
            min={0}
            value={pricePerSecond}
            onChange={(e) => setPricePerSecond(e.target.value)}
            required
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-2 mb-8">
        <label className="label">Settlement Wallet Address</label>
        <input
          className="input"
          value={payoutWallet}
          onChange={(e) => setPayoutWallet(e.target.value)}
          placeholder="0x..."
          required
          disabled={loading}
        />
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
          Royalties and viewer payments for this movie will be routed to this
          wallet. You can use a different address from your connected wallet
          if you prefer.
        </p>
      </div>

      <div className="form-group-grid" style={{ marginTop: "2.5rem" }}>
        <div className="space-y-2">
          <label className="label">Primary Master Source</label>
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.35rem" }}>
            Highest quality encoded file used for on‑demand streaming.
          </p>
          <div className="relative group">
            <input
              ref={mediaInputRef}
              className="absolute inset-0 z-10"
              type="file"
              accept="video/*,audio/*,.mp4,.webm,.mov,.m4v,.avi,.mkv,.mp3,.wav,.m4a,.ogg,.flac"
              onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
              required
              disabled={loading}
              style={{ opacity: 0, cursor: loading ? "default" : "pointer" }}
            />
            <div
              style={{
                padding: "1.75rem 1.5rem",
                borderRadius: "1.5rem",
                border: mediaFile ? "1px solid var(--primary)" : "1px dashed rgba(255,255,255,0.12)",
                background: mediaFile ? "rgba(91,33,182,0.12)" : "rgba(15,23,42,0.85)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: "0.35rem",
              }}
              onClick={() => {
                if (!loading) mediaInputRef.current?.click();
              }}
            >
              {!mediaFile && (
                <span
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#e5e7eb",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Upload master file
                </span>
              )}
              {mediaFile && (
                <span
                  style={{
                    display: "block",
                    maxWidth: 220,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#e5e7eb",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {mediaFile.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="label">Cinematic Poster</label>
          <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.35rem" }}>
            Vertical artwork shown in carousels and collections.
          </p>
          <div className="relative group">
            <input
              ref={posterInputRef}
              className="absolute inset-0 z-10"
              type="file"
              accept="image/*"
              disabled={loading}
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setThumbnailFile(file);
                if (file) {
                  const previewUrl = URL.createObjectURL(file);
                  setThumbnailPreview(previewUrl);
                } else {
                  setThumbnailPreview(null);
                }
              }}
              required
              style={{ opacity: 0, cursor: loading ? "default" : "pointer" }}
            />
            <div
              style={{
                padding: "1.75rem 1.5rem",
                borderRadius: "1.5rem",
                border: thumbnailFile ? "1px solid var(--primary)" : "1px dashed rgba(255,255,255,0.12)",
                background: thumbnailFile ? "rgba(91,33,182,0.10)" : "rgba(15,23,42,0.8)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: "0.35rem",
              }}
              onClick={() => {
                if (!loading) posterInputRef.current?.click();
              }}
            >
              {thumbnailPreview ? (
                <img
                  src={thumbnailPreview}
                  alt="Poster preview"
                  style={{ height: 72, width: 48, objectFit: "cover", borderRadius: 8, boxShadow: "0 14px 40px rgba(0,0,0,0.8)" }}
                />
              ) : (
                <>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#e5e7eb",
                    }}
                  >
                    Click to select poster image
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6">
        <button
          className="sf-btn sf-btn-default"
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "1.1rem 1.5rem",
            fontSize: "0.95rem",
            fontWeight: 700,
            textTransform: "none",
            letterSpacing: "0.06em",
            justifyContent: "center",
          }}
        >
          {loading ? step || "Processing Release..." : "Finalize & Publish to Network"}
        </button>
        <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.5rem", textAlign: "center" }}>
          On submit we will register the movie on-chain, upload media, and
          persist metadata in a single guided flow.
        </p>
      </div>

      {message && (
        <div
          className={`mt-6 p-5 rounded-2xl border text-sm font-bold text-center animate-fade-in ${message.startsWith("✅")
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : message.startsWith("❌")
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : 'bg-white/5 border-white/10 text-slate-400'
            }`}
        >
          {message}
        </div>
      )}
    </form>
  );
}
