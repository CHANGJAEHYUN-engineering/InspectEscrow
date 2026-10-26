// PATCH3 Sepolia-only external arbitrator gas top-up.
// READ-ONLY by default; --broadcast requires a locally held private key.
// Never hardcode, log, or persist private keys or credential-bearing RPC URLs.
import fs from "node:fs";
import {
  JsonRpcProvider, Wallet, formatEther, getAddress, parseEther
} from "ethers";

const pkg = "packages/phase3c_hardening_20261023";
const plan = JSON.parse(fs.readFileSync(`${pkg}/PATCH3_ROLE_PLAN.json`, "utf8"));
const expectedFrom = getAddress("0xA01e44c905CE25377EC5fBBC4064b2d3b5ec4a92");
const expectedTo = getAddress("0x9E3bA22795068b82B3D7C2A998cd40294520c8Ce");
const from = getAddress(plan.newRequired.credentialRegistryAuthority);
const to = getAddress(plan.newRequired.externalArbitrator);
const amount = parseEther("0.003");
const minimumReserve = parseEther("0.005");
const gasLimit = 21000n;
const broadcast = process.argv.slice(2).includes("--broadcast");
const assert = (ok, message) => { if (!ok) throw new Error(message); };

assert(process.argv.slice(2).every(a => a === "--broadcast"), "Unexpected CLI argument");
assert(from === expectedFrom && to === expectedTo, "Frozen PATCH3 funding addresses changed; refuse transfer");
assert(from !== to, "Sender and recipient must differ");
const rpc = process.env.PATCH3_RPC_URL;
assert(typeof rpc === "string" && /^https:\/\//.test(rpc), "PATCH3_RPC_URL must be an HTTPS Sepolia RPC endpoint");
const provider = new JsonRpcProvider(rpc);
const network = await provider.getNetwork();
assert(network.chainId === 11155111n, "Not Sepolia; refuse transfer");
const recipientCode = await provider.getCode(to);
assert(recipientCode === "0x", "External Arbitrator destination is not an EOA; refuse transfer");

const [senderBalance, recipientBalance, feeData, pendingNonce] = await Promise.all([
  provider.getBalance(from),
  provider.getBalance(to),
  provider.getFeeData(),
  provider.getTransactionCount(from, "pending")
]);
const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
assert(maxFeePerGas != null && maxFeePerGas > 0n, "No usable fee quote");
const maximumGasCost = gasLimit * maxFeePerGas;
const projectedRemaining = senderBalance - amount - maximumGasCost;
const enoughBalance = senderBalance >= amount + maximumGasCost + minimumReserve;
const alreadyFunded = recipientBalance >= amount;
const summary = {
  status: "READ_ONLY_TOPUP_PREVIEW",
  chainId: Number(network.chainId),
  from,
  to,
  amountEth: "0.003",
  senderBalanceEth: formatEther(senderBalance),
  recipientBalanceEth: formatEther(recipientBalance),
  gasLimit: gasLimit.toString(),
  maxFeePerGasWei: maxFeePerGas.toString(),
  maxNetworkFeeEth: formatEther(maximumGasCost),
  projectedSenderBalanceAfterEth: formatEther(projectedRemaining),
  minimumSenderReserveEth: formatEther(minimumReserve),
  pendingNonce,
  enoughBalanceAndReserve: enoughBalance,
  recipientAlreadyHasTargetAmount: alreadyFunded,
  broadcastRequested: broadcast,
  transactionsSent: 0
};
console.log(JSON.stringify(summary, null, 2));

assert(enoughBalance, "Insufficient Authority balance to transfer while preserving minimum reserve");
assert(!alreadyFunded, "Recipient already holds >=0.003 Sepolia ETH; prevent unnecessary duplicate top-up");

if (!broadcast) {
  console.log("READ-ONLY PREVIEW PASS. No transaction was sent.");
  process.exit(0);
}
assert(process.env.PATCH3_TOPUP_CONFIRM === "SEND_0.003_SEPOLIA_ETH",
  "Explicit top-up confirmation missing; no transaction sent");
const privateKey = process.env.PATCH3_AUTHORITY_PRIVATE_KEY;
assert(typeof privateKey === "string" && /^0x[0-9a-fA-F]{64}$/.test(privateKey),
  "PATCH3_AUTHORITY_PRIVATE_KEY must be a 0x-prefixed 32-byte key (key not logged)");
let wallet;
try { wallet = new Wallet(privateKey, provider); }
catch { throw new Error("Unable to derive Authority signer (key not logged)"); }
assert(getAddress(wallet.address) === from, "Private key does not match frozen Authority sender");

// Re-check immediately before any broadcast; no optimistic reliance on the preview.
const [currentBalance, currentRecipientBalance, currentNetwork] = await Promise.all([
  provider.getBalance(from), provider.getBalance(to), provider.getNetwork()
]);
assert(currentNetwork.chainId === 11155111n, "Sepolia chain ID changed");
assert(currentBalance >= amount + maximumGasCost + minimumReserve,
  "Authority funds changed; insufficient reserve");
assert(currentRecipientBalance < amount, "Recipient was funded since preview; abort");

const feeOptions = feeData.maxFeePerGas != null && feeData.maxPriorityFeePerGas != null
  ? { type: 2, maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas }
  : { gasPrice: feeData.gasPrice };
assert(feeOptions.gasPrice != null || (
  feeOptions.maxFeePerGas > 0n &&
  feeOptions.maxPriorityFeePerGas >= 0n &&
  feeOptions.maxPriorityFeePerGas <= feeOptions.maxFeePerGas),
  "Invalid gas fee options");

// One send attempt only. If receipt retrieval fails, check the explorer by txHash.
// Never blindly run --broadcast a second time.
const tx = await wallet.sendTransaction({
  to, value: amount, gasLimit, ...feeOptions
});
console.log(JSON.stringify({
  status: "TRANSACTION_SENT_AWAITING_CONFIRMATION",
  transactionHash: tx.hash,
  from, to, amountEth: "0.003",
  note: "If an RPC/receipt error occurs, verify this hash before attempting anything else."
}, null, 2));
const receipt = await tx.wait(1);
assert(receipt && receipt.status === 1,
  "Transfer not confirmed successfully; inspect transaction hash, DO NOT retry automatically");
const finalRecipientBalance = await provider.getBalance(to);
console.log(JSON.stringify({
  status: "TOPUP_CONFIRMED",
  transactionHash: tx.hash,
  blockNumber: receipt.blockNumber,
  gasUsed: receipt.gasUsed.toString(),
  recipientBalanceEth: formatEther(finalRecipientBalance),
  receiptStatus: Number(receipt.status)
}, null, 2));
