const { network } = require("hardhat");
const { verify } = require("../utils/verify");
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;
  // constructor required arguments
  const args = [25, deployer]; // fee in percentage 25 = 2.5% ,fee recipient

  // deploying the contract
  const marketplace = await deploy("Marketplace", {
    from: deployer,
    log: true,
    args: args,
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  // if it was not on localhost verify the contract on ether scan
  if (chainId !== 31337) {
    await verify(marketplace.address, args);
  }

  log("-------------------------------------");
};

module.exports.tags = ["all", "marketplace"];
