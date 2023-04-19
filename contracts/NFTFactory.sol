// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/// @dev imports
import "./NFTCollection.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract NFTFactory {
    // events
    event CollectionCreated(
        address indexed owner,
        address indexed collectionsAddress
    );
    event UpdatedPlatformFee(uint256 platformFee);
    event UpdatedFeeRecipient(address feeRecipient);

    struct Collection {
        address collectionAddress;
        string name;
    }

    /// @notice user address -> collection addresses array
    mapping(address => Collection[]) public collectionsOwned;

    /// @notice owner of the collection
    address public immutable owner;
    /// @notice fee recipient
    address payable public feeRecipient;
    /// @notice platform fee for each new nft collection
    uint256 public platformFee;
    /// @notice deployed and available collections array
    address[] public deployedCollections;
    /// @notice to check if is valid nft contract
    bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;

    /// @dev modifiers of contract
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(uint256 _platformFee, address payable _feeRecipient) {
        platformFee = _platformFee;
        feeRecipient = _feeRecipient;
        owner = msg.sender;
    }

    /// @notice method for creating new collection
    /// @param _name collection name
    /// @param _symbol collection symbol
    /// @param _royaltyFee collection royalty fee
    /// @param _collectionFeeRecipient address of fee recipient
    function createCollection(
        string memory _name,
        string memory _symbol,
        uint16 _royaltyFee,
        address payable _collectionFeeRecipient
    ) public payable {
        require(msg.value >= platformFee, "not enough funds");
        require(_royaltyFee <= 1000, "max royalty fee is 10 percent"); // 1000 = 10%

        (bool success, ) = feeRecipient.call{value: msg.value}("");
        require(success, "transfer failed");

        // deploying new collection and passing the args
        NFTCollection newCollection = new NFTCollection(
            _name,
            _symbol,
            _royaltyFee,
            _collectionFeeRecipient,
            msg.sender
        );

        deployedCollections.push(address(newCollection));
        collectionsOwned[msg.sender].push(
            Collection(address(newCollection), _name)
        );

        emit CollectionCreated(msg.sender, address(newCollection));
    }

    /// @notice updates the platform fee
    /// @dev only admin
    /// @param _platformFee new platform fee to set
    function updatePlatformFee(uint256 _platformFee) public onlyOwner {
        platformFee = _platformFee;
        emit UpdatedPlatformFee(_platformFee);
    }

    /// @notice updates the fee recipient
    /// @dev only admin
    /// @param _feeRecipient new fee recipient to receive platform fee
    function updateFeeRecipient(
        address payable _feeRecipient
    ) public onlyOwner {
        require(_feeRecipient != address(0), "recipient cannot be empty");

        feeRecipient = _feeRecipient;
        emit UpdatedFeeRecipient(_feeRecipient);
    }

    /// @notice method for getting all addresses owned by user
    function getCollectionsOwned(
        address user
    ) public view returns (Collection[] memory) {
        return collectionsOwned[user];
    }
}
