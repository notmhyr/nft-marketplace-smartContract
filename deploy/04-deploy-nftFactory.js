const { network } = require("hardhat");
const { verify } = require("../utils/verify");
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  const Fee = ethers.utils.parseEther("0.001");
  // constructor required arguments
  const args = [Fee, deployer]; // fee for creating each collection,fee recipient

  // deploying the contract
  const nftFactory = await deploy("NFTFactory", {
    from: deployer,
    log: true,
    args: args,
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  // if it was not on localhost verify the contract on ether scan
  if (chainId !== 31337) {
    await verify(nftFactory.address, args);
  }

  log("-------------------------------------");
};

module.exports.tags = ["all", "nftfactory"];
