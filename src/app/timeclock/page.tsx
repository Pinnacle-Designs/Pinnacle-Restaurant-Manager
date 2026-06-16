import { PageHeader } from "@/components/ui";
import { TimeClockClient } from "@/components/staff/TimeClockClient";

export default function TimeClockPage() {
  return (
    <div>
      <PageHeader
        title="Time Clock"
        description="Shared kiosk — pick your name, enter PIN, then verify per fraud prevention settings"
      />
      <TimeClockClient />
    </div>
  );
}
