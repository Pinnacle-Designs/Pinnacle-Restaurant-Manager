import { prisma } from "./prisma";
import type { SessionUser } from "./session";

export async function resolveUserWorkspace(user: SessionUser) {
  if (user.locationId) {
    const location = await prisma.location.findUnique({ where: { id: user.locationId } });
    if (location?.active) {
      return { locationId: location.id, locationName: location.name };
    }
  }

  if (user.role !== "OWNER") {
    throw new Error(
      "Your account is not linked to a restaurant yet. Ask your manager to add you to their team."
    );
  }

  const location = await prisma.location.create({
    data: {
      name: `${user.name}'s Restaurant`,
      address: "Add your address",
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { locationId: location.id },
  });

  return { locationId: location.id, locationName: location.name };
}
