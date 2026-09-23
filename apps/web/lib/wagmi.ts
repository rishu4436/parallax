import { getWagmiConnectorV2 } from "@binance/w3w-wagmi-connector-v2";
import { createConfig, http } from "wagmi";
import { bsc } from "wagmi/chains";
import { metaMask, walletConnect } from "wagmi/connectors";

const binance = getWagmiConnectorV2();
const walletConnectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const wagmiConfig = createConfig({
  chains: [bsc],
  multiInjectedProviderDiscovery: true,
  connectors: [
    binance(),
    metaMask(),
    ...(walletConnectId ? [walletConnect({ projectId: walletConnectId, showQrModal: true })] : []),
  ],
  transports: {
    [bsc.id]: http(process.env.NEXT_PUBLIC_BSC_RPC || "https://bsc-dataseed.binance.org"),
  },
  ssr: true,
});
