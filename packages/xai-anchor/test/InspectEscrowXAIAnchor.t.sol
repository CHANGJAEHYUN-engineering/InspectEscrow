// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/InspectEscrowXAIAnchor.sol";

interface Vm {
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract MockInspectEscrow {
    struct MockTerms {
        bytes32 tradeId;
        address supplier;
        address buyer;
        address primaryInspector;
        bytes32 policyHash;
        uint256 escrowAmount;
    }

    mapping(bytes32 => MockTerms) private trades;

    function createTrade(bytes32 tradeId, address supplier, address buyer) external {
        trades[tradeId] =
            MockTerms(tradeId, supplier, buyer, address(0x9999), bytes32(uint256(0x1234)), 1 ether);
    }

    function getTradeTerms(bytes32 tradeId) external view returns (MockTerms memory) {
        require(trades[tradeId].tradeId != 0, "TRADE_UNKNOWN");
        return trades[tradeId];
    }
}

contract InspectEscrowXAIAnchorTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant SUPPLIER = address(0x1010);
    address private constant BUYER = address(0x2020);
    address private constant OUTSIDER = address(0x3030);
    bytes32 private constant TRADE = bytes32(uint256(0x777));
    bytes32 private constant EVIDENCE = bytes32(uint256(0x888));
    bytes32 private constant XAI = bytes32(uint256(0x999));
    MockInspectEscrow private escrow;
    InspectEscrowXAIAnchor private anchorContract;

    function setUp() public {
        escrow = new MockInspectEscrow();
        escrow.createTrade(TRADE, SUPPLIER, BUYER);
        anchorContract = new InspectEscrowXAIAnchor(address(escrow));
    }

    function testSupplierAnchorsAndReadback() public {
        vm.prank(SUPPLIER);
        anchorContract.anchor(TRADE, 0, EVIDENCE, XAI);
        InspectEscrowXAIAnchor.Anchor memory result = anchorContract.getAnchor(TRADE, 0, EVIDENCE);
        require(result.xaiSha256 == XAI && result.attestor == SUPPLIER, "MISMATCH");
        require(result.anchoredAt != 0 && result.anchoredBlock != 0, "MISSING_BLOCK");
        require(anchorContract.verify(TRADE, 0, EVIDENCE, XAI), "UNVERIFIABLE");
        require(!anchorContract.verify(TRADE, 0, EVIDENCE, bytes32(uint256(0x998))), "TAMPER_NOT_DETECTED");
    }

    function testBuyerAnchorsSeparately() public {
        vm.prank(SUPPLIER);
        anchorContract.anchor(TRADE, 0, EVIDENCE, XAI);
        vm.prank(BUYER);
        anchorContract.anchor(TRADE, 1, EVIDENCE, bytes32(uint256(0x123)));
        require(anchorContract.verify(TRADE, 0, EVIDENCE, XAI), "SUPPLIER_MISSING");
        require(anchorContract.verify(TRADE, 1, EVIDENCE, bytes32(uint256(0x123))), "BUYER_MISSING");
    }

    function testNoUnauthorizedAnchor() public {
        vm.expectRevert(InspectEscrowXAIAnchor.UnauthorizedCounterparty.selector);
        vm.prank(OUTSIDER);
        anchorContract.anchor(TRADE, 0, EVIDENCE, XAI);
    }

    function testBuyerCannotAnchorSupplierRole() public {
        vm.expectRevert(InspectEscrowXAIAnchor.UnauthorizedCounterparty.selector);
        vm.prank(BUYER);
        anchorContract.anchor(TRADE, 0, EVIDENCE, XAI);
    }

    function testImmutableDuplicate() public {
        vm.prank(SUPPLIER);
        anchorContract.anchor(TRADE, 0, EVIDENCE, XAI);
        vm.expectRevert(InspectEscrowXAIAnchor.AlreadyAnchored.selector);
        vm.prank(SUPPLIER);
        anchorContract.anchor(TRADE, 0, EVIDENCE, bytes32(uint256(0x777)));
    }

    function testDifferentEvidenceCanBeAnchored() public {
        vm.prank(SUPPLIER);
        anchorContract.anchor(TRADE, 0, EVIDENCE, XAI);
        bytes32 nextEvidence = bytes32(uint256(0x456));
        vm.prank(SUPPLIER);
        anchorContract.anchor(TRADE, 0, nextEvidence, XAI);
        require(anchorContract.verify(TRADE, 0, EVIDENCE, XAI), "OLD_OVERWRITTEN");
        require(anchorContract.verify(TRADE, 0, nextEvidence, XAI), "NEW_NOT_RECORDED");
    }

    function testUnknownTradeRejected() public {
        vm.expectRevert(InspectEscrowXAIAnchor.UnknownTrade.selector);
        vm.prank(SUPPLIER);
        anchorContract.anchor(bytes32(uint256(0xabcdef)), 0, EVIDENCE, XAI);
    }

    function testZeroAndRoleChecks() public {
        vm.expectRevert(InspectEscrowXAIAnchor.ZeroTrade.selector);
        anchorContract.anchor(bytes32(0), 0, EVIDENCE, XAI);
        vm.expectRevert(InspectEscrowXAIAnchor.InvalidRole.selector);
        anchorContract.anchor(TRADE, 2, EVIDENCE, XAI);
        vm.expectRevert(InspectEscrowXAIAnchor.ZeroEvidenceHash.selector);
        anchorContract.anchor(TRADE, 0, bytes32(0), XAI);
        vm.expectRevert(InspectEscrowXAIAnchor.ZeroXAIHash.selector);
        anchorContract.anchor(TRADE, 0, EVIDENCE, bytes32(0));
    }

    function testNeverTouchesEscrowFunds() public {
        vm.prank(SUPPLIER);
        anchorContract.anchor(TRADE, 0, EVIDENCE, XAI);
        require(address(anchorContract).balance == 0, "FUNDS_IN_ANCHOR");
        require(anchorContract.escrow() == address(escrow), "ESCROW_CHANGED");
    }
}
