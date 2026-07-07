import { NextResponse } from "next/server";

/** Prisma where clause: resource must belong to the signed-in tenant location. */
export function tenantWhere(id: string, locationId: string) {
  return { id, locationId };
}

/** Child resources (e.g. order items) scoped through a parent with locationId. */
export function tenantChildWhere<T extends string>(
  id: string,
  locationId: string,
  parentKey: T
) {
  return { id, [parentKey]: { locationId } } as { id: string } & Record<T, { locationId: string }>;
}

export function tenantNotFoundResponse(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}
