// this code will update the contract abis and contract addresses in frontend

require("dotenv").config();
const fs = require("fs");
const { ethers, network } = require("hardhat");
const chainId = network.config.chainId.toString();

// initializing frontend file paths
const frontend_constants_file =
  "C:/Users/Delta/Desktop/nft-marketplace-frontend/constants/";
const frontend_contract_addresses_file =
  "C:/Users/Delta/Desktop/nft-marketplace-frontend/constants/contractAddresses.json";

// contracts
let marketplace, auction, nftFactory, nftCollection, weth;

// using hardhat-deployer for run the script for us
module.exports = async () => {
  console.log("updating frontend");
  if (process.env.UPDATE_FRONT_END === "true") {
    // getting deployed contracts
    marketplace = await ethers.getContract("Marketplace");
    auction = await ethers.getContract("Auction");
    nftFactory = await ethers.getContract("NFTFactory");
    nftCollection = await ethers.getContract("NFTCollection");
    weth = await ethers.getContract("WETH");
    updateContractAddresses();
    updateAbis();
  }
};

// function for update abis for each contract
async function updateAbis() {
  console.log("Updating abis");
  // creates the file and store the data if not exist or update it if already exist
  fs.writeFileSync(
    `${frontend_constants_file}marketplaceAbi.json`,
    marketplace.interface.format(ethers.utils.FormatTypes.json)
  );
  fs.writeFileSync(
    `${frontend_constants_file}auctionAbi.json`,
    auction.interface.format(ethers.utils.FormatTypes.json)
  );
  fs.writeFileSync(
    `${frontend_constants_file}nftFactoryAbi.json`,
    nftFactory.interface.format(ethers.utils.FormatTypes.json)
  );
  fs.writeFileSync(
    `${frontend_constants_file}nftCollectionAbi.json`,
    nftCollection.interface.format(ethers.utils.FormatTypes.json)
  );

  fs.writeFileSync(
    `${frontend_constants_file}wethAbi.json`,
    weth.interface.format(ethers.utils.FormatTypes.json)
  );
}

// function for update contract addresses for each chain id
async function updateContractAddresses() {
  console.log("Updating contract addresses");

  // reading the file
  const currentAddresses = JSON.parse(
    fs.readFileSync(frontend_contract_addresses_file, "utf8")
  );

  // check if chain id exist
  if (chainId in currentAddresses) {
    // check if there is already marketplace address in the object if not initialize it
    if ("marketplace" in currentAddresses[chainId]) {
      // check if address is the same as current address if not it will update it
      if (currentAddresses[chainId]["marketplace"] !== marketplace.address) {
        currentAddresses[chainId]["marketplace"] = marketplace.address;
      }
    } else {
      currentAddresses[chainId]["marketplace"] = marketplace.address;
    }

    // check if there is already auction address in the object if not initialize it
    if ("auction" in currentAddresses[chainId]) {
      // check if address is the same as current address if not it will update it
      if (currentAddresses[chainId]["auction"] !== auction.address) {
        currentAddresses[chainId]["auction"] = auction.address;
      }
    } else {
      currentAddresses[chainId]["auction"] = auction.address;
    }

    // check if there is already nftFactory address in the object if not initialize it
    if ("nftFactory" in currentAddresses[chainId]) {
      // check if address is the same as current address if not it will update it
      if (currentAddresses[chainId]["nftFactory"] !== nftFactory.address) {
        currentAddresses[chainId]["nftFactory"] = nftFactory.address;
      }
    } else {
      currentAddresses[chainId]["nftFactory"] = nftFactory.address;
    }

    // check if there is already nftFactory address in the object if not initialize it
    if ("weth" in currentAddresses[chainId]) {
      // check if address is the same as current address if not it will update it
      if (currentAddresses[chainId]["weth"] !== weth.address) {
        currentAddresses[chainId]["weth"] = weth.address;
      }
    } else {
      currentAddresses[chainId]["weth"] = weth.address;
    }
  } else {
    currentAddresses[chainId] = {
      marketplace: marketplace.address,
      auction: auction.address,
      nftFactory: nftFactory.address,
      weth: weth.address,
    };
  }

  fs.writeFileSync(
    frontend_contract_addresses_file,
    JSON.stringify(currentAddresses)
  );
}

module.exports.tags = ["all", "frontend"];
