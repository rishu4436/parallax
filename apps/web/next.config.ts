import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { createRequire } from "node:module";

loadEnv({ path: path.resolve(__dirname, "../../.env") });
const require = createRequire(import.meta.url);

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@parallax/core", "@parallax/web3", "@parallax/config"],
  env: {
    NEXT_PUBLIC_CHAIN_ID: "56",
    NEXT_PUBLIC_BSC_RPC: process.env.NEXT_PUBLIC_BSC_RPC || "https://bsc-dataseed.binance.org",
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
  },
  webpack: (config) => {
    const webpack = require("webpack") as {
      NormalModuleReplacementPlugin: new (pattern: RegExp, request: string) => object;
    };
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /[\\/]@wagmi[\\/]connectors[\\/].*baseAccount\.js$/,
        path.resolve(__dirname, "lib/stub-base-account.ts"),
      ),
    );
    return config;
  },
};

export default nextConfig;
