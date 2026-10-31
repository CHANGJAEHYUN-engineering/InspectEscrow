"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Contract, JsonRpcProvider, keccak256 } = require("ethers");

const project = path.resolve(__dirname, "..", "..", "..");
const abi = JSON.parse(fs.readFileSync(path.join(project, ".patch3-build", "InspectEscrowPatch3.sol_InspectEscrowPatch3.abi"), "utf8"));
const provider = new JsonRpcProvider("http://127.0.0.1:18549", 11155111, { staticNetwork: true, cacheTimeout: -1 });
const escrowAddress = "0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905";
const escrow = new Contract(escrowAddress, abi, provider);
const ids = {
  completed: "0x2e1e7f88734dc4bf2b1fee924192a11311846a4351b86497d5c43670fa173d9e",
  candidate: "0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff",
  protectedModelA: "0x8e07587390de665a8a3c0fe81e1e7298541847acd244db5ea98e5dc3acb3f9db"
};
const actors = {
  supplier: "0xaE7B8A9B15534829492F9449a67e83aAbd82E7BE",
  buyer: "0x5B52D3B71dD5B4637B828Fd2a0e8bC78346709eE"
};
const checks = [];
const add = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail: String(detail) });

async function main() {
  const [network, block, code, completed, candidate, modelA, supplierClaimable, buyerClaimable,
    totalFunded, totalWithdrawn, unsettled, outstanding, conserved, covered, balance] = await Promise.all([
    provider.getNetwork(), provider.getBlock("latest"), provider.getCode(escrowAddress),
    escrow.getTradeState(ids.completed), escrow.getTradeState(ids.candidate), escrow.getTradeState(ids.protectedModelA),
    escrow.claimable(actors.supplier), escrow.claimable(actors.buyer),
    escrow.totalFunded(), escrow.totalWithdrawn(), escrow.unsettledEscrow(), escrow.outstandingClaimable(),
    escrow.accountingConserved(), escrow.balanceCoversLiabilities(), provider.getBalance(escrowAddress)
  ]);
  add("01_FORK_CHAIN_ID", Number(network.chainId) === 11155111, network.chainId);
  add("02_PATCH3_RUNTIME_HASH", keccak256(code) === "0x5a606383f54c6ebeb52316927343ee802ecdd4774a1a2978de08bf9ee981bdd9", keccak256(code));
  add("03_COMPLETED_S05_RELEASED", Number(completed) === 17, completed);
  add("04_COMPLETED_SUPPLIER_WITHDRAWN", supplierClaimable === 0n, supplierClaimable);
  add("05_COMPLETED_BUYER_NOT_REFUNDED", buyerClaimable === 0n, buyerClaimable);
  add("06_REVIEW_CANDIDATE_PROPOSED", Number(candidate) === 1, candidate);
  add("07_PROTECTED_MODEL_A_FUNDED", Number(modelA) === 4, modelA);
  add("08_TOTAL_FUNDED", totalFunded === 7000000000000000n, totalFunded);
  add("09_TOTAL_WITHDRAWN", totalWithdrawn === 1000000000000000n, totalWithdrawn);
  add("10_UNSETTLED_FUNDED", unsettled === 6000000000000000n, unsettled);
  add("11_OUTSTANDING_CLAIMABLE_ZERO", outstanding === 0n, outstanding);
  add("12_ACCOUNTING_CONSERVED", conserved === true, conserved);
  add("13_BALANCE_COVERS_LIABILITIES", covered === true && balance >= unsettled + outstanding, `${covered} / ${balance}`);
  const result = {
    suite: "INSPECTESCROW_2D_SETTLEMENT_WITHDRAW_SEPOLIA_FORK_READ_ONLY",
    generatedAtUtc: new Date().toISOString(),
    scope: "LOCAL_ANVIL_FORK_OF_SEPOLIA_READ_ONLY_CALLS",
    forkBlockNumber: block.number,
    chainId: Number(network.chainId),
    contract: escrowAddress,
    runtimeHash: keccak256(code),
    checksPassed: checks.filter(x => x.pass).length,
    checksTotal: checks.length,
    allPass: checks.every(x => x.pass),
    localForkTransactions: 0,
    actualSepoliaTransactions: 0,
    accounting: {
      totalFunded: totalFunded.toString(), totalWithdrawn: totalWithdrawn.toString(),
      unsettledFunded: unsettled.toString(), outstandingClaimable: outstanding.toString(),
      contractBalance: balance.toString()
    },
    checks
  };
  fs.writeFileSync(path.join(__dirname, "2D_RESOLUTION_SEPOLIA_FORK_RESULTS.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (!result.allPass) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
