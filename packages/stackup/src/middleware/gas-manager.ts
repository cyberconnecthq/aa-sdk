import type { UserOperationStruct } from "@alchemy/aa-core";
import {
  deepHexlify,
  resolveProperties,
  type ConnectedSmartAccountProvider,
  type PublicErc4337Client,
  type UserOperationRequest,
  type SupportedTransports,
} from "@alchemy/aa-core";
import type {
  Address,
  Hex,
  PublicClient,
  Transport,
  Chain,
  HttpTransport,
  FallbackTransport,
} from "viem";
import { createPublicClient, http } from "viem";

type StackupPaymasterContext =
  | StackupPaymasterContextPayAsYouGo
  | StackupPaymasterContextERC20Token;

type StackupPaymasterContextPayAsYouGo = {
  type: "payg";
  chainId?: Chain["id"];
  sponsorSig: string;
};

type StackupPaymasterContextERC20Token = {
  type: "erc20token";
  token: Address;
};

type ClientWithStackupMethods = PublicErc4337Client & {
  request: PublicErc4337Client["request"] &
    {
      request(args: {
        method: "pm_sponsorUserOperation";
        params: [UserOperationRequest, Address, StackupPaymasterContext];
      }): Promise<StackupPaymasterResponse>;
    }["request"];
};

export interface StackupGasManagerConfig {
  entryPoint: Address;
  client: StackupPaymasterClient;
  chainId?: Chain["id"];
  sponsorSig: string;
}

export interface StackupPaymasterClient<
  T extends SupportedTransports = Transport
> extends PublicClient<T, Chain> {
  getSponsorUserOperation(
    request: UserOperationRequest,
    entryPoint: string,
    context: StackupPaymasterContext
  ): Promise<StackupPaymasterResponse>;
  estimateCredit(
    request: UserOperationRequest,
    entryPoint: string,
    context: StackupPaymasterContext
  ): Promise<StackupPaymasterResponse>;
}

type StackupPaymasterResponse = {
  paymasterAndData: Hex;
  preVerificationGas: Hex;
  verificationGasLimit: Hex;
  callGasLimit: Hex;
};

export const createStackupPaymasterClient = ({
  chain,
  rpcUrl,
}: {
  chain: Chain;
  rpcUrl: string;
}): StackupPaymasterClient<HttpTransport> => {
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  return createStackupPaymasterClientFromClient(client);
};

export const createStackupPaymasterClientFromClient: <
  T extends Transport | FallbackTransport = Transport
>(
  client: PublicClient<T, Chain>
) => StackupPaymasterClient<T> = <
  T extends Transport | FallbackTransport = Transport
>(
  client: PublicClient<T, Chain>
): StackupPaymasterClient<T> => {
  const clientAdapter = client as ClientWithStackupMethods;
  return {
    ...clientAdapter,
    getSponsorUserOperation(
      request: UserOperationRequest,
      entryPoint: Address,
      context: StackupPaymasterContext
    ): Promise<StackupPaymasterResponse> {
      return clientAdapter.request({
        method: "pm_sponsorUserOperation",
        params: [request, entryPoint, context],
      });
    },
    estimateCredit(
      request: UserOperationRequest,
      entryPoint: Address,
      context: StackupPaymasterContext
    ): Promise<StackupPaymasterResponse> {
      return clientAdapter.request({
        method: "pm_estimateCredit" as any,
        params: [request, entryPoint, context],
      });
    },
  } as StackupPaymasterClient<T>;
};

/**
 * This uses the stackup RPC method: `pm_sponsorUserOperation` to get all of the gas estimates + paymaster data
 * in one RPC call. It will no-op the gas estimator middleware and set a custom middleware that makes the RPC call
 *
 * @param provider - the smart account provider to override to use the stackup paymaster
 * @param config - the alchemy paymaster configuration
 * @returns the provider augmented to use the stackup paymaster
 */
export const withStackupGasManager = <
  T extends Transport,
  Provider extends ConnectedSmartAccountProvider<T>
>(
  provider: Provider,
  config: StackupGasManagerConfig
): Provider => {
  return (
    provider
      // no-op gas estimator
      .withGasEstimator(async () => ({
        callGasLimit: 0n,
        preVerificationGas: 0n,
        verificationGasLimit: 0n,
      }))
      .withPaymasterMiddleware({
        paymasterDataMiddleware: async (struct: UserOperationStruct) => {
          return config.client.getSponsorUserOperation(
            deepHexlify(await resolveProperties(struct)),
            config.entryPoint,
            {
              type: "payg",
              chainId: config.chainId,
              sponsorSig: config.sponsorSig,
            }
          );
        },
        //@ts-ignore
        paymasterEstimator: async (struct: UserOperationStruct) => {
          console.log("Estimating gas credit");
          return config.client.estimateCredit(
            deepHexlify(await resolveProperties(struct)),
            config.entryPoint,
            {
              type: "payg",
              chainId: config.chainId,
              sponsorSig: config.sponsorSig,
            }
          );
        },
      })
  );
};
