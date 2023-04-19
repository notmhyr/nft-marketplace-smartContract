require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-ethers");
require("hardhat-deploy");
require("dotenv").config();

const rpc_url = process.env.SEPOLIA_RPC_URL;
const private_key = process.env.PRIVATE_KEY;
const etherscan_api_key = process.env.ETHERSCAN_API_KEY;
const goerli_rpc_url = process.env.GOERLI_RPC_URL;
module.exports = {
  solidity: "0.8.17",
  networks: {
    sepolia: {
      chainId: 11155111,
      url: rpc_url,
      accounts: [private_key],
      blockConfirmation: 6,
    },
    localhost: {
      chainId: 31337,
    },
    goerli: {
      chainId: 5,
      url: goerli_rpc_url,
      accounts: [private_key],
      blockConfirmation: 6,
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  etherscan: {
    apiKey: {
      sepolia: etherscan_api_key,
      goerli: etherscan_api_key,
    },
  },
};
