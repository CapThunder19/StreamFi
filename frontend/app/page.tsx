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
  ChevronDownIcon,
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
  status: "upcoming" | "published";
  linkedMovieId: string | null;
  publishedOnChainId: number | null;
  pledgedTotalHsk: number;
  investorCount: number;
  onChainReady: boolean;
  createdAt: string;
};

const GENRES = [
  { name: "Action", color: "#00f2ff" },
  { name: "Sci-Fi", color: "#a855f7" },
  { name: "Drama", color: "#ec4899" },
  { name: "Animation", color: "#22c55e" },
  { name: "Thriller", color: "#3b82f6" },
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
  const [currentPage, setCurrentPage] = useState<"home" | "categories" | "creators" | "invest" | "creator-analytics" | "creator-upload" | "creator-withdraw" | "creator-upcoming">("home");
  const [isCreatorDropdownOpen, setIsCreatorDropdownOpen] = useState<boolean>(false);

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
  const [upThumbnailFile, setUpThumbnailFile] = useState<File | null>(null);
  const [upThumbnailPreview, setUpThumbnailPreview] = useState<string | null>(null);
  const [upPayoutWallet, setUpPayoutWallet] = useState<string>("");
  const [removeUpcomingId, setRemoveUpcomingId] = useState<string>("");
  const [upcomingLoading, setUpcomingLoading] = useState<boolean>(false);
  const [publishingUpcomingId, setPublishingUpcomingId] = useState<string | null>(null);
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
      setCurrentPage("creator-upload");
    }
    if (role === "viewer" && (currentPage.startsWith("creator-"))) {
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
    if (!account) {
      throw new Error("Connect wallet first");
    }
    if (movie.status === "published" || movie.linkedMovieId) {
      throw new Error("This movie is already published. Invest from published movies.");
    }
    if (!movie.onChainReady || !movie.onChainId || movie.onChainId <= 0) {
      throw new Error("This upcoming movie is not live on-chain yet. Ask creator to publish on-chain first.");
    }
    try {
      setInvestLoading(true);
      if (!amount) throw new Error("Enter investment amount");
      const amountHsk = Number(amount);
      if (!Number.isFinite(amountHsk) || amountHsk <= 0) {
        throw new Error("Enter a valid investment amount");
      }

      const c = await getContract();
      const id = BigInt(movie.onChainId);
      await assertMovieExists(c, id);

      const value = parseEther(amount);
      pushLog(`Sending on-chain upcoming investment ${amount} ETH in "${movie.title}" (#${id.toString()})...`);
      const tx = await c.invest(id, { value });
      pushLog(`Invest tx: ${tx.hash}`);
      await tx.wait();

      pushLog(`Recording successful upcoming investment ${amountHsk} HSK in database...`);
      const res = await fetch("/api/upcoming-investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcomingId: movie.id,
          investorWallet: account,
          amountHsk,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to record upcoming investment");
      }

      const data = await res.json().catch(() => ({}));
      await loadUpcomingMovies();
      pushLog(
        `✅ On-chain investment confirmed and recorded. Total pledged: ${Number(data?.totalInvestedHsk || 0).toFixed(4)} HSK by ${Number(data?.investorCount || 0)} investor(s).`
      );
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
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create upcoming movie");
      }

      const createdUpcoming = await res.json().catch(() => null);

      await loadUpcomingMovies();
      setUpcomingStatus(
        createdUpcoming?.onChainId
          ? `✅ Upcoming movie created with on-chain ID #${createdUpcoming.onChainId}`
          : "✅ Upcoming movie created"
      );
      setUpTitle("");
      setUpDescription("");
      setUpGenre("");
      setUpTargetHsk("");
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
      setUpcomingStatus(`[ERR] ${msg}`);
    } finally {
      setUpcomingLoading(false);
    }
  }

  async function handlePublishUpcomingOnChain(movie: UpcomingMovie) {
    if (!account) {
      setUpcomingStatus("❌ Connect wallet first");
      return;
    }
    if (movie.status === "published" || movie.linkedMovieId) {
      setUpcomingStatus("❌ This upcoming movie is already published");
      return;
    }
    if (movie.onChainReady) {
      setUpcomingStatus(`✅ Upcoming \"${movie.title}\" is already live on-chain (#${movie.onChainId})`);
      return;
    }

    const priceInput = window.prompt(`Set price per second in HSK for \"${movie.title}\"`, "0.0001");
    if (priceInput === null) return;

    const priceNum = Number(priceInput);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setUpcomingStatus("❌ Enter a valid price per second");
      return;
    }

    const payoutWallet = isAddress(movie.creatorWallet) ? movie.creatorWallet : account;

    try {
      setPublishingUpcomingId(movie.id);
      setUpcomingStatus("⏳ Publishing upcoming movie on-chain...");

      const c = await getContract();
      const priceWei = parseEther(String(priceNum));
      const tx = await c.registerMovie(priceWei, payoutWallet);
      pushLog(`Publish upcoming tx: ${tx.hash}`);
      await tx.wait();

      const newOnChainId = Number(await c.movieCount());

      const patchRes = await fetch(`/api/upcoming-movies?id=${encodeURIComponent(movie.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onChainId: newOnChainId }),
      });

      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update upcoming movie after publish");
      }

      await loadUpcomingMovies();
      setUpcomingStatus(`✅ Published on-chain with movie ID #${newOnChainId}. Investors can now pay on-chain.`);
    } catch (e: any) {
      const msg = e.reason || e.message || String(e);
      setUpcomingStatus(`❌ ${msg}`);
    } finally {
      setPublishingUpcomingId(null);
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

  // --- WALLET GATE ---
  if (!account) {
    return (
      <div className="gate-screen">
        <motion.div
          className="gate-card"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="sidebar-logo-mark" style={{ margin: "0 auto 2rem", width: "4rem", height: "4rem" }}>
            <FilmIcon className="sidebar-icon" style={{ width: "2rem", height: "2rem" }} />
          </div>
          <span className="tag-pill">Web3 Streaming</span>
          <h1 style={{ marginTop: "1.5rem", fontSize: "2.5rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
            Connect Wallet
          </h1>
          <p className="small" style={{ marginTop: "1rem", maxWidth: "340px", marginInline: "auto", fontSize: "1rem", color: "var(--text-dim)" }}>
            Access the future of decentralized entertainment on HashKey Chain.
          </p>
          <div className="wallet-connect-shell" style={{ marginTop: "2.5rem" }}>
            <ConnectButton showBalance={false} />
          </div>
          <div style={{ marginTop: "2rem" }}>
            <Progress
              percent={100}
              size="small"
              showInfo={false}
              strokeColor={{ from: "var(--primary)", to: "var(--secondary)" }}
            />
          </div>
          <p className="small" style={{ marginTop: "1rem", opacity: 0.6 }}>
            Secured by HashKey · Chain ID: 133
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
          <h1 style={{ marginTop: "0.80rem", fontSize: "1.50rem", fontWeight: 700, color: "#ffffff" }}>
            Choose your StreamFi role
          </h1>
          <p className="small" style={{ marginTop: "0.50rem", maxWidth: "360px", marginInline: "auto" }}>
            We will remember this role for this wallet on future logins.
          </p>
          <div className="role-choice-buttons">
            <Button className="role-choice-primary" variant="default" size="default" onClick={() => handleSelectRole("viewer")}>
              I am a Viewer
            </Button>
            <Button className="role-choice-secondary" variant="outline" size="default" onClick={() => handleSelectRole("creator")}>
              I am a Creator
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">
            <FilmIcon className="sidebar-icon" />
          </div>
          <div>
            <div className="sidebar-logo-title" style={{ fontSize: "1.25rem" }}>StreamFi</div>
            <div className="sidebar-logo-sub">Entertainment on Chain</div>
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
                className={`sidebar-item ${(currentPage.startsWith("creator-") && currentPage !== "creator-analytics") ? "sidebar-item-active" : ""}`}
                type="button"
                onClick={() => setIsCreatorDropdownOpen(!isCreatorDropdownOpen)}
              >
                <UserIcon />
                <span>Creator Dashboard</span>
                <ChevronDownIcon className={`sidebar-item-chevron ${isCreatorDropdownOpen ? "sidebar-item-chevron-open" : ""}`} />
              </button>

              {isCreatorDropdownOpen && (
                <div className="sidebar-sub-menu">
                  <button
                    className={`sidebar-sub-item ${currentPage === "creator-upload" ? "sidebar-sub-item-active" : ""}`}
                    onClick={() => setCurrentPage("creator-upload")}
                  >
                    <span>Register & Upload</span>
                  </button>
                  <button
                    className={`sidebar-sub-item ${currentPage === "creator-withdraw" ? "sidebar-sub-item-active" : ""}`}
                    onClick={() => setCurrentPage("creator-withdraw")}
                  >
                    <span>Withdraw Funds</span>
                  </button>
                  <button
                    className={`sidebar-sub-item ${currentPage === "creator-upcoming" ? "sidebar-sub-item-active" : ""}`}
                    onClick={() => setCurrentPage("creator-upcoming")}
                  >
                    <span>Upcoming Movies</span>
                  </button>
                </div>
              )}

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
                  {account ? account.slice(0, 6) + "..." : "Guest"}
                </span>
                <span style={{ fontSize: "0.65rem", color: "var(--primary)" }}>
                  {shortAccount}
                </span>
              </span>
            </span>
            <Tag color="cyan" style={{ border: "none", background: "rgba(0, 242, 255, 0.1)", color: "var(--primary)", textTransform: "capitalize", marginInlineEnd: 0 }}>
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
                  backgroundImage: `url(${heroMovie.thumbnailUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
                : {
                  background: "var(--accent-gradient)"
                }
            }
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            {moviesLoading && (
              <div className="hero-info">
                <h1 className="hero-title">Loading the stage...</h1>
              </div>
            )}

            {!moviesLoading && !moviesError && heroMovie && (
              <div className="hero-info">
                <motion.div custom={0} variants={fadeUp}>
                  <span className="tag-pill" style={{ background: "rgba(0, 242, 255, 0.2)", color: "#00f2ff", border: "none" }}>
                    Featured Movie
                  </span>
                </motion.div>
                <motion.h1 className="hero-title" custom={1} variants={fadeUp}>
                  {heroMovie.title}
                </motion.h1>
                <motion.p className="hero-meta" custom={2} variants={fadeUp}>
                  <span>{heroMovie.genre}</span>
                  <span>·</span>
                  <span>{Math.round(heroMovie.duration)} min</span>
                  <span>·</span>
                  <span style={{ color: "var(--primary)" }}> {heroMovie.pricePerSecond.toFixed?.(2) ?? heroMovie.pricePerSecond} HSK/s</span>
                </motion.p>

                <motion.div style={{ marginTop: "1.5rem" }} custom={3} variants={fadeUp}>
                  <button
                    className="hero-play-btn"
                    onClick={() => router.push(`/watch/${heroMovie.id}`)}
                  >
                    <PlayIcon />
                    Watch Now
                  </button>
                </motion.div>

                <motion.div style={{ marginTop: "2rem", maxWidth: 300 }} custom={4} variants={fadeUp}>
                  <Progress
                    percent={Math.min(100, Math.max(30, Math.round((heroMovie.duration / 240) * 100)))}
                    size="small"
                    showInfo={false}
                    strokeColor={{ from: "var(--primary)", to: "var(--secondary)" }}
                    trailColor="rgba(255,255,255,0.1)"
                  />
                </motion.div>
              </div>
            )}

            {!moviesLoading && !moviesError && !heroMovie && (
              <div className="hero-info">
                <h1 className="hero-title">No Movies Available</h1>
                <p>Welcome to StreamFi. Connect as a creator to upload the first one!</p>
              </div>
            )}
          </motion.section>
        )}

        {currentPage === "home" && !moviesLoading && !moviesError && movies.length > 0 && (
          <div className="content-root-inner animate-fade-in" style={{ marginTop: "4rem" }}>
            {/* TOP 3 HIGHLIGHT SECTION */}
            <div className="section-container" style={{ marginBottom: "5rem" }}>
              <div className="section-header">
                <h2>Top Rated Movies</h2>
                <div className="section-badge">Featured Picks</div>
              </div>
              <div className="movie-grid">
                {movies.slice(0, 3).map((m) => (
                  <div
                    key={m.id}
                    className="movie-card movie-card-landscape"
                    onClick={() => setSelectedHomeMovie(m)}
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
                        <span>{Math.round(m.duration)} min</span>
                        <span>·</span>
                        <span style={{ color: "var(--primary)" }}>💰 {m.pricePerSecond.toFixed?.(2) ?? m.pricePerSecond} HSK/s</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SEPARATE CONTAINER FOR ALL OTHERS */}
            <div className="section-container" style={{ marginBottom: "4rem" }}>
              <div className="section-header">
                <h2>Explore Collection</h2>
                <button onClick={() => setCurrentPage("categories")} className="view-all-btn">
                  Browse All Collections
                </button>
              </div>
              <div className="movie-grid">
                {movies.slice(3, 15).map((m) => (
                  <div
                    key={m.id}
                    className="movie-card"
                    onClick={() => setSelectedHomeMovie(m)}
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
                        <span>{Math.round(m.duration)} min</span>
                        <span>·</span>
                        <span className="movie-rating">★ 4.8</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
        {role === "creator" && currentPage === "creator-upload" && (
          <div className="dashboard-root animate-fade-in">
            <motion.section
              className="dashboard-header-premium"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="tag-pill mb-4" style={{ background: "rgba(139, 92, 246, 0.2)", color: "var(--primary)" }}>Production Mode</span>
              <h1 className="hero-title">Release New Content</h1>
              <p className="text-dim max-w-xl">Deploy your cinematic vision to the decentralized network. Secure master distribution and automated royalty splits.</p>
            </motion.section>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
            >
              <UploadMovieForm
                creatorWallet={account}
                onSuccess={() => { loadMovies(); setCurrentPage("home"); }}
                pushLog={pushLog}
              />
            </motion.div>
          </div>
        )}

        {role === "creator" && currentPage === "creator-withdraw" && (
          <div className="dashboard-root animate-fade-in">
            <motion.section
              className="dashboard-header-premium"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="tag-pill mb-4">Royalties & Payouts</span>
              <h1 className="hero-title">Settlement center</h1>
              <p className="text-dim max-w-xl">Review what your titles have earned and trigger a clean on-chain payout for a specific movie when you are ready.</p>
            </motion.section>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="flex justify-center"
            >
              <motion.section className="console-card w-full max-w-xl" custom={0} variants={fadeUp}>
                <div className="console-number">ROYALTY WITHDRAWAL</div>
                <h2 className="mb-2">Withdraw royalties</h2>
                <p className="text-sm text-slate-400 mb-8">Each withdrawal clears the balance for one on-chain content ID, keeping splits to investors and the platform in sync.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "0.5rem" }}>
                  <div className="space-y-2">
                    <label className="label">On-chain content ID</label>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={wdMovieId}
                      onChange={(e) => setWdMovieId(e.target.value)}
                      placeholder="e.g. 1"
                      disabled={withdrawLoading}
                    />
                  </div>
                  <Button
                    variant="default"
                    size="lg"
                    type="button"
                    onClick={handleWithdraw}
                    disabled={withdrawLoading || !wdMovieId}
                    style={{ width: "100%" }}
                  >
                    {withdrawLoading ? "Initializing transfer..." : "Settle funds"}
                  </Button>
                </div>
                <StatusMessage status={withdrawStatus} />

                {movies.filter(m => m.creatorWallet.toLowerCase() === account?.toLowerCase()).length > 0 && (
                  <div className="mt-8 pt-8 border-t border-white/5">
                    <span className="stat-label block mb-3">Your Content Portfolio</span>
                    <div className="flex flex-wrap gap-2">
                      {movies
                        .filter(m => m.creatorWallet.toLowerCase() === account?.toLowerCase())
                        .slice(0, 8)
                        .map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${wdMovieId === String(m.onChainId) ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]' : 'border-white/5 bg-white/5 text-slate-400 hover:border-white/20'}`}
                            onClick={() => setWdMovieId(String(m.onChainId))}
                          >
                            ID #{m.onChainId} · {m.title}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </motion.section>
            </motion.div>
          </div>
        )}

        {role === "creator" && currentPage === "creator-upcoming" && (
          <div className="dashboard-root animate-fade-in">
            <motion.section
              className="dashboard-header-premium"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="tag-pill mb-4" style={{ background: "rgba(139, 92, 246, 0.2)", color: "var(--primary)" }}>Upcoming slate</span>
              <h1 className="hero-title">Plan upcoming titles</h1>
              <p className="text-dim max-w-xl">Sketch projects that are not live yet, set soft funding targets, and keep basic release details in one place.</p>
            </motion.section>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="console-grid"
            >
              <motion.section className="console-card" custom={0} variants={fadeUp}>
                <div className="console-number">01 · OUTLINE</div>
                <h2 className="mb-6">New upcoming project</h2>

                <div style={{ display: "flex", flexDirection: "column", gap: "1.4rem" }}>
                  <div className="space-y-2">
                    <label className="label">Project title</label>
                    <input className="input" value={upTitle} onChange={(e) => setUpTitle(e.target.value)} placeholder="Secret project name" />
                  </div>

                  <div className="space-y-2">
                    <label className="label">Concept overview</label>
                    <textarea className="input" rows={2} value={upDescription} onChange={(e) => setUpDescription(e.target.value)} placeholder="Logline or core premise..." />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div className="space-y-2">
                      <label className="label">Genre</label>
                      <input className="input" value={upGenre} onChange={(e) => setUpGenre(e.target.value)} placeholder="e.g. Action" />
                    </div>
                    <div className="space-y-2">
                      <label className="label">Target (HSK)</label>
                      <input className="input" type="number" min={0} step="0.0001" value={upTargetHsk} onChange={(e) => setUpTargetHsk(e.target.value)} placeholder="Goal" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="label">Payout wallet</label>
                    <input className="input" value={upPayoutWallet} onChange={(e) => setUpPayoutWallet(e.target.value)} placeholder="0x..." />
                  </div>

                  <Button
                    variant="default"
                    size="lg"
                    type="button"
                    onClick={handleCreateUpcomingMovie}
                    disabled={upcomingLoading || !upTitle}
                    style={{ width: "100%", marginTop: "0.25rem" }}
                  >
                    {upcomingLoading ? "Creating project..." : "Add to upcoming"}
                  </Button>
                </div>
              </motion.section>

              <motion.section className="console-card" custom={1} variants={fadeUp}>
                <div className="console-number">02 · TRACK</div>
                <h2 className="mb-6">Upcoming overview</h2>

                <div className="space-y-4">
                  {upcomingMovies
                    .filter((m) => m.creatorWallet?.toLowerCase() === account?.toLowerCase())
                    .map((m) => (
                      <div key={m.id} className="p-5 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="text-lg font-bold text-white leading-tight">{m.title}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="text-[9px] font-black text-[var(--primary)] uppercase tracking-widest">{m.onChainId ? `NETWORK ID: #${m.onChainId}` : "STATUS: DRAFT"}</div>
                              {m.onChainReady && (
                                <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-sm font-bold border border-emerald-500/20">READY</span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-slate-400 font-mono uppercase tracking-tighter">{m.genre}</span>
                        </div>

                        <div className="mb-4">
                          <div className="flex justify-between text-[11px] mb-2 font-bold">
                            <span className="text-slate-500 uppercase">Pledges Collected</span>
                            <span className="text-white">{Number(m.pledgedTotalHsk || 0).toFixed(2)} / {m.targetAmountHsk} HSK</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full bg-[var(--primary)] transition-all duration-1000"
                              style={{ width: `${Math.min(100, (Number(m.pledgedTotalHsk || 0) / Number(m.targetAmountHsk || 1)) * 100)}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <Button
                            variant={m.onChainReady ? "outline" : "default"}
                            size="sm"
                            type="button"
                            className="flex-1"
                            disabled={Boolean(publishingUpcomingId) || m.onChainReady}
                            onClick={() => handlePublishUpcomingOnChain(m)}
                          >
                            {publishingUpcomingId === m.id ? "Syncing..." : m.onChainReady ? "Live on Chain" : "Publish On-chain"}
                          </Button>
                          <button
                            className="text-xs font-bold text-red-500/50 hover:text-red-500 transition-colors px-2"
                            onClick={() => { if (confirm('Remove this project?')) { setRemoveUpcomingId(m.id); handleRemoveUpcomingMovie(); } }}
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    ))}
                  {upcomingMovies.filter(m => m.creatorWallet?.toLowerCase() === account?.toLowerCase()).length === 0 && (
                    <div className="text-center py-12 opacity-30">
                      <p className="text-sm font-bold uppercase tracking-widest">No upcoming projects yet</p>
                    </div>
                  )}
                </div>
              </motion.section>
            </motion.div>
          </div>
        )}

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

        {/* INVEST PAGE -> Invest & Earn section with functional buttons */}
        {role === "viewer" && currentPage === "invest" && (
          <div className="dashboard-root animate-fade-in">
            <motion.section
              className="dashboard-header-premium"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="tag-pill mb-4" style={{ background: "rgba(139, 92, 246, 0.2)", color: "var(--primary)" }}>Invest & earnings</span>
              <h1 className="hero-title">Viewer earnings console</h1>
              <p className="text-dim max-w-xl">See what your sessions have generated so far, send one-off support, or experiment with the stream/settle controls below.</p>
            </motion.section>
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
                    {upcomingMovies
                      .filter((m) => m.status !== "published" && !m.linkedMovieId)
                      .map((m) => (
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
          </div>
        )}

        {role === "creator" && currentPage === "creator-analytics" && (
          <div className="dashboard-root animate-fade-in">
            <motion.section
              className="dashboard-header-premium"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="tag-pill mb-4" style={{ background: "rgba(0, 242, 255, 0.1)", color: "var(--primary)" }}>Live Performance</span>
              <h1 className="hero-title">Creator Intelligence</h1>
              <p className="text-dim max-w-xl">Deep-dive into your content's financial performance and investor engagement across the HashKey network.</p>

              <div className="flex gap-4 mt-8">
                <Button variant="default" size="sm" type="button" onClick={loadCreatorAnalytics} disabled={creatorAnalyticsLoading}>
                  {creatorAnalyticsLoading ? "Syncing Network..." : "Force Refresh Data"}
                </Button>
              </div>
            </motion.section>

            {creatorAnalyticsLoading ? (
              <div className="flex flex-col items-center justify-center p-20 gap-4">
                <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
                <span className="stat-label">Analyzing Blockchain Data...</span>
              </div>
            ) : (
              <div className="space-y-12">
                {/* AGGREGATE STATS ROW */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: "1.5rem",
                  }}
                >
                  <div className="card p-6 border-white/5 bg-[#110c1c]">
                    <div className="stat-label mb-2">Total Network Earnings</div>
                    <div className="text-4xl font-black text-white">
                      {creatorStats.reduce((acc, s) => acc + s.creatorEarningHsk, 0).toFixed(4)}
                      <span className="text-sm font-medium text-slate-500 ml-2">HSK</span>
                    </div>
                    <div className="text-[10px] font-bold text-emerald-400 mt-2 uppercase tracking-widest">↑ 12.4% vs last period</div>
                  </div>
                  <div className="card p-6 border-white/5 bg-[#110c1c]">
                    <div className="stat-label mb-2">Investor Distributions</div>
                    <div className="text-4xl font-black text-white">
                      {creatorStats.reduce((acc, s) => acc + s.investorPoolHsk, 0).toFixed(4)}
                      <span className="text-sm font-medium text-slate-500 ml-2">HSK</span>
                    </div>
                    <div className="text-[10px] font-bold text-blue-400 mt-2 uppercase tracking-widest">Across {creatorStats.length} projects</div>
                  </div>
                  <div className="card p-6 border-white/5 bg-[#110c1c]">
                    <div className="stat-label mb-2">On-chain Audience</div>
                    <div className="text-4xl font-black text-white">
                      {(creatorStats.reduce((acc, s) => acc + s.totalRevenueHsk, 0) * 12).toFixed(0)}
                      <span className="text-sm font-medium text-slate-500 ml-2">Mins</span>
                    </div>
                    <div className="text-[10px] font-bold text-amber-400 mt-2 uppercase tracking-widest">Active streaming time</div>
                  </div>
                </div>

                <h2 className="dashboard-section-title" style={{ marginTop: "2.5rem" }}>
                  Content Portfolio Performance
                </h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {creatorStats.map((s) => (
                    <motion.div key={s.movieId} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
                      <Card className="card p-8 border-white/5 hover:border-[var(--primary)]/30 transition-all duration-500">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                          <div>
                            <div className="text-2xl font-black uppercase tracking-tighter text-white">{s.title}</div>
                            <div className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-widest mt-1">NETWORK ID: #{s.onChainId}</div>
                          </div>
                          <div className="text-right">
                            <div className="stat-label">Total Revenue</div>
                            <div className="text-3xl font-black text-white">{s.totalRevenueHsk.toFixed(4)} <span className="text-sm font-medium text-slate-500">HSK</span></div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 pt-7 border-t border-white/5">
                          <div className="stat-item" style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                            <div className="stat-label">Your Share (60%)</div>
                            <div className="text-xl font-bold text-emerald-400">{s.creatorEarningHsk.toFixed(6)}</div>
                          </div>
                          <div className="stat-item" style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                            <div className="stat-label">Investor Pool (30%)</div>
                            <div className="text-xl font-bold text-blue-400">{s.investorPoolHsk.toFixed(6)}</div>
                          </div>
                          <div className="stat-item" style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                            <div className="stat-label">Shares Issued</div>
                            <div className="text-xl font-bold text-slate-200">{(Number(s.totalSharesWei) / 1e18).toFixed(2)}</div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <AnimatePresence>
          {selectedHomeMovie && (
            <motion.div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 200,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "1rem",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.75)",
                  border: "none",
                }}
                aria-label="Close details"
                onClick={() => setSelectedHomeMovie(null)}
              />

              <motion.div
                className="card"
                style={{
                  position: "relative",
                  width: "100%",
                  maxWidth: 720,
                  overflow: "hidden",
                  padding: 0,
                  background: "#110c1c",
                }}
                initial={{ opacity: 0, scale: 0.92, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.22 }}
              >
                <div
                  style={{
                    height: 260,
                    width: "100%",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundImage: selectedHomeMovie.thumbnailUrl
                      ? `linear-gradient(180deg, rgba(10,10,12,0.15), rgba(10,10,12,0.95)), url(${selectedHomeMovie.thumbnailUrl})`
                      : "var(--accent-gradient)",
                  }}
                />

                <div style={{ padding: "1.25rem 1.5rem 1.6rem" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
                    <div>
                      <div className="movie-badge" style={{ fontSize: "1.35rem", lineHeight: 1.1 }}>
                        {selectedHomeMovie.title}
                      </div>
                      <div className="small" style={{ marginTop: "0.25rem" }}>
                        {selectedHomeMovie.genre} · {Math.round(selectedHomeMovie.duration)} min
                      </div>
                    </div>
                    <button
                      type="button"
                      className="button"
                      style={{ marginTop: 0, padding: "0.5rem 1rem" }}
                      onClick={() => setSelectedHomeMovie(null)}
                    >
                      Close
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginTop: "1rem" }}>
                    <div className="small" style={{ opacity: 0.85 }}>
                      Creator: {selectedHomeMovie.creatorWallet.slice(0, 6)}...{selectedHomeMovie.creatorWallet.slice(-4)}
                    </div>
                    <div className="small" style={{ color: "var(--primary)", fontWeight: 700 }}>
                      Price: {selectedHomeMovie.pricePerSecond} HSK/sec
                    </div>
                  </div>

                  <button
                    type="button"
                    className="button"
                    style={{ width: "100%" }}
                    onClick={() => router.push(`/watch/${selectedHomeMovie.id}`)}
                  >
                    Play Movie
                  </button>
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
        <input
          className="input !py-1 text-sm"
          type="text"
          placeholder="Investment Amount (HSK)"
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
  const isPublished = movie.status === "published" || Boolean(movie.linkedMovieId);
  const canInvestOnChain = Boolean(movie.onChainReady && movie.onChainId && movie.onChainId > 0);

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
      setStatus(`❌ ${e?.message || "Failed"}`);
    }
  };

  const progressPercent = Math.min(100, (Number(movie.pledgedTotalHsk || 0) / Number(movie.targetAmountHsk || 1)) * 100);

  return (
    <Card className="card p-5 border-white/5 hover:border-[var(--primary)]/30 transition-all duration-500 overflow-hidden group">
      <div className="relative mb-5 landscape-img overflow-hidden rounded-xl">
        {movie.thumbnailUrl ? (
          <img
            src={movie.thumbnailUrl}
            alt={movie.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-3xl">🎬</div>
        )}
        <div className="absolute top-2 left-2">
          <span className={`text-[9px] font-black px-2 py-1 rounded bg-black/60 backdrop-blur-md uppercase tracking-widest ${canInvestOnChain ? 'text-emerald-400' : 'text-amber-400'}`}>
            {canInvestOnChain ? 'LIVE ON CHAIN' : 'PRE-RELEASE'}
          </span>
        </div>
      </div>

      <div className="text-lg font-bold text-white mb-1 truncate">{movie.title}</div>
      <div className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-widest mb-4">
        {movie.genre} · CREATOR: {movie.creatorWallet.slice(0, 4)}...{movie.creatorWallet.slice(-4)}
      </div>

      <p className="text-xs text-slate-400 line-clamp-2 h-8 mb-4">{movie.description}</p>

      <div className="p-4 rounded-xl bg-white/5 border border-white/5 mt-2 mb-6">
        <div className="flex justify-between items-end mb-2">
          <div className="stat-label mb-0">Fundraising</div>
          <div className="text-xs font-bold text-white">{progressPercent.toFixed(1)}%</div>
        </div>
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-[var(--primary)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-3 text-[10px] font-bold">
          <span className="text-slate-500">PLEDGED: {Number(movie.pledgedTotalHsk || 0).toFixed(2)} HSK</span>
          <span className="text-white">GOAL: {movie.targetAmountHsk}</span>
        </div>
      </div>

      <div className="space-y-3 mt-6">
        <input
          className="input invest-input text-sm"
          type="text"
          placeholder="Investment Amount (HSK)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={isPublished || !canInvestOnChain}
        />
        <Button
          variant={isPublished || !canInvestOnChain ? "outline" : "default"}
          size="default"
          type="button"
          className="w-full font-bold uppercase tracking-widest text-[11px] invest-cta"
          disabled={loading || !amount || isPublished || !canInvestOnChain}
          onClick={handleClick}
        >
          {isPublished
            ? "Published"
            : !canInvestOnChain
              ? "Awaiting Chain Sync"
              : loading
                ? "Processing..."
                : "Confirm Investment"}
        </Button>
      </div>

      {status && (
        <p className={`mt-3 text-[10px] font-bold text-center ${status.startsWith("✅") ? 'text-emerald-400' : 'text-red-400'}`}>
          {status}
        </p>
      )}
    </Card>
  );
}
