const { ethers, network } = require("hardhat");
const { assert, expect } = require("chai");

// function for generate start time and end time
function addHours(date, hours) {
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);

  return Math.floor(date.getTime() / 1000);
}

// start time and end time
const startTime = addHours(new Date(), 1);
const endTime = addHours(new Date(), 2);

const minBid = ethers.utils.parseEther("0.2"); // min bid

// auction contract test
describe("auction", () => {
  let auction,
    nft,
    marketplace,
    deployer,
    user1,
    user2,
    user1Auction,
    user2Auction,
    user2Nft,
    user2Marketplace;

  beforeEach(async () => {
    [deployer, user1, user2] = await ethers.getSigners();

    //deploy all of the contracts
    await deployments.fixture(["all"]);

    // getting contracts
    auction = await ethers.getContract("Auction");
    nft = await ethers.getContract("NFT");

    const addressRegistry = await ethers.getContract("AddressRegistry");
    marketplace = await ethers.getContract("Marketplace");
    await addressRegistry.updateMarketplace(marketplace.address);
    await addressRegistry.updateAuction(auction.address);
    await marketplace.updateAddressRegistry(addressRegistry.address);
    await auction.updateAddressRegistry(addressRegistry.address);

    // mint nft and list it on marketplace
    const amount = ethers.utils.parseEther("0.1");
    await nft.mint("hello", 500, { value: amount });
    await nft.approve(marketplace.address, 1);

    // connecting users to contracts
    user1Auction = auction.connect(user1);
    user2Auction = auction.connect(user2);
    user2Nft = nft.connect(user2);
    user2Marketplace = marketplace.connect(user2);
  });

  describe("constructor", () => {
    it("initialize the contract correctly", async () => {
      const platformFee = await auction.platformFee();
      const feeRecipient = await auction.platformFeeRecipient();
      const owner = await auction.owner();

      assert.equal(platformFee.toString(), "100");
      assert.equal(feeRecipient, deployer.address);
      assert.equal(owner, deployer.address);
    });
  });

  describe("create auction", async () => {
    it("fails if not the nft owner", async () => {
      await expect(
        user1Auction.createAuction(nft.address, 1, minBid, startTime, endTime)
      ).to.be.revertedWith("not the token owner");
    });

    it("fails if item is not listed", async () => {
      await expect(
        auction.createAuction(nft.address, 1, minBid, startTime, endTime)
      ).to.be.revertedWith("item is not listed");
    });

    it("fails if invalid start time passed", async () => {
      await marketplace.listItem(nft.address, 1, 1000);

      await expect(
        auction.createAuction(nft.address, 1, minBid, 3213, endTime)
      ).to.be.revertedWith("invalid time start");
    });

    it("fails if expiration is less than 5 mins", async () => {
      await marketplace.listItem(nft.address, 1, 1000);

      // setting the end time to 2 minutes
      const d = new Date();
      d.setTime(d.getTime() + 2 * 60 * 1000);
      const invalidEndTime = Math.floor(d.getTime() / 1000); // convert it from milliseconds to seconds

      await expect(
        auction.createAuction(nft.address, 1, minBid, startTime, invalidEndTime)
      ).to.be.revertedWith("end time should be more than 5 mins");
    });

    it("creates an auction", async () => {
      await marketplace.listItem(nft.address, 1, 1000);

      await expect(
        auction.createAuction(nft.address, 1, minBid, startTime, endTime)
      ).to.emit(auction, "AuctionCreated");

      const [owner, minimumBid] = await auction.auctions(nft.address, 1);

      assert.equal(owner, deployer.address);
      assert.equal(minimumBid.toString(), minBid.toString());
    });

    it("reverts if contract is paused", async () => {
      await marketplace.listItem(nft.address, 1, 1000);

      await auction.toggleIsPaused();
      await expect(
        auction.createAuction(nft.address, 1, minBid, startTime, endTime)
      ).to.be.revertedWith("contract is paused");
    });
  });

  describe("cancel auction", () => {
    it("fails if auction does not exist", async () => {
      await expect(auction.cancelAuction(nft.address, 1)).to.be.revertedWith(
        "auction not exist"
      );
    });

    it("fails if caller is not owner", async () => {
      await marketplace.listItem(nft.address, 1, 1000);

      await auction.createAuction(nft.address, 1, minBid, startTime, endTime);
      await expect(
        user1Auction.cancelAuction(nft.address, 1)
      ).to.be.revertedWith("not nft owner");
    });

    it("refund the highest bidder if exist", async () => {
      await marketplace.listItem(nft.address, 1, 1000);

      await auction.createAuction(nft.address, 1, minBid, startTime, endTime);
      const amount = ethers.utils.parseEther("0.25");

      // increasing time of the block by 1 hour because start time is after 1 hour
      await network.provider.send("evm_increaseTime", [3700]);
      await network.provider.request({ method: "evm_mine", params: [] });

      await user1Auction.placeBid(nft.address, 1, { value: amount });

      const beforeBalance = await user1.getBalance();
      await auction.cancelAuction(nft.address, 1);
      const afterBalance = await user1.getBalance();

      assert.equal(
        beforeBalance.add(amount).toString(),
        afterBalance.toString()
      );
    });

    it("cancel and delete auction in the state", async () => {
      await marketplace.listItem(nft.address, 1, 1000);

      await auction.createAuction(nft.address, 1, minBid, startTime, endTime);

      await auction.cancelAuction(nft.address, 1);

      const [, minimumBid] = await auction.auctions(nft.address, 1);

      assert.equal(minimumBid.toString(), "0");
    });
  });

  // Place bid test
  describe("place bid", () => {
    const amount = ethers.utils.parseEther("0.25");

    beforeEach(async () => {
      await marketplace.listItem(nft.address, 1, 1000);
      await auction.createAuction(nft.address, 1, minBid, startTime, endTime);
    });

    it("fails if auction not started", async () => {
      await expect(
        user1Auction.placeBid(nft.address, 1, { value: amount })
      ).to.be.revertedWith("out of time");
    });

    it("fails if value is less than minimum bid", async () => {
      // increasing time of the block by 1 hour because start time is after 1 hour
      await network.provider.send("evm_increaseTime", [3700]);
      await network.provider.request({ method: "evm_mine", params: [] });

      await expect(
        user1Auction.placeBid(nft.address, 1, { value: 1000 })
      ).to.be.revertedWith("bid is less than minimum bid");
    });

    it("fails if there is highest bidder", async () => {
      // increasing time of the block by 1 hour because start time is after 1 hour
      await network.provider.send("evm_increaseTime", [3700]);
      await network.provider.request({ method: "evm_mine", params: [] });

      await user1Auction.placeBid(nft.address, 1, { value: amount });

      const amountToBid = ethers.utils.parseEther("0.22");
      await expect(
        user2Auction.placeBid(nft.address, 1, { value: amountToBid })
      ).to.be.revertedWith("failed to outBid highest bidder");
    });

    it("outbid and refund the highest bidder", async () => {
      // increasing time of the block by 1 hour because start time is after 1 hour
      await network.provider.send("evm_increaseTime", [3700]);
      await network.provider.request({ method: "evm_mine", params: [] });

      await user1Auction.placeBid(nft.address, 1, { value: amount });

      const amountToBid = ethers.utils.parseEther("0.3");

      const beforeBalance = await user1.getBalance();
      await user2Auction.placeBid(nft.address, 1, { value: amountToBid });
      const afterBalance = await user1.getBalance();

      const [, bid] = await auction.highestBids(nft.address, 1);

      assert.equal(bid.toString(), amountToBid.toString());
      assert.equal(
        beforeBalance.add(amount).toString(),
        afterBalance.toString()
      );
    });

    it("place the bid successfully", async () => {
      // increasing time of the block by 1 hour because start time is after 1 hour
      await network.provider.send("evm_increaseTime", [3700]);
      await network.provider.request({ method: "evm_mine", params: [] });

      await user1Auction.placeBid(nft.address, 1, { value: amount });

      const [, bid] = await auction.highestBids(nft.address, 1);

      assert.equal(bid.toString(), amount.toString());
    });
  });

  describe("withdraw the bid ", async () => {
    const amount = ethers.utils.parseEther("0.25");

    beforeEach(async () => {
      await marketplace.listItem(nft.address, 1, 1000);
      await auction.createAuction(nft.address, 1, minBid, startTime, endTime);

      // increasing time of the block by 1 hour because start time is after 1 hour
      await network.provider.send("evm_increaseTime", [3700]);
      await network.provider.request({ method: "evm_mine", params: [] });
      await user1Auction.placeBid(nft.address, 1, { value: amount });
    });

    it("fails if caller is not highest bidder", async () => {
      await expect(user2Auction.withdrawBid(nft.address, 1)).to.be.revertedWith(
        "you are not the highest bidder"
      );
    });

    it("fails if not called after 12 hours when auction has ended", async () => {
      await expect(user1Auction.withdrawBid(nft.address, 1)).to.be.revertedWith(
        "can withdraw only after 12 hours auction has ended"
      );
    });

    it("withdraw the bid successfully", async () => {
      // increase the block time by 14 hours
      await network.provider.send("evm_increaseTime", [14 * 3600]);
      await network.provider.request({ method: "evm_mine", params: [] });

      const beforeBalance = await user1.getBalance();
      const tx = await user1Auction.withdrawBid(nft.address, 1);
      const afterBalance = await user1.getBalance();
      //calculating the gas cost for tx
      const txRecipient = await tx.wait(1);
      const { gasUsed, effectiveGasPrice } = txRecipient;
      const gasCost = gasUsed.mul(effectiveGasPrice);

      assert.equal(
        beforeBalance.add(amount).toString(),
        afterBalance.add(gasCost).toString()
      );
    });

    it("emits an event and update the state after bid withdrawn ", async () => {
      // increase the block time by 14 hours
      await network.provider.send("evm_increaseTime", [14 * 3600]);
      await network.provider.request({ method: "evm_mine", params: [] });

      await expect(user1Auction.withdrawBid(nft.address, 1)).to.emit(
        auction,
        "BidWithdrawn"
      );
      const [, bid] = await auction.highestBids(nft.address, 1);

      assert.equal(bid.toString(), "0");
    });
  });

  // Result auction test
  describe("result auction", async () => {
    const amount = ethers.utils.parseEther("0.25");
    let platformFee, ownerFee, royaltyFee;
    beforeEach(async () => {
      const amountToMint = ethers.utils.parseEther("0.1");
      await user2Nft.mint("hello", 500, { value: amountToMint });
      await user2Nft.approve(marketplace.address, 2);
      await user2Marketplace.listItem(nft.address, 2, 1000);
      await user2Auction.createAuction(
        nft.address,
        2,
        minBid,
        startTime,
        endTime
      );

      //calculate the owner's fee
      platformFee = await auction.platformFee();
      ownerFee = amount.mul(platformFee).div(1000);
      const [address, royalty] = await nft.royaltyInfo(2, amount);
      royaltyFee = royalty;
    });

    it("fails if auction not ended yet", async () => {
      await expect(
        user2Auction.resultAuction(nft.address, 2)
      ).to.be.revertedWith("auction not ended");
    });

    it("reverts if there is no bidder", async () => {
      // increase the time by 3 hours
      await network.provider.send("evm_increaseTime", [3 * 3600]);
      await network.provider.request({ method: "evm_mine", params: [] });
      await expect(
        user2Auction.resultAuction(nft.address, 2)
      ).to.be.revertedWith("there is no bidder");
    });

    it("transfer the fee for project owner", async () => {
      // increasing time of the block by 1 hour because start time is after 1 hour
      await network.provider.send("evm_increaseTime", [3700]);
      await network.provider.request({ method: "evm_mine", params: [] });
      await user1Auction.placeBid(nft.address, 2, { value: amount });

      // increase the time by 3 hours
      await network.provider.send("evm_increaseTime", [3 * 3600]);
      await network.provider.request({ method: "evm_mine", params: [] });

      const beforeBalance = await deployer.getBalance();
      await user2Auction.resultAuction(nft.address, 2);
      const afterBalance = await deployer.getBalance();

      assert.equal(
        beforeBalance.add(ownerFee).toString(),
        afterBalance.toString()
      );
    });

    it("transfer wining bid and royalty to owner", async () => {
      // increasing time of the block by 1 hour because start time is after 1 hour
      await network.provider.send("evm_increaseTime", [3700]);
      await network.provider.request({ method: "evm_mine", params: [] });
      await user1Auction.placeBid(nft.address, 2, { value: amount });

      // increase the time by 3 hours
      await network.provider.send("evm_increaseTime", [3 * 3600]);
      await network.provider.request({ method: "evm_mine", params: [] });

      const beforeBalance = await user2.getBalance();

      const tx = await user2Auction.resultAuction(nft.address, 2); //result the auction

      const afterBalance = await user2.getBalance();

      //calculating the gas cost for tx
      const txRecipient = await tx.wait(1);
      const { gasUsed, effectiveGasPrice } = txRecipient;
      const gasCost = gasUsed.mul(effectiveGasPrice);

      const price = amount.sub(ownerFee).sub(royaltyFee);
      const calculatedBalance = beforeBalance.add(royaltyFee).add(price);

      assert.equal(
        calculatedBalance.toString(),
        afterBalance.add(gasCost).toString()
      );
    });

    it("transfer the nft to bidder and emits an event", async () => {
      // increasing time of the block by 1 hour because start time is after 1 hour
      await network.provider.send("evm_increaseTime", [3700]);
      await network.provider.request({ method: "evm_mine", params: [] });
      await user1Auction.placeBid(nft.address, 2, { value: amount });

      // increase the time by 3 hours
      await network.provider.send("evm_increaseTime", [3 * 3600]);
      await network.provider.request({ method: "evm_mine", params: [] });

      await expect(user2Auction.resultAuction(nft.address, 2)).to.emit(
        auction,
        "AuctionResulted"
      ); //result the auction

      const newOwner = await nft.ownerOf(2);
      assert.equal(newOwner, user1.address);
    });
  });

  // Update min bid
  describe("update min bid", () => {
    beforeEach(async () => {
      await marketplace.listItem(nft.address, 1, 1000);

      await auction.createAuction(nft.address, 1, minBid, startTime, endTime);
    });

    it("fails if not the owner", async () => {
      await expect(
        user1Auction.updateMinBid(nft.address, 1, 3322)
      ).to.be.revertedWith("not auction owner");
    });

    it("revert if bidder exist", async () => {
      const amount = ethers.utils.parseEther("0.2");

      // increasing time of the block by 1 hour because start time is after 1 hour
      await network.provider.send("evm_increaseTime", [3700]);
      await network.provider.request({ method: "evm_mine", params: [] });
      await user1Auction.placeBid(nft.address, 1, { value: amount });

      await expect(
        auction.updateMinBid(nft.address, 1, 3322)
      ).to.be.revertedWith("cannot update the minimum bid if bidder exist");
    });

    it("update the minimum bid", async () => {
      const amount = ethers.utils.parseEther("0.2");
      await expect(auction.updateMinBid(nft.address, 1, amount)).to.emit(
        auction,
        "UpdatedMinBid"
      );

      const [, minimumBid] = await auction.auctions(nft.address, 1);

      assert.equal(minimumBid.toString(), amount.toString());
    });
  });

  // Update the start time
  describe("update start time", () => {
    beforeEach(async () => {
      await marketplace.listItem(nft.address, 1, 1000);
      await auction.createAuction(nft.address, 1, minBid, startTime, endTime);
    });

    it("fails if not the owner", async () => {
      await expect(
        user1Auction.updateStartTime(nft.address, 1, 3322)
      ).to.be.revertedWith("not auction owner");
    });

    it("fails if invalid start time passed", async () => {
      await expect(
        auction.updateStartTime(nft.address, 1, 0)
      ).to.be.revertedWith("invalid start time");
    });

    it("fails if already started ", async () => {
      // increase the time by 1 hour
      await network.provider.send("evm_increaseTime", [3700]);
      await network.provider.request({ method: "evm_mine", params: [] });

      await expect(
        auction.updateStartTime(nft.address, 1, 3322)
      ).to.be.revertedWith("auction already started");
    });

    it("fails if start time is less than 5 min to end time", async () => {
      // setting the start time with 2 mins difference between start time and end time
      const invalidStartTime = addHours(new Date(), 2.58);

      await expect(
        auction.updateStartTime(nft.address, 1, invalidStartTime)
      ).to.be.revertedWith(
        "auction start time should be less than end time by 5 min"
      );
    });

    it("update the start time to new value", async () => {
      // new start time set to 1/35
      const newStartTime = addHours(new Date(), 1.35);
      await expect(
        auction.updateStartTime(nft.address, 1, newStartTime)
      ).to.emit(auction, "UpdatedStartTime");

      const [, , startT] = await auction.auctions(nft.address, 1);

      assert.equal(startT.toString(), newStartTime.toString());
    });
  });

  // Update the end time
  describe("update end time", () => {
    beforeEach(async () => {
      await marketplace.listItem(nft.address, 1, 1000);
      await auction.createAuction(nft.address, 1, minBid, startTime, endTime);
    });

    it("fails if not the owner", async () => {
      await expect(
        user1Auction.updateEndTime(nft.address, 1, 5432)
      ).to.be.revertedWith("not auction owner");
    });

    it("fails if invalid end time passed", async () => {
      await expect(auction.updateEndTime(nft.address, 1, 0)).to.be.revertedWith(
        "invalid end time"
      );
    });

    it("fails if auction is ended", async () => {
      // increase the block time by 4 hour
      await network.provider.send("evm_increaseTime", [4 * 3600]);
      await network.provider.request({ method: "evm_mine", params: [] });

      await expect(
        auction.updateEndTime(nft.address, 1, 7635)
      ).to.be.revertedWith("auction is ended");
    });

    it("fails if end time is less than start time by 5 min or more", async () => {
      const invalidEndTime = addHours(new Date(), 1);

      await expect(
        auction.updateEndTime(nft.address, 1, invalidEndTime)
      ).to.be.revertedWith(
        "auction end time should be greater than start time by 5 mins"
      );
    });

    it("fails if end time is less than 5 mins (by now)", async () => {
      // increase the block time by 1/31
      await network.provider.send("evm_increaseTime", [1.31 * 3600]);
      await network.provider.request({ method: "evm_mine", params: [] });

      const invalidEndTime = addHours(new Date(), 1.33);

      await expect(
        auction.updateEndTime(nft.address, 1, invalidEndTime)
      ).to.be.revertedWith("end time should be more than 5 mins");
    });

    it("updates the end time", async () => {
      const newEndTime = addHours(new Date(), 1.33);

      await expect(auction.updateEndTime(nft.address, 1, newEndTime)).to.emit(
        auction,
        "UpdatedEndTime"
      );

      const [, , , endT] = await auction.auctions(nft.address, 1);

      assert.equal(endT.toString(), newEndTime.toString());
    });
  });

  // Updater functions
  describe("auction updater functions", () => {
    it("reverts if not contract owner", async () => {
      await expect(user1Auction.updatePlatformFee(312231)).to.revertedWith(
        "not owner"
      );
    });

    it("update the platform fee", async () => {
      const amount = ethers.utils.parseEther("0.5");
      await expect(auction.updatePlatformFee(amount)).to.emit(
        auction,
        "UpdatedPlatformFee"
      );

      const platformFee = await auction.platformFee();

      assert.equal(platformFee.toString(), amount.toString());
    });

    it("update the fee recipient", async () => {
      await expect(auction.updateFeeRecipient(user1.address)).to.emit(
        auction,
        "UpdatedPlatformFeeRecipient"
      );

      const feeRecipient = await auction.platformFeeRecipient();

      assert.equal(feeRecipient, user1.address);
    });

    it("fails if no address passed to fee recipient ", async () => {
      await expect(
        auction.updateFeeRecipient("0x0000000000000000000000000000000000000000")
      ).to.be.revertedWith("recipient cannot be empty");
    });

    it("update is paused variable", async () => {
      await auction.toggleIsPaused();

      const isPaused = await auction.isPaused();

      assert.equal(isPaused, true);
    });
  });
});
