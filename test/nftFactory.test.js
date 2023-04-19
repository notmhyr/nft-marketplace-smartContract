const { assert, expect } = require("chai");
const { ethers } = require("hardhat");
const ownerFee = ethers.utils.parseEther("0.1");

describe("nft factory", async () => {
  let nftFactory, deployer, user1, user1NftFactory;
  beforeEach(async () => {
    [deployer, user1] = await ethers.getSigners();

    //deploy nft factory contract
    await deployments.fixture(["nftfactory", "nft", "auction"]);

    // getting contract
    nftFactory = await ethers.getContract("NFTFactory");

    user1NftFactory = nftFactory.connect(user1);
  });

  describe("constructor", () => {
    it("initialize the contract correctly", async () => {
      const platformFee = await nftFactory.platformFee();
      const feeRecipient = await nftFactory.feeRecipient();
      const owner = await nftFactory.owner();

      assert.equal(platformFee.toString(), ownerFee.toString());
      assert.equal(feeRecipient, deployer.address);
      assert.equal(owner, deployer.address);
    });
  });

  // Create collection test
  describe("create collection", () => {
    it("fails if value passed is less than platform fee", async () => {
      await expect(
        nftFactory.createCollection("name", "symbol", 1000, user1.address)
      ).to.be.revertedWith("not enough funds");
    });

    it("fails if royalty fee passed is greater than 10%", async () => {
      await expect(
        nftFactory.createCollection("name", "symbol", 1001, user1.address, {
          value: ownerFee,
        })
      ).to.be.revertedWith("max royalty fee is 10 percent");
    });

    it("sends the fee to owner", async () => {
      const beforeBalance = await deployer.getBalance();
      await user1NftFactory.createCollection(
        "name",
        "symbol",
        1000,
        user1.address,
        {
          value: ownerFee,
        }
      );
      const afterBalance = await deployer.getBalance();

      assert.equal(
        beforeBalance.add(ownerFee).toString(),
        afterBalance.toString()
      );
    });

    it("creates new collection and update the states", async () => {
      await expect(
        user1NftFactory.createCollection(
          "name",
          "symbol",
          1000,
          user1.address,
          {
            value: ownerFee,
          }
        )
      ).to.emit(nftFactory, "CollectionCreated");

      const deployedCollections = await nftFactory.getCollectionsOwned(
        user1.address
      );

      assert(deployedCollections.length == 1);
    });
  });

  // Updater functions
  describe("updater functions", () => {
    it("reverts if not contract owner", async () => {
      await expect(user1NftFactory.updatePlatformFee(312231)).to.revertedWith(
        "not owner"
      );
    });

    it("update the platform fee", async () => {
      const amount = ethers.utils.parseEther("0.5");
      await expect(nftFactory.updatePlatformFee(amount)).to.emit(
        nftFactory,
        "UpdatedPlatformFee"
      );

      const platformFee = await nftFactory.platformFee();

      assert.equal(platformFee.toString(), amount.toString());
    });

    it("update the fee recipient", async () => {
      await expect(nftFactory.updateFeeRecipient(user1.address)).to.emit(
        nftFactory,
        "UpdatedFeeRecipient"
      );

      const feeRecipient = await nftFactory.feeRecipient();

      assert.equal(feeRecipient, user1.address);
    });

    it("fails if no address passed to fee recipient ", async () => {
      await expect(
        nftFactory.updateFeeRecipient(
          "0x0000000000000000000000000000000000000000"
        )
      ).to.be.revertedWith("recipient cannot be empty");
    });
  });
});
