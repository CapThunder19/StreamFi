import "./globals.css";
import type { ReactNode } from "react";
import Web3Provider from "./web3-provider";

export const metadata = {
  title: "StreamFi Movies",
  description: "StreamFi HashKey testnet demo",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
