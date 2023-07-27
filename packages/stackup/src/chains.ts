import type { Chain } from "viem";
import {
  arbitrum,
  arbitrumGoerli,
  bsc,
  bscTestnet,
  goerli,
  mainnet,
  optimism,
  optimismGoerli,
  polygon,
  polygonMumbai,
  baseGoerli,
  lineaTestnet,
} from "viem/chains";
import { GasFeeStrategy, type GasFeeMode } from "./middleware/gas-fees.js";

const linea = {
  id: 59144,
  name: "Linea",
  rpcUrls: {
    infura: { http: "https://rpc.linea.build" },
    public: { http: "https://rpc.linea.build" },
    default: { http: "https://rpc.linea.build" },
  },
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
};

export const SupportedChains = new Map<number, Chain>([
  [baseGoerli.id, baseGoerli],
  [polygonMumbai.id, polygonMumbai],
  [polygon.id, polygon],
  [mainnet.id, mainnet],
  [goerli.id, goerli],
  [arbitrumGoerli.id, arbitrumGoerli],
  [arbitrum.id, arbitrum],
  [optimism.id, optimism],
  [optimismGoerli.id, optimismGoerli],
  // not sure how bsc supports eip-1559
  [bsc.id, bsc],
  [bscTestnet.id, bscTestnet],
  [lineaTestnet.id, lineaTestnet],
  [linea.id, linea] as any,
]);

const defineChainStrategy = (
  chainId: number,
  strategy: GasFeeStrategy,
  value: GasFeeMode["value"]
): [number, GasFeeMode] => {
  return [chainId, { strategy, value }];
};

export const ChainFeeStrategies: Map<number, GasFeeMode> = new Map<
  number,
  GasFeeMode
>([
  // testnets
  defineChainStrategy(goerli.id, GasFeeStrategy.FIXED, 0n),
  defineChainStrategy(polygonMumbai.id, GasFeeStrategy.FIXED, 0n),
  defineChainStrategy(optimismGoerli.id, GasFeeStrategy.FIXED, 0n),
  defineChainStrategy(arbitrumGoerli.id, GasFeeStrategy.FIXED, 0n),
  defineChainStrategy(bscTestnet.id, GasFeeStrategy.FIXED, 0n),
  // mainnets
  defineChainStrategy(mainnet.id, GasFeeStrategy.PRIORITY_FEE_PERCENTAGE, 57n),
  defineChainStrategy(polygon.id, GasFeeStrategy.PRIORITY_FEE_PERCENTAGE, 25n),
  defineChainStrategy(optimism.id, GasFeeStrategy.BASE_FEE_PERCENTAGE, 5n),
  defineChainStrategy(arbitrum.id, GasFeeStrategy.BASE_FEE_PERCENTAGE, 5n),
  defineChainStrategy(bsc.id, GasFeeStrategy.FIXED, 0n),
  defineChainStrategy(lineaTestnet.id, GasFeeStrategy.FIXED, 0n),
]);
