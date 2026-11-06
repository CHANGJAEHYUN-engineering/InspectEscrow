"use strict";

const { Contract, Interface, getAddress, id, isAddress } = require("ethers");

const STATUS = ["UNKNOWN", "ACTIVE", "SUSPENDED", "REVOKED"];
const STATIONS = [
  ["supplierStation", "Supplier Station", "공급·납품사 출하 검사"],
  ["buyerStation", "Buyer Station", "구매·발주사 입고 검사"],
  ["primaryInspectorStation", "Primary Inspector Station", "1차 독립 검증"],
  ["backupInspectorStation", "Backup Inspector Station", "예비 독립 검증"],
  ["externalArbitratorStation", "External Arbitrator Station", "외부 분쟁 중재"]
];
const ROLE_NAMES = ["supplier", "buyer", "primaryInspector", "backupInspector", "externalArbitrator"];
const TRANSITIONS = {
  registerCredential: { from: [0], to: 1, label: "자격 등록" },
  suspendCredential: { from: [1], to: 2, label: "자격 일시 정지" },
  resumeCredential: { from: [2], to: 1, label: "자격 재개" },
  revokeCredential: { from: [1, 2], to: 3, label: "자격 폐기" }
};
const CUSTOM_ERRORS = {
  UnauthorizedAuthority: "현재 지갑은 Credential Registry Authority가 아닙니다.",
  InvalidCredentialState: "현재 자격 상태에서는 선택한 변경을 실행할 수 없습니다.",
  ZeroAddress: "0x0 주소는 검사 장비 자격으로 사용할 수 없습니다.",
  AuthorityCannotBeCredential: "Registry Authority 주소는 Station credential로 등록할 수 없습니다."
};

const send = (res, status, value) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(value));
};
const same = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
const validTrade = value => /^0x[0-9a-fA-F]{64}$/.test(String(value || ""));
async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw Error("REQUEST_TOO_LARGE");
  }
  return raw ? JSON.parse(raw) : {};
}
function explain(error) {
  const raw = String(error?.shortMessage || error?.reason || error?.message || error);
  const named = Object.entries(CUSTOM_ERRORS).find(([name]) => raw.includes(name));
  if (named) return named[1];
  if (raw.includes("execution reverted")) return "컨트랙트 사전 시뮬레이션이 변경을 거부했습니다. 현재 지갑과 자격 상태를 다시 확인하세요.";
  return raw.slice(0, 260);
}
async function contracts(ctx) {
  const network = await ctx.provider.getNetwork();
  const registryAddress = getAddress(await ctx.contract.credentialRegistry());
  const registry = new Contract(registryAddress, ctx.registryAbi, ctx.provider);
  return { network, registryAddress, registry };
}
async function overview(ctx, url) {
  const tradeId = url.searchParams.get("tradeId");
  if (!validTrade(tradeId)) throw Error("VALID_TRADE_ID_REQUIRED");
  const connected = url.searchParams.get("account");
  if (connected && !isAddress(connected)) throw Error("INVALID_CONNECTED_ACCOUNT");
  const [{ network, registryAddress, registry }, block, terms, state, deadline] = await Promise.all([
    contracts(ctx), ctx.provider.getBlock("latest"), ctx.contract.getTradeTerms(tradeId), ctx.contract.getTradeState(tradeId), ctx.contract.getActionDeadline(tradeId)
  ]);
  const authority = getAddress(await registry.authority());
  const roles = Object.fromEntries(ROLE_NAMES.map(name => [name, getAddress(terms[name])]));
  const stations = [];
  for (const [key, stationType, purpose] of STATIONS) {
    const address = getAddress(terms[key]);
    const [statusValue, record] = await Promise.all([registry.status(address), registry.credentials(address)]);
    const status = Number(statusValue);
    stations.push({
      key, stationType, purpose, address, status, statusName: STATUS[status] || "UNKNOWN",
      changedAt: Number(record.changedAt), revokedAt: Number(record.revokedAt), reasonCode: record.reasonCode,
      allowedActions: Object.entries(TRANSITIONS).filter(([, rule]) => rule.from.includes(status)).map(([action]) => action)
    });
  }
  let history = [], historyNotice = "";
  try {
    const logs = await registry.queryFilter(registry.filters.CredentialStatusChanged(), 0, "latest");
    history = logs.slice(-100).reverse().map(log => ({
      blockNumber: log.blockNumber, transactionHash: log.transactionHash, credential: getAddress(log.args.credential),
      previousStatus: Number(log.args.previousStatus), previousStatusName: STATUS[Number(log.args.previousStatus)],
      newStatus: Number(log.args.newStatus), newStatusName: STATUS[Number(log.args.newStatus)],
      reasonCode: log.args.reasonCode, changedAt: Number(log.args.changedAt)
    }));
  } catch (error) {
    historyNotice = "현재 RPC가 전체 Registry 이벤트 범위 조회를 지원하지 않아 최신 자격 상태만 표시합니다.";
  }
  const account = connected ? getAddress(connected) : null;
  const isAuthority = !!account && same(account, authority);
  return {
    source: "LIVE_ONCHAIN_REGISTRY_READBACK", readOnly: !isAuthority, chainId: Number(network.chainId), blockNumber: block.number,
    blockTimestamp: block.timestamp, escrow: getAddress(await ctx.contract.getAddress()), registry: registryAddress, authority,
    connectedAccount: account, isAuthority, authorityRule: "connectedAccount === registry.authority()",
    tradeId, tradeState: Number(state), deadline: Number(deadline), roles, stations, history, historyNotice,
    supportedAdminActions: Object.entries(TRANSITIONS).map(([action, rule]) => ({ action, label: rule.label })),
    securityBoundary: ["Registry는 escrow 자금을 이동할 수 없음", "Registry는 거래 정책·상태·정산 결과를 변경할 수 없음", "관리 TX는 Authority 지갑의 MetaMask 승인이 필요함"]
  };
}
async function simulate(ctx, body) {
  if (!TRANSITIONS[body.action]) throw Error("UNSUPPORTED_REGISTRY_ACTION");
  if (!isAddress(body.credential) || !isAddress(body.from)) throw Error("VALID_FROM_AND_CREDENTIAL_REQUIRED");
  const reasonLabel = String(body.reasonLabel || "").trim();
  if (reasonLabel.length < 3 || reasonLabel.length > 80) throw Error("REASON_LABEL_LENGTH_3_TO_80_REQUIRED");
  const { network, registryAddress, registry } = await contracts(ctx);
  const authority = getAddress(await registry.authority()), from = getAddress(body.from), credential = getAddress(body.credential);
  if (!same(from, authority)) throw Error("UnauthorizedAuthority");
  const current = Number(await registry.status(credential)), transition = TRANSITIONS[body.action];
  if (!transition.from.includes(current)) throw Error("InvalidCredentialState");
  const reasonCode = id("INSPECTESCROW_REGISTRY:" + reasonLabel);
  const iface = new Interface(ctx.registryAbi), calldata = iface.encodeFunctionData(body.action, [credential, reasonCode]);
  await ctx.provider.call({ from, to: registryAddress, data: calldata }, "pending");
  return {
    stage: "SIMULATED_NOT_SENT", chainId: Number(network.chainId), target: registryAddress, from, credential,
    action: body.action, actionLabel: transition.label, currentStatus: current, currentStatusName: STATUS[current],
    expectedStatus: transition.to, expectedStatusName: STATUS[transition.to], reasonLabel, reasonCode, calldata,
    readyForMetaMaskApproval: true, transactionsSent: 0,
    warning: "이 응답은 읽기 전용 사전 시뮬레이션입니다. 실제 변경은 Authority 지갑의 MetaMask 승인이 있어야 실행됩니다."
  };
}
async function handle(req, res, ctx, url) {
  if (url.pathname === "/api/registry/overview" && req.method === "GET") {
    try { return send(res, 200, await overview(ctx, url)); }
    catch (error) { return send(res, 422, { error: "REGISTRY_OVERVIEW_FAILED", detail: explain(error) }); }
  }
  if (url.pathname === "/api/registry/simulate-action" && req.method === "POST") {
    if (req.headers.origin && req.headers.origin !== "http://" + req.headers.host && req.headers.origin !== process.env.INSPECTESCROW_PUBLIC_ORIGIN) return send(res, 403, { error: "ORIGIN_REJECTED", detail: "현재 InspectEscrow 화면에서 시작한 요청만 허용됩니다." });
    try { return send(res, 200, await simulate(ctx, await readBody(req))); }
    catch (error) { return send(res, 422, { error: "REGISTRY_SIMULATION_FAILED", detail: explain(error) }); }
  }
  return send(res, 404, { error: "REGISTRY_ROUTE_NOT_FOUND" });
}

module.exports = { handle, overview, simulate, STATUS, TRANSITIONS };
