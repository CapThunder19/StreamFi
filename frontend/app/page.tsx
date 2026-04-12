"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  HomeIcon,
  FilmIcon,
  UserIcon,
  BanknotesIcon,
  PlayIcon,
} from "@heroicons/react/24/solid";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { BrowserProvider, Contract, isAddress, parseEther } from "ethers";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Progress, Tag, Tooltip } from "antd";
import { Clapperboard, Sparkles, WalletCards } from "lucide-react";
import { useAccount, useDisconnect } from "wagmi";
import abiJson from "../abi/StreamFiPayment.json";
import UploadMovieForm from "../components/UploadMovieForm";
import MovieGrid from "../components/MovieGrid";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ViewerBill, getViewerBills } from "../lib/viewerBilling";

const STREAMFI_ABI = abiJson.abi;
const ROLE_STORAGE_PREFIX = "streamfi.role.";

type UserRole = "viewer" | "creator";

type LogItem = { id: number; text: string };

type Movie = {
  id: string;
  onChainId: number;
  title: string;
  description: string;
  genre: string;
  duration: number;
  pricePerSecond: number;
  creatorWallet: string;
  videoUrl: string;
  thumbnailUrl: string;
};

type UpcomingMovie = {
  id: string;
  title: string;
  description: string;
  genre: string;
  creatorWallet: string;
  thumbnailUrl: string;
  targetAmountHsk: number;
  onChainId: number | null;
  createdAt: string;
};

const GENRES = [
  { name: "Action", color: "#f97316" },
  { name: "Sci-Fi", color: "#0ea5e9" },
  { name: "Drama", color: "#ec4899" },
  { name: "Comedy", color: "#facc15" },
  { name: "Documentary", color: "#22c55e" },
];

const CHIPS = ["All", "New Releases", "Trending", "Live Premieres", "Invest Opportunities", "Pay-per-second", "Free to Watch"];

/* ─── Framer motion variants ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/* ─── HashKey Chain Testnet configuration ─── */
const HASHKEY_TESTNET = {
  chainId: "0x85",          // 133 in hex
  chainIdDecimal: 133,
  chainName: "HashKey Chain Testnet",
  rpcUrls: ["https://testnet.hsk.xyz"],
  nativeCurrency: {
    name: "HSK",
    symbol: "HSK",
    decimals: 18,
  },
  blockExplorerUrls: ["https://testnet-explorer.hsk.xyz"],
};

/** Request MetaMask to switch to HashKey testnet; add the chain if it's unknown */
async function switchToHashKeyTestnet(injectedProvider?: any) {
  const anyWin = window as any;
  const walletProvider = injectedProvider || anyWin.ethereum;
  if (!walletProvider) return;

  try {
    await walletProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HASHKEY_TESTNET.chainId }],
    });
  } catch (switchError: any) {
    // 4902 = chain not added to wallet yet → add it automatically
    if (switchError.code === 4902) {
      await walletProvider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: HASHKEY_TESTNET.chainId,
            chainName: HASHKEY_TESTNET.chainName,
            rpcUrls: HASHKEY_TESTNET.rpcUrls,
            nativeCurrency: HASHKEY_TESTNET.nativeCurrency,
            blockExplorerUrls: HASHKEY_TESTNET.blockExplorerUrls,
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

export default function HomePage() {
  const router = useRouter();
  const { address: connectedAddress } = useAccount();
  const { disconnect } = useDisconnect();

  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);

  const [logs, setLogs] = useState<LogItem[]>([]);
  const logIdRef = useRef<number>(0);

  // Per-section loading state so operations don't block each other
  const [investLoading, setInvestLoading] = useState<boolean>(false);
  const [payLoading, setPayLoading] = useState<boolean>(false);
  const [streamLoading, setStreamLoading] = useState<boolean>(false);
  const [withdrawLoading, setWithdrawLoading] = useState<boolean>(false);

  const [showIntro, setShowIntro] = useState<boolean>(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [activeChip, setActiveChip] = useState<string>("All");
  const [currentPage, setCurrentPage] = useState<"home" | "categories" | "creators" | "invest" | "creator-analytics">("home");

  const [movies, setMovies] = useState<Movie[]>([]);
  const [upcomingMovies, setUpcomingMovies] = useState<UpcomingMovie[]>([]);
  const [moviesLoading, setMoviesLoading] = useState<boolean>(false);
  const [moviesError, setMoviesError] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState<number>(0);

  // Status messages for each console card
  const [investStatus, setInvestStatus] = useState<string | null>(null);
  const [payStatus, setPayStatus] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);

  // Input state for console cards
  const [invMovieId, setInvMovieId] = useState<string>("");
  const [invAmount, setInvAmount] = useState<string>("");
  const [payMovieId, setPayMovieId] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [streamMovieId, setStreamMovieId] = useState<string>("");
  const [settleSeconds, setSettleSeconds] = useState<string>("");
  const [wdMovieId, setWdMovieId] = useState<string>("");
  const [upTitle, setUpTitle] = useState<string>("");
  const [upDescription, setUpDescription] = useState<string>("");
  const [upGenre, setUpGenre] = useState<string>("");
  const [upTargetHsk, setUpTargetHsk] = useState<string>("");
  const [upOnChainId, setUpOnChainId] = useState<string>("");
  const [upThumbnailFile, setUpThumbnailFile] = useState<File | null>(null);
  const [upThumbnailPreview, setUpThumbnailPreview] = useState<string | null>(null);
  const [upPayoutWallet, setUpPayoutWallet] = useState<string>("");
  const [removeUpcomingId, setRemoveUpcomingId] = useState<string>("");
  const [upcomingLoading, setUpcomingLoading] = useState<boolean>(false);
  const [upcomingStatus, setUpcomingStatus] = useState<string | null>(null);
  const [viewerBills, setViewerBills] = useState<ViewerBill[]>([]);
  const [creatorAnalyticsLoading, setCreatorAnalyticsLoading] = useState<boolean>(false);
  const [creatorStats, setCreatorStats] = useState<Array<{
    movieId: string;
    onChainId: number;
    title: string;
    totalRevenueHsk: number;
    creatorEarningHsk: number;
    investorPoolHsk: number;
    totalSharesWei: string;
  }>>([]);
  const [selectedHomeMovie, setSelectedHomeMovie] = useState<Movie | null>(null);

  // Ref to keep contract address stable
  const contractAddressRef = useRef<string>("");
  const activeInjectedProviderRef = useRef<any>(null);

  useEffect(() => {
    const envAddr = process.env.NEXT_PUBLIC_STREAMFI_CONTRACT_ADDRESS;
    if (envAddr) contractAddressRef.current = envAddr;
    const timer = setTimeout(() => setShowIntro(false), 2600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (connectedAddress) {
      setAccount((prev) =>
        prev && prev.toLowerCase() === connectedAddress.toLowerCase() ? prev : connectedAddress
      );
      return;
    }

    setProvider(null);
    setAccount(null);
    setContract(null);
    setRole(null);
  }, [connectedAddress]);

  useEffect(() => {
    if (!account) {
      setRole(null);
      return;
    }
    const storedRole = window.localStorage.getItem(`${ROLE_STORAGE_PREFIX}${account.toLowerCase()}`) as UserRole | null;
    if (storedRole === "viewer" || storedRole === "creator") {
      setRole(storedRole);
      return;
    }
    setRole(null);
  }, [account]);

  useEffect(() => {
    if (!role) return;
    if (role === "creator" && (currentPage === "categories" || currentPage === "invest")) {
      setCurrentPage("creators");
    }
    if (role === "viewer" && (currentPage === "creators" || currentPage === "creator-analytics")) {
      setCurrentPage("categories");
    }
  }, [role, currentPage]);

  const loadViewerBills = useCallback(() => {
    if (!account) {
      setViewerBills([]);
      return;
    }
    const bills = getViewerBills(account).sort((a, b) => b.updatedAt - a.updatedAt);
    setViewerBills(bills);
  }, [account]);

  useEffect(() => {
    loadViewerBills();
  }, [loadViewerBills]);

  useEffect(() => {
    const onStorage = () => loadViewerBills();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadViewerBills]);

  const loadMovies = useCallback(async () => {
    setMoviesLoading(true);
    setMoviesError(null);
    try {
      const res = await fetch("/api/movies");
      if (!res.ok) throw new Error("Failed to load movies");
      const data = await res.json();
      setMovies(data);
    } catch (err: any) {
      setMoviesError(err.message || "Failed to load movies");
    } finally {
      setMoviesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMovies();
  }, [loadMovies]);

  const loadUpcomingMovies = useCallback(async () => {
    try {
      const res = await fetch("/api/upcoming-movies");
      if (!res.ok) throw new Error("Failed to fetch upcoming movies");
      const data = await res.json();
      setUpcomingMovies(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Failed to load upcoming movies", err);
    }
  }, []);

  useEffect(() => {
    loadUpcomingMovies();
  }, [loadUpcomingMovies]);

  useEffect(() => {
    if (account && !upPayoutWallet) {
      setUpPayoutWallet(account);
    }
  }, [account, upPayoutWallet]);

  useEffect(() => {
    if (!movies.length) {
      setHeroIndex(0);
      return undefined;
    }

    setHeroIndex(0);

    if (movies.length === 1) {
      return undefined;
    }

    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % movies.length);
    }, 10000);

    return () => clearInterval(interval);
  }, [movies]);

  const pushLog = useCallback((text: string) => {
    const nextId = logIdRef.current;
    logIdRef.current += 1;
    setLogs((prev) => [{ id: nextId, text }, ...prev].slice(0, 80));
  }, []);

  async function getWalletProvider() {
    const anyWin = window as any;
    const injected = anyWin.ethereum;
    if (!injected) throw new Error("No wallet found. Install MetaMask or Rainbow Wallet.");

    const providers: any[] = Array.isArray(injected.providers) && injected.providers.length
      ? injected.providers
      : [injected];

    if (account) {
      const target = account.toLowerCase();
      for (const p of providers) {
        try {
          const accounts = (await p.request({ method: "eth_accounts" })) as string[];
          if (accounts.some((addr) => addr.toLowerCase() === target)) {
            return p;
          }
        } catch {
          // Ignore providers that reject account reads
        }
      }
    }

    return activeInjectedProviderRef.current || providers[0];
  }

  /** Ensure wallet is connected on HashKey testnet and return signer */
  async function ensureWallet() {
    if (typeof window === "undefined") throw new Error("Window not available");
    const walletProvider = await getWalletProvider();
    activeInjectedProviderRef.current = walletProvider;

    const requestedAccounts = (await walletProvider.request({
      method: "eth_requestAccounts",
    })) as string[];
    if (!requestedAccounts?.length) {
      throw new Error("No wallet account available. Please unlock MetaMask.");
    }

    const selectedAddress = (walletProvider.selectedAddress as string | undefined)?.toLowerCase();
    const activeAccount =
      requestedAccounts.find((addr) => addr.toLowerCase() === selectedAddress) || requestedAccounts[0];

    // Always switch to HashKey testnet before connecting
    await switchToHashKeyTestnet(walletProvider);

    if (!provider) {
      // Create a fresh provider AFTER the chain switch
      const p = new BrowserProvider(walletProvider);
      setProvider(p);

      // Verify we're actually on the right chain
      const network = await p.getNetwork();
      if (Number(network.chainId) !== HASHKEY_TESTNET.chainIdDecimal) {
        throw new Error(
          `Still connected to chain ${network.chainId}. Please manually switch to HashKey testnet (chain ID 133) in your wallet.`
        );
      }

      const s = await p.getSigner(activeAccount);
      const addr = await s.getAddress();
      setAccount(addr);
      pushLog(`Wallet connected on HashKey testnet: ${addr}`);
      return { provider: p, signer: s };
    } else {
      // Re-verify the chain in case user switched networks manually
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== HASHKEY_TESTNET.chainIdDecimal) {
        // Chain changed — force re-create provider after switching
        await switchToHashKeyTestnet(walletProvider);
        const p = new BrowserProvider(walletProvider);
        setProvider(p);
        const s = await p.getSigner(activeAccount);
        const addr = await s.getAddress();
        setAccount(addr);
        pushLog(`Reconnected on HashKey testnet: ${addr}`);
        return { provider: p, signer: s };
      }

      const s = await provider.getSigner(activeAccount);
      const addr = await s.getAddress();
      setAccount(addr);
      return { provider, signer: s };
    }
  }

  /** Get or create contract instance — always fresh to avoid stale state */
  async function getContract(): Promise<Contract> {
    const { provider: prov, signer } = await ensureWallet();
    const addr = contractAddressRef.current;
    if (!addr) {
      throw new Error("Contract address not configured. Set NEXT_PUBLIC_STREAMFI_CONTRACT_ADDRESS in .env.local");
    }

    // Verify contract is deployed on this network
    const code = await prov.getCode(addr);
    if (!code || code === "0x") {
      const network = await prov.getNetwork();
      throw new Error(
        `No contract found at ${addr} on chain ${network.chainId}. ` +
        `Make sure you're on the correct network (HashKey testnet) and the contract is deployed.`
      );
    }

    // Always create a fresh contract with current signer
    const c = new Contract(addr, STREAMFI_ABI, signer);
    setContract(c);
    return c;
  }

  /** Helper to resolve an on-chain movie ID from user input */
  function resolveOnChainId(input: string): bigint {
    if (!input || input.trim() === "") throw new Error("Please enter a Movie ID");
    const id = BigInt(input);
    if (id <= BigInt(0)) throw new Error("Movie ID must be greater than 0");
    return id;
  }

  async function assertMovieExists(c: Contract, id: bigint) {
    const movie = await c.movies(id);
    if (!movie?.exists) {
      throw new Error(
        `Movie #${id.toString()} not found on this contract. ` +
          "Use the correct on-chain ID or deploy/connect the right contract address."
      );
    }
  }

  // ─── HANDLER: Invest ───
  async function handleInvest() {
    try {
      setInvestLoading(true);
      setInvestStatus(null);
      const c = await getContract();
      const id = resolveOnChainId(invMovieId);
      await assertMovieExists(c, id);
      if (!invAmount || invAmount.trim() === "") throw new Error("Enter amount in ETH/HSK");
      const value = parseEther(invAmount);
      pushLog(`Investing ${invAmount} ETH in movie #${id.toString()}...`);
      setInvestStatus("⏳ Sending transaction...");
      const tx = await c.invest(id, { value });
      pushLog(`Invest tx: ${tx.hash}`);
      setInvestStatus("⏳ Waiting for confirmation...");
      await tx.wait();
      pushLog("✅ Investment confirmed!");
      setInvestStatus("✅ Investment confirmed!");
      setInvMovieId("");
      setInvAmount("");
    } catch (e: any) {
      const msg = e.reason || e.message || String(e);
      pushLog(`❌ Invest error: ${msg}`);
      setInvestStatus(`❌ ${msg}`);
    } finally {
      setInvestLoading(false);
    }
  }

  // ─── HANDLER: One-off Pay ───
  async function handlePayOnce() {
    try {
      setPayLoading(true);
      setPayStatus(null);
      const c = await getContract();
      const id = resolveOnChainId(payMovieId);
      await assertMovieExists(c, id);
      if (!payAmount || payAmount.trim() === "") throw new Error("Enter amount in ETH/HSK");
      const value = parseEther(payAmount);
      pushLog(`Paying ${payAmount} ETH for movie #${id.toString()}...`);
      setPayStatus("⏳ Sending transaction...");
      const tx = await c.pay(id, { value });
      pushLog(`Pay tx: ${tx.hash}`);
      setPayStatus("⏳ Waiting for confirmation...");
      await tx.wait();
      pushLog("✅ Payment confirmed!");
      setPayStatus("✅ Payment confirmed!");
      setPayMovieId("");
      setPayAmount("");
    } catch (e: any) {
      const msg = e.reason || e.message || String(e);
      pushLog(`❌ Pay error: ${msg}`);
      setPayStatus(`❌ ${msg}`);
    } finally {
      setPayLoading(false);
    }
  }

  // ─── HANDLER: Start Stream ───
  async function handleStartStream() {
    try {
      setStreamLoading(true);
      setStreamStatus(null);
      const c = await getContract();
      const id = resolveOnChainId(streamMovieId);
      await assertMovieExists(c, id);
      pushLog(`Starting stream for movie #${id.toString()}...`);
      setStreamStatus("⏳ Sending transaction...");
      const tx = await c.startStream(id);
      pushLog(`Start stream tx: ${tx.hash}`);
      setStreamStatus("⏳ Waiting for confirmation...");
      await tx.wait();
      pushLog("✅ Stream started!");
      setStreamStatus("✅ Stream started!");
    } catch (e: any) {
      const msg = e.reason || e.message || String(e);
      pushLog(`❌ Start stream error: ${msg}`);
      setStreamStatus(`❌ ${msg}`);
    } finally {
      setStreamLoading(false);
    }
  }

  // ─── HANDLER: Settle Stream ───
  async function handleSettleStream() {
    try {
      setStreamLoading(true);
      setStreamStatus(null);
      const c = await getContract();
      const id = resolveOnChainId(streamMovieId);
      await assertMovieExists(c, id);
      const secs = settleSeconds ? BigInt(settleSeconds) : BigInt(0);
      if (!secs) throw new Error("Enter seconds to settle");
      const movie = await c.movies(id);
      const pricePerSecondWei: bigint = movie.pricePerSecond;
      const amountDue = pricePerSecondWei * secs;
      pushLog(`Settling ${secs.toString()}s — cost: ${amountDue.toString()} wei...`);
      setStreamStatus("⏳ Sending settle transaction...");
      const tx = await c.settleStream(id, { value: amountDue });
      pushLog(`Settle tx: ${tx.hash}`);
      setStreamStatus("⏳ Waiting for confirmation...");
      await tx.wait();
      pushLog("✅ Stream settled!");
      setStreamStatus("✅ Stream settled!");
      setSettleSeconds("");
    } catch (e: any) {
      const msg = e.reason || e.message || String(e);
      pushLog(`❌ Settle error: ${msg}`);
      setStreamStatus(`❌ ${msg}`);
    } finally {
      setStreamLoading(false);
    }
  }

  // ─── HANDLER: Stop Stream ───
  async function handleStopStream() {
    try {
      setStreamLoading(true);
      setStreamStatus(null);
      const c = await getContract();
      const id = resolveOnChainId(streamMovieId);
      await assertMovieExists(c, id);
      pushLog(`Stopping stream for movie #${id.toString()}...`);
      setStreamStatus("⏳ Sending transaction...");
      const tx = await c.stopStream(id);
      pushLog(`Stop stream tx: ${tx.hash}`);
      setStreamStatus("⏳ Waiting for confirmation...");
      await tx.wait();
      pushLog("✅ Stream stopped!");
      setStreamStatus("✅ Stream stopped!");
    } catch (e: any) {
      const msg = e.reason || e.message || String(e);
      pushLog(`❌ Stop stream error: ${msg}`);
      setStreamStatus(`❌ ${msg}`);
    } finally {
      setStreamLoading(false);
    }
  }

  // ─── HANDLER: Withdraw Investor Funds ───
  async function handleWithdraw() {
    try {
      setWithdrawLoading(true);
      setWithdrawStatus(null);
      const c = await getContract();
      const id = resolveOnChainId(wdMovieId);
      pushLog(`Withdrawing investor funds for movie #${id.toString()}...`);
      setWithdrawStatus("⏳ Sending transaction...");
      const tx = await c.withdrawInvestorFunds(id);
      pushLog(`Withdraw tx: ${tx.hash}`);
      setWithdrawStatus("⏳ Waiting for confirmation...");
      await tx.wait();
      pushLog("✅ Withdrawal confirmed! Check your wallet.");
      setWithdrawStatus("✅ Withdrawal confirmed!");
      setWdMovieId("");
    } catch (e: any) {
      const msg = e.reason || e.message || String(e);
      pushLog(`❌ Withdraw error: ${msg}`);
      setWithdrawStatus(`❌ ${msg}`);
    } finally {
      setWithdrawLoading(false);
    }
  }

  // ─── HANDLER: Invest from card (Invest page) ───
  async function handleInvestFromCard(movie: Movie, amount: string) {
    try {
      setInvestLoading(true);
      const c = await getContract();
      const id = BigInt(movie.onChainId);
      await assertMovieExists(c, id);
      if (!amount) throw new Error("Enter investment amount");
      const value = parseEther(amount);
      pushLog(`Investing ${amount} ETH in "${movie.title}" (on-chain #${id.toString()})...`);
      const tx = await c.invest(id, { value });
      pushLog(`Invest tx: ${tx.hash}`);
      await tx.wait();
      pushLog(`✅ Investment in "${movie.title}" confirmed!`);
    } catch (e: any) {
      const msg = e.reason || e.message || String(e);
      pushLog(`❌ Invest error: ${msg}`);
    } finally {
      setInvestLoading(false);
    }
  }

  async function handleInvestUpcoming(movie: UpcomingMovie, amount: string) {
    if (!movie.onChainId || movie.onChainId <= 0) {
      throw new Error("This upcoming movie has no on-chain ID yet. Creator must set it first.");
    }
    try {
      setInvestLoading(true);
      const c = await getContract();
      const id = BigInt(movie.onChainId);
      await assertMovieExists(c, id);
      if (!amount) throw new Error("Enter investment amount");
      const value = parseEther(amount);
      pushLog(`Investing ${amount} ETH in upcoming "${movie.title}" (#${id.toString()})...`);
      const tx = await c.invest(id, { value });
      pushLog(`Invest tx: ${tx.hash}`);
      await tx.wait();
      pushLog(`✅ Investment in upcoming "${movie.title}" confirmed!`);
    } catch (e: any) {
      const msg = e.reason || e.message || String(e);
      pushLog(`❌ Invest error: ${msg}`);
      throw e;
    } finally {
      setInvestLoading(false);
    }
  }

  async function handleCreateUpcomingMovie() {
    if (!account) {
      setUpcomingStatus("❌ Connect wallet first");
      return;
    }
    if (!upTitle || !upDescription || !upGenre) {
      setUpcomingStatus("❌ Fill title, description and genre");
      return;
    }
    if (!upPayoutWallet || !isAddress(upPayoutWallet)) {
      setUpcomingStatus("❌ Enter valid payout wallet address");
      return;
    }

    try {
      setUpcomingLoading(true);
      setUpcomingStatus("⏳ Creating upcoming movie...");

      let uploadedUpcomingThumbnailUrl = "";
      if (upThumbnailFile) {
        const uploadData = new FormData();
        uploadData.append("file", upThumbnailFile);

        const thumbRes = await fetch("/api/upload-thumbnail", {
          method: "POST",
          body: uploadData,
        });

        if (!thumbRes.ok) {
          const data = await thumbRes.json().catch(() => ({}));
          throw new Error(data.error || "Failed to upload upcoming thumbnail");
        }

        const thumbData = await thumbRes.json();
        uploadedUpcomingThumbnailUrl = String(thumbData?.url || "");
      }

      const res = await fetch("/api/upcoming-movies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: upTitle,
          description: upDescription,
          genre: upGenre,
          creatorWallet: upPayoutWallet,
          thumbnailUrl: uploadedUpcomingThumbnailUrl,
          targetAmountHsk: Number(upTargetHsk || 0),
          onChainId: Number(upOnChainId || 0),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create upcoming movie");
      }

      await loadUpcomingMovies();
      setUpcomingStatus("✅ Upcoming movie created");
      setUpTitle("");
      setUpDescription("");
      setUpGenre("");
      setUpTargetHsk("");
      setUpOnChainId("");
      setUpThumbnailFile(null);
      setUpThumbnailPreview(null);
      setUpPayoutWallet(account || "");
    } catch (e: any) {
      const msg = e.message || String(e);
      setUpcomingStatus(`❌ ${msg}`);
    } finally {
      setUpcomingLoading(false);
    }
  }

  async function handleRemoveUpcomingMovie() {
    if (!removeUpcomingId.trim()) {
      setUpcomingStatus("❌ Enter upcoming ID to remove");
      return;
    }

    try {
      setUpcomingLoading(true);
      setUpcomingStatus("⏳ Removing upcoming movie...");
      const res = await fetch(`/api/upcoming-movies?id=${encodeURIComponent(removeUpcomingId.trim())}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove upcoming movie");
      }
      await loadUpcomingMovies();
      setUpcomingStatus("✅ Upcoming movie removed");
      setRemoveUpcomingId("");
    } catch (e: any) {
      const msg = e.message || String(e);
      setUpcomingStatus(`❌ ${msg}`);
    } finally {
      setUpcomingLoading(false);
    }
  }

  // ─── HANDLER: Disconnect wallet ───
  function handleDisconnect() {
    disconnect();
    setProvider(null);
    setAccount(null);
    setContract(null);
    setRole(null);
    activeInjectedProviderRef.current = null;
    setLogs([]);
    pushLog("Wallet disconnected");
  }

  async function loadCreatorAnalytics() {
    if (!account) return;
    try {
      setCreatorAnalyticsLoading(true);
      const c = await getContract();
      const myMovies = movies.filter((m) => m.creatorWallet?.toLowerCase() === account.toLowerCase());

      const stats = await Promise.all(
        myMovies.map(async (m) => {
          const id = BigInt(m.onChainId);
          const chainMovie = await c.movies(id);
          const totalShares = await c.totalShares(id);
          const totalRevenueWei = chainMovie.totalRevenue as bigint;
          const totalRevenueHsk = Number(totalRevenueWei) / 1e18;
          return {
            movieId: m.id,
            onChainId: m.onChainId,
            title: m.title,
            totalRevenueHsk,
            creatorEarningHsk: totalRevenueHsk * 0.6,
            investorPoolHsk: totalRevenueHsk * 0.3,
            totalSharesWei: totalShares.toString(),
          };
        })
      );

      setCreatorStats(stats);
    } catch (e: any) {
      const msg = e.reason || e.message || String(e);
      pushLog(`❌ Analytics error: ${msg}`);
    } finally {
      setCreatorAnalyticsLoading(false);
    }
  }

  function handleSelectRole(nextRole: UserRole) {
    if (!account) return;
    window.localStorage.setItem(`${ROLE_STORAGE_PREFIX}${account.toLowerCase()}`, nextRole);
    setRole(nextRole);
    setCurrentPage(nextRole === "creator" ? "creators" : "categories");
    pushLog(`Role assigned: ${nextRole}`);
  }

  const shortAccount = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : "disconnected";

  const heroMovie = movies.length ? movies[heroIndex % movies.length] : null;
  const secondaryMovies = movies.filter((_, idx) => idx !== (heroIndex % movies.length)).slice(0, 3);

  // Helper: render inline status message
  function StatusMessage({ status }: { status: string | null }) {
    if (!status) return null;
    const color = status.startsWith("✅") ? "#4ade80" : status.startsWith("❌") ? "#f87171" : "#fdba74";
    return (
      <p className="small" style={{ marginTop: "0.35rem", color }}>
        {status}
      </p>
    );
  }

  /* ─── INTRO SCREEN ─── */
  if (showIntro) {
    return (
      <div className="intro-overlay">
        <motion.div
          className="intro-logo"
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="intro-logo-main">StreamFi</span>
          <span className="intro-logo-sub">Streaming, but on-chain.</span>
        </motion.div>
      </div>
    );
  }

  /* ─── CONNECT WALLET GATE ─── */
  if (!account) {
    return (
      <div className="gate-screen">
        <motion.div
          className="card gate-card"
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div style={{ marginBottom: "0.5rem" }}>
            <span
              style={{
                fontSize: "2rem",
                fontWeight: 800,
                background: "linear-gradient(135deg, #f97316, #fb923c)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              StreamFi
            </span>
          </div>
          <span className="tag-pill">Welcome to StreamFi</span>
          <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "center", gap: "0.45rem" }}>
            <Tag color="orange" icon={<WalletCards size={13} />}>Wallet</Tag>
            <Tag color="gold" icon={<Clapperboard size={13} />}>Movies</Tag>
            <Tag color="geekblue" icon={<Sparkles size={13} />}>On-chain</Tag>
          </div>
          <h1
            style={{
              marginTop: "0.8rem",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            Connect your wallet to enter.
          </h1>
          <p className="small" style={{ marginTop: "0.5rem", maxWidth: "320px", marginInline: "auto" }}>
            Use a HashKey-compatible wallet so we can load your movies, streams and balances on chain.
          </p>
          <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "center" }}>
            <ConnectButton showBalance={false} />
          </div>
          <div style={{ marginTop: "0.9rem" }}>
            <Progress
              percent={100}
              size="small"
              showInfo={false}
              strokeColor={{ from: "#f97316", to: "#fb923c" }}
            />
          </div>
          <p className="small" style={{ marginTop: "0.75rem" }}>
            Make sure your network is set to HashKey testnet.
          </p>
        </motion.div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="gate-screen">
        <motion.div
          className="card gate-card"
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="tag-pill">First-time wallet setup</span>
          <h1
            style={{
              marginTop: "0.8rem",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            Choose your StreamFi role
          </h1>
          <p className="small" style={{ marginTop: "0.5rem", maxWidth: "360px", marginInline: "auto" }}>
            We will remember this role for this wallet on future logins.
          </p>

          <div style={{ display: "grid", gap: "0.6rem", marginTop: "1.2rem" }}>
            <Button variant="default" size="default" onClick={() => handleSelectRole("viewer")}>
              I am a Viewer
            </Button>
            <Button variant="outline" size="default" onClick={() => handleSelectRole("creator")}>
              I am a Creator
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ─── MAIN APP ─── */
  return (
    <div className="app-shell">
      {/* ─── SIDEBAR ─── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">
            <FilmIcon className="sidebar-icon" />
          </div>
          <div>
            <div className="sidebar-logo-title">StreamFi</div>
            <div className="sidebar-logo-sub">Movies · Web3 · PayFi</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-item ${currentPage === "home" ? "sidebar-item-active" : ""}`}
            type="button"
            onClick={() => setCurrentPage("home")}
          >
            <HomeIcon />
            <span>Home</span>
          </button>
          {role === "viewer" && (
            <>
              <button
                className={`sidebar-item ${currentPage === "categories" ? "sidebar-item-active" : ""}`}
                type="button"
                onClick={() => setCurrentPage("categories")}
              >
                <FilmIcon />
                <span>Movies</span>
              </button>
              <button
                className={`sidebar-item ${currentPage === "invest" ? "sidebar-item-active" : ""}`}
                type="button"
                onClick={() => setCurrentPage("invest")}
              >
                <BanknotesIcon />
                <span>Viewer Dashboard</span>
              </button>
            </>
          )}
          {role === "creator" && (
            <>
              <button
                className={`sidebar-item ${currentPage === "creators" ? "sidebar-item-active" : ""}`}
                type="button"
                onClick={() => setCurrentPage("creators")}
              >
                <UserIcon />
                <span>Creator Dashboard</span>
              </button>
              <button
                className={`sidebar-item ${currentPage === "creator-analytics" ? "sidebar-item-active" : ""}`}
                type="button"
                onClick={() => {
                  setCurrentPage("creator-analytics");
                  loadCreatorAnalytics();
                }}
              >
                <BanknotesIcon />
                <span>Earnings & Investments</span>
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-section-label">Playlists</div>
        <div>
          {GENRES.map((g) => (
            <button className="genre-pill" type="button" key={g.name}>
              <span className="genre-pill-dot" style={{ background: g.color }} />
              <span>{g.name}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer" onClick={handleDisconnect}>
          <ArrowRightOnRectangleIcon />
          <span>Disconnect</span>
        </div>
      </aside>

      {/* ─── CONTENT ─── */}
      <div className="content-root">
        {/* Header */}
        <header className="content-header">
          <div className="search-bar">
            <input
              className="search-input"
              placeholder="Search movies, creators, or genres..."
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span className="wallet-chip">
              <span className="wallet-avatar" />
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#e5e7eb" }}>
                  {account ? shortAccount.split("...")[0] + "..." : "Guest"}
                </span>
                <span style={{ fontSize: "0.65rem", color: "#f97316" }}>
                  {shortAccount}
                </span>
              </span>
            </span>
            <Tag color="volcano" style={{ textTransform: "capitalize", marginInlineEnd: 0 }}>
              {role}
            </Tag>
            <Tooltip title="Disconnect wallet and clear current app session">
              <Button variant="default" size="sm" onClick={handleDisconnect}>
                Logout
              </Button>
            </Tooltip>
          </div>
        </header>

        {/* HOME PAGE -> Hero only */}
        {currentPage === "home" && (
          <motion.section
            className="hero-grid"
            style={
              heroMovie?.thumbnailUrl
                ? {
                    backgroundImage: `linear-gradient(120deg, rgba(15,23,42,0.96), rgba(15,23,42,0.75)), url(${heroMovie.thumbnailUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <div>
              {moviesLoading && (
                <div className="hero-info">
                  <h1 className="hero-title">Loading movies...</h1>
                  <p className="hero-meta">Fetching from StreamFi database</p>
                </div>
              )}

              {moviesError && !moviesLoading && (
                <div className="hero-info">
                  <h1 className="hero-title">Unable to load movies</h1>
                  <p className="hero-meta">{moviesError}</p>
                </div>
              )}

              {!moviesLoading && !moviesError && heroMovie && (
                <>
                  <div className="hero-poster-row">
                    <motion.div
                      className="hero-poster-card hero-poster-featured"
                      style={{ height: 220 }}
                      custom={0}
                      variants={fadeUp}
                      whileHover={{ y: -6, scale: 1.04 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      onClick={() => setSelectedHomeMovie(heroMovie)}
                    >
                      <div
                        className="poster-gradient"
                        style={{
                          height: "100%",
                          backgroundImage: heroMovie.thumbnailUrl
                            ? `linear-gradient(135deg, rgba(15,23,42,0.1), rgba(15,23,42,0.8)), url(${heroMovie.thumbnailUrl})`
                            : "linear-gradient(135deg,#4f46e5,#22d3ee)",
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      >
                        <div className="poster-label">
                          <div className="poster-label-title">{heroMovie.title}</div>
                          <div className="poster-label-sub">{heroMovie.genre}</div>
                        </div>
                      </div>
                    </motion.div>

                    {secondaryMovies.map((movie, index) => (
                      <motion.div
                        key={movie.id}
                        className="hero-poster-card"
                        style={{ height: 160 }}
                        custom={index + 1}
                        variants={fadeUp}
                        whileHover={{ y: -6, scale: 1.04 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        onClick={() => setSelectedHomeMovie(movie)}
                      >
                        <div
                          className="poster-gradient"
                          style={{
                            height: "100%",
                            backgroundImage: movie.thumbnailUrl
                              ? `linear-gradient(135deg, rgba(15,23,42,0.1), rgba(15,23,42,0.8)), url(${movie.thumbnailUrl})`
                              : "linear-gradient(135deg,#0f766e,#22c55e)",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        >
                          <div className="poster-label">
                            <div className="poster-label-title">{movie.title}</div>
                            <div className="poster-label-sub">{movie.genre}</div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="hero-info">
                    <h1 className="hero-title">{heroMovie.title}</h1>
                    <p className="hero-meta">
                      {heroMovie.genre} · {Math.round(heroMovie.duration)} min
                    </p>
                    <div style={{ marginTop: "0.6rem", maxWidth: 260 }}>
                      <Progress
                        percent={Math.min(100, Math.max(20, Math.round((heroMovie.duration / 240) * 100)))}
                        size="small"
                        showInfo={false}
                        strokeColor={{ from: "#f97316", to: "#fbbf24" }}
                        trailColor="rgba(255,255,255,0.15)"
                      />
                      <p className="small" style={{ color: "#d1d5db", marginTop: "0.2rem" }}>
                        Trend score based on recent watch activity
                      </p>
                    </div>
                    <motion.button
                      className="hero-play-btn"
                      whileHover={{ scale: 1.12 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={() => setSelectedHomeMovie(heroMovie)}
                    >
                      <PlayIcon />
                    </motion.button>
                  </div>

                  {movies.length > 1 && (
                    <div style={{ marginTop: "1.5rem" }}>
                      <div className="section-header" style={{ marginBottom: "0.75rem" }}>
                        <h2>Popular on StreamFi</h2>
                      </div>
                      <div className="movie-grid" aria-label="Popular movies on home">
                        {movies.slice(0, 6).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className="movie-card text-left"
                            onClick={() => setSelectedHomeMovie(m)}
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
                              {Math.round(m.duration)} min · 💰 {m.pricePerSecond.toFixed?.(2) ?? m.pricePerSecond} HSK/s
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!moviesLoading && !moviesError && !heroMovie && (
                <div className="hero-info">
                  <h1 className="hero-title">No movies yet</h1>
                  <p className="hero-meta">Upload your first movie from the Creators tab.</p>
                </div>
              )}
            </div>
          </motion.section>
        )}

        {/* CATEGORIES PAGE -> chips + trending grid */}
        {role === "viewer" && currentPage === "categories" && (
          <>
            <motion.section
              className="category-section"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              <div className="category-header">
                <h2>Select category</h2>
                <div className="category-arrows">
                  <button type="button"><ChevronLeftIcon style={{ width: 12, height: 12 }} /></button>
                  <button type="button"><ChevronRightIcon style={{ width: 12, height: 12 }} /></button>
                </div>
              </div>
              <div className="chips-row">
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    className={`chip ${activeChip === c ? "chip-active" : ""}`}
                    type="button"
                    onClick={() => setActiveChip(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </motion.section>

            <motion.section
              style={{ marginBottom: "1.5rem" }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              <div className="section-header">
                <h2>Trending Movies</h2>
              </div>
              <MovieGrid />
            </motion.section>
          </>
        )}

        {/* CREATORS PAGE -> unified upload + console tools + log */}
        {role === "creator" && currentPage === "creators" && (
          <>
            <motion.section
              style={{ marginBottom: "0.75rem" }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.15rem" }}>
                Creator Dashboard
              </h2>
              <p className="small" style={{ marginBottom: "0.75rem" }}>
                Create movies and manage creator operations for your wallet.
              </p>
            </motion.section>

                <motion.div
                  className="console-grid"
                  initial="hidden"
                  animate="visible"
                  variants={staggerContainer}
                >
              {/* 01 · CREATOR — Register & Upload Movie (unified) */}
              <motion.section className="console-card" custom={0} variants={fadeUp}>
            <div className="console-number">01 · CREATOR</div>
            <h2>Register & Upload Movie</h2>
            <p className="small">Registers on-chain + saves metadata. One step.</p>
            <UploadMovieForm
              creatorWallet={account}
              onSuccess={loadMovies}
              pushLog={pushLog}
            />
          </motion.section>

          {/* 02 · WITHDRAW */}
          <motion.section className="console-card" custom={1} variants={fadeUp}>
            <div className="console-number">02 · WITHDRAW</div>
            <h2>Withdraw Investor Funds</h2>
            <p className="small">Withdraw your accumulated investor balance for a movie where you invested.</p>
            <label className="label">Movie ID (on-chain)</label>
            <input
              className="input"
              type="number"
              min={1}
              value={wdMovieId}
              onChange={(e) => setWdMovieId(e.target.value)}
              placeholder="1"
              disabled={withdrawLoading}
            />
            <Button
              variant="default"
              size="default"
              type="button"
              onClick={handleWithdraw}
              disabled={withdrawLoading}
              style={{ width: "100%", marginTop: "0.6rem" }}
            >
              {withdrawLoading ? "Processing..." : "Withdraw Funds"}
            </Button>
            <StatusMessage status={withdrawStatus} />
            {movies.length > 0 && (
              <div className="quick-pick">
                <span className="quick-pick-label">Quick pick:</span>
                {movies.slice(0, 5).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="quick-pick-btn"
                    onClick={() => setWdMovieId(String(m.onChainId))}
                    title={m.title}
                  >
                    #{m.onChainId} {m.title}
                  </button>
                ))}
              </div>
            )}
          </motion.section>

          {/* 03 · UPCOMING */}
          <motion.section className="console-card" custom={2} variants={fadeUp}>
            <div className="console-number">03 · UPCOMING</div>
            <h2>Upcoming Movies</h2>
            <p className="small">Viewers can invest only in upcoming movies. Add upcoming and remove it later using ID.</p>

            <label className="label">Title</label>
            <input className="input" value={upTitle} onChange={(e) => setUpTitle(e.target.value)} placeholder="Upcoming title" />

            <label className="label">Description</label>
            <textarea className="input" rows={2} value={upDescription} onChange={(e) => setUpDescription(e.target.value)} placeholder="Short teaser" />

            <label className="label">Genre</label>
            <input className="input" value={upGenre} onChange={(e) => setUpGenre(e.target.value)} placeholder="Drama" />

            <label className="label">Target (HSK)</label>
            <input className="input" type="number" min={0} step="0.0001" value={upTargetHsk} onChange={(e) => setUpTargetHsk(e.target.value)} placeholder="100" />

            <label className="label">On-chain Movie ID (optional)</label>
            <input className="input" type="number" min={1} value={upOnChainId} onChange={(e) => setUpOnChainId(e.target.value)} placeholder="Set after registration" />

            <label className="label">Upcoming Thumbnail (optional)</label>
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setUpThumbnailFile(file);
                if (file) {
                  setUpThumbnailPreview(URL.createObjectURL(file));
                } else {
                  setUpThumbnailPreview(null);
                }
              }}
            />
            {upThumbnailPreview && (
              <img
                src={upThumbnailPreview}
                alt="Upcoming thumbnail preview"
                style={{ marginTop: "0.45rem", borderRadius: "0.5rem", maxHeight: "7rem", objectFit: "cover" }}
              />
            )}

            <label className="label">Payout Wallet Address</label>
            <input className="input" value={upPayoutWallet} onChange={(e) => setUpPayoutWallet(e.target.value)} placeholder="0x..." />

            <Button
              variant="default"
              size="default"
              type="button"
              onClick={handleCreateUpcomingMovie}
              disabled={upcomingLoading}
              style={{ width: "100%", marginTop: "0.6rem" }}
            >
              {upcomingLoading ? "Processing..." : "Add Upcoming Movie"}
            </Button>

            <hr className="hr" />
            <label className="label">Remove upcoming by ID</label>
            <input className="input" value={removeUpcomingId} onChange={(e) => setRemoveUpcomingId(e.target.value)} placeholder="e.g. 1712-abcd12" />
            <Button
              variant="outline"
              size="default"
              type="button"
              onClick={handleRemoveUpcomingMovie}
              disabled={upcomingLoading}
              style={{ width: "100%", marginTop: "0.6rem" }}
            >
              Remove Upcoming Movie
            </Button>

            {upcomingStatus && <StatusMessage status={upcomingStatus} />}

            <div style={{ marginTop: "0.6rem", display: "grid", gap: "0.4rem" }}>
              {upcomingMovies
                .filter((m) => m.creatorWallet?.toLowerCase() === account?.toLowerCase())
                .slice(0, 5)
                .map((m) => (
                  <div key={m.id} className="small" style={{ color: "#d1d5db" }}>
                    {m.thumbnailUrl ? (
                      <img
                        src={m.thumbnailUrl}
                        alt={m.title}
                        style={{ width: "100%", maxHeight: "7rem", objectFit: "cover", borderRadius: "0.45rem", marginBottom: "0.35rem" }}
                      />
                    ) : null}
                    ID: {m.id} · {m.title} · on-chain: {m.onChainId ?? "not set"} · payout: {m.creatorWallet.slice(0, 6)}...{m.creatorWallet.slice(-4)}
                  </div>
                ))}
            </div>
          </motion.section>
            </motion.div>

            {/* Activity Log */}
            {logs.length > 0 && (
              <section className="log" aria-label="Activity log">
                {logs.map((l) => (
                  <div key={l.id} className="log-line">
                    &gt; {l.text}
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {/* INVEST PAGE -> Invest & Earn section with functional buttons */}
        {role === "viewer" && currentPage === "invest" && (
          <motion.section
            style={{ marginBottom: "1.5rem" }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <div className="section-header">
              <h2>Viewer Dashboard</h2>
            </div>
            {movies.length === 0 ? (
              <p className="small" style={{ marginTop: "0.75rem" }}>
                No movies available yet.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                <motion.section className="console-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="console-number">00 · BILLING</div>
                  <h2>Auto Settlement</h2>
                  <p className="small">Micropayments are auto-settled when the player closes or video ends.</p>
                  <div style={{ marginTop: "0.6rem", display: "grid", gap: "0.55rem" }}>
                    {viewerBills.length === 0 && (
                      <p className="small">No active sessions yet. Open any movie and play to start streaming.</p>
                    )}
                    {viewerBills.map((bill) => {
                      return (
                        <div key={`${bill.movieId}-${bill.onChainId}`} className="card" style={{ padding: "0.6rem 0.7rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{bill.title}</div>
                              <div className="small">Movie #{bill.onChainId} · Watched: {bill.watchedSeconds}s</div>
                              <div className="small" style={{ color: "#fb923c" }}>
                                Session tracked: {(bill.pricePerSecond * bill.watchedSeconds).toFixed(6)} HSK
                              </div>
                            </div>
                            <div className="small" style={{ color: "#4ade80" }}>Auto-paid on close</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.section>

                <motion.div
                  className="console-grid"
                  initial="hidden"
                  animate="visible"
                  variants={staggerContainer}
                >
                  <motion.section className="console-card" custom={0} variants={fadeUp}>
                    <div className="console-number">01 · PAY</div>
                    <h2>One-off Payment</h2>
                    <p className="small">Split: 60% creator · 30% investors · 10% platform.</p>
                    <label className="label">Movie ID (on-chain)</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={payMovieId}
                      onChange={(e) => setPayMovieId(e.target.value)}
                      placeholder="1"
                      disabled={payLoading}
                    />
                    <label className="label">Amount (ETH/HSK)</label>
                    <input
                      className="input"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="0.01"
                      disabled={payLoading}
                    />
                    <Button
                      variant="default"
                      size="default"
                      type="button"
                      onClick={handlePayOnce}
                      disabled={payLoading}
                      style={{ width: "100%", marginTop: "0.6rem" }}
                    >
                      {payLoading ? "Processing..." : "Pay once"}
                    </Button>
                    <StatusMessage status={payStatus} />
                    {movies.length > 0 && (
                      <div className="quick-pick">
                        <span className="quick-pick-label">Quick pick:</span>
                        {movies.slice(0, 5).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className="quick-pick-btn"
                            onClick={() => setPayMovieId(String(m.onChainId))}
                            title={m.title}
                          >
                            #{m.onChainId} {m.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.section>

                  <motion.section className="console-card" custom={1} variants={fadeUp}>
                    <div className="console-number">02 · STREAM</div>
                    <h2>Streaming Mode</h2>
                    <p className="small">Start/stop stream and settle seconds to pay exact due.</p>
                    <label className="label">Movie ID (on-chain)</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={streamMovieId}
                      onChange={(e) => setStreamMovieId(e.target.value)}
                      placeholder="1"
                      disabled={streamLoading}
                    />
                    <div className="console-inline-btns">
                      <Button
                        variant="default"
                        size="sm"
                        type="button"
                        onClick={handleStartStream}
                        disabled={streamLoading}
                      >
                        Start
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={handleStopStream}
                        disabled={streamLoading}
                      >
                        Stop
                      </Button>
                    </div>
                    <hr className="hr" />
                    <label className="label">Settle seconds</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={settleSeconds}
                      onChange={(e) => setSettleSeconds(e.target.value)}
                      placeholder="e.g. 30"
                      disabled={streamLoading}
                    />
                    <Button
                      variant="default"
                      size="default"
                      type="button"
                      onClick={handleSettleStream}
                      disabled={streamLoading}
                      style={{ width: "100%", marginTop: "0.6rem" }}
                    >
                      {streamLoading ? "Processing..." : "Settle now"}
                    </Button>
                    <StatusMessage status={streamStatus} />
                    {movies.length > 0 && (
                      <div className="quick-pick">
                        <span className="quick-pick-label">Quick pick:</span>
                        {movies.slice(0, 5).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className="quick-pick-btn"
                            onClick={() => setStreamMovieId(String(m.onChainId))}
                            title={m.title}
                          >
                            #{m.onChainId} {m.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.section>
                </motion.div>

                <div className="section-header" style={{ marginTop: "0.5rem" }}>
                  <h2>Invest in Upcoming Movies</h2>
                </div>
                {upcomingMovies.length === 0 ? (
                  <p className="small">No upcoming movies available for investment yet.</p>
                ) : (
                  <div className="invest-grid">
                    {upcomingMovies.map((m) => (
                      <UpcomingInvestCard
                        key={m.id}
                        movie={m}
                        loading={investLoading}
                        onInvest={handleInvestUpcoming}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Show activity log on invest page too */}
            {logs.length > 0 && (
              <section className="log" aria-label="Activity log" style={{ marginTop: "1rem" }}>
                {logs.map((l) => (
                  <div key={l.id} className="log-line">
                    &gt; {l.text}
                  </div>
                ))}
              </section>
            )}
          </motion.section>
        )}

        {role === "creator" && currentPage === "creator-analytics" && (
          <motion.section
            style={{ marginBottom: "1.5rem" }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <div className="section-header">
              <h2>Creator Earnings & Investments</h2>
            </div>

            {creatorAnalyticsLoading ? (
              <p className="small" style={{ marginTop: "0.7rem" }}>Loading on-chain analytics...</p>
            ) : creatorStats.length === 0 ? (
              <p className="small" style={{ marginTop: "0.7rem" }}>No analytics yet. Upload movie and receive payments/investments.</p>
            ) : (
              <div className="invest-grid">
                {creatorStats.map((s) => (
                  <Card key={s.movieId} className="card">
                    <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{s.title}</div>
                    <div className="small" style={{ marginTop: "0.2rem" }}>On-chain ID: #{s.onChainId}</div>
                    <div style={{ marginTop: "0.65rem", fontSize: "0.75rem", display: "grid", gap: "0.25rem" }}>
                      <div>Total Revenue: <span style={{ color: "#fbbf24" }}>{s.totalRevenueHsk.toFixed(6)} HSK</span></div>
                      <div>Creator Earnings (60%): <span style={{ color: "#4ade80" }}>{s.creatorEarningHsk.toFixed(6)} HSK</span></div>
                      <div>Investor Pool (30%): <span style={{ color: "#60a5fa" }}>{s.investorPoolHsk.toFixed(6)} HSK</span></div>
                      <div>Total Investment Shares (wei): <span style={{ color: "#d1d5db" }}>{s.totalSharesWei}</span></div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <div style={{ marginTop: "0.8rem" }}>
              <Button variant="outline" size="sm" type="button" onClick={loadCreatorAnalytics} disabled={creatorAnalyticsLoading}>
                Refresh Analytics
              </Button>
            </div>
          </motion.section>
        )}

        <AnimatePresence>
          {selectedHomeMovie && (
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
                onClick={() => setSelectedHomeMovie(null)}
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
                    backgroundImage: selectedHomeMovie.thumbnailUrl
                      ? `linear-gradient(180deg, rgba(15,23,42,0.25), rgba(15,23,42,0.9)), url(${selectedHomeMovie.thumbnailUrl})`
                      : "linear-gradient(135deg,#4f46e5,#22d3ee)",
                  }}
                />

                <div className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-white">{selectedHomeMovie.title}</h3>
                      <p className="text-sm text-orange-300">
                        {selectedHomeMovie.genre} · {Math.round(selectedHomeMovie.duration)} min
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                      onClick={() => setSelectedHomeMovie(null)}
                    >
                      Close
                    </button>
                  </div>

                  <p className="text-sm leading-6 text-slate-300">{selectedHomeMovie.description}</p>

                  <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span>
                      Creator: {selectedHomeMovie.creatorWallet.slice(0, 6)}...{selectedHomeMovie.creatorWallet.slice(-4)}
                    </span>
                    <span>Price: {selectedHomeMovie.pricePerSecond} HSK/sec</span>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      className="rounded-full bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-400"
                      onClick={() => router.push(`/watch/${selectedHomeMovie.id}`)}
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

    </div>
  );
}

/* ─── Invest Card sub-component ─── */
function InvestCard({
  movie,
  loading,
  onInvest,
}: {
  movie: Movie;
  loading: boolean;
  onInvest: (movie: Movie, amount: string) => void;
}) {
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
    <Card className="card">
      <div className="invest-title-row">
        <div
          className="invest-poster"
          style={
            movie.thumbnailUrl
              ? {
                  backgroundImage: `url(${movie.thumbnailUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        />
        <div>
          <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{movie.title}</div>
          <div className="small">
            {movie.genre} · {Math.round(movie.duration)} min
          </div>
          <div className="small" style={{ color: "#f97316", fontWeight: 500 }}>
            On-chain ID: #{movie.onChainId}
          </div>
        </div>
      </div>
      <div style={{ marginTop: "0.7rem", fontSize: "0.7rem", color: "#9ca3af" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
          <span>Price/sec</span>
          <span style={{ color: "#fdba74" }}>{movie.pricePerSecond} HSK</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Revenue split</span>
          <span>60/30/10</span>
        </div>
      </div>
      <div style={{ marginTop: "0.6rem" }}>
        <label className="label">Investment Amount (ETH/HSK)</label>
        <input
          className="input"
          type="text"
          placeholder="e.g. 0.1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <Button
        variant="default"
        size="default"
        type="button"
        style={{ width: "100%", marginTop: "0.5rem" }}
        disabled={loading || !amount}
        onClick={handleClick}
      >
        {loading ? "Processing..." : "Invest Now"}
      </Button>
      {status && (
        <p
          className="small"
          style={{
            marginTop: "0.25rem",
            color: status.startsWith("✅") ? "#4ade80" : status.startsWith("❌") ? "#f87171" : "#fdba74",
          }}
        >
          {status}
        </p>
      )}
    </Card>
  );
}

function UpcomingInvestCard({
  movie,
  loading,
  onInvest,
}: {
  movie: UpcomingMovie;
  loading: boolean;
  onInvest: (movie: UpcomingMovie, amount: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const canInvestOnChain = Boolean(movie.onChainId && movie.onChainId > 0);

  const handleClick = async () => {
    if (!canInvestOnChain) {
      setStatus("❌ On-chain ID not set yet");
      return;
    }
    setStatus("⏳ Sending...");
    try {
      await onInvest(movie, amount);
      setStatus("✅ Investment sent!");
      setAmount("");
    } catch (e: any) {
      setStatus(`❌ ${e?.message || "Failed"}`);
    }
  };

  return (
    <Card className="card">
      {movie.thumbnailUrl ? (
        <img
          src={movie.thumbnailUrl}
          alt={movie.title}
          style={{ width: "100%", height: "9rem", objectFit: "cover", borderRadius: "0.6rem", marginBottom: "0.55rem" }}
        />
      ) : null}
      <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{movie.title}</div>
      <div className="small" style={{ marginTop: "0.2rem" }}>
        {movie.genre} · Upcoming by {movie.creatorWallet.slice(0, 6)}...{movie.creatorWallet.slice(-4)}
      </div>
      <div className="small" style={{ marginTop: "0.2rem" }}>{movie.description}</div>
      <div style={{ marginTop: "0.6rem", fontSize: "0.72rem", color: "#9ca3af" }}>
        <div>Target: <span style={{ color: "#fbbf24" }}>{movie.targetAmountHsk || 0} HSK</span></div>
        <div>On-chain ID: <span style={{ color: canInvestOnChain ? "#4ade80" : "#f87171" }}>{movie.onChainId ?? "not set"}</span></div>
      </div>

      <div style={{ marginTop: "0.6rem" }}>
        <label className="label">Investment Amount (ETH/HSK)</label>
        <input
          className="input"
          type="text"
          placeholder="e.g. 0.1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!canInvestOnChain}
        />
      </div>
      <Button
        variant={canInvestOnChain ? "default" : "outline"}
        size="default"
        type="button"
        style={{ width: "100%", marginTop: "0.5rem" }}
        disabled={loading || !amount || !canInvestOnChain}
        onClick={handleClick}
      >
        {canInvestOnChain ? (loading ? "Processing..." : "Invest in Upcoming") : "Waiting for On-chain ID"}
      </Button>
      {status && (
        <p
          className="small"
          style={{
            marginTop: "0.25rem",
            color: status.startsWith("✅") ? "#4ade80" : status.startsWith("❌") ? "#f87171" : "#fdba74",
          }}
        >
          {status}
        </p>
      )}
    </Card>
  );
}
