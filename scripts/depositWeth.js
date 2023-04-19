const { ethers } = require("hardhat");

async function main() {
  const weth = await ethers.getContract("WETH");
  [deployer, user1, user2] = await ethers.getSigners();

  const user1Weth = weth.connect(user1);
  const user2Weth = weth.connect(user2);

  const amount = ethers.utils.parseEther("15");
  await user1Weth.deposit({ value: amount });
  await user2Weth.deposit({ value: amount });

  console.log("exchanged eth to weth");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
