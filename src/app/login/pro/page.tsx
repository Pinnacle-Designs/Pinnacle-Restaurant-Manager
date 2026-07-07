import { redirect } from "next/navigation";

/** Legacy URL — pro-clean uses the standard sign-in page. */
export default function ProCleanLoginPage() {
  redirect("/login");
}
