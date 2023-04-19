const { network } = require("hardhat");

// reason for deploying this contract is getting the abi
module.exports = async ({ deployments, getNamedAccounts }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  const args = ["collection", "CL", 100, deployer, deployer];

  const nftCollection = await deploy("NFTCollection", {
    from: deployer,
    log: true,
    args: args,
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  log("-------------------------------------");
};

module.exports.tags = ["all", "nftcollection"];
