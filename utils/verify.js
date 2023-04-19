const { run } = require("hardhat");

// Verifying the contract on ether scan programmatically
const verify = async (contractAddress, args) => {
  console.log("Verifying the contract");
  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: args,
    });
  } catch (error) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log("already verified");
    } else {
      console.log(error);
    }
  }
};

module.exports = { verify };
