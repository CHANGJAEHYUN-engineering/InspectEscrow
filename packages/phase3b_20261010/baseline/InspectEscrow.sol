// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title InspectEscrow
/// @notice Native-ETH escrow coupled to signed manufacturing-inspection evidence.
/// @dev The contract verifies commitments, authority and state transitions. It does not prove
///      physical specimen identity, capture conditions, PatchCore execution or product quality.
contract InspectEscrow is EIP712, ReentrancyGuard {
    string public constant NAME = "InspectEscrow";
    string public constant VERSION = "1";
    string public constant CONTRACT_VERSION = "PHASE2-PATCH2";

    enum TradeState {
        NONE,
        PROPOSED,
        PARTIES_ACCEPTED,
        INSPECTORS_ACCEPTED,
        FUNDED,
        AWAIT_SUPPLIER,
        SUPPLIER_REINSPECTION,
        SUPPLIER_HOLD,
        AWAIT_BUYER,
        BUYER_REINSPECTION,
        BUYER_INSPECTION_TIMEOUT,
        ACCEPTANCE_PENDING,
        DISPUTED_PRIMARY,
        DISPUTED_BACKUP,
        EXECUTION_HOLD,
        EVIDENCE_HOLD,
        ESCALATED,
        RELEASED,
        REFUNDED,
        CANCELLED
    }

    enum InspectionRole {
        SUPPLIER,
        BUYER
    }

    enum InspectionValidity {
        ADMISSIBLE,
        INVALID
    }

    enum InspectionOutcome {
        NONE,
        INSPECTION_INVALID,
        ADMISSIBLE_PASS,
        ADMISSIBLE_REVIEW
    }

    enum InvalidReason {
        NONE,
        REQUIRED_VIEW_MISSING,
        IMAGE_QA_FAILED,
        CAPTURE_PROFILE_NONCONFORMING,
        SPECIMEN_EVIDENCE_INSUFFICIENT,
        RECAPTURE_RULE_VIOLATION,
        EVIDENCE_PACKAGE_INCOMPLETE,
        OTHER_POLICY_DEFINED
    }

    enum InspectorStage {
        PRIMARY,
        BACKUP
    }

    enum SettlementOutcome {
        NONE,
        RELEASE_TO_SUPPLIER,
        REFUND_TO_BUYER
    }

    enum ReplayStatus {
        NONE,
        CONSISTENT,
        INCONSISTENT
    }

    struct Windows {
        uint64 supplierInspection;
        uint64 buyerInspection;
        uint64 buyerAcceptance;
        uint64 primaryInspector;
        uint64 backupInspector;
    }

    struct TradeTerms {
        bytes32 tradeId;
        address supplier;
        address buyer;
        address primaryInspector;
        address backupInspector;
        address supplierStation;
        address buyerStation;
        address inspectorStation;
        uint256 escrowAmount;
        uint32 policyVersion;
        bytes32 policyHash;
        bytes32 modelBundleHash;
        bytes32 captureProfileHash;
        bytes32 productSpecHash;
        bytes32 requiredViewSetHash;
        bytes32 scoreSchemaId;
        uint128 thresholdScaled;
        uint8 scoreScaleExponent;
        uint128 scoreMinScaled;
        uint128 scoreMaxScaled;
        uint8 maxSupplierRetries;
        uint8 maxBuyerRetries;
        Windows windows;
    }

    struct InspectionRecord {
        InspectionOutcome outcome;
        uint128 aggregateScoreScaled;
        bytes32 evidencePackageHash;
        bytes32 specimenManifestHash;
        uint32 attempt;
        uint64 submittedAt;
        address station;
    }

    struct StationAttestation {
        bytes32 tradeId;
        InspectionRole role;
        address station;
        uint32 attempt;
        bytes32 sessionNonce;
        bytes32 policyHash;
        bytes32 modelBundleHash;
        bytes32 captureProfileHash;
        bytes32 specimenManifestHash;
        bytes32 evidencePackageHash;
        uint128 aggregateScoreScaled;
        bytes32 scoreSchemaId;
        InspectionValidity inspectionValidity;
        InvalidReason invalidReason;
        uint64 issuedAt;
        uint64 validUntil;
    }

    struct ReplayAttestation {
        bytes32 tradeId;
        InspectorStage stage;
        address inspectorActor;
        bytes32 policyHash;
        bytes32 supplierEvidenceHash;
        bytes32 buyerEvidenceHash;
        bytes32 replayReportHash;
        bool consistent;
        bytes32 nonce;
        uint64 issuedAt;
        uint64 validUntil;
    }

    struct InspectorDecisionAttestation {
        bytes32 tradeId;
        InspectorStage stage;
        address inspectorActor;
        bytes32 policyHash;
        bytes32 supplierEvidenceHash;
        bytes32 buyerEvidenceHash;
        bytes32 replayReportHash;
        SettlementOutcome decision;
        bytes32 reasonCode;
        bytes32 nonce;
        uint64 issuedAt;
        uint64 validUntil;
    }

    struct MutualResolution {
        bytes32 tradeId;
        SettlementOutcome outcome;
        bytes32 resolutionNonce;
        uint64 deadline;
    }

    struct Trade {
        TradeTerms terms;
        TradeState state;
        uint64 stateEnteredAt;
        uint64 actionDeadline;
        bool supplierAccepted;
        bool buyerAccepted;
        bool primaryInspectorAccepted;
        bool backupInspectorAccepted;
        bool funded;
        bool settled;
        InspectionRecord supplierInspection;
        InspectionRecord buyerInspection;
        ReplayStatus replayStatus;
        bytes32 replayReportHash;
    }

    bytes32 public constant STATION_ATTESTATION_TYPEHASH = keccak256(
        "StationAttestation(bytes32 tradeId,uint8 role,address station,uint32 attempt,bytes32 sessionNonce,bytes32 policyHash,bytes32 modelBundleHash,bytes32 captureProfileHash,bytes32 specimenManifestHash,bytes32 evidencePackageHash,uint128 aggregateScoreScaled,bytes32 scoreSchemaId,uint8 inspectionValidity,uint8 invalidReason,uint64 issuedAt,uint64 validUntil)"
    );
    bytes32 public constant REPLAY_ATTESTATION_TYPEHASH = keccak256(
        "ReplayAttestation(bytes32 tradeId,uint8 stage,address inspectorActor,bytes32 policyHash,bytes32 supplierEvidenceHash,bytes32 buyerEvidenceHash,bytes32 replayReportHash,bool consistent,bytes32 nonce,uint64 issuedAt,uint64 validUntil)"
    );
    bytes32 public constant INSPECTOR_DECISION_TYPEHASH = keccak256(
        "InspectorDecisionAttestation(bytes32 tradeId,uint8 stage,address inspectorActor,bytes32 policyHash,bytes32 supplierEvidenceHash,bytes32 buyerEvidenceHash,bytes32 replayReportHash,uint8 decision,bytes32 reasonCode,bytes32 nonce,uint64 issuedAt,uint64 validUntil)"
    );
    bytes32 public constant MUTUAL_RESOLUTION_TYPEHASH = keccak256(
        "MutualResolution(bytes32 tradeId,uint8 outcome,bytes32 resolutionNonce,uint64 deadline)"
    );

    mapping(bytes32 tradeId => Trade trade) private _trades;
    mapping(bytes32 digest => bool consumed) public consumedDigest;
    mapping(bytes32 scopedNonceKey => bool consumed) public consumedNonce;
    mapping(bytes32 tradeId => mapping(bytes32 nonce => bool used)) public usedResolutionNonce;
    mapping(address recipient => uint256 amount) public claimable;

    uint256 public totalFunded;
    uint256 public unsettledEscrow;
    uint256 public outstandingClaimable;
    uint256 public totalWithdrawn;

    error TradeAlreadyExists();
    error TradeNotFound();
    error UnauthorizedCaller();
    error UnauthorizedStation();
    error WrongRole();
    error InvalidState(TradeState expected, TradeState actual);
    error InvalidStateSet(TradeState actual);
    error PolicyHashMismatch();
    error ModelBundleHashMismatch();
    error CaptureProfileHashMismatch();
    error ScoreSchemaMismatch();
    error EvidenceHashMismatch();
    error NonceAlreadyUsed();
    error AttestationExpired();
    error AttestationFromFuture();
    error InvalidAttestationWindow();
    error InvalidAttestationSignature();
    error ForbiddenDuplicateSubmission();
    error ScoreOutOfRange();
    error AttemptNumberMismatch(uint32 expected, uint32 actual);
    error DeadlineNotReached();
    error DeadlinePassed();
    error FundingMismatch();
    error AlreadyFunded();
    error AlreadySettled();
    error InvalidMutualSignatures();
    error ZeroAddress();
    error InvalidTerms();
    error InvalidInspectionReason();
    error InvalidScoreSentinel();
    error InvalidSettlementOutcome();
    error RetryLimitReached();
    error ReplayRequired();
    error NoClaimableBalance();
    error NativeTransferFailed();
    error DirectEtherDisabled();

    event TradeProposed(
        bytes32 indexed tradeId, address indexed supplier, address indexed buyer, bytes32 policyHash
    );
    event PolicyAccepted(bytes32 indexed tradeId, address indexed party, bytes32 policyHash);
    event InspectorAssignmentAccepted(
        bytes32 indexed tradeId, address indexed inspector, bytes32 policyHash
    );
    event TradeFunded(bytes32 indexed tradeId, address indexed buyer, uint256 amount);
    event TradeActivated(bytes32 indexed tradeId, uint64 supplierDeadline);
    event SupplierInspectionTimeoutRefundCredited(
        bytes32 indexed tradeId, address indexed buyer, uint256 amount
    );
    event SupplierPreShipmentTerminated(
        bytes32 indexed tradeId, address indexed buyer, uint256 amount, bytes32 reason
    );
    event InspectionInvalidRecorded(
        bytes32 indexed tradeId,
        InspectionRole indexed role,
        uint32 attempt,
        InvalidReason reason,
        bytes32 specimenManifestHash,
        bytes32 evidencePackageHash,
        address station
    );
    event InspectionOutcomeDerived(
        bytes32 indexed tradeId,
        InspectionRole indexed role,
        uint32 attempt,
        uint128 aggregateScoreScaled,
        InspectionOutcome outcome,
        bytes32 specimenManifestHash,
        bytes32 evidencePackageHash,
        address station
    );
    event ReinspectionOpened(
        bytes32 indexed tradeId, InspectionRole indexed role, uint32 nextAttempt, uint64 deadline
    );
    event SupplierHoldEntered(bytes32 indexed tradeId, uint32 attempt, uint128 score);
    event DisputeOpened(bytes32 indexed tradeId, uint64 primaryInspectorDeadline);
    event BuyerInspectionTimeoutEntered(bytes32 indexed tradeId);
    event EvidenceHoldEntered(bytes32 indexed tradeId, InspectionRole indexed role, bytes32 reason);
    event BackupInspectorActivated(bytes32 indexed tradeId, uint64 backupInspectorDeadline);
    event ReplayResultRecorded(
        bytes32 indexed tradeId,
        InspectorStage indexed stage,
        bytes32 replayReportHash,
        bool consistent
    );
    event Escalated(bytes32 indexed tradeId);
    event InspectorDecisionRecorded(
        bytes32 indexed tradeId,
        InspectorStage indexed stage,
        SettlementOutcome decision,
        bytes32 reasonCode,
        bytes32 replayReportHash
    );
    event MutualResolutionRecorded(
        bytes32 indexed tradeId, SettlementOutcome outcome, bytes32 resolutionNonce
    );
    event SettlementCredited(
        bytes32 indexed tradeId,
        address indexed recipient,
        uint256 amount,
        SettlementOutcome outcome
    );
    event Withdrawal(address indexed recipient, uint256 amount);
    event TradeCancelled(bytes32 indexed tradeId, address indexed caller);

    constructor() EIP712(NAME, VERSION) { }

    receive() external payable {
        revert DirectEtherDisabled();
    }

    fallback() external payable {
        revert DirectEtherDisabled();
    }

    /// @notice Creates immutable terms. No administrative mutation function exists.
    function proposeTrade(TradeTerms calldata terms) external {
        _validateTerms(terms);
        if (_trades[terms.tradeId].state != TradeState.NONE) revert TradeAlreadyExists();
        if (msg.sender != terms.supplier && msg.sender != terms.buyer) revert UnauthorizedCaller();

        Trade storage trade = _trades[terms.tradeId];
        trade.terms = terms;
        _enterState(trade, TradeState.PROPOSED, 0);
        emit TradeProposed(terms.tradeId, terms.supplier, terms.buyer, terms.policyHash);
    }

    function acceptPolicy(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (trade.state != TradeState.PROPOSED) {
            revert InvalidState(TradeState.PROPOSED, trade.state);
        }
        if (msg.sender == trade.terms.supplier) {
            if (trade.supplierAccepted) revert ForbiddenDuplicateSubmission();
            trade.supplierAccepted = true;
        } else if (msg.sender == trade.terms.buyer) {
            if (trade.buyerAccepted) revert ForbiddenDuplicateSubmission();
            trade.buyerAccepted = true;
        } else {
            revert UnauthorizedCaller();
        }
        emit PolicyAccepted(tradeId, msg.sender, trade.terms.policyHash);
        if (trade.supplierAccepted && trade.buyerAccepted) {
            _enterState(trade, TradeState.PARTIES_ACCEPTED, 0);
        }
    }

    function acceptInspectorAssignment(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (trade.state != TradeState.PARTIES_ACCEPTED) {
            revert InvalidState(TradeState.PARTIES_ACCEPTED, trade.state);
        }
        if (msg.sender == trade.terms.primaryInspector) {
            if (trade.primaryInspectorAccepted) revert ForbiddenDuplicateSubmission();
            trade.primaryInspectorAccepted = true;
        } else if (msg.sender == trade.terms.backupInspector) {
            if (trade.backupInspectorAccepted) revert ForbiddenDuplicateSubmission();
            trade.backupInspectorAccepted = true;
        } else {
            revert UnauthorizedCaller();
        }
        emit InspectorAssignmentAccepted(tradeId, msg.sender, trade.terms.policyHash);
        if (trade.primaryInspectorAccepted && trade.backupInspectorAccepted) {
            _enterState(trade, TradeState.INSPECTORS_ACCEPTED, 0);
        }
    }

    function fund(bytes32 tradeId) external payable nonReentrant {
        Trade storage trade = _trade(tradeId);
        if (trade.state != TradeState.INSPECTORS_ACCEPTED) {
            revert InvalidState(TradeState.INSPECTORS_ACCEPTED, trade.state);
        }
        if (msg.sender != trade.terms.buyer) revert UnauthorizedCaller();
        if (trade.funded) revert AlreadyFunded();
        if (msg.value != trade.terms.escrowAmount) revert FundingMismatch();

        trade.funded = true;
        totalFunded += msg.value;
        unsettledEscrow += msg.value;
        _enterState(trade, TradeState.FUNDED, 0);
        emit TradeFunded(tradeId, msg.sender, msg.value);
    }

    /// @notice Permissionless after exact funding so the FUNDED state cannot be held hostage.
    function activate(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (trade.state != TradeState.FUNDED) revert InvalidState(TradeState.FUNDED, trade.state);
        uint64 deadline = _deadlineFromNow(trade.terms.windows.supplierInspection);
        _enterState(trade, TradeState.AWAIT_SUPPLIER, deadline);
        emit TradeActivated(tradeId, deadline);
    }

    function submitInspection(StationAttestation calldata attestation, bytes calldata signature)
        external
    {
        Trade storage trade = _trade(attestation.tradeId);
        _validateInspectionStateAndCaller(trade, attestation.role);
        if (block.timestamp > trade.actionDeadline) revert DeadlinePassed();

        address expectedStation = attestation.role == InspectionRole.SUPPLIER
            ? trade.terms.supplierStation
            : trade.terms.buyerStation;
        if (attestation.station != expectedStation) revert UnauthorizedStation();

        uint32 expectedAttempt = attestation.role == InspectionRole.SUPPLIER
            ? trade.supplierInspection.attempt + 1
            : trade.buyerInspection.attempt + 1;
        if (attestation.attempt != expectedAttempt) {
            revert AttemptNumberMismatch(expectedAttempt, attestation.attempt);
        }

        _validateStationCommitments(trade, attestation);
        _validateTime(attestation.issuedAt, attestation.validUntil);
        if (
            attestation.specimenManifestHash == bytes32(0)
                || attestation.evidencePackageHash == bytes32(0)
        ) revert InvalidTerms();

        if (attestation.inspectionValidity == InspectionValidity.INVALID) {
            if (attestation.invalidReason == InvalidReason.NONE) revert InvalidInspectionReason();
            if (attestation.aggregateScoreScaled != 0) revert InvalidScoreSentinel();
        } else {
            if (attestation.invalidReason != InvalidReason.NONE) {
                revert InvalidInspectionReason();
            }
            if (
                attestation.aggregateScoreScaled < trade.terms.scoreMinScaled
                    || attestation.aggregateScoreScaled > trade.terms.scoreMaxScaled
            ) revert ScoreOutOfRange();
        }

        bytes32 digest = hashStationAttestation(attestation);
        bytes32 nonceKey = keccak256(
            abi.encode(
                STATION_ATTESTATION_TYPEHASH,
                expectedStation,
                attestation.tradeId,
                attestation.role,
                attestation.sessionNonce
            )
        );
        if (consumedNonce[nonceKey]) revert NonceAlreadyUsed();
        _validateFreshSignature(digest, signature, expectedStation);

        consumedDigest[digest] = true;
        consumedNonce[nonceKey] = true;
        _recordInspection(trade, attestation);
    }

    function requestSupplierReinspection(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (msg.sender != trade.terms.supplier) revert UnauthorizedCaller();
        if (trade.state != TradeState.SUPPLIER_HOLD) {
            revert InvalidState(TradeState.SUPPLIER_HOLD, trade.state);
        }
        if (!_retryAvailable(trade.supplierInspection.attempt, trade.terms.maxSupplierRetries)) {
            revert RetryLimitReached();
        }
        uint64 deadline = _deadlineFromNow(trade.terms.windows.supplierInspection);
        _enterState(trade, TradeState.SUPPLIER_REINSPECTION, deadline);
        emit ReinspectionOpened(
            tradeId, InspectionRole.SUPPLIER, trade.supplierInspection.attempt + 1, deadline
        );
    }

    function invokeReinspectionTimeout(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (trade.state == TradeState.SUPPLIER_REINSPECTION) {
            _requireDeadlineReached(trade);
            _refundSupplierProtocolFailure(
                tradeId, trade, keccak256("SUPPLIER_REINSPECTION_TIMEOUT")
            );
            return;
        }
        if (trade.state != TradeState.BUYER_REINSPECTION) {
            revert InvalidStateSet(trade.state);
        }
        _requireDeadlineReached(trade);
        _enterState(trade, TradeState.EVIDENCE_HOLD, 0);
        emit EvidenceHoldEntered(tradeId, InspectionRole.BUYER, keccak256("REINSPECTION_TIMEOUT"));
    }

    /// @notice Ends the transaction if a Supplier REVIEW hold expires without a valid retry.
    /// @dev This is failure to complete the pre-shipment protocol gate, not a defect finding.
    function invokeSupplierHoldTimeout(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (trade.state != TradeState.SUPPLIER_HOLD) {
            revert InvalidState(TradeState.SUPPLIER_HOLD, trade.state);
        }
        _requireDeadlineReached(trade);
        _refundSupplierProtocolFailure(tradeId, trade, keccak256("SUPPLIER_HOLD_TIMEOUT"));
    }

    /// @notice Ends a funded trade when the Supplier never submits its initial inspection.
    /// @dev This is a protocol-performance failure, not a product-quality determination.
    function invokeSupplierInspectionTimeout(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (trade.state != TradeState.AWAIT_SUPPLIER) {
            revert InvalidState(TradeState.AWAIT_SUPPLIER, trade.state);
        }
        _requireDeadlineReached(trade);
        _settle(tradeId, trade, SettlementOutcome.REFUND_TO_BUYER);
        emit SupplierInspectionTimeoutRefundCredited(
            tradeId, trade.terms.buyer, trade.terms.escrowAmount
        );
    }

    function abandonSupplierHold(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (msg.sender != trade.terms.supplier) revert UnauthorizedCaller();
        if (trade.state != TradeState.SUPPLIER_HOLD) {
            revert InvalidState(TradeState.SUPPLIER_HOLD, trade.state);
        }
        _settle(tradeId, trade, SettlementOutcome.REFUND_TO_BUYER);
    }

    function acceptAndRelease(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (msg.sender != trade.terms.buyer) revert UnauthorizedCaller();
        if (trade.state != TradeState.ACCEPTANCE_PENDING) {
            revert InvalidState(TradeState.ACCEPTANCE_PENDING, trade.state);
        }
        if (trade.buyerInspection.outcome != InspectionOutcome.ADMISSIBLE_PASS) {
            revert InvalidStateSet(trade.state);
        }
        _settle(tradeId, trade, SettlementOutcome.RELEASE_TO_SUPPLIER);
    }

    function invokeAcceptanceTimeout(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (trade.state != TradeState.ACCEPTANCE_PENDING) {
            revert InvalidState(TradeState.ACCEPTANCE_PENDING, trade.state);
        }
        if (trade.buyerInspection.outcome != InspectionOutcome.ADMISSIBLE_PASS) {
            revert InvalidStateSet(trade.state);
        }
        _requireDeadlineReached(trade);
        _settle(tradeId, trade, SettlementOutcome.RELEASE_TO_SUPPLIER);
    }

    function invokeBuyerInspectionTimeout(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (trade.state != TradeState.AWAIT_BUYER) {
            revert InvalidState(TradeState.AWAIT_BUYER, trade.state);
        }
        if (trade.buyerInspection.attempt != 0) revert ForbiddenDuplicateSubmission();
        _requireDeadlineReached(trade);
        _enterState(trade, TradeState.BUYER_INSPECTION_TIMEOUT, 0);
        emit BuyerInspectionTimeoutEntered(tradeId);
    }

    function recordReplayResult(ReplayAttestation calldata attestation, bytes calldata signature)
        external
    {
        Trade storage trade = _trade(attestation.tradeId);
        (InspectorStage stage, address activeInspector) = _activeInspector(trade);
        if (attestation.stage != stage) revert WrongRole();
        if (msg.sender != activeInspector || attestation.inspectorActor != activeInspector) {
            revert UnauthorizedCaller();
        }
        if (block.timestamp > trade.actionDeadline) revert DeadlinePassed();
        if (trade.replayStatus != ReplayStatus.NONE) revert ForbiddenDuplicateSubmission();
        if (attestation.policyHash != trade.terms.policyHash) revert PolicyHashMismatch();
        _validateEvidenceAnchors(
            trade, attestation.supplierEvidenceHash, attestation.buyerEvidenceHash
        );
        if (attestation.replayReportHash == bytes32(0)) revert InvalidTerms();
        _validateTime(attestation.issuedAt, attestation.validUntil);

        bytes32 digest = hashReplayAttestation(attestation);
        bytes32 nonceKey = keccak256(
            abi.encode(
                REPLAY_ATTESTATION_TYPEHASH,
                trade.terms.inspectorStation,
                attestation.tradeId,
                attestation.stage,
                attestation.nonce
            )
        );
        if (consumedNonce[nonceKey]) revert NonceAlreadyUsed();
        _validateFreshSignature(digest, signature, trade.terms.inspectorStation);
        consumedDigest[digest] = true;
        consumedNonce[nonceKey] = true;

        trade.replayReportHash = attestation.replayReportHash;
        if (attestation.consistent) {
            trade.replayStatus = ReplayStatus.CONSISTENT;
        } else {
            trade.replayStatus = ReplayStatus.INCONSISTENT;
            _enterState(trade, TradeState.EXECUTION_HOLD, 0);
        }
        emit ReplayResultRecorded(
            attestation.tradeId, stage, attestation.replayReportHash, attestation.consistent
        );
    }

    function submitInspectorDecision(
        InspectorDecisionAttestation calldata attestation,
        bytes calldata signature
    ) external {
        Trade storage trade = _trade(attestation.tradeId);
        (InspectorStage stage, address activeInspector) = _activeInspector(trade);
        if (attestation.stage != stage) revert WrongRole();
        if (msg.sender != activeInspector || attestation.inspectorActor != activeInspector) {
            revert UnauthorizedCaller();
        }
        if (block.timestamp > trade.actionDeadline) revert DeadlinePassed();
        if (attestation.decision == SettlementOutcome.NONE) {
            revert InvalidSettlementOutcome();
        }
        if (trade.replayStatus != ReplayStatus.CONSISTENT) revert ReplayRequired();
        if (attestation.policyHash != trade.terms.policyHash) revert PolicyHashMismatch();
        _validateEvidenceAnchors(
            trade, attestation.supplierEvidenceHash, attestation.buyerEvidenceHash
        );
        if (
            attestation.replayReportHash != trade.replayReportHash
                || attestation.replayReportHash == bytes32(0)
        ) revert EvidenceHashMismatch();
        _validateTime(attestation.issuedAt, attestation.validUntil);

        bytes32 digest = hashInspectorDecision(attestation);
        bytes32 nonceKey = keccak256(
            abi.encode(
                INSPECTOR_DECISION_TYPEHASH,
                trade.terms.inspectorStation,
                attestation.tradeId,
                attestation.stage,
                attestation.nonce
            )
        );
        if (consumedNonce[nonceKey]) revert NonceAlreadyUsed();
        _validateFreshSignature(digest, signature, trade.terms.inspectorStation);
        consumedDigest[digest] = true;
        consumedNonce[nonceKey] = true;

        emit InspectorDecisionRecorded(
            attestation.tradeId,
            stage,
            attestation.decision,
            attestation.reasonCode,
            attestation.replayReportHash
        );
        _settle(attestation.tradeId, trade, attestation.decision);
    }

    function activateBackupInspector(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (trade.state != TradeState.DISPUTED_PRIMARY) {
            revert InvalidState(TradeState.DISPUTED_PRIMARY, trade.state);
        }
        _requireDeadlineReached(trade);
        trade.replayStatus = ReplayStatus.NONE;
        trade.replayReportHash = bytes32(0);
        uint64 deadline = _deadlineFromNow(trade.terms.windows.backupInspector);
        _enterState(trade, TradeState.DISPUTED_BACKUP, deadline);
        emit BackupInspectorActivated(tradeId, deadline);
    }

    function escalateAfterBackupTimeout(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (trade.state != TradeState.DISPUTED_BACKUP) {
            revert InvalidState(TradeState.DISPUTED_BACKUP, trade.state);
        }
        _requireDeadlineReached(trade);
        _enterState(trade, TradeState.ESCALATED, 0);
        emit Escalated(tradeId);
    }

    function mutualResolve(
        MutualResolution calldata resolution,
        bytes calldata supplierSignature,
        bytes calldata buyerSignature
    ) external {
        Trade storage trade = _trade(resolution.tradeId);
        if (!_mutualResolutionState(trade.state)) revert InvalidStateSet(trade.state);
        if (resolution.outcome == SettlementOutcome.NONE) revert InvalidSettlementOutcome();
        if (block.timestamp > resolution.deadline) revert AttestationExpired();
        if (usedResolutionNonce[resolution.tradeId][resolution.resolutionNonce]) {
            revert NonceAlreadyUsed();
        }

        bytes32 digest = hashMutualResolution(resolution);
        if (
            !_isSignatureFrom(digest, supplierSignature, trade.terms.supplier)
                || !_isSignatureFrom(digest, buyerSignature, trade.terms.buyer)
        ) revert InvalidMutualSignatures();

        usedResolutionNonce[resolution.tradeId][resolution.resolutionNonce] = true;
        emit MutualResolutionRecorded(
            resolution.tradeId, resolution.outcome, resolution.resolutionNonce
        );
        _settle(resolution.tradeId, trade, resolution.outcome);
    }

    function cancelBeforeActivation(bytes32 tradeId) external {
        Trade storage trade = _trade(tradeId);
        if (msg.sender != trade.terms.supplier && msg.sender != trade.terms.buyer) {
            revert UnauthorizedCaller();
        }
        if (
            trade.state != TradeState.PROPOSED && trade.state != TradeState.PARTIES_ACCEPTED
                && trade.state != TradeState.INSPECTORS_ACCEPTED
        ) revert InvalidStateSet(trade.state);
        _enterState(trade, TradeState.CANCELLED, 0);
        emit TradeCancelled(tradeId, msg.sender);
    }

    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NoClaimableBalance();
        claimable[msg.sender] = 0;
        outstandingClaimable -= amount;
        totalWithdrawn += amount;
        (bool ok,) = payable(msg.sender).call{ value: amount }("");
        if (!ok) revert NativeTransferFailed();
        emit Withdrawal(msg.sender, amount);
    }

    function getTradeTerms(bytes32 tradeId) external view returns (TradeTerms memory) {
        return _tradeView(tradeId).terms;
    }

    function getTradeState(bytes32 tradeId) external view returns (TradeState) {
        return _tradeView(tradeId).state;
    }

    function getActionDeadline(bytes32 tradeId) external view returns (uint64) {
        return _tradeView(tradeId).actionDeadline;
    }

    function getInspection(bytes32 tradeId, InspectionRole role)
        external
        view
        returns (InspectionRecord memory)
    {
        Trade storage trade = _tradeView(tradeId);
        if (role == InspectionRole.SUPPLIER) return trade.supplierInspection;
        if (role == InspectionRole.BUYER) return trade.buyerInspection;
        revert WrongRole();
    }

    function getReplay(bytes32 tradeId) external view returns (ReplayStatus, bytes32) {
        Trade storage trade = _tradeView(tradeId);
        return (trade.replayStatus, trade.replayReportHash);
    }

    function isSettled(bytes32 tradeId) external view returns (bool) {
        return _tradeView(tradeId).settled;
    }

    function accountingConserved() external view returns (bool) {
        return totalFunded == unsettledEscrow + outstandingClaimable + totalWithdrawn;
    }

    function hashStationAttestation(StationAttestation calldata a) public view returns (bytes32) {
        // Every member is a static ABI type, so encoding the tuple is equivalent to listing
        // each member after the type hash and avoids compiler stack-depth fragility.
        return _hashTypedDataV4(keccak256(abi.encode(STATION_ATTESTATION_TYPEHASH, a)));
    }

    function hashReplayAttestation(ReplayAttestation calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(REPLAY_ATTESTATION_TYPEHASH, a)));
    }

    function hashInspectorDecision(InspectorDecisionAttestation calldata a)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(INSPECTOR_DECISION_TYPEHASH, a)));
    }

    function hashMutualResolution(MutualResolution calldata r) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(MUTUAL_RESOLUTION_TYPEHASH, r)));
    }

    function _validateTerms(TradeTerms calldata t) internal pure {
        if (
            t.tradeId == bytes32(0) || t.supplier == address(0) || t.buyer == address(0)
                || t.primaryInspector == address(0) || t.backupInspector == address(0)
                || t.supplierStation == address(0) || t.buyerStation == address(0)
                || t.inspectorStation == address(0)
        ) revert ZeroAddress();
        if (
            t.supplier == t.buyer || t.supplier == t.primaryInspector
                || t.supplier == t.backupInspector || t.buyer == t.primaryInspector
                || t.buyer == t.backupInspector || t.primaryInspector == t.backupInspector
        ) revert InvalidTerms();
        if (
            t.supplierStation == t.buyerStation || t.supplierStation == t.inspectorStation
                || t.buyerStation == t.inspectorStation
        ) revert InvalidTerms();
        address[4] memory actors = [t.supplier, t.buyer, t.primaryInspector, t.backupInspector];
        address[3] memory stations = [t.supplierStation, t.buyerStation, t.inspectorStation];
        for (uint256 i; i < actors.length; ++i) {
            for (uint256 j; j < stations.length; ++j) {
                if (actors[i] == stations[j]) revert InvalidTerms();
            }
        }
        if (
            t.escrowAmount == 0 || t.policyVersion == 0 || t.policyHash == bytes32(0)
                || t.modelBundleHash == bytes32(0) || t.captureProfileHash == bytes32(0)
                || t.productSpecHash == bytes32(0) || t.requiredViewSetHash == bytes32(0)
                || t.scoreSchemaId == bytes32(0)
        ) revert InvalidTerms();
        if (
            t.scoreMinScaled > t.thresholdScaled || t.thresholdScaled > t.scoreMaxScaled
                || t.windows.supplierInspection == 0 || t.windows.buyerInspection == 0
                || t.windows.buyerAcceptance == 0 || t.windows.primaryInspector == 0
                || t.windows.backupInspector == 0
        ) revert InvalidTerms();
    }

    function _validateInspectionStateAndCaller(Trade storage trade, InspectionRole role)
        internal
        view
    {
        if (role == InspectionRole.SUPPLIER) {
            if (msg.sender != trade.terms.supplier) revert UnauthorizedCaller();
            if (
                trade.state != TradeState.AWAIT_SUPPLIER
                    && trade.state != TradeState.SUPPLIER_REINSPECTION
            ) revert InvalidStateSet(trade.state);
        } else if (role == InspectionRole.BUYER) {
            if (msg.sender != trade.terms.buyer) revert UnauthorizedCaller();
            if (
                trade.state != TradeState.AWAIT_BUYER
                    && trade.state != TradeState.BUYER_REINSPECTION
            ) revert InvalidStateSet(trade.state);
        } else {
            revert WrongRole();
        }
    }

    function _validateStationCommitments(Trade storage trade, StationAttestation calldata a)
        internal
        view
    {
        if (a.policyHash != trade.terms.policyHash) revert PolicyHashMismatch();
        if (a.modelBundleHash != trade.terms.modelBundleHash) revert ModelBundleHashMismatch();
        if (a.captureProfileHash != trade.terms.captureProfileHash) {
            revert CaptureProfileHashMismatch();
        }
        if (a.scoreSchemaId != trade.terms.scoreSchemaId) revert ScoreSchemaMismatch();
    }

    function _validateEvidenceAnchors(
        Trade storage trade,
        bytes32 supplierEvidenceHash,
        bytes32 buyerEvidenceHash
    ) internal view {
        if (
            supplierEvidenceHash != trade.supplierInspection.evidencePackageHash
                || buyerEvidenceHash != trade.buyerInspection.evidencePackageHash
                || supplierEvidenceHash == bytes32(0) || buyerEvidenceHash == bytes32(0)
        ) revert EvidenceHashMismatch();
    }

    function _validateTime(uint64 issuedAt, uint64 validUntil) internal view {
        if (validUntil < issuedAt) revert InvalidAttestationWindow();
        if (issuedAt > block.timestamp) revert AttestationFromFuture();
        if (validUntil < block.timestamp) revert AttestationExpired();
    }

    function _validateFreshSignature(
        bytes32 digest,
        bytes calldata signature,
        address expectedSigner
    ) internal view {
        if (consumedDigest[digest]) revert NonceAlreadyUsed();
        if (!_isSignatureFrom(digest, signature, expectedSigner)) {
            revert InvalidAttestationSignature();
        }
    }

    function _isSignatureFrom(bytes32 digest, bytes calldata signature, address expectedSigner)
        internal
        pure
        returns (bool)
    {
        (address recovered, ECDSA.RecoverError error, bytes32 errorArgument) =
            ECDSA.tryRecoverCalldata(digest, signature);
        return error == ECDSA.RecoverError.NoError && errorArgument == bytes32(0)
            && recovered == expectedSigner;
    }

    function _recordInspection(Trade storage trade, StationAttestation calldata a) internal {
        InspectionRecord memory record = InspectionRecord({
            outcome: InspectionOutcome.NONE,
            aggregateScoreScaled: a.aggregateScoreScaled,
            evidencePackageHash: a.evidencePackageHash,
            specimenManifestHash: a.specimenManifestHash,
            attempt: a.attempt,
            submittedAt: uint64(block.timestamp),
            station: a.station
        });

        if (a.inspectionValidity == InspectionValidity.INVALID) {
            record.outcome = InspectionOutcome.INSPECTION_INVALID;
            _storeRoleRecord(trade, a.role, record);
            emit InspectionInvalidRecorded(
                a.tradeId,
                a.role,
                a.attempt,
                a.invalidReason,
                a.specimenManifestHash,
                a.evidencePackageHash,
                a.station
            );
            _routeInvalid(trade, a);
            return;
        }

        record.outcome = a.aggregateScoreScaled < trade.terms.thresholdScaled
            ? InspectionOutcome.ADMISSIBLE_PASS
            : InspectionOutcome.ADMISSIBLE_REVIEW;
        _storeRoleRecord(trade, a.role, record);
        emit InspectionOutcomeDerived(
            a.tradeId,
            a.role,
            a.attempt,
            a.aggregateScoreScaled,
            record.outcome,
            a.specimenManifestHash,
            a.evidencePackageHash,
            a.station
        );
        _routeAdmissible(trade, a.tradeId, a.role, record);
    }

    function _storeRoleRecord(
        Trade storage trade,
        InspectionRole role,
        InspectionRecord memory record
    ) internal {
        if (role == InspectionRole.SUPPLIER) trade.supplierInspection = record;
        else trade.buyerInspection = record;
    }

    function _routeInvalid(Trade storage trade, StationAttestation calldata a) internal {
        uint8 maxRetries = a.role == InspectionRole.SUPPLIER
            ? trade.terms.maxSupplierRetries
            : trade.terms.maxBuyerRetries;
        if (!_retryAvailable(a.attempt, maxRetries)) {
            if (a.role == InspectionRole.SUPPLIER) {
                _refundSupplierProtocolFailure(
                    a.tradeId, trade, keccak256("SUPPLIER_INVALID_RETRY_EXHAUSTED")
                );
                return;
            }
            _enterState(trade, TradeState.EVIDENCE_HOLD, 0);
            emit EvidenceHoldEntered(a.tradeId, a.role, keccak256("RETRY_LIMIT_EXHAUSTED"));
            return;
        }

        uint64 deadline;
        TradeState nextState;
        if (a.role == InspectionRole.SUPPLIER) {
            deadline = _deadlineFromNow(trade.terms.windows.supplierInspection);
            nextState = TradeState.SUPPLIER_REINSPECTION;
        } else {
            deadline = _deadlineFromNow(trade.terms.windows.buyerInspection);
            nextState = TradeState.BUYER_REINSPECTION;
        }
        _enterState(trade, nextState, deadline);
        emit ReinspectionOpened(a.tradeId, a.role, a.attempt + 1, deadline);
    }

    function _routeAdmissible(
        Trade storage trade,
        bytes32 tradeId,
        InspectionRole role,
        InspectionRecord memory record
    ) internal {
        if (role == InspectionRole.SUPPLIER) {
            if (record.outcome == InspectionOutcome.ADMISSIBLE_PASS) {
                _enterState(
                    trade,
                    TradeState.AWAIT_BUYER,
                    _deadlineFromNow(trade.terms.windows.buyerInspection)
                );
            } else {
                if (!_retryAvailable(record.attempt, trade.terms.maxSupplierRetries)) {
                    _refundSupplierProtocolFailure(
                        tradeId, trade, keccak256("SUPPLIER_REVIEW_RETRY_EXHAUSTED")
                    );
                    return;
                }
                _enterState(
                    trade,
                    TradeState.SUPPLIER_HOLD,
                    _deadlineFromNow(trade.terms.windows.supplierInspection)
                );
                emit SupplierHoldEntered(tradeId, record.attempt, record.aggregateScoreScaled);
            }
        } else if (record.outcome == InspectionOutcome.ADMISSIBLE_PASS) {
            _enterState(
                trade,
                TradeState.ACCEPTANCE_PENDING,
                _deadlineFromNow(trade.terms.windows.buyerAcceptance)
            );
        } else {
            _enterState(
                trade,
                TradeState.DISPUTED_PRIMARY,
                _deadlineFromNow(trade.terms.windows.primaryInspector)
            );
            trade.replayStatus = ReplayStatus.NONE;
            trade.replayReportHash = bytes32(0);
            emit DisputeOpened(tradeId, trade.actionDeadline);
        }
    }

    function _activeInspector(Trade storage trade) internal view returns (InspectorStage, address) {
        if (trade.state == TradeState.DISPUTED_PRIMARY) {
            return (InspectorStage.PRIMARY, trade.terms.primaryInspector);
        }
        if (trade.state == TradeState.DISPUTED_BACKUP) {
            return (InspectorStage.BACKUP, trade.terms.backupInspector);
        }
        revert InvalidStateSet(trade.state);
    }

    function _settle(bytes32 tradeId, Trade storage trade, SettlementOutcome outcome) internal {
        if (trade.settled) revert AlreadySettled();
        bool releaseToSupplier = outcome == SettlementOutcome.RELEASE_TO_SUPPLIER;
        if (!releaseToSupplier && outcome != SettlementOutcome.REFUND_TO_BUYER) {
            revert InvalidSettlementOutcome();
        }
        trade.settled = true;
        uint256 amount = trade.terms.escrowAmount;
        unsettledEscrow -= amount;
        address recipient = releaseToSupplier ? trade.terms.supplier : trade.terms.buyer;
        TradeState terminal = releaseToSupplier ? TradeState.RELEASED : TradeState.REFUNDED;
        claimable[recipient] += amount;
        outstandingClaimable += amount;
        _enterState(trade, terminal, 0);
        emit SettlementCredited(tradeId, recipient, amount, outcome);
    }

    function _refundSupplierProtocolFailure(bytes32 tradeId, Trade storage trade, bytes32 reason)
        internal
    {
        _settle(tradeId, trade, SettlementOutcome.REFUND_TO_BUYER);
        emit SupplierPreShipmentTerminated(
            tradeId, trade.terms.buyer, trade.terms.escrowAmount, reason
        );
    }

    function _mutualResolutionState(TradeState state) internal pure returns (bool) {
        return state == TradeState.ESCALATED || state == TradeState.EXECUTION_HOLD
            || state == TradeState.BUYER_INSPECTION_TIMEOUT || state == TradeState.EVIDENCE_HOLD;
    }

    function _retryAvailable(uint32 currentAttempt, uint8 maxAdditionalAttempts)
        internal
        pure
        returns (bool)
    {
        return currentAttempt <= uint32(maxAdditionalAttempts);
    }

    function _requireDeadlineReached(Trade storage trade) internal view {
        if (trade.actionDeadline == 0 || block.timestamp <= trade.actionDeadline) {
            revert DeadlineNotReached();
        }
    }

    function _deadlineFromNow(uint64 duration) internal view returns (uint64) {
        uint256 deadline = block.timestamp + duration;
        if (deadline > type(uint64).max) revert InvalidTerms();
        return uint64(deadline);
    }

    function _enterState(Trade storage trade, TradeState state, uint64 deadline) internal {
        trade.state = state;
        trade.stateEnteredAt = uint64(block.timestamp);
        trade.actionDeadline = deadline;
    }

    function _trade(bytes32 tradeId) internal view returns (Trade storage trade) {
        trade = _trades[tradeId];
        if (trade.state == TradeState.NONE) revert TradeNotFound();
    }

    function _tradeView(bytes32 tradeId) internal view returns (Trade storage trade) {
        trade = _trades[tradeId];
        if (trade.state == TradeState.NONE) revert TradeNotFound();
    }
}
