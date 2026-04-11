"use client";

import { useEffect, useState } from "react";
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

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [duration, setDuration] = useState("");
  const [pricePerSecond, setPricePerSecond] = useState("");
  const [payoutWallet, setPayoutWallet] = useState("");
  const [upcomingIdToRemove, setUpcomingIdToRemove] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<number>(0); // 0=idle, 1=registering, 2=uploading media, 3=uploading thumb, 4=saving DB, 5=done
  const [mediaUploadProgress, setMediaUploadProgress] = useState<{ loaded: number; total: number; percent: number } | null>(null);

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
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save movie metadata");
      }

      // Optional: remove matching upcoming movie entry once this movie is fully uploaded.
      if (upcomingIdToRemove.trim()) {
        setStep("Removing upcoming entry...");
        const removeRes = await fetchWithTimeout(
          `/api/upcoming-movies?id=${encodeURIComponent(upcomingIdToRemove.trim())}`,
          { method: "DELETE" }
        );

        if (removeRes.ok) {
          log(`✅ Removed upcoming movie ID: ${upcomingIdToRemove.trim()}`);
        } else {
          const removeData = await removeRes.json().catch(() => ({}));
          log(`⚠️ Could not remove upcoming ID ${upcomingIdToRemove.trim()}: ${removeData.error || "Unknown error"}`);
        }
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
      setUpcomingIdToRemove("");
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
    <form onSubmit={handleSubmit} className="space-y-2 mt-2">
      {/* Progress indicator */}
      {loading && currentStep > 0 && (
        <div className="upload-progress">
          <div className="upload-progress-bar">
            <div
              className="upload-progress-fill"
              style={{ width: `${(Math.min(currentStep, 4) / 4) * 100}%` }}
            />
          </div>
          <span className="upload-progress-label">{stepLabels[currentStep]}</span>

          {currentStep === 2 && mediaFile && (
            <div style={{ marginTop: "0.35rem" }}>
              <div style={{ fontSize: "0.72rem", color: "#f8fafc", marginBottom: "0.25rem" }}>
                {mediaUploadProgress
                  ? `${mediaUploadProgress.percent}% uploaded (${formatBytes(mediaUploadProgress.loaded)} / ${formatBytes(
                      mediaUploadProgress.total
                    )})`
                  : `0% uploaded (0 B / ${formatBytes(mediaFile.size)})`}
              </div>
              <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>
                {mediaUploadProgress
                  ? `Remaining: ${formatBytes(Math.max(mediaUploadProgress.total - mediaUploadProgress.loaded, 0))}`
                  : `Remaining: ${formatBytes(mediaFile.size)}`}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="space-y-1">
        <label className="label">Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={loading} />
      </div>
      <div className="space-y-1">
        <label className="label">Description</label>
        <textarea
          className="input"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-1">
        <label className="label">Genre</label>
        <input className="input" value={genre} onChange={(e) => setGenre(e.target.value)} required disabled={loading} />
      </div>
      <div className="space-y-1">
        <label className="label">Duration (minutes)</label>
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
      <div className="space-y-1">
        <label className="label">Price per second (HSK)</label>
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
      <div className="space-y-1">
        <label className="label">Payout Wallet Address (investment + micropayments)</label>
        <input
          className="input"
          value={payoutWallet}
          onChange={(e) => setPayoutWallet(e.target.value)}
          placeholder="0x..."
          required
          disabled={loading}
        />
      </div>
      <div className="space-y-1">
        <label className="label">Upcoming ID to remove after upload (optional)</label>
        <input
          className="input"
          value={upcomingIdToRemove}
          onChange={(e) => setUpcomingIdToRemove(e.target.value)}
          placeholder="e.g. 1712412345-ab12cd"
          disabled={loading}
        />
      </div>
      <div className="space-y-1">
        <label className="label">Movie File (MP4/Video/Audio)</label>
        <input
          className="input"
          type="file"
          accept="video/*,audio/*,.mp4,.webm,.mov,.m4v,.avi,.mkv,.mp3,.wav,.m4a,.ogg,.flac"
          onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
          required
          disabled={loading}
        />
        {mediaFile && (
          <p className="small" style={{ marginTop: "0.25rem" }}>
            Selected: {mediaFile.name}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <label className="label">Thumbnail Image</label>
        <input
          className="input"
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
        />
        {thumbnailPreview && (
          <div style={{ marginTop: "0.5rem" }}>
            <p className="small" style={{ marginBottom: "0.25rem" }}>
              Preview:
            </p>
            <img
              src={thumbnailPreview}
              alt="Thumbnail preview"
              style={{
                maxHeight: "8rem",
                borderRadius: "0.5rem",
                border: "1px solid rgba(255,255,255,0.08)",
                objectFit: "cover",
              }}
            />
          </div>
        )}
      </div>
      <button className="button" type="submit" disabled={loading} style={{ width: "100%" }}>
        {loading ? step || "Processing..." : "Register & Upload Movie"}
      </button>
      {message && (
        <p
          className="small"
          style={{
            marginTop: "0.35rem",
            color: message.startsWith("✅") ? "#4ade80" : message.startsWith("❌") ? "#f87171" : "#6b7280",
          }}
        >
          {message}
        </p>
      )}
    </form>
  );
}
