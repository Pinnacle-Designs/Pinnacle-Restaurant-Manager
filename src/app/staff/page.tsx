import { prisma } from "@/lib/prisma";
import { getLocationId } from "@/lib/location";
import { getEnrichedSessionUser } from "@/lib/location-plan";
import { hasPermissionInList } from "@/lib/permissions";
import { stripSalaries } from "@/lib/api-auth";
import { PageHeader } from "@/components/ui";
import { StaffPageClient } from "@/components/staff/StaffPageClient";

export default async function StaffPage() {
  const locationId = await getLocationId();
  const user = await getEnrichedSessionUser();
  const staff = await prisma.staffMember.findMany({
    where: { locationId },
    orderBy: { name: "asc" },
  });

  const safeStaff = user ? stripSalaries(user.role, staff, user.permissions) : staff;

  return (
    <div>
      <PageHeader
        title="Staff"
        description={
          user && hasPermissionInList(user.permissions, "manage_hiring")
            ? "Hiring, training & certifications, payroll, schedules, and team"
            : user && hasPermissionInList(user.permissions, "manage_training")
              ? "Certification tracking, compliance training, payroll, and schedules"
              : user && hasPermissionInList(user.permissions, "manage_payroll")
            ? "Payroll, schedules, tip pooling, and team roster"
            : user && hasPermissionInList(user.permissions, "edit_staff")
              ? "Manage your team and build weekly schedules"
              : "View your team roster"
        }
      />
      <StaffPageClient initialStaff={safeStaff} />
    </div>
  );
}
