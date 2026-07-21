// One-shot deploy of Settlement.sol to Celo Alfajores. Prints the deployed
// address so it can be pasted into .env as SETTLEMENT_CONTRACT.
require("dotenv/config");
const fs = require("node:fs");
const path = require("node:path");
const { createWalletClient, createPublicClient, http } = require("viem");
const { celoSepolia } = require("viem/chains");
const { privateKeyToAccount } = require("viem/accounts");

async function main() {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, "Settlement.json"), "utf8"),
  );

  const rpcUrl = process.env.CELO_TESTNET_RPC_URL ?? "https://forno.celo-sepolia.celo-testnet.org";
  const pk = process.env.SETTLER_PK;
  if (!pk) throw new Error("SETTLER_PK not set in .env");

  const account = privateKeyToAccount(pk);
  const publicClient = createPublicClient({ chain: celoSepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: celoSepolia, transport: http(rpcUrl) });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Deployer:", account.address);
  console.log("Balance (wei):", balance.toString());
  if (balance === 0n) {
    throw new Error("Deployer has 0 balance — fund it via https://faucet.celo.org first.");
  }

  console.log("Deploying Settlement.sol...");
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
  });
  console.log("Deploy tx hash:", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Status:", receipt.status);
  console.log("Contract address:", receipt.contractAddress);
  console.log(`\nAdd to .env:\nSETTLEMENT_CONTRACT=${receipt.contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
