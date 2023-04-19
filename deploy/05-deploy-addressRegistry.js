const { network } = require("hardhat");
const { verify } = require("../utils/verify");
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  // deploying the contract
  const addressRegistry = await deploy("AddressRegistry", {
    from: deployer,
    log: true,
    args: [],
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  // if it was not on localhost verify the contract on ether scan
  if (chainId !== 31337) {
    await verify(addressRegistry.address, []);
  }

  log("-------------------------------------");
};

module.exports.tags = ["all", "addressregistry"];
