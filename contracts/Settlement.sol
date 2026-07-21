// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal settlement contract for Meridian. Records a settlement
/// amount on-chain. Deliberately simple: no token transfer, no custody — the
/// point of this project is the trace crossing into a real chain call, not a
/// real payment rail. `settle(0)` is used in Phase 3 to trigger a genuine
/// pre-broadcast revert (not a hardcoded failure).
contract Settlement {
    event Settled(address indexed settler, uint256 amount, uint256 timestamp);

    uint256 public totalSettled;

    function settle(uint256 amount) external {
        require(amount > 0, "Settlement: amount must be positive");
        totalSettled += amount;
        emit Settled(msg.sender, amount, block.timestamp);
    }
}
