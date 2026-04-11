"use client";

import { getDefaultConfig, RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { ChakraProvider, createSystem, defaultConfig } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, theme as antdTheme } from "antd";
import { useState } from "react";
import { defineChain } from "viem";
import { WagmiProvider, http } from "wagmi";

const chakraSystem = createSystem(defaultConfig);

const hashKeyTestnet = defineChain({
  id: 133,
  name: "HashKey Chain Testnet",
  nativeCurrency: {
    name: "HSK",
    symbol: "HSK",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://testnet.hsk.xyz"] },
    public: { http: ["https://testnet.hsk.xyz"] },
  },
  blockExplorers: {
    default: { name: "HashKey Explorer", url: "https://testnet-explorer.hsk.xyz" },
  },
  testnet: true,
});

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "streamfi-dev-walletconnect";

const config = getDefaultConfig({
  appName: "StreamFi",
  projectId: walletConnectProjectId,
  chains: [hashKeyTestnet],
  transports: {
    [hashKeyTestnet.id]: http("https://testnet.hsk.xyz"),
  },
  ssr: true,
});

export default function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider
          theme={{
            algorithm: antdTheme.darkAlgorithm,
            token: {
              colorPrimary: "#f97316",
              borderRadius: 10,
            },
          }}
        >
          <ChakraProvider value={chakraSystem}>
            <RainbowKitProvider
              theme={lightTheme({
                accentColor: "#f97316",
                accentColorForeground: "#ffffff",
                borderRadius: "medium",
              })}
            >
              {children}
            </RainbowKitProvider>
          </ChakraProvider>
        </ConfigProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
