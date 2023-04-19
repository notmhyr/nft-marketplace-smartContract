// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract AddressRegistry {
    // address of the owner
    address public immutable owner;

    // address of the marketplace
    address public marketplace;

    //address of the auction
    address public auction;

    // address of the platform nft container
    address public nft;

    // address of the nft factory
    address public nftFactory;

    // address of weth token
    address public WETH;

    /// @notice to check if is valid nft contract
    bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;

    modifier onlyOwner() {
        require(msg.sender == owner, "not contract owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function updateMarketplace(address _marketplace) public onlyOwner {
        marketplace = _marketplace;
    }

    function updateAuction(address _auction) public onlyOwner {
        auction = _auction;
    }

    function updateNft(address _nft) public onlyOwner {
        require(
            IERC165(_nft).supportsInterface(INTERFACE_ID_ERC721),
            "invalid nft address"
        );
        nft = _nft;
    }

    function updateNftFactory(address _nftFactory) public onlyOwner {
        nftFactory = _nftFactory;
    }

    function updateWETH(address _WETH) public onlyOwner {
        WETH = _WETH;
    }
}
