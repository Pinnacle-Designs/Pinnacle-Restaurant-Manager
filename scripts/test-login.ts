import { loadEnvFile } from "./production-checklist-utils";
import { loginUser } from "../src/lib/auth";

async function main() {
  loadEnvFile();
  const email = process.argv[2] ?? "pro-clean@pinnacle.app";
  const password = process.argv[3] ?? "PinnaclePro2026!";
  const user = await loginUser(email, password);
  if (!user) {
    console.log("LOGIN_FAILED");
    process.exit(1);
  }
  console.log("LOGIN_OK", { email: user.email, role: user.role, locationId: user.locationId });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
