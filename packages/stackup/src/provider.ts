import {
  SmartAccountProvider,
  deepHexlify,
  resolveProperties,
  type UserOperationCallData,
  type BatchUserOperationCallData,
  type SendUserOperationResult,
  asyncPipe,
  noOpMiddleware,
  type UserOperationStruct,
  getUserOperationHash,
  type UserOperationRequest,
  type AccountMiddlewareFn,
  BaseSmartContractAccount,
  type PublicErc4337Client,
  type SmartAccountProviderOpts,
} from "@alchemy/aa-core";
import type { HttpTransport, Address, Chain } from "viem";
import {
  withStackupGasManager,
  type StackupGasManagerConfig,
} from "./middleware/gas-manager.js";
import { ChainFeeStrategies, SupportedChains } from "./chains.js";
import { GasFeeStrategy, withStackupFeeData } from "./middleware/gas-fees.js";

/**
 * Utility method for asserting a {@link UserOperationStruct} is a {@link UserOperationRequest}
 *
 * @param request a {@link UserOperationStruct} to validate
 * @returns a type guard that asserts the {@link UserOperationStruct} is a {@link UserOperationRequest}
 */
export function isValidRequest(
  request: UserOperationStruct
): request is UserOperationRequest {
  // These are the only ones marked as optional in the interface above
  return (
    !!request.callGasLimit &&
    !!request.maxFeePerGas &&
    request.maxPriorityFeePerGas != null &&
    !!request.preVerificationGas &&
    !!request.verificationGasLimit
  );
}

export type StackupProviderConfig = {
  chain: Chain;
  entryPointAddress: Address;
  account?: BaseSmartContractAccount;
  rpcProvider: string | PublicErc4337Client;
  opts?: SmartAccountProviderOpts;
  feeOpts?: {
    /** this adds a percent buffer on top of the fee estimated (default 5%)*/
    maxPriorityFeeBufferPercent?: bigint;
  };
};

export class StackupProvider extends SmartAccountProvider<HttpTransport> {
  constructor({
    chain,
    rpcProvider,
    entryPointAddress,
    account,
    opts,
    feeOpts,
  }: StackupProviderConfig) {
    const _chain = SupportedChains.get(chain.id);
    if (!_chain) {
      throw new Error(`StackupProvider: chain (${chain}) not supported`);
    }
    super(rpcProvider, entryPointAddress, _chain, account, opts);

    withStackupFeeData(
      this,
      ChainFeeStrategies.get(_chain.id) ?? {
        strategy: GasFeeStrategy.DEFAULT,
        value: 0n,
      },
      feeOpts?.maxPriorityFeeBufferPercent ?? 5n
    );
  }

  // override sendUserOperation to match stackup bundler rpc endpoint (eth_estimateUserOperationGas)
  sendUserOperation = async (
    data: UserOperationCallData | BatchUserOperationCallData
  ): Promise<SendUserOperationResult> => {
    if (!this.account) {
      throw new Error("account not connected!");
    }

    const initCode = await this.account.getInitCode();
    const uoStruct = await asyncPipe(
      this.dummyPaymasterDataMiddleware,
      this.feeDataGetter, // change order to fill the gas fee data first before estimate gas
      this.gasEstimator,
      this.paymasterDataMiddleware,
      this.customMiddleware ?? noOpMiddleware
    )({
      initCode,
      sender: this.getAddress(),
      nonce: this.account.getNonce(),
      callData: Array.isArray(data)
        ? this.account.encodeBatchExecute(data)
        : this.account.encodeExecute(data.target, data.value ?? 0n, data.data),
      signature: this.account.getDummySignature(),
      // default stackup gas limits for eth_estimateUserOperationGas
      callGasLimit: 35000n,
      preVerificationGas: 21000n,
      verificationGasLimit: 70000n,
    } as UserOperationStruct);

    const request = deepHexlify(await resolveProperties(uoStruct));
    if (!isValidRequest(request)) {
      // this pretty prints the uo
      throw new Error(
        `Request is missing parameters. All properties on UserOperationStruct must be set. uo: ${JSON.stringify(
          request,
          null,
          2
        )}`
      );
    }

    request.signature = (await this.account.signMessage(
      getUserOperationHash(
        request,
        this.entryPointAddress as `0x${string}`,
        BigInt(this.chain.id)
      )
    )) as `0x${string}`;

    return {
      hash: await this.rpcClient.sendUserOperation(
        request,
        this.entryPointAddress
      ),
      request,
    };
  };

  // override gasEstimator to match stackup bundler rpc endpoint (eth_estimateUserOperationGas)
  gasEstimator: AccountMiddlewareFn = async (struct) => {
    const request = deepHexlify(await resolveProperties(struct));
    const estimates = await this.rpcClient.estimateUserOperationGas(
      request,
      this.entryPointAddress
    );

    struct.callGasLimit = estimates.callGasLimit;
    // @ts-ignore
    struct.verificationGasLimit = estimates.verificationGas;
    struct.preVerificationGas = estimates.preVerificationGas;

    return struct;
  };

  withStackupGasManager(config: StackupGasManagerConfig) {
    if (!this.isConnected()) {
      throw new Error(
        "StackupProvider: account is not set, did you call `connect` first?"
      );
    }

    return withStackupGasManager(this, config);
  }
}
