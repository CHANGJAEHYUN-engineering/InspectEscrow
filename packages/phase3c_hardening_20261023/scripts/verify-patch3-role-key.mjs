// READ-ONLY local role-key verification; never send keys to chat or write to disk.
// Usage: set PATCH3_ACTOR_PRIVATE_KEY locally and run:
// node .../verify-patch3-role-key.mjs externalArbitrator
import fs from 'node:fs';
import { Wallet, getAddress } from 'ethers';
const pkg='packages/phase3c_hardening_20261023';
const role=process.argv[2];
const plan=JSON.parse(fs.readFileSync(`${pkg}/PATCH3_ROLE_PLAN.json`,'utf8'));
const known={
  ...Object.fromEntries(Object.entries(plan.reuseFromPatch2||{}).map(([key,value])=>[key,value.address])),
  ...plan.newRequired
};
const names=Object.keys(known).sort();
if(!role||!Object.hasOwn(known,role))throw new Error('Specify one frozen role: '+names.join(', '));
const privateKey=process.env.PATCH3_ACTOR_PRIVATE_KEY;
if(!privateKey)throw new Error('PATCH3_ACTOR_PRIVATE_KEY is required; type only in a LOCAL secure prompt');
// Fail closed without allowing a library error to echo malformed secret input.
if(!/^0x[0-9a-fA-F]{64}$/.test(privateKey))throw new Error('Expected a 0x-prefixed 32-byte hex key (input not printed)');
let signer;
try { signer=new Wallet(privateKey); }
catch { throw new Error('Unable to derive wallet address (input not printed)'); }
const expected=getAddress(known[role]);
const actual=getAddress(signer.address);
const matches=names.filter(name=>getAddress(known[name])===actual);
const pass=actual===expected;
console.log(JSON.stringify({
  status: pass?'PASS_ROLE_KEY_MATCH':'FAIL_ROLE_KEY_MISMATCH',
  requestedRole:role,
  expectedPublicAddress:expected,
  derivedPublicAddress:actual,
  matchesFrozenRoles:matches,
  transactionsSent:0,
  secretBoundary:'PRIVATE_KEY_NOT_PRINTED_OR_WRITTEN'
},null,2));
if(!pass)process.exitCode=1;
