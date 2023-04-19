// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAddressRegistry {
    function auction() external view returns (address);

    function WETH() external view returns (address);
}

interface IAuction {
    function auctions(
        address _nftAddress,
        uint256 _tokenId
    ) external view returns (address, uint256, uint256, uint256, bool);
}

contract Marketplace is ReentrancyGuard {
    /// @dev events of the contract
    event ItemListed(
        address indexed owner,
        address indexed nftAddress,
        uint256 tokenId,
        uint256 price
    );

    event UpdatedPlatformFee(uint96 platformFee);
    event UpdatedFeeRecipient(address feeRecipient);

    event ItemCanceled(
        address indexed owner,
        address indexed nftAddress,
        uint256 tokenId
    );
    event ItemUpdated(
        address indexed owner,
        address indexed nftAddress,
        uint256 tokenId,
        uint256 newPrice
    );
    event ItemSold(
        address indexed seller,
        address indexed buyer,
        address indexed nft,
        uint256 tokenId,
        uint256 price
    );
    event OfferCreated(
        address indexed offerer,
        address indexed nft,
        uint256 tokenId,
        uint256 amount
    );

    event OfferCanceled(
        address indexed creator,
        address indexed nft,
        uint256 tokenId
    );

    /// @notice structure for listing each item
    struct Listing {
        address owner;
        uint256 price;
        bool sold;
    }

    /// @notice structure for each offer
    struct Offer {
        uint256 offer; // amount
        uint256 expiration; //expiration time
    }

    /// @notice NFT address -> token id -> owner -> price
    mapping(address => mapping(uint256 => Listing)) public listedItems;
    /// @notice NFT address -> token id -> offerer -> offer
    mapping(address => mapping(uint256 => mapping(address => Offer)))
        public offers;

    /// @notice to check if is valid nft contract
    bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;

    /// @notice owner of the contract
    address public immutable owner;

    /// @notice platform fee in percentage 1 to 1000 eg 25 = 2.5%
    uint16 public platformFee;

    /// @notice fee recipient
    address payable public feeRecipient;

    ///@notice address registry
    IAddressRegistry public addressRegistry;

    /// @notice modifier to check caller is nft owner
    modifier isNftOwner(address _nftAddress, uint256 _tokenId) {
        IERC721 nft = IERC721(_nftAddress);
        require(nft.ownerOf(_tokenId) == msg.sender, "not the token owner");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    /// @notice modifier to check if item is already listed
    modifier notListed(address _nftAddress, uint256 _tokenId) {
        Listing memory listing = listedItems[_nftAddress][_tokenId];
        require(listing.price == 0, "item is already listed");
        _;
    }
    /// @notice modifier to make sure item is listed
    modifier isListed(address _nftAddress, uint256 _tokenId) {
        Listing memory listing = listedItems[_nftAddress][_tokenId];

        require(listing.price > 0, "item is not listed");
        _;
    }

    /// @notice check if offer already exist
    modifier offerExist(
        address _nftAddress,
        uint256 _tokenId,
        address _creator
    ) {
        Offer memory targetOffer = offers[_nftAddress][_tokenId][_creator];
        require(
            targetOffer.offer > 0 || targetOffer.expiration > _getNow(),
            "offer doesn't exist or expired"
        );
        _;
    }

    /// @notice check if offer not exist
    modifier offerNotExist(
        address _nftAddress,
        uint256 _tokenId,
        address _creator
    ) {
        Offer memory targetOffer = offers[_nftAddress][_tokenId][_creator];
        require(targetOffer.offer == 0, "offer already created");
        _;
    }

    /// @notice contract constructor
    constructor(uint16 _platformFee, address payable _feeRecipient) {
        platformFee = _platformFee;
        feeRecipient = _feeRecipient;
        owner = msg.sender;
    }

    /// @notice for listing new items on marketplace
    /// @dev only valid nft contracts
    /// @dev only admin or approved person
    /// @dev only if not listed before
    /// @param _nftAddress nft contract address
    /// @param _tokenId nft token id
    /// @param _price price for list it
    function listItem(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _price
    )
        external
        notListed(_nftAddress, _tokenId)
        isNftOwner(_nftAddress, _tokenId)
    {
        try
            IERC165(_nftAddress).supportsInterface(INTERFACE_ID_ERC721)
        returns (bool supported) {
            // Contracts support ERC-165
            require(supported, "not erc 721 contract");
        } catch (bytes memory /*lowLevelData*/) {
            // Contracts doesn't support ERC-165
            revert("doesn't support ERC-165");
        }

        IERC721 nft = IERC721(_nftAddress);
        require(
            nft.isApprovedForAll(msg.sender, address(this)) ||
                nft.getApproved(_tokenId) == address(this),
            "not approved for marketplace"
        );
        require(_price > 0, "price cannot be zero");

        listedItems[_nftAddress][_tokenId] = Listing(msg.sender, _price, false);

        emit ItemListed(msg.sender, _nftAddress, _tokenId, _price);
    }

    ///@notice update the listing price
    /// @dev only admin
    /// @dev only if it's listed for sale
    /// @param _nftAddress nft contract address
    /// @param _tokenId nft token id
    /// @param _newPrice new price to update listing
    function updateListing(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _newPrice
    ) public isNftOwner(_nftAddress, _tokenId) isListed(_nftAddress, _tokenId) {
        require(_newPrice > 0, "price cannot be less than zero");
        Listing storage listing = listedItems[_nftAddress][_tokenId];
        listing.price = _newPrice;

        emit ItemUpdated(msg.sender, _nftAddress, _tokenId, _newPrice);
    }

    /// @notice cancel listed nft
    /// @dev only admin
    /// @dev only if it's listed for sale
    /// @param _nftAddress nft contract address
    /// @param _tokenId nft token id
    function cancelListing(
        address _nftAddress,
        uint256 _tokenId
    ) public isNftOwner(_nftAddress, _tokenId) isListed(_nftAddress, _tokenId) {
        delete (listedItems[_nftAddress][_tokenId]);
        emit ItemCanceled(msg.sender, _nftAddress, _tokenId);
    }

    /// @notice for buying an item from marketplace
    /// @dev only if it's listed for sale
    /// @param _nftAddress nft contract address
    /// @param _tokenId nft token id
    function buyItem(
        address _nftAddress,
        uint256 _tokenId
    ) public payable isListed(_nftAddress, _tokenId) {
        Listing memory listing = listedItems[_nftAddress][_tokenId];

        require(
            msg.value >= listing.price,
            "insufficient funds for buying nft"
        );

        IAuction auction = IAuction(addressRegistry.auction());
        (, , uint256 startTime, , bool result) = auction.auctions(
            _nftAddress,
            _tokenId
        );
        require(
            startTime == 0 || result == true,
            "cannot buy an item when auction is going on"
        );
        // calculate the fee
        uint256 feeAmount;

        feeAmount = (msg.value * platformFee) / 1000;

        (bool feeSuccess, ) = feeRecipient.call{value: feeAmount}("");
        require(feeSuccess, "transfer failed for paying tax");

        // sending royalty fee to owner if collection supports ERC2981 standard
        if (
            IERC165(_nftAddress).supportsInterface(type(IERC2981).interfaceId)
        ) {
            (address receiver, uint256 royaltyFee) = IERC2981(_nftAddress)
                .royaltyInfo(_tokenId, msg.value);

            (bool royaltySuccess, ) = payable(receiver).call{value: royaltyFee}(
                ""
            );
            require(royaltySuccess, "failed to transfer the royalty");
            feeAmount += royaltyFee;
        }

        (bool sellerSuccess, ) = payable(listing.owner).call{
            value: msg.value - feeAmount
        }("");
        require(sellerSuccess, "transfer failed for nft owner");
        delete (listedItems[_nftAddress][_tokenId]);

        IERC721(_nftAddress).safeTransferFrom(
            listing.owner,
            msg.sender,
            _tokenId
        );
        emit ItemSold(
            listing.owner,
            msg.sender,
            _nftAddress,
            _tokenId,
            listing.price
        );
    }

    /// @notice method for offering item
    /// @dev only if it's listed for sale
    /// @dev converted into two functions because of (stack too deep error)
    /// @param _nftAddress nft contract address
    /// @param _tokenId nft token id
    /// @param _wethAmount amount in weth token
    /// @param _expiration offers expiration date
    function createOffer(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _wethAmount,
        uint256 _expiration
    )
        public
        isListed(_nftAddress, _tokenId)
        offerNotExist(_nftAddress, _tokenId, msg.sender)
    {
        require(_wethAmount > 0, "your offer cannot be 0");
        require(_expiration > _getNow(), "invalid expiration");
        // check allowance amount for contract to move tokens
        address wethAddress = addressRegistry.WETH();
        require(
            IERC20(wethAddress).allowance(msg.sender, address(this)) >=
                _wethAmount,
            "Insufficient WETH allowance"
        );

        _createOffer(
            _nftAddress,
            _tokenId,
            _wethAmount,
            msg.sender,
            _expiration
        );
    }

    /// @notice method for canceling existing offer
    /// @dev only if offer exist
    /// @param _nftAddress nft contract address
    /// @param _tokenId nft token id
    function cancelOffer(
        address _nftAddress,
        uint256 _tokenId
    ) public offerExist(_nftAddress, _tokenId, msg.sender) {
        delete (offers[_nftAddress][_tokenId][msg.sender]);
        emit OfferCanceled(msg.sender, _nftAddress, _tokenId);
    }

    /// @notice method for accepting offer
    /// @dev only nft admin
    /// @param _nftAddress nft contract address
    /// @param _tokenId nft token id
    /// @param _creator offer creator address
    function acceptOffer(
        address _nftAddress,
        uint256 _tokenId,
        address _creator
    )
        public
        nonReentrant
        isNftOwner(_nftAddress, _tokenId)
        offerExist(_nftAddress, _tokenId, _creator)
    {
        _acceptOffer(_nftAddress, _tokenId, _creator);
    }

    /// @notice updates the platform fee
    /// @dev only admin
    /// @param _platformFee new platform fee to set
    function updatePlatformFee(uint16 _platformFee) public onlyOwner {
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

    /**
     @notice update address registry
     @dev only admin
     @param _newAddress new address
     */
    function updateAddressRegistry(address _newAddress) public onlyOwner {
        addressRegistry = IAddressRegistry(_newAddress);
    }

    function _getNow() internal view returns (uint256) {
        return block.timestamp;
    }

    /// @notice method for transfer and cancel nft listing
    /// @dev only auction contract can call this function
    /// @param _nftAddress nft contract address
    /// @param _tokenId nft token id
    /// @param _winner nft token id
    function transferNFTtoAuctionWinner(
        address _nftAddress,
        uint256 _tokenId,
        address _winner
    ) external isListed(_nftAddress, _tokenId) {
        require(
            msg.sender == addressRegistry.auction(),
            "only auction contract can call this"
        );

        // delete listing
        delete (listedItems[_nftAddress][_tokenId]);

        // send nft to auction winner
        IERC721 nft = IERC721(_nftAddress);
        nft.safeTransferFrom(nft.ownerOf(_tokenId), _winner, _tokenId);
    }

    function _acceptOffer(
        address _nftAddress,
        uint256 _tokenId,
        address _creator
    ) private {
        Offer memory targetOffer = offers[_nftAddress][_tokenId][_creator];

        address wethAddress = addressRegistry.WETH();
        uint256 feeAmount;

        feeAmount = (targetOffer.offer * platformFee) / 1000;
        require(
            IERC20(wethAddress).transferFrom(_creator, feeRecipient, feeAmount),
            "WETH transfer failed"
        );

        // sending royalty fee to owner if collection supports ERC2981 standard
        if (
            IERC165(_nftAddress).supportsInterface(type(IERC2981).interfaceId)
        ) {
            (address receiver, uint256 royaltyFee) = IERC2981(_nftAddress)
                .royaltyInfo(_tokenId, targetOffer.offer);

            require(
                IERC20(wethAddress).transferFrom(
                    _creator,
                    receiver,
                    royaltyFee
                ),
                "WETH transfer failed"
            );

            feeAmount += royaltyFee;
        }

        require(
            IERC20(wethAddress).transferFrom(
                _creator,
                msg.sender,
                targetOffer.offer - feeAmount
            ),
            "WETH transfer failed"
        );

        delete (offers[_nftAddress][_tokenId][_creator]);
        delete (listedItems[_nftAddress][_tokenId]);

        IERC721(_nftAddress).safeTransferFrom(msg.sender, _creator, _tokenId);

        emit ItemSold(
            msg.sender,
            _creator,
            _nftAddress,
            _tokenId,
            targetOffer.offer
        );
        emit OfferCanceled(_creator, _nftAddress, _tokenId);
    }

    /// @dev if auction exist offer cannot be created
    function _createOffer(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _wethAmount,
        address _creator,
        uint256 _expiration
    ) private {
        IAuction auction = IAuction(addressRegistry.auction());
        (, , uint256 startTime, , bool result) = auction.auctions(
            _nftAddress,
            _tokenId
        );
        require(
            startTime == 0 || result == true,
            "cannot place an offer when auction is going on"
        );
        offers[_nftAddress][_tokenId][_creator] = Offer(
            _wethAmount,
            _expiration
        );
        emit OfferCreated(msg.sender, _nftAddress, _tokenId, _wethAmount);
    }
}
