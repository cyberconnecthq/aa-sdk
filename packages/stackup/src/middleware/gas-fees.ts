import type { StackupProvider } from "../provider.js";

export enum GasFeeStrategy {
  // maxPriorityFee = 133% eth_maxPriorityFeePerGas; maxFee = 2 x base fee + maxPriorityFee
  DEFAULT = "DEFAULT",
  // maxPriorityFee = value + eth_maxPriorityFeePerGas x (100 + maxPriorityFeeBufferPercent)%; maxFee = 1.25 x base fee + maxPriorityFee
  FIXED = "FIXED",
  // maxPriorityFee = eth_baseFeePerGas x value%; maxFee = 1.25 x base fee + maxPriorityFee
  BASE_FEE_PERCENTAGE = "BASE_FEE_PERCENTAGE",
  // maxPriorityFee = eth_maxPriorityFeePerGas x (100 + maxPriorityFeeBufferPercent)% x (100 + value)%; maxFee = 1.25 x base fee + maxPriorityFee
  PRIORITY_FEE_PERCENTAGE = "PRIORITY_FEE_PERCENTAGE",
}

export interface GasFeeMode {
  strategy: GasFeeStrategy;
  value: bigint;
}

// TODO: change this according to stackup sdk
export const withStackupFeeData = (
  provider: StackupProvider,
  feeMode: GasFeeMode,
  maxPriorityFeeBufferPercent: bigint
): StackupProvider => {
  if (feeMode.strategy === GasFeeStrategy.DEFAULT) {
    return provider;
  }

  provider.withFeeDataGetter(async () => {
    const [block, maxPriorityFeePerGasOnChain] = await Promise.all([
      provider.rpcClient.getBlock({ blockTag: "latest" }),
      provider.rpcClient.getMaxPriorityFeePerGas(),
    ]);
    const baseFeePerGas = block.baseFeePerGas;
    if (baseFeePerGas == null) {
      throw new Error("baseFeePerGas is null");
    }
    // add a buffer here to account for potential spikes in priority fee
    const maxPriorityFeePerGas =
      (BigInt(maxPriorityFeePerGasOnChain) *
        (100n + maxPriorityFeeBufferPercent)) /
      100n;
    // add 25% overhead to ensure mine
    const baseFeeScaled = (baseFeePerGas * 5n) / 4n;

    const prioFee = ((): bigint => {
      switch (feeMode.strategy) {
        case GasFeeStrategy.FIXED:
          return maxPriorityFeePerGas + feeMode.value;
        case GasFeeStrategy.BASE_FEE_PERCENTAGE:
          return (baseFeeScaled * feeMode.value) / 100n;
        case GasFeeStrategy.PRIORITY_FEE_PERCENTAGE:
          // add 10% to required priority fee to ensure mine
          return (maxPriorityFeePerGas * (100n + feeMode.value)) / 100n;
        default:
          throw new Error("fee mode not supported");
      }
    })();

    return {
      maxPriorityFeePerGas: prioFee,
      maxFeePerGas: baseFeeScaled + prioFee,
    };
  });
  return provider;
};
