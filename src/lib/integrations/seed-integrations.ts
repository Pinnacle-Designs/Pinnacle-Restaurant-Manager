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

  const usFoods = await prisma.vendorEdiConnection.findFirst({
    where: { locationId, provider: "US_FOODS" },
  });
  if (!usFoods) {
    await connectVendorEdi(locationId, "US_FOODS");
    try {
      await syncVendorCatalog(locationId, "US_FOODS");
    } catch {
      // partial seed ok
    }
  }

  const xero = await prisma.accountingConnection.findFirst({
    where: { locationId, provider: "XERO" },
  });
  if (!xero) {
    await connectAccountingProvider(locationId, "XERO", "Smoky Oak BBQ (Xero sandbox)");
  }

  const gfs = await prisma.vendorEdiConnection.findFirst({
    where: { locationId, provider: "GORDON_FOOD_SERVICE" },
  });
  if (!gfs) {
    await connectVendorEdi(locationId, "GORDON_FOOD_SERVICE");
    try {
      await syncVendorCatalog(locationId, "GORDON_FOOD_SERVICE");
    } catch {
      // partial seed ok
    }
  }
}
