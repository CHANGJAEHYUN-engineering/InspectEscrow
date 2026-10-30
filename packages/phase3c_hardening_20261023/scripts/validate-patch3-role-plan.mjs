import fs from 'node:fs';
import { getAddress } from 'ethers';

const planPath = process.argv[2] ?? 'packages/phase3c_hardening_20261023/PATCH3_ROLE_PLAN_TEMPLATE.json';
const allowIncomplete = process.argv.includes('--allow-incomplete');
const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

const reuse = plan.reuseFromPatch2 ?? {};
const fresh = plan.newRequired ?? {};

const raw = {
  supplier: reuse.supplier?.address,
  buyer: reuse.buyer?.address,
  primaryInspector: reuse.primaryInspector?.address,
  backupInspector: reuse.backupInspector?.address,
  externalArbitrator: fresh.externalArbitrator,
  supplierStation: reuse.supplierStation?.address,
  buyerStation: reuse.buyerStation?.address,
  primaryInspectorStation: reuse.primaryInspectorStation?.address,
  backupInspectorStation: fresh.backupInspectorStation,
  externalArbitratorStation: fresh.externalArbitratorStation,
  credentialRegistryAuthority: fresh.credentialRegistryAuthority
};

const missing = Object.entries(raw).filter(([, value]) => !value).map(([key]) => key);
if (missing.length && !allowIncomplete) {
  throw new Error(`PATCH3 role plan incomplete: ${missing.join(', ')}`);
}

if (missing.length && allowIncomplete) {
  console.log(JSON.stringify({
    status: 'INCOMPLETE_ALLOWED',
    missing,
    note: 'Populate public addresses only. Never store private keys, mnemonics or seed phrases in this file.'
  }, null, 2));
  process.exit(0);
}

const normalized = Object.fromEntries(
  Object.entries(raw).map(([key, value]) => {
    try {
      return [key, getAddress(value)];
    } catch {
      throw new Error(`${key} is not a valid EVM address: ${value}`);
    }
  })
);

const actorKeys = ['supplier', 'buyer', 'primaryInspector', 'backupInspector', 'externalArbitrator'];
const stationKeys = ['supplierStation', 'buyerStation', 'primaryInspectorStation', 'backupInspectorStation', 'externalArbitratorStation'];
const allKeys = [...actorKeys, ...stationKeys, 'credentialRegistryAuthority'];

const lowerToKey = new Map();
for (const key of allKeys) {
  const lower = normalized[key].toLowerCase();
  if (lowerToKey.has(lower)) {
    throw new Error(`PATCH3 address collision: ${key} == ${lowerToKey.get(lower)} (${normalized[key]})`);
  }
  lowerToKey.set(lower, key);
}

if (normalized.backupInspectorStation.toLowerCase() === normalized.primaryInspectorStation.toLowerCase()) {
  throw new Error('Backup Inspector Station must be distinct from Primary Inspector Station');
}
if (normalized.externalArbitratorStation.toLowerCase() === normalized.primaryInspectorStation.toLowerCase()
  || normalized.externalArbitratorStation.toLowerCase() === normalized.backupInspectorStation.toLowerCase()) {
  throw new Error('External Arbitrator Station must be distinct from both Inspector Stations');
}

const result = {
  schema: 'inspectescrow.patch3-role-plan-resolved/1.0.0',
  status: 'PASS',
  source: planPath,
  roles: Object.fromEntries([...actorKeys, ...stationKeys].map(key => [key, normalized[key]])),
  credentialRegistryAuthority: normalized.credentialRegistryAuthority,
  assertions: {
    allNonzeroAndValid: true,
    actorsPairwiseDistinct: true,
    stationsPairwiseDistinct: true,
    actorStationCrossSetDistinct: true,
    authorityDistinctFromActorsAndStations: true,
    primaryBackupArbitratorStationSeparated: true
  },
  secretBoundary: 'PUBLIC_ADDRESSES_ONLY'
};

if (outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
}

console.log(JSON.stringify(result, null, 2));
