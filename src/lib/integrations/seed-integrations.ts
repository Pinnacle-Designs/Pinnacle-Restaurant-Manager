import { prisma } from "@/lib/prisma";
import { connectAccountingProvider, syncAccountingToProvider } from "./accounting";
import { connectVendorEdi, syncVendorCatalog } from "./vendor-edi";
import { ensureIntegrationSettings } from "./pos-sync";

export async function seedIntegrationsSample(locationId: string) {
  await ensureIntegrationSettings(locationId);

  await connectAccountingProvider(locationId, "QUICKBOOKS", "Smoky Oak BBQ LLC");
  try {
    await syncAccountingToProvider(locationId, "QUICKBOOKS");
  } catch {
    // partial seed ok
  }

  await connectVendorEdi(locationId, "SYSCO");
  try {
    await syncVendorCatalog(locationId, "SYSCO");
  } catch {
    // inventory may not exist yet on first pass
  }
}
