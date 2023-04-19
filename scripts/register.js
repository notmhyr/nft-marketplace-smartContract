const { ethers } = require("hardhat");

// register the auction address in address registry contract

const main = async () => {
  // const nftCollection = await ethers.getContract("NFTCollection")
  // const nftFactory = await ethers.getContract("NFTFactory")

  const marketplace = await ethers.getContract("Marketplace");
  const auction = await ethers.getContract("Auction");
  const weth = await ethers.getContract("WETH");
  const addressRegistry = await ethers.getContract("AddressRegistry");

  const marketplaceTx = await marketplace.updateAddressRegistry(
    addressRegistry.address
  );
  await marketplaceTx.wait();

  const auctionTx = await auction.updateAddressRegistry(
    addressRegistry.address
  );
  await auctionTx.wait();

  const registerAuctionTx = await addressRegistry.updateAuction(
    auction.address
  );
  await registerAuctionTx.wait();

  const registerMarketplaceTx = await addressRegistry.updateMarketplace(
    marketplace.address
  );
  await registerMarketplaceTx.wait();

  const registerWETHTx = await addressRegistry.updateWETH(weth.address);
  await registerWETHTx.wait();

  console.log(`addresses registered`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
