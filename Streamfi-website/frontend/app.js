import { BrowserProvider, Contract, formatEther, parseEther } from "https://cdn.jsdelivr.net/npm/ethers@6.13.1/+esm";

// ABI extracted from Hardhat artifact for StreamFiPayment
const STREAMFI_ABI = [
	{ "inputs": [{ "internalType": "address", "name": "_platform", "type": "address" }], "stateMutability": "nonpayable", "type": "constructor" },
	{ "anonymous": false, "inputs": [{ "indexed": false, "internalType": "uint256", "name": "movieId", "type": "uint256" }, { "indexed": false, "internalType": "address", "name": "investor", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "shares", "type": "uint256" }], "name": "InvestmentMade", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": false, "internalType": "uint256", "name": "movieId", "type": "uint256" }, { "indexed": false, "internalType": "address", "name": "creator", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "pricePerSecond", "type": "uint256" }], "name": "MovieRegistered", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": false, "internalType": "uint256", "name": "movieId", "type": "uint256" }, { "indexed": false, "internalType": "address", "name": "user", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "PaymentReceived", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": false, "internalType": "uint256", "name": "movieId", "type": "uint256" }, { "indexed": false, "internalType": "address", "name": "user", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "fromTime", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "toTime", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "secondsStreamed", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "StreamSettled", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": false, "internalType": "uint256", "name": "movieId", "type": "uint256" }, { "indexed": false, "internalType": "address", "name": "user", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "startTime", "type": "uint256" }], "name": "StreamStarted", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": false, "internalType": "uint256", "name": "movieId", "type": "uint256" }, { "indexed": false, "internalType": "address", "name": "user", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "stopTime", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "totalSeconds", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "totalPaid", "type": "uint256" }], "name": "StreamStopped", "type": "event" },
	{ "anonymous": false, "inputs": [{ "indexed": false, "internalType": "address", "name": "user", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "Withdrawal", "type": "event" },
	{ "inputs": [], "name": "CREATOR_SHARE", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
	{ "inputs": [], "name": "INVESTOR_SHARE", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
	{ "inputs": [], "name": "PLATFORM_SHARE", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
	{ "inputs": [{ "internalType": "uint256", "name": "movieId", "type": "uint256" }], "name": "invest", "outputs": [], "stateMutability": "payable", "type": "function" },
	{ "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }, { "internalType": "address", "name": "", "type": "address" }], "name": "investors", "outputs": [{ "internalType": "uint256", "name": "shares", "type": "uint256" }, { "internalType": "uint256", "name": "balance", "type": "uint256" }], "stateMutability": "view", "type": "function" },
	{ "inputs": [], "name": "movieCount", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
	{ "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "movies", "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }, { "internalType": "address", "name": "creator", "type": "address" }, { "internalType": "uint256", "name": "pricePerSecond", "type": "uint256" }, { "internalType": "uint256", "name": "totalRevenue", "type": "uint256" }, { "internalType": "bool", "name": "exists", "type": "bool" }], "stateMutability": "view", "type": "function" },
	{ "inputs": [{ "internalType": "uint256", "name": "movieId", "type": "uint256" }], "name": "pay", "outputs": [], "stateMutability": "payable", "type": "function" },
	{ "inputs": [], "name": "platform", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
	{ "inputs": [{ "internalType": "uint256", "name": "pricePerSecond", "type": "uint256" }, { "internalType": "address", "name": "creatorPayoutWallet", "type": "address" }], "name": "registerMovie", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
	{ "inputs": [{ "internalType": "uint256", "name": "movieId", "type": "uint256" }], "name": "settleStream", "outputs": [], "stateMutability": "payable", "type": "function" },
	{ "inputs": [{ "internalType": "uint256", "name": "movieId", "type": "uint256" }], "name": "startStream", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
	{ "inputs": [{ "internalType": "uint256", "name": "movieId", "type": "uint256" }], "name": "stopStream", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
	{ "inputs": [{ "internalType": "address", "name": "", "type": "address" }, { "internalType": "uint256", "name": "", "type": "uint256" }], "name": "streams", "outputs": [{ "internalType": "uint256", "name": "movieId", "type": "uint256" }, { "internalType": "address", "name": "user", "type": "address" }, { "internalType": "uint256", "name": "startTime", "type": "uint256" }, { "internalType": "uint256", "name": "lastSettledAt", "type": "uint256" }, { "internalType": "uint256", "name": "totalSeconds", "type": "uint256" }, { "internalType": "bool", "name": "active", "type": "bool" }], "stateMutability": "view", "type": "function" },
	{ "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "totalShares", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
	{ "inputs": [{ "internalType": "uint256", "name": "movieId", "type": "uint256" }], "name": "withdrawInvestorFunds", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
];

let provider;
let signer;
let contract;

const els = {
	walletStatus: document.getElementById("wallet-status"),
	connectBtn: document.getElementById("connect-btn"),
	contractInput: document.getElementById("contract-address"),
	setContractBtn: document.getElementById("set-contract-btn"),
	log: document.getElementById("log"),
	regPrice: document.getElementById("reg-price"),
	regBtn: document.getElementById("reg-btn"),
	invMovieId: document.getElementById("inv-movie-id"),
	invAmount: document.getElementById("inv-amount"),
	invBtn: document.getElementById("inv-btn"),
	payMovieId: document.getElementById("pay-movie-id"),
	payAmount: document.getElementById("pay-amount"),
	payBtn: document.getElementById("pay-btn"),
	streamMovieId: document.getElementById("stream-movie-id"),
	startStreamBtn: document.getElementById("start-stream-btn"),
	stopStreamBtn: document.getElementById("stop-stream-btn"),
	settleSeconds: document.getElementById("settle-seconds"),
	settleStreamBtn: document.getElementById("settle-stream-btn"),
	wdMovieId: document.getElementById("wd-movie-id"),
	wdBtn: document.getElementById("wd-btn"),
};

function log(msg, data) {
	const line = document.createElement("div");
	line.className = "log-line";
	const label = document.createElement("span");
	label.className = "label";
	label.textContent = "> ";
	const text = document.createElement("span");
	text.textContent = msg + (data ? " " + data : "");
	line.appendChild(label);
	line.appendChild(text);
	els.log.prepend(line);
}

async function ensureWallet() {
	if (!window.ethereum) {
		throw new Error("No wallet found. Install MetaMask.");
	}
	if (!provider) {
		provider = new BrowserProvider(window.ethereum);
	}
	if (!signer) {
		await window.ethereum.request({ method: "eth_requestAccounts" });
		signer = await provider.getSigner();
		const addr = await signer.getAddress();
		els.walletStatus.textContent = `Wallet: ${addr.slice(0, 6)}...${addr.slice(-4)}`;
		els.walletStatus.classList.remove("red");
	}
}

function requireContract() {
	if (!contract) {
		throw new Error("Set the contract address first.");
	}
}

els.connectBtn.addEventListener("click", async () => {
	try {
		await ensureWallet();
		log("Wallet connected");
	} catch (err) {
		console.error(err);
		els.walletStatus.textContent = "Wallet: error";
		els.walletStatus.classList.add("red");
		log("Wallet error:", err.message ?? String(err));
	}
});

els.setContractBtn.addEventListener("click", async () => {
	try {
		await ensureWallet();
		const addr = els.contractInput.value.trim();
		if (!addr) throw new Error("Enter contract address");
		contract = new Contract(addr, STREAMFI_ABI, signer);
		const platform = await contract.platform();
		log(`Using contract ${addr}, platform ${platform}`);
	} catch (err) {
		console.error(err);
		log("Set contract error:", err.message ?? String(err));
	}
});

els.regBtn.addEventListener("click", async () => {
	try {
		requireContract();
		const priceStr = els.regPrice.value.trim();
		if (!priceStr) throw new Error("Enter price per second in wei");
		const price = BigInt(priceStr);
		const creatorWallet = await signer.getAddress();
		const tx = await contract.registerMovie(price, creatorWallet);
		log("Registering movie… tx:", tx.hash);
		await tx.wait();
		const count = await contract.movieCount();
		log(`Movie registered with id ${count.toString()}`);
	} catch (err) {
		console.error(err);
		log("Register error:", err.message ?? String(err));
	}
});

els.invBtn.addEventListener("click", async () => {
	try {
		requireContract();
		const movieId = BigInt(els.invMovieId.value || "0");
		const amountEth = els.invAmount.value.trim();
		if (!movieId) throw new Error("Enter movie id");
		if (!amountEth) throw new Error("Enter amount in ETH");
		const value = parseEther(amountEth);
		const tx = await contract.invest(movieId, { value });
		log("Invest tx:", tx.hash);
		await tx.wait();
		log("Investment confirmed");
	} catch (err) {
		console.error(err);
		log("Invest error:", err.message ?? String(err));
	}
});

els.payBtn.addEventListener("click", async () => {
	try {
		requireContract();
		const movieId = BigInt(els.payMovieId.value || "0");
		const amountEth = els.payAmount.value.trim();
		if (!movieId) throw new Error("Enter movie id");
		if (!amountEth) throw new Error("Enter amount in ETH");
		const value = parseEther(amountEth);
		const tx = await contract.pay(movieId, { value });
		log("One-off pay tx:", tx.hash);
		await tx.wait();
		log("Payment confirmed");
	} catch (err) {
		console.error(err);
		log("Pay error:", err.message ?? String(err));
	}
});

els.startStreamBtn.addEventListener("click", async () => {
	try {
		requireContract();
		const movieId = BigInt(els.streamMovieId.value || "0");
		if (!movieId) throw new Error("Enter movie id");
		const tx = await contract.startStream(movieId);
		log("Start stream tx:", tx.hash);
		await tx.wait();
		log("Stream started");
	} catch (err) {
		console.error(err);
		log("Start stream error:", err.message ?? String(err));
	}
});

els.settleStreamBtn.addEventListener("click", async () => {
	try {
		requireContract();
		const movieId = BigInt(els.streamMovieId.value || "0");
		const seconds = BigInt(els.settleSeconds.value || "0");
		if (!movieId) throw new Error("Enter movie id");
		if (!seconds) throw new Error("Enter seconds to settle");
		const movie = await contract.movies(movieId);
		const pricePerSecond = movie.pricePerSecond; // uint256
		const amountDue = pricePerSecond * seconds;
		const tx = await contract.settleStream(movieId, { value: amountDue });
		log(`Settling ${seconds.toString()}s (wei ${amountDue.toString()}) tx:`, tx.hash);
		await tx.wait();
		log("Stream settled");
	} catch (err) {
		console.error(err);
		log("Settle stream error:", err.message ?? String(err));
	}
});

els.stopStreamBtn.addEventListener("click", async () => {
	try {
		requireContract();
		const movieId = BigInt(els.streamMovieId.value || "0");
		if (!movieId) throw new Error("Enter movie id");
		const tx = await contract.stopStream(movieId);
		log("Stop stream tx:", tx.hash);
		await tx.wait();
		log("Stream stopped");
	} catch (err) {
		console.error(err);
		log("Stop stream error:", err.message ?? String(err));
	}
});

els.wdBtn.addEventListener("click", async () => {
	try {
		requireContract();
		const movieId = BigInt(els.wdMovieId.value || "0");
		if (!movieId) throw new Error("Enter movie id");
		const tx = await contract.withdrawInvestorFunds(movieId);
		log("Withdraw tx:", tx.hash);
		const receipt = await tx.wait();
		log("Withdraw confirmed (check wallet)");
	} catch (err) {
		console.error(err);
		log("Withdraw error:", err.message ?? String(err));
	}
});

window.addEventListener("load", () => {
	if (!window.ethereum) {
		els.walletStatus.textContent = "Wallet: not found";
		els.walletStatus.classList.add("red");
		log("No Ethereum wallet detected. Install MetaMask.");
	} else {
		log("Ready. Connect wallet on HashKey testnet and paste contract address.");
	}
});
