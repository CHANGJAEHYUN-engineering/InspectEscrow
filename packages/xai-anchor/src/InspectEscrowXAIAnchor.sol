// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Supplemental immutable XAI hash anchoring for InspectEscrow.
/// @dev Does NOT change escrow terms, release funds, adjudicate quality,
///      or prove that the original photographs depict a genuine product.
contract InspectEscrowXAIAnchor {
    error ZeroEscrow();
    error ZeroTrade();
    error ZeroEvidenceHash();
    error ZeroXAIHash();
    error InvalidRole();
    error UnknownTrade();
    error UnauthorizedCounterparty();
    error AlreadyAnchored();

    struct Anchor {
        bytes32 xaiSha256;
        address attestor;
        uint64 anchoredAt;
        uint64 anchoredBlock;
    }

    address public immutable escrow;
    mapping(bytes32 => Anchor) private _anchors;

    event XAIAnchored(
        bytes32 indexed tradeId,
        uint8 indexed role,
        bytes32 indexed evidencePackageHash,
        bytes32 xaiSha256,
        address attestor,
        uint64 anchoredAt
    );

    constructor(address escrow_) {
        if (escrow_ == address(0) || escrow_.code.length == 0) revert ZeroEscrow();
        escrow = escrow_;
    }

    /// @notice One supplemental XAI content hash per trade, role and evidence.
    /// @dev role 0 = Supplier, role 1 = Buyer. The actor must match the
    ///      corresponding counterparty returned by the immutable escrow.
    /// @param xaiSha256 SHA-256 of UTF-8 JSON.stringify(sidecar.payload)
    ///        (the sidecar.localContentSha256 value, with a 0x prefix).
    function anchor(bytes32 tradeId, uint8 role, bytes32 evidencePackageHash, bytes32 xaiSha256) external {
        if (tradeId == bytes32(0)) revert ZeroTrade();
        if (role > 1) revert InvalidRole();
        if (evidencePackageHash == bytes32(0)) revert ZeroEvidenceHash();
        if (xaiSha256 == bytes32(0)) revert ZeroXAIHash();

        // getTradeTerms returns a STATIC Solidity tuple, whose first
        // three ABI words are (tradeId, supplier, buyer).
        // Decode only this fixed prefix. Reject malformed/unknown trades.
        (bool success, bytes memory output) =
            escrow.staticcall(abi.encodeWithSignature("getTradeTerms(bytes32)", tradeId));
        if (!success || output.length < 96 || output.length % 32 != 0) {
            revert UnknownTrade();
        }

        bytes32 returnedId;
        address supplier;
        address buyer;
        (returnedId, supplier, buyer) = abi.decode(output, (bytes32, address, address));
        if (returnedId != tradeId || supplier == address(0) || buyer == address(0)) {
            revert UnknownTrade();
        }

        address expected = role == 0 ? supplier : buyer;
        if (msg.sender != expected) revert UnauthorizedCounterparty();

        bytes32 key = anchorKey(tradeId, role, evidencePackageHash);
        if (_anchors[key].attestor != address(0)) revert AlreadyAnchored();
        _anchors[key] = Anchor({
            xaiSha256: xaiSha256,
            attestor: msg.sender,
            anchoredAt: uint64(block.timestamp),
            anchoredBlock: uint64(block.number)
        });
        emit XAIAnchored(tradeId, role, evidencePackageHash, xaiSha256, msg.sender, uint64(block.timestamp));
    }

    function anchorKey(bytes32 tradeId, uint8 role, bytes32 evidencePackageHash)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(tradeId, role, evidencePackageHash));
    }

    function getAnchor(bytes32 tradeId, uint8 role, bytes32 evidencePackageHash)
        external
        view
        returns (Anchor memory)
    {
        return _anchors[anchorKey(tradeId, role, evidencePackageHash)];
    }

    /// @notice True only if the exact report hash was recorded previously.
    /// @dev Does NOT authenticate the original object, model, or XAI correctness.
    function verify(bytes32 tradeId, uint8 role, bytes32 evidencePackageHash, bytes32 xaiSha256)
        external
        view
        returns (bool)
    {
        Anchor memory a = _anchors[anchorKey(tradeId, role, evidencePackageHash)];
        return a.attestor != address(0) && a.xaiSha256 == xaiSha256;
    }
}
