// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/// @dev imports
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";

contract NFTCollection is ERC721URIStorage, ERC2981 {
    /// @dev events of the contract
    event Minted(
        uint256 tokenId,
        string tokenURI,
        address minter,
        string collectionName
    );
    event UpdatedRoyalty(address feeRecipient, uint96 royaltyFee);

    /// @notice owner of the collection
    address public immutable owner;
    /// @notice token id counter
    uint256 public tokenIds;

    /// @dev modifiers of contract
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    /// @notice contract constructor for initializing new collection
    constructor(
        string memory name,
        string memory symbol,
        uint16 _royaltyFee,
        address payable _feeRecipient,
        address _owner
    ) ERC721(name, symbol) {
        owner = _owner;

        // setting royalty fee on collection with eip 2981 standard
        _setDefaultRoyalty(_feeRecipient, _royaltyFee);
    }

    function mint(string memory _tokenURI) public onlyOwner returns (uint256) {
        require(bytes(_tokenURI).length > 0, "no token uri");

        uint256 newTokenId = tokenIds += 1;
        _safeMint(msg.sender, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);
        emit Minted(newTokenId, _tokenURI, msg.sender, name());
        return newTokenId;
    }

    /**
    @notice updates the royalty status
    @dev only admin
    @param _feeRecipient new fee recipient to receive platform fee
    @param _royaltyFee new royalty fee to set
     */
    function updateRoyalty(
        address _feeRecipient,
        uint16 _royaltyFee
    ) public onlyOwner {
        require(_feeRecipient != address(0), "recipient cannot be empty");
        require(_royaltyFee <= 1000, "royalty fee cannot be more than 10%");

        _setDefaultRoyalty(_feeRecipient, _royaltyFee);

        emit UpdatedRoyalty(_feeRecipient, _royaltyFee);
    }

    /**
     @notice Method for removing the royalty
     */
    function removeRoyalty() public onlyOwner {
        _deleteDefaultRoyalty();
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
