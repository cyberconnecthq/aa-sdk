import {
  SimpleSmartContractAccount,
  type BatchUserOperationCallData,
  type SimpleSmartAccountOwner,
} from "@alchemy/aa-core";
import { toHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { polygonMumbai } from "viem/chains";
import { StackupProvider, createStackupPaymasterClient } from "../index.js";

const ENTRYPOINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const BUNDLER_RPC_URL = process.env.BUNDLER_RPC_URL!;
const PAYMASTER_RPC_URL = process.env.PAYMASTER_RPC_URL!;
const OWNER_MNEMONIC = process.env.OWNER_MNEMONIC!;
const SIMPLE_ACCOUNT_FACTORY_ADDRESS =
  "0x0b1bbac2a57f530c0454232082ab061af9ca724f"; // Cyber
// "0x9406Cc6185a346906296840746125a0E44976454";

describe("Simple Account Tests", () => {
  const ownerAccount = mnemonicToAccount(OWNER_MNEMONIC);
  const owner: SimpleSmartAccountOwner = {
    signMessage: async (msg) =>
      ownerAccount.signMessage({
        message: { raw: toHex(msg) },
      }),
    getAddress: async () => ownerAccount.address,
  };
  const chain = polygonMumbai;
  const signer = new StackupProvider({
    chain,
    rpcProvider: BUNDLER_RPC_URL,
    entryPointAddress: ENTRYPOINT_ADDRESS,
  }).connect(
    (provider) =>
      new SimpleSmartContractAccount({
        entryPointAddress: ENTRYPOINT_ADDRESS,
        chain,
        owner,
        factoryAddress: SIMPLE_ACCOUNT_FACTORY_ADDRESS,
        rpcClient: provider,
      })
  );

  it("should succesfully get counterfactual address", async () => {
    expect(await signer.getAddress()).toMatchInlineSnapshot(
      `"0xf84B1A0042f77790b3e9c3637B03E06b74f125E0"`
    );
  });

  it("should correctly sign the message", async () => {
    expect(
      // TODO: expose sign message on the provider too
      await signer.account.signMessage(
        "0xa70d0af2ebb03a44dcd0714a8724f622e3ab876d0aa312f0ee04823285d6fb1b"
      )
    ).toBe(
      "0xd3bc38ada1998d99cb6e8d1616387b2264dc4e8e38d5d92d60572a1e830a344a1fc12e1d58af18ab668faabc5aa9f73c5c9bd11056fa08bd2267055204a1de701b"
    );
  });

  it("should execute successfully", async () => {
    const result = signer.sendUserOperation({
      target: await signer.getAddress(),
      data: "0x",
    });

    await expect(result).resolves.not.toThrowError();
  });

  it("should fail to execute if account address is not deployed and not correct", async () => {
    const accountAddress = "0xc33AbD9621834CA7c6Fc9f9CC3c47b9c17B03f9F";
    const newSigner = new StackupProvider({
      chain,
      rpcProvider: BUNDLER_RPC_URL,
      entryPointAddress: ENTRYPOINT_ADDRESS,
    }).connect(
      (provider) =>
        new SimpleSmartContractAccount({
          entryPointAddress: ENTRYPOINT_ADDRESS,
          chain,
          owner,
          factoryAddress: SIMPLE_ACCOUNT_FACTORY_ADDRESS,
          rpcClient: provider,
          accountAddress,
        })
    );

    const result = newSigner.sendUserOperation({
      target: await newSigner.getAddress(),
      data: "0x",
    });

    await expect(result).rejects.toThrowError();
  });

  it("should successfully execute with stackup paymaster info", async () => {
    // TODO: this is super hacky right now
    // we have to wait for the test above to run and be confirmed so that this one submits successfully using the correct nonce
    // one way we could do this is by batching the two UOs together
    await new Promise((resolve) => setTimeout(resolve, 7500));
    const newSigner = signer.withStackupGasManager({
      entryPoint: ENTRYPOINT_ADDRESS,
      client: createStackupPaymasterClient({
        chain,
        rpcUrl: PAYMASTER_RPC_URL,
      }),
    });

    const result = newSigner.sendUserOperation({
      target: await newSigner.getAddress(),
      data: "0x",
    });

    await expect(result).resolves.not.toThrowError();
  }, 10000);

  it("should correctly encode batch transaction data", async () => {
    const account = signer.account;
    const data = [
      {
        target: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        data: "0xdeadbeef",
      },
      {
        target: "0x8ba1f109551bd432803012645ac136ddd64dba72",
        data: "0xcafebabe",
      },
    ] satisfies BatchUserOperationCallData;

    expect(await account.encodeBatchExecute(data)).toMatchInlineSnapshot(
      '"0x18dfb3c7000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000002000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef0000000000000000000000008ba1f109551bd432803012645ac136ddd64dba720000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000004deadbeef000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004cafebabe00000000000000000000000000000000000000000000000000000000"'
    );
  });
});
