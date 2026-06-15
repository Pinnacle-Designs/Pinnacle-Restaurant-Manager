import { redirect } from "next/navigation";

/** POS is unified under Orders — keep old bookmarks working. */
export default function PosPage() {
  redirect("/orders?view=serve");
}
