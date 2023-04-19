const { assert, expect } = require("chai");

describe("address registry", () => {
  let nftFactory,
    addressRegistry,
    marketplace,
    auction,
    nft,
    deployer,
    user1,
    user1AddressRegistry;
  beforeEach(async () => {
    [deployer, user1] = await ethers.getSigners();

    //deploy all contracts
    await deployments.fixture(["all"]);

    // getting contract
    addressRegistry = await ethers.getContract("AddressRegistry");
    nftFactory = await ethers.getContract("NFTFactory");
    marketplace = await ethers.getContract("Marketplace");
    nft = await ethers.getContract("NFT");
    auction = await ethers.getContract("Auction");

    user1AddressRegistry = addressRegistry.connect(user1);
  });

  describe("constructor", () => {
    it("initialize the contract", async () => {
      const owner = await addressRegistry.owner();

      assert.equal(owner, deployer.address);
    });
  });

  // Update addresses test
  describe("update addresses", () => {
    it("update marketplace address", async () => {
      await addressRegistry.updateMarketplace(marketplace.address);

      const newAddress = await addressRegistry.marketplace();

      assert.equal(newAddress, marketplace.address);
    });

    it("update auction address", async () => {
      await addressRegistry.updateAuction(auction.address);

      const newAddress = await addressRegistry.auction();

      assert.equal(newAddress, auction.address);
    });

    it("update nft address", async () => {
      await addressRegistry.updateNft(nft.address);

      const newAddress = await addressRegistry.nft();

      assert.equal(newAddress, nft.address);
    });

    it("update nft factory address", async () => {
      await addressRegistry.updateNftFactory(nftFactory.address);

      const newAddress = await addressRegistry.nftFactory();

      assert.equal(newAddress, nftFactory.address);
    });
  });
});
