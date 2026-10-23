import fs from 'node:fs';
import path from 'node:path';
import { getAddress, hexlify, randomBytes } from 'ethers';

const pkg = 'packages/phase3c_hardening_20261023';
const planPath = process.env.PATCH3_ROLE_PLAN ?? `${pkg}/PATCH3_ROLE_PLAN.json`;
const deploymentPath = process.env.PATCH3_DEPLOYMENT_MANIFEST ?? `${pkg}/results/PATCH3_SEPOLIA_DEPLOYMENT.json`;
const templatePath = `${pkg}/policy/PATCH3_POLICY_INPUT_TEMPLATE.json`;
const outPath = process.env.PATCH3_POLICY_INPUT_OUT ?? `${pkg}/policy/PATCH3_POLICY_INPUT.json`;

for (const p of [planPath, deploymentPath, templatePath]) {
  if (!fs.existsSync(p)) throw new Error(`Required file missing: ${p}`);
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

const reuse = plan.reuseFromPatch2 ?? {};
const fresh = plan.newRequired ?? {};
const roles = {
  supplier: reuse.supplier?.address,
  buyer: reuse.buyer?.address,
  primaryInspector: reuse.primaryInspector?.address,
  backupInspector: reuse.backupInspector?.address,
  externalArbitrator: fresh.externalArbitrator,
  supplierStation: reuse.supplierStation?.address,
  buyerStation: reuse.buyerStation?.address,
  primaryInspectorStation: reuse.primaryInspectorStation?.address,
  backupInspectorStation: fresh.backupInspectorStation,
  externalArbitratorStation: fresh.externalArbitratorStation
};

for (const [key, value] of Object.entries(roles)) {
  if (!value) throw new Error(`Missing role address: ${key}`);
  roles[key] = getAddress(value);
}

const authority = getAddress(fresh.credentialRegistryAuthority);
const registry = getAddress(deployment.contracts.CredentialRegistryPatch3.address);
const escrow = getAddress(deployment.contracts.InspectEscrowPatch3.address);
if (getAddress(deployment.credentialRegistryAuthority) !== authority) {
  throw new Error('Role-plan authority does not match deployment manifest');
}

const tradeId = process.env.PATCH3_TRADE_ID ?? hexlify(randomBytes(32));
if (!/^0x[0-9a-fA-F]{64}$/.test(tradeId)) throw new Error('PATCH3_TRADE_ID must be bytes32');

const input = {
  ...template,
  status: 'READY_TO_HASH_AFTER_UNUSED_TRADE_ID_CHECK',
  chainId: 11155111,
  verifyingContract: escrow,
  credentialRegistry: registry,
  credentialAuthority: authority,
  tradeId,
  roles
};

fs.mkdirSync(path.dirname(outPath), {recursive: true});
fs.writeFileSync(outPath, JSON.stringify(input, null, 2) + '\n');
console.log(JSON.stringify({
  status: input.status,
  tradeId,
  verifyingContract: escrow,
  credentialRegistry: registry,
  output: outPath,
  next: `node ${pkg}/policy/generate-patch3-policy.mjs ${outPath}`
}, null, 2));
