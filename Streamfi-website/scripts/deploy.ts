import { network } from "hardhat";

async function main() {
	const connection = await network.connect();
	const { viem } = connection;

	const [deployer] = await viem.getWalletClients();
	const platformAddress = deployer.account.address;

	console.log("Deploying StreamFiPayment to network:", connection.networkName);
	console.log("Deployer / platform address:", platformAddress);

	const streamFiPayment = await viem.deployContract("StreamFiPayment", [platformAddress]);

	console.log("StreamFiPayment deployed at:", streamFiPayment.address);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

