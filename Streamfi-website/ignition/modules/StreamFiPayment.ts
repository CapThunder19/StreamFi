import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("StreamFiPaymentModule", (m) => {
  // Use the first account from the configured network as the platform
  const platform = m.getAccount(0);

  const streamFiPayment = m.contract("StreamFiPayment", [platform]);

  return { streamFiPayment };
});
