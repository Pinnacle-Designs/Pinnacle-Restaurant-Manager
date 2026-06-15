import { bumpMenuRevision } from "./stock";
import { publishMenuToAllEnabledChannels } from "./publish";

/** Call after any menu item create/update/delete — bumps revision and syncs channels. */
export async function onMenuChanged(locationId: string) {
  await bumpMenuRevision(locationId);
  await publishMenuToAllEnabledChannels(locationId);
}
