// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title CredentialRegistryPatch3
/// @notice Minimal revocation/suspension registry for InspectEscrow signing credentials.
/// @dev This contract cannot move escrow funds, mutate trade policy, or choose settlement outcomes.
contract CredentialRegistryPatch3 {
    enum CredentialStatus {
        UNKNOWN,
        ACTIVE,
        SUSPENDED,
        REVOKED
    }

    struct CredentialRecord {
        CredentialStatus status;
        uint64 changedAt;
        uint64 revokedAt;
        bytes32 reasonCode;
    }

    address public immutable authority;
    mapping(address credential => CredentialRecord record) public credentials;

    error UnauthorizedAuthority();
    error InvalidCredentialState();
    error ZeroAddress();
    error AuthorityCannotBeCredential();

    event CredentialStatusChanged(
        address indexed credential,
        CredentialStatus previousStatus,
        CredentialStatus newStatus,
        bytes32 reasonCode,
        uint64 changedAt
    );

    constructor(address authority_) {
        if (authority_ == address(0)) revert ZeroAddress();
        authority = authority_;
    }

    modifier onlyAuthority() {
        if (msg.sender != authority) revert UnauthorizedAuthority();
        _;
    }

    function status(address credential) external view returns (uint8) {
        return uint8(credentials[credential].status);
    }

    function registerCredential(address credential, bytes32 reasonCode) external onlyAuthority {
        if (credential == address(0)) revert ZeroAddress();
        if (credential == authority) revert AuthorityCannotBeCredential();

        CredentialRecord storage record = credentials[credential];
        if (record.status != CredentialStatus.UNKNOWN) revert InvalidCredentialState();
        _setStatus(credential, record, CredentialStatus.ACTIVE, reasonCode);
    }

    function suspendCredential(address credential, bytes32 reasonCode) external onlyAuthority {
        CredentialRecord storage record = credentials[credential];
        if (record.status != CredentialStatus.ACTIVE) revert InvalidCredentialState();
        _setStatus(credential, record, CredentialStatus.SUSPENDED, reasonCode);
    }

    function resumeCredential(address credential, bytes32 reasonCode) external onlyAuthority {
        CredentialRecord storage record = credentials[credential];
        if (record.status != CredentialStatus.SUSPENDED) revert InvalidCredentialState();
        _setStatus(credential, record, CredentialStatus.ACTIVE, reasonCode);
    }

    function revokeCredential(address credential, bytes32 reasonCode) external onlyAuthority {
        CredentialRecord storage record = credentials[credential];
        if (
            record.status != CredentialStatus.ACTIVE
                && record.status != CredentialStatus.SUSPENDED
        ) revert InvalidCredentialState();

        _setStatus(credential, record, CredentialStatus.REVOKED, reasonCode);
        record.revokedAt = uint64(block.timestamp);
    }

    function _setStatus(
        address credential,
        CredentialRecord storage record,
        CredentialStatus next,
        bytes32 reasonCode
    ) internal {
        CredentialStatus previous = record.status;
        record.status = next;
        record.changedAt = uint64(block.timestamp);
        record.reasonCode = reasonCode;

        emit CredentialStatusChanged(
            credential, previous, next, reasonCode, uint64(block.timestamp)
        );
    }
}
