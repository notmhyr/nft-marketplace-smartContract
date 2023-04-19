// const { ethers } = require("hardhat");
const { assert, expect } = require("chai");

describe("nft collection", () => {
  let nftCollection, deployer, user1, user1NftCollection;
  beforeEach(async () => {
    [deployer, user1] = await ethers.getSigners();

    //deploy nft factory contract
    const NftCollection = await ethers.getContractFactory("NFTCollection");
    nftCollection = await NftCollection.deploy(
      "name",
      "symbol",
      500,
      deployer.address,
      deployer.address
    );
    await nftCollection.deployed();

    user1NftCollection = nftCollection.connect(user1);
  });

  describe("constructor", async () => {
    it("initialize the contract", async () => {
      const owner = await nftCollection.owner();

      assert.equal(owner, deployer.address);
    });

    it("sets the royalty fee on the contract", async () => {
      const amount = ethers.utils.parseEther("1");
      const expectedFee = amount.mul(500).div(10000);
      const [address, royalty] = await nftCollection.royaltyInfo(1, amount);

      assert.equal(address, deployer.address);
      assert.equal(royalty.toString(), expectedFee.toString());
    });
  });

  // Mint test
  describe("mint", () => {
    it("fails if no token URI passed", async () => {
      await expect(nftCollection.mint("")).to.be.revertedWith("no token uri");
    });

    it("mints the nft", async () => {
      await expect(nftCollection.mint("hello")).to.emit(
        nftCollection,
        "Minted"
      );

      const tokenId = await nftCollection.tokenIds();
      assert.equal(tokenId.toString(), "1");

      const nftOwner = await nftCollection.ownerOf(1);
      assert.equal(nftOwner, deployer.address);

      const URI = await nftCollection.tokenURI(1);
      assert.equal(URI, "hello");
    });
  });

  // Updater functions tets
  describe("update royalty", () => {
    it("fails if not owner ", async () => {
      await expect(
        user1NftCollection.updateRoyalty(deployer.address, 500)
      ).to.be.revertedWith("not owner");
    });

    it("fails if invalid address passed", async () => {
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      await expect(
        nftCollection.updateRoyalty(zeroAddress, 500)
      ).to.be.revertedWith("recipient cannot be empty");
    });

    it("fails if royalty is more than 10%", async () => {
      await expect(
        nftCollection.updateRoyalty(user1.address, 2000) // passing 20%
      ).to.be.revertedWith("royalty fee cannot be more than 10%");
    });

    it("updates the royalty", async () => {
      await expect(nftCollection.updateRoyalty(user1.address, 1000)).to.emit(
        nftCollection,
        "UpdatedRoyalty"
      );

      const amount = ethers.utils.parseEther("1");
      const expectedFee = amount.mul(1000).div(10000);
      const [address, royalty] = await nftCollection.royaltyInfo(1, amount);

      assert.equal(address, user1.address);
      assert.equal(royalty.toString(), expectedFee.toString());
    });
  });

  describe("remove royalty", async () => {
    it("fails if not owner ", async () => {
      await expect(user1NftCollection.removeRoyalty()).to.be.revertedWith(
        "not owner"
      );
    });

    it("removes the royalty", async () => {
      await nftCollection.removeRoyalty();
      const amount = ethers.utils.parseEther("1");
      const [, royalty] = await nftCollection.royaltyInfo(1, amount);

      assert.equal(royalty.toString(), "0");
    });
  });
});
