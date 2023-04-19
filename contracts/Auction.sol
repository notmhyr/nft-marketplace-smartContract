// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

interface IAddressRegistry {
    function marketplace() external view returns (address);
}

interface IMarketplace {
    function listedItems(
        address _nftAddress,
        uint256 _tokenId
    ) external view returns (address, uint256 price, bool);

    function transferNFTtoAuctionWinner(
        address _nftAddress,
        uint256 _tokenId,
        address _winner
    ) external;
}

contract Auction is ReentrancyGuard {
    // events
    event AuctionCreated(
        address indexed nft,
        uint256 indexed tokenId,
        uint256 minBid,
        uint256 startTime,
        uint256 endTime
    );

    event AuctionCanceled(address indexed nft, uint256 indexed tokenId);

    event UpdatedPlatformFee(uint256 platformFee);

    event UpdatedPlatformFeeRecipient(address recipient);
    event BidPlaced(
        address indexed nft,
        uint256 indexed tokenId,
        address indexed bidder,
        uint256 bid
    );

    event BidRefunded(
        address indexed nft,
        uint256 indexed tokenId,
        address indexed bidder,
        uint256 bid
    );

    event BidWithdrawn(
        address indexed nft,
        uint256 indexed tokenId,
        address indexed bidder,
        uint256 bid
    );

    event AuctionResulted(
        address oldOwner,
        address indexed nft,
        uint256 indexed tokenId,
        address indexed winner,
        uint256 winingPrice
    );

    event PauseToggled(bool isPaused);

    event UpdatedMinBid(
        address indexed nft,
        uint256 indexed tokenId,
        uint256 newMinBid
    );

    event UpdatedStartTime(
        address indexed nft,
        uint256 indexed tokenId,
        uint256 newStartTime
    );

    event UpdatedEndTime(
        address indexed nft,
        uint256 indexed tokenId,
        uint256 newEndTime
    );

    // structs
    struct AuctionStructure {
        address payable owner;
        uint256 minBid;
        uint256 startTime;
        uint256 endTime;
        bool resulted;
    }
    struct HighestBid {
        address payable bidder;
        uint256 bid;
        uint256 lastBidTime;
    }

    /// @notice owner of the contract
    address public immutable owner;

    /// @notice platform fee recipient
    address payable public platformFeeRecipient;

    /// @notice platform fee percentage
    uint256 public platformFee;

    /// @notice pause variable for pausing the contract
    bool public isPaused;

    ///@notice address registry
    IAddressRegistry public addressRegistry;

    // mappings
    /// @notice nft address -> token id -> auction
    mapping(address => mapping(uint256 => AuctionStructure)) public auctions;

    /// @notice nft address -> token id -> highest bid
    mapping(address => mapping(uint256 => HighestBid)) public highestBids;

    // modifiers

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
    modifier whenNotPaused() {
        require(!isPaused, "contract is paused");
        _;
    }

    modifier isNftOwner(address _nftAddress, uint256 _tokenId) {
        IERC721 nft = IERC721(_nftAddress);
        require(nft.ownerOf(_tokenId) == msg.sender, "not the token owner");
        _;
    }

    modifier auctionNotExist(address _nftAddress, uint256 _tokenId) {
        require(
            auctions[_nftAddress][_tokenId].endTime == 0,
            "auction already exist"
        );
        _;
    }

    modifier auctionExist(address _nftAddress, uint256 _tokenId) {
        require(
            auctions[_nftAddress][_tokenId].endTime > 0,
            "auction not exist"
        );
        _;
    }

    constructor(uint256 _platformFee, address payable _feeRecipient) {
        platformFeeRecipient = _feeRecipient;
        platformFee = _platformFee;
        owner = msg.sender;
    }

    /**
 @notice method for creating new auction
 @dev only when not paused
 @dev only if auction not exist
 @dev only if listed
 @param _nftAddress nft contract address
 @param _tokenId nft token id
 @param _minBid minimum bid required
 @param _startTime time to start the auction
 @param _endTime time to end the auction
*/
    function createAuction(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _minBid,
        uint256 _startTime,
        uint256 _endTime
    )
        external
        whenNotPaused
        isNftOwner(_nftAddress, _tokenId)
        auctionNotExist(_nftAddress, _tokenId)
    {
        IMarketplace marketplace = IMarketplace(addressRegistry.marketplace());
        (, uint256 price, ) = marketplace.listedItems(_nftAddress, _tokenId);
        require(price > 0, "item is not listed");
        require(_startTime > _getNow(), "invalid time start");
        require(
            _endTime >= _startTime + 300,
            "end time should be more than 5 mins"
        );

        auctions[_nftAddress][_tokenId] = AuctionStructure({
            owner: payable(msg.sender),
            minBid: _minBid,
            startTime: _startTime,
            endTime: _endTime,
            resulted: false
        });

        emit AuctionCreated(
            _nftAddress,
            _tokenId,
            _minBid,
            _startTime,
            _endTime
        );
    }

    /**
 @notice method for canceling auction
 @dev only when not paused
 @dev only if exist
 @param _nftAddress nft contract address
 @param _tokenId nft token id
*/
    function cancelAuction(
        address _nftAddress,
        uint256 _tokenId
    ) external nonReentrant auctionExist(_nftAddress, _tokenId) {
        AuctionStructure memory auction = auctions[_nftAddress][_tokenId];
        require(
            IERC721(_nftAddress).ownerOf(_tokenId) == msg.sender &&
                auction.owner == msg.sender,
            "not nft owner"
        );
        require(!auction.resulted, "auction already resulted");
        HighestBid memory highestBid = highestBids[_nftAddress][_tokenId];
        if (highestBid.bidder != address(0)) {
            _refundHighestBidder(
                _nftAddress,
                _tokenId,
                highestBid.bidder,
                highestBid.bid
            );

            // clear highest bidder
            delete (highestBids[_nftAddress][_tokenId]);
        }

        // clear auction
        delete (auctions[_nftAddress][_tokenId]);

        emit AuctionCanceled(_nftAddress, _tokenId);
    }

    /**
 @notice method for placing a bid
 @dev only when not paused
 @dev only if exist
 @param _nftAddress nft contract address
 @param _tokenId nft token id
*/
    function placeBid(
        address _nftAddress,
        uint256 _tokenId
    )
        external
        payable
        nonReentrant
        whenNotPaused
        auctionExist(_nftAddress, _tokenId)
    {
        AuctionStructure memory auction = auctions[_nftAddress][_tokenId];
        HighestBid storage highestBid = highestBids[_nftAddress][_tokenId];
        require(
            _getNow() < auction.endTime && _getNow() >= auction.startTime,
            "out of time"
        );
        require(!auction.resulted, "auction has resulted");
        require(msg.value >= auction.minBid, "bid is less than minimum bid");
        require(msg.value > highestBid.bid, "failed to outBid highest bidder");
        if (highestBid.bidder != address(0)) {
            _refundHighestBidder(
                _nftAddress,
                _tokenId,
                highestBid.bidder,
                highestBid.bid
            );
        }

        highestBid.bid = msg.value;
        highestBid.bidder = payable(msg.sender);
        highestBid.lastBidTime = _getNow();

        emit BidPlaced(_nftAddress, _tokenId, msg.sender, msg.value);
    }

    /**
 @notice method for withdraw bid by highest bidder after 12 hours
 @dev only highest bidder
 @param _nftAddress nft contract address
 @param _tokenId nft token id
*/
    function withdrawBid(
        address _nftAddress,
        uint256 _tokenId
    ) external nonReentrant {
        HighestBid memory highestBid = highestBids[_nftAddress][_tokenId];
        require(
            msg.sender == highestBid.bidder,
            "you are not the highest bidder"
        );
        uint256 _endTime = auctions[_nftAddress][_tokenId].endTime;
        require(
            _getNow() > _endTime && _getNow() - _endTime >= 43200,
            "can withdraw only after 12 hours auction has ended"
        );

        uint256 previousBid = highestBid.bid;

        //cleaning the existing top bidder
        delete (highestBids[_nftAddress][_tokenId]);

        // refunding the top bidder
        _refundHighestBidder(
            _nftAddress,
            _tokenId,
            payable(msg.sender),
            previousBid
        );

        emit BidWithdrawn(_nftAddress, _tokenId, msg.sender, previousBid);
    }

    /**
 @notice method for resulting the finished auction
 @dev only nft owner
 @dev only if there is a bidder
 @param _nftAddress nft contract address
 @param _tokenId nft token id
*/
    function resultAuction(
        address _nftAddress,
        uint256 _tokenId
    )
        external
        nonReentrant
        auctionExist(_nftAddress, _tokenId)
        isNftOwner(_nftAddress, _tokenId)
    {
        AuctionStructure storage auction = auctions[_nftAddress][_tokenId];
        // ensure caller is owner
        require(msg.sender == auction.owner, "not owner");
        // ensure auction is ended
        require(_getNow() > auction.endTime, "auction not ended");
        // ensure auction has not resulted
        require(!auction.resulted, "auction already resulted");

        // checking highest bidder info
        HighestBid memory highestBid = highestBids[_nftAddress][_tokenId];
        address winner = highestBid.bidder;
        uint256 winningBid = highestBid.bid;

        // if there is no bids delete the auction
        if (winner == address(0)) {
            delete (auctions[_nftAddress][_tokenId]);
            revert("there is no bidder");
        }

        // ensure value is higher than minimum bid
        require(winningBid >= auction.minBid, "amount lower than minimum bid");

        auction.resulted = true;

        delete (highestBids[_nftAddress][_tokenId]);

        _resultAuction(
            _nftAddress,
            _tokenId,
            auction.owner,
            winner,
            winningBid
        );
    }

    /**
 @notice method for updating minimum bid
 @dev only if exist
 @dev only auction owner
 @param _nftAddress nft contract address
 @param _tokenId nft token id
 @param _newMinBid new minimum bid
*/
    function updateMinBid(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _newMinBid
    ) external auctionExist(_nftAddress, _tokenId) {
        AuctionStructure storage auction = auctions[_nftAddress][_tokenId];
        require(msg.sender == auction.owner, "not auction owner");
        require(!auction.resulted, "auction already resulted");

        HighestBid memory highestBid = highestBids[_nftAddress][_tokenId];
        // check if there is highest bid
        require(
            highestBid.bid == 0,
            "cannot update the minimum bid if bidder exist"
        );

        auction.minBid = _newMinBid;

        emit UpdatedMinBid(_nftAddress, _tokenId, _newMinBid);
    }

    /**
 @notice method for updating start time
 @dev only if exist
 @dev only auction owner
 @param _nftAddress nft contract address
 @param _tokenId nft token id
 @param _newStartTime new start time
*/
    function updateStartTime(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _newStartTime
    ) external auctionExist(_nftAddress, _tokenId) {
        AuctionStructure storage auction = auctions[_nftAddress][_tokenId];
        require(msg.sender == auction.owner, "not auction owner");
        require(!auction.resulted, "auction already resulted");
        require(_newStartTime > 0, "invalid start time");
        require(auction.startTime + 60 > _getNow(), "auction already started");
        require(
            _newStartTime + 300 < auction.endTime,
            "auction start time should be less than end time by 5 min"
        );

        auction.startTime = _newStartTime;
        emit UpdatedStartTime(_nftAddress, _tokenId, _newStartTime);
    }

    /**
 @notice method for updating end time
 @dev only if exist
 @dev only auction owner
 @param _nftAddress nft contract address
 @param _tokenId nft token id
 @param _newEndTime new start time
*/
    function updateEndTime(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _newEndTime
    ) external auctionExist(_nftAddress, _tokenId) {
        AuctionStructure storage auction = auctions[_nftAddress][_tokenId];
        require(msg.sender == auction.owner, "not auction owner");
        require(!auction.resulted, "auction already resulted");
        require(_newEndTime > 0, "invalid end time");
        require(_getNow() < auction.endTime, "auction is ended");
        require(
            _newEndTime > auction.startTime + 300,
            "auction end time should be greater than start time by 5 mins"
        );
        require(
            _newEndTime > _getNow() + 300,
            "end time should be more than 5 mins"
        );

        auction.endTime = _newEndTime;
        emit UpdatedEndTime(_nftAddress, _tokenId, _newEndTime);
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
        platformFeeRecipient = _feeRecipient;
        emit UpdatedPlatformFeeRecipient(_feeRecipient);
    }

    /**
     @notice update address registry
     @dev only admin
     @param _newAddress new address
     */
    function updateAddressRegistry(address _newAddress) public onlyOwner {
        addressRegistry = IAddressRegistry(_newAddress);
    }

    /**
     @notice Toggling the pause 
     @dev Only admin
     */
    function toggleIsPaused() external onlyOwner {
        isPaused = !isPaused;
        emit PauseToggled(isPaused);
    }

    /// Getter functions

    /**
     @notice Method for getting all info about the auction
     @param _nftAddress ERC 721 Address
     @param _tokenId Token id of the nft
     */
    function getAuction(
        address _nftAddress,
        uint256 _tokenId
    )
        external
        view
        returns (
            address payable auctionOwner,
            uint256 minBid,
            uint256 startTime,
            uint256 endTime,
            bool resulted
        )
    {
        AuctionStructure memory auction = auctions[_nftAddress][_tokenId];

        return (
            auction.owner,
            auction.minBid,
            auction.startTime,
            auction.endTime,
            auction.resulted
        );
    }

    /**
     @notice Method for getting all info about the highest bidder
     @param _nftAddress ERC 721 Address
     @param _tokenId Token id of the nft
     */
    function getHighestBidder(
        address _nftAddress,
        uint256 _tokenId
    )
        external
        view
        returns (address payable bidder, uint256 bid, uint256 lastBidTime)
    {
        HighestBid memory highestBid = highestBids[_nftAddress][_tokenId];

        return (highestBid.bidder, highestBid.bid, highestBid.lastBidTime);
    }

    /// @notice getting block timestamp
    function _getNow() internal view returns (uint256) {
        return block.timestamp;
    }

    /**
 @notice method for resulting auction
 @param _nftAddress ERC 721 Address
 @param _tokenId nft token id
 @param auctionOwner address of auction owner
 @param winner address of winner
 @param winningBid bid amount
*/
    function _resultAuction(
        address _nftAddress,
        uint256 _tokenId,
        address auctionOwner,
        address winner,
        uint256 winningBid
    ) private {
        uint256 feeAmount;

        // sending fee to platform owner
        feeAmount = (winningBid * platformFee) / 1000;
        (bool successFee, ) = platformFeeRecipient.call{value: feeAmount}("");
        require(successFee, "failed to transfer fee");

        // sending royalty fee to owner if collection supports ERC2981 standard
        if (
            IERC165(_nftAddress).supportsInterface(type(IERC2981).interfaceId)
        ) {
            (address receiver, uint256 royaltyFee) = IERC2981(_nftAddress)
                .royaltyInfo(_tokenId, winningBid);

            (bool royaltySuccess, ) = payable(receiver).call{value: royaltyFee}(
                ""
            );
            require(royaltySuccess, "failed to transfer the royalty");
            feeAmount += royaltyFee;
        }

        // sending bid to auction owner
        (bool successTransfer, ) = auctionOwner.call{
            value: winningBid - feeAmount
        }("");
        require(successTransfer, "failed to transfer the amount to owner");

        // sending nft to winner using marketplace function (because marketplace is approved to move token)
        IMarketplace marketplace = IMarketplace(addressRegistry.marketplace());
        marketplace.transferNFTtoAuctionWinner(_nftAddress, _tokenId, winner);

        emit AuctionResulted(
            msg.sender,
            _nftAddress,
            _tokenId,
            winner,
            winningBid
        );

        delete (auctions[_nftAddress][_tokenId]);
    }

    /**
 @notice method for refunding highest bidder
 @param _nftAddress ERC 721 Address
 @param _tokenId nft token id
 @param _bidder address of bidder 
 @param _bid amount
*/
    function _refundHighestBidder(
        address _nftAddress,
        uint256 _tokenId,
        address payable _bidder,
        uint256 _bid
    ) private {
        (bool successRefund, ) = _bidder.call{value: _bid}("");
        require(successRefund, "failed to refund the highest bidder");

        emit BidRefunded(_nftAddress, _tokenId, _bidder, _bid);
    }
}
