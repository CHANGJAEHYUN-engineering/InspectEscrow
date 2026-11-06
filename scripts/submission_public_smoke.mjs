#!/usr/bin/env node
/** Read-only live prototype smoke. NEVER sends on-chain transactions. */
import assert from "node:assert/strict";
const base="https://inspectescrow-integrated-web-production.up.railway.app";
const tradeId="0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff";
let tests=0;
async function get(route){
  const r=await fetch(new URL(route,base),{method:"GET",cache:"no-store",signal:AbortSignal.timeout(18000)});
  assert.equal(r.ok,true,route+" HTTP "+r.status);
  tests++;
  return r;
}
const h=await (await get("/healthz")).json();assert.equal(h.ok,true);
for(const route of ["/","/trades?tradeId="+tradeId,"/replay?tradeId="+tradeId,"/resolution?tradeId="+tradeId]){
 const r=await get(route);const body=await r.text();assert.match(body,/InspectEscrow/i,route+" missing title");
}
const rjs=await (await get("/replay.js")).text();assert.match(rjs,/CONTROLLED_SCORE_TAMPER_PLUS_ONE/);assert.match(rjs,/onchainSubmissionAllowed/);
const mjs=await (await get("/resolution.js")).text();assert.match(mjs,/importMutualRequest/);assert.match(mjs,/hashMutualResolution/);
const roles=await (await get("/roles.js")).text();assert.match(roles,/eth_requestAccounts/);
const plat=await (await get("/platform.js")).text();assert.match(plat,/tradeId/);
const c=await (await get("/api/resolution/context?tradeId="+tradeId)).json();
assert.equal(Number(c.state),17,"Expected RELEASED state 17, got "+c.state);
assert.equal(c.stateName,"RELEASED");
assert.equal(Boolean(c.accounting?.conserved),true);
console.log(JSON.stringify({status:"PASS",checks:tests,network:"Sepolia",tradeState:c.stateName,txSent:0,source:"live deployed prototype"},null,2));
