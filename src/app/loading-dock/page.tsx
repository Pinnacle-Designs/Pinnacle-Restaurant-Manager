import { redirect } from "next/navigation";

/** Renamed to Purchase Orders. */
export default function LoadingDockRedirectPage() {
  redirect("/purchase-orders");
}
