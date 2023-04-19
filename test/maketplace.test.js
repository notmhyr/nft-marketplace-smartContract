const { ethers, deployments } = require("hardhat");
const { assert, expect } = require("chai");
describe("marketplace", () => {
  let marketplace,
    nft,
    weth,
    deployer,
    user1,
    user2,
    user1Marketplace,
    user2Marketplace,
    user2Nft,
    wethAmount;

  beforeEach(async () => {
    [deployer, user1, user2] = await ethers.getSigners();

    //deploy all of the contracts
    await deployments.fixture(["all"]);

    // getting contracts
    marketplace = await ethers.getContract("Marketplace");
    nft = await ethers.getContract("NFT");
    weth = await ethers.getContract("WETH");

    // setting the data required for the interface
    const addressRegistry = await ethers.getContract("AddressRegistry");
    const auction = await ethers.getContract("Auction");
    await addressRegistry.updateAuction(auction.address);
    await addressRegistry.updateWETH(weth.address);
    await marketplace.updateAddressRegistry(addressRegistry.address);

    // connecting users to contracts
    user1Marketplace = marketplace.connect(user1);
    user2Marketplace = marketplace.connect(user2);
    user2Nft = nft.connect(user2);

    // exchanging some ether to weth token
    const user1Weth = weth.connect(user1);
    const user2Weth = weth.connect(user2);
    wethAmount = ethers.utils.parseEther("6");
    await user1Weth.deposit({ value: wethAmount });
    await user2Weth.deposit({ value: wethAmount });
    // approve marketplace to use weth tokens
    await user1Weth.approve(marketplace.address, wethAmount);
    await user2Weth.approve(marketplace.address, wethAmount);
  });

  // Constructor test
  describe("constructor", () => {
    it("initialize the contract correctly", async () => {
      const platformFee = await marketplace.platformFee();
      const feeRecipient = await marketplace.feeRecipient();
      const owner = await marketplace.owner();

      assert.equal(platformFee.toString(), "25");
      assert.equal(feeRecipient, deployer.address);
      assert.equal(owner, deployer.address);
    });
  });

  // List item test
  describe("list item", () => {
    let tokenId;
    beforeEach(async () => {
      const amount = ethers.utils.parseEther("0.1");
      await nft.mint("some URI", 500, { value: amount });
    });

    it("revert if not nft owner", async () => {
      await expect(
        user1Marketplace.listItem(nft.address, 1, 100)
      ).to.be.revertedWith("not the token owner");
    });

    it("revert if market place is not approved", async () => {
      await expect(
        marketplace.listItem(nft.address, 1, 1000)
      ).to.be.revertedWith("not approved for marketplace");
    });

    it("reverts if the price is 0", async () => {
      await nft.approve(marketplace.address, 1);
      await expect(marketplace.listItem(nft.address, 1, 0)).to.be.revertedWith(
        "price cannot be zero"
      );
    });

    it("lists the nft", async () => {
      await nft.approve(marketplace.address, 1);
      await expect(marketplace.listItem(nft.address, 1, 1000)).to.emit(
        marketplace,
        "ItemListed"
      );

      const [, price] = await marketplace.listedItems(nft.address, 1);
      assert.equal(price.toString(), "1000");
    });

    it("reverts if item is already listed", async () => {
      await nft.approve(marketplace.address, 1);
      await marketplace.listItem(nft.address, 1, 1000);
      await expect(
        marketplace.listItem(nft.address, 1, 1000)
      ).to.be.revertedWith("item is already listed");
    });
  });

  // Update listing test
  describe("update listing", () => {
    it("revert if not nft owner", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await nft.mint("some URI", 500, { value: amount });
      await nft.approve(marketplace.address, 1);
      await marketplace.listItem(nft.address, 1, 1000);

      await expect(
        user1Marketplace.updateListing(nft.address, 1, 100)
      ).to.be.revertedWith("not the token owner");
    });

    it("reverts if item is not listed", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await nft.mint("some URI", 500, { value: amount });

      await expect(
        marketplace.updateListing(nft.address, 1, 100)
      ).to.be.revertedWith("item is not listed");
    });

    it("reverts if the price is 0", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await nft.mint("some URI", 500, { value: amount });
      await nft.approve(marketplace.address, 1);
      await marketplace.listItem(nft.address, 1, 1000);

      await expect(
        marketplace.updateListing(nft.address, 1, 0)
      ).to.be.revertedWith("price cannot be less than zero");
    });

    it("updates the listing price", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await nft.mint("some URI", 500, { value: amount });
      await nft.approve(marketplace.address, 1);
      await marketplace.listItem(nft.address, 1, 1000);

      await marketplace.updateListing(nft.address, 1, 500);
      const [, price] = await marketplace.listedItems(nft.address, 1);
      assert.equal(price.toString(), "500");
    });
  });

  // Cancel listing test
  describe("cancel listing", async () => {
    it("revert if not nft owner", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await nft.mint("some URI", 500, { value: amount });
      await nft.approve(marketplace.address, 1);
      await marketplace.listItem(nft.address, 1, 1000);

      await expect(
        user1Marketplace.cancelListing(nft.address, 1)
      ).to.be.revertedWith("not the token owner");
    });

    it("reverts if item is not listed", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await nft.mint("some URI", 500, { value: amount });

      await expect(
        marketplace.cancelListing(nft.address, 1)
      ).to.be.revertedWith("item is not listed");
    });

    it("cancel the listing", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await nft.mint("some URI", 500, { value: amount });
      await nft.approve(marketplace.address, 1);
      await marketplace.listItem(nft.address, 1, 1000);

      await marketplace.cancelListing(nft.address, 1);
      const [, price] = await marketplace.listedItems(nft.address, 1);
      assert.equal(price.toString(), "0");
    });
  });

  // Buy NFT test
  describe("buy item", async () => {
    let listedPrice, ownerFee, royaltyFee;
    beforeEach(async () => {
      // minting the nft
      const amount = ethers.utils.parseEther("0.1");
      await user2Nft.mint("some URI", 500, { value: amount });
      await user2Nft.approve(marketplace.address, 1);

      //listing the item
      listedPrice = ethers.utils.parseEther("0.01");
      await user2Marketplace.listItem(nft.address, 1, listedPrice);

      // calculating fees
      const [address, royalty] = await nft.royaltyInfo(1, listedPrice);
      royaltyFee = royalty;
      const platformFee = await marketplace.platformFee();
      ownerFee = listedPrice.mul(platformFee).div(1000);
    });

    it("reverts if value is less than price", async () => {
      const amount = ethers.utils.parseEther("0.001");
      await expect(
        user1Marketplace.buyItem(nft.address, 1, {
          value: amount,
        })
      ).to.be.revertedWith("insufficient funds for buying nft");
    });

    it("should transfer the fee and listing price for owner", async () => {
      const balanceBefore = await deployer.getBalance();
      await user1Marketplace.buyItem(nft.address, 1, {
        value: listedPrice,
      });

      const balanceAfter = await deployer.getBalance();

      assert.equal(
        balanceBefore.add(ownerFee).toString(),
        balanceAfter.toString()
      );
    });

    it("transfer the fee if token has royalty fee", async () => {
      const balanceBefore = await user2.getBalance();
      await user1Marketplace.buyItem(nft.address, 1, {
        value: listedPrice,
      });

      const price = listedPrice.sub(ownerFee).sub(royaltyFee);
      const calculatedBalance = balanceBefore.add(royaltyFee).add(price);
      const balanceAfter = await user2.getBalance();

      // check if value is transferred successfully
      assert.equal(calculatedBalance.toString(), balanceAfter.toString());
    });

    it("buys the nft and nft will get transferred", async () => {
      await user1Marketplace.buyItem(nft.address, 1, {
        value: listedPrice,
      });

      // check if item is deleted in listed items
      const [, price] = await marketplace.listedItems(nft.address, 1);
      assert.equal(price.toString(), "0");

      // check if token is transferred
      const newOwner = await nft.ownerOf(1);
      assert.equal(newOwner, user1.address);
    });
  });

  // Create offer test
  describe("create offer", () => {
    beforeEach(async () => {
      // minting the nft
      const amount = ethers.utils.parseEther("0.1");
      await nft.mint("some URI", 500, { value: amount });
      await nft.approve(marketplace.address, 1);

      //listing the item
      listedPrice = ethers.utils.parseEther("0.01");
      await marketplace.listItem(nft.address, 1, listedPrice);
    });

    it("reverts if offer is zero", async () => {
      await expect(
        user1Marketplace.createOffer(nft.address, 1, 0, 2024)
      ).to.be.revertedWith("your offer cannot be 0");
    });

    it("reverts if expiration is less than now", async () => {
      await expect(
        user1Marketplace.createOffer(nft.address, 1, 1000, 2024)
      ).to.be.revertedWith("invalid expiration");
    });

    it("creates the offer", async () => {
      const date = new Date();
      // setting the expiration to 1 hour
      date.setTime(date.getTime() + 1 * 60 * 60 * 1000);
      const deadLine = Math.floor(date.getTime() / 1000); // convert it from milliseconds to seconds

      // creates and emit
      await expect(
        user1Marketplace.createOffer(nft.address, 1, 1000, deadLine)
      ).to.emit(marketplace, "OfferCreated");

      const [offer, expiration] = await marketplace.offers(
        nft.address,
        1,
        user1.address
      );

      assert.equal(offer.toString(), "1000");
      assert.equal(expiration.toString(), deadLine.toString());
    });

    it("fails if offer already exist", async () => {
      // setting the expiration to 1 hour
      const date = new Date();
      date.setTime(date.getTime() + 1 * 60 * 60 * 1000);
      const deadLine = Math.floor(date.getTime() / 1000); // convert it from milliseconds to seconds

      await user1Marketplace.createOffer(nft.address, 1, 1000, deadLine);

      await expect(
        user1Marketplace.createOffer(nft.address, 1, 1000, deadLine)
      ).to.be.revertedWith("offer already created");
    });
  });

  // Cancel the offer
  describe("cancel offer", () => {
    beforeEach(async () => {
      // minting the nft
      const amount = ethers.utils.parseEther("0.1");
      await nft.mint("some URI", 500, { value: amount });
      await nft.approve(marketplace.address, 1);

      //listing the item
      listedPrice = ethers.utils.parseEther("0.01");
      await marketplace.listItem(nft.address, 1, listedPrice);
    });

    it("reverts if offer does not exist", async () => {
      await expect(marketplace.cancelOffer(nft.address, 1)).to.be.revertedWith(
        "offer doesn't exist or expired"
      );
    });

    it("removes the offer", async () => {
      // setting the expiration to 1 hour
      const date = new Date();
      date.setTime(date.getTime() + 1 * 60 * 60 * 1000);
      const deadLine = Math.floor(date.getTime() / 1000); // convert it from milliseconds to seconds

      await user1Marketplace.createOffer(nft.address, 1, 1000, deadLine);

      await user1Marketplace.cancelOffer(nft.address, 1);

      const [offer, expiration] = await marketplace.offers(
        nft.address,
        1,
        user1.address
      );

      assert.equal(offer.toString(), "0");
      assert.equal(expiration.toString(), "0");
    });
  });

  // Accept offer test
  describe("accept offer", () => {
    let listedPrice, royaltyFee, ownerFee, offer;
    beforeEach(async () => {
      // minting the nft
      const amount = ethers.utils.parseEther("0.1");
      await user2Nft.mint("some URI", 500, { value: amount });
      await user2Nft.approve(marketplace.address, 1);

      //listing the item
      listedPrice = ethers.utils.parseEther("0.01");
      await user2Marketplace.listItem(nft.address, 1, listedPrice);

      // setting the expiration to 1 hour
      const date = new Date();
      date.setTime(date.getTime() + 1 * 60 * 60 * 1000);
      const deadLine = Math.floor(date.getTime() / 1000); // convert it from milliseconds to seconds

      // creating offer
      await user1Marketplace.createOffer(nft.address, 1, wethAmount, deadLine);

      // calculating fees
      const platformFee = await marketplace.platformFee();
      [offer] = await marketplace.offers(nft.address, 1, user1.address);
      const [address, royalty] = await nft.royaltyInfo(1, offer);
      royaltyFee = royalty;
      ownerFee = offer.mul(platformFee).div(1000);
    });

    it("reverts if not owner the nft", async () => {
      await expect(
        user1Marketplace.acceptOffer(nft.address, 1, user1.address)
      ).to.be.revertedWith("not the token owner");
    });

    it("should transfer the fee for marketplace owner", async () => {
      const balanceBefore = await weth.balanceOf(deployer.address);
      const tx = await user2Marketplace.acceptOffer(
        nft.address,
        1,
        user1.address
      );

      const balanceAfter = await weth.balanceOf(deployer.address);

      assert.equal(
        balanceBefore.add(ownerFee).toString(),
        balanceAfter.toString()
      );
    });

    it("transfer the fee if token has royalty fee, also the offer", async () => {
      const balanceBefore = await weth.balanceOf(user2.address);
      const tx = await user2Marketplace.acceptOffer(
        nft.address,
        1,
        user1.address
      );
      // calculating the gas used for the tx
      const txRecipient = await tx.wait(1);
      const { gasUsed, effectiveGasPrice } = txRecipient;
      const gasCost = gasUsed.mul(effectiveGasPrice);

      const price = offer.sub(ownerFee).sub(royaltyFee);
      const calculatedBalance = balanceBefore.add(royaltyFee).add(price);
      const balanceAfter = await weth.balanceOf(user2.address);

      // check if value is transferred successfully
      assert.equal(calculatedBalance.toString(), balanceAfter.toString());
    });

    it("transfer the nft and update the state", async () => {
      await user2Marketplace.acceptOffer(nft.address, 1, user1.address);

      const newOwner = await nft.ownerOf(1);
      const [offer] = await marketplace.offers(nft.address, 1, user1.address);
      const [, price] = await marketplace.listedItems(nft.address, 1);

      assert.equal(newOwner, user1.address);
      assert.equal(offer.toString(), "0");
      assert.equal(price.toString(), "0");
    });
  });

  // Updater functions
  describe("updater functions", () => {
    it("reverts if not contract owner", async () => {
      await expect(user1Marketplace.updatePlatformFee(100)).to.revertedWith(
        "not owner"
      );
    });

    it("update the platform fee", async () => {
      await expect(marketplace.updatePlatformFee(100)).to.emit(
        marketplace,
        "UpdatedPlatformFee"
      );

      const platformFee = await marketplace.platformFee();

      assert.equal(platformFee.toString(), "100");
    });

    it("update the fee recipient", async () => {
      await expect(marketplace.updateFeeRecipient(user1.address)).to.emit(
        marketplace,
        "UpdatedFeeRecipient"
      );

      const feeRecipient = await marketplace.feeRecipient();

      assert.equal(feeRecipient, user1.address);
    });

    it("fails if no address passed to fee recipient ", async () => {
      await expect(
        marketplace.updateFeeRecipient(
          "0x0000000000000000000000000000000000000000"
        )
      ).to.be.revertedWith("recipient cannot be empty");
    });

    it("update address registry", async () => {
      await marketplace.updateAddressRegistry(nft.address);

      const newAddress = await marketplace.addressRegistry();

      assert.equal(newAddress, nft.address);
    });
  });
});
