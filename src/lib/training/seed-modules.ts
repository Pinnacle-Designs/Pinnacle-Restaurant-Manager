import { prisma } from "@/lib/prisma";
import { DEFAULT_TRAINING_MODULES } from "./catalog";

export async function getOrCreateTrainingSettings(locationId: string) {
  return prisma.trainingSettings.upsert({
    where: { locationId },
    create: { locationId },
    update: {},
  });
}

export async function ensureDefaultTrainingModules(locationId: string) {
  await getOrCreateTrainingSettings(locationId);

  for (const mod of DEFAULT_TRAINING_MODULES) {
    await prisma.trainingModule.upsert({
      where: {
        locationId_moduleKey: { locationId, moduleKey: mod.moduleKey },
      },
      create: {
        locationId,
        moduleKey: mod.moduleKey,
        title: mod.title,
        kind: mod.kind,
        summary: mod.summary,
        content: mod.content,
        estimatedMinutes: mod.estimatedMinutes,
        required: mod.required,
        renewalMonths: mod.renewalMonths,
        active: true,
      },
      update: {
        title: mod.title,
        summary: mod.summary,
        content: mod.content,
        estimatedMinutes: mod.estimatedMinutes,
        renewalMonths: mod.renewalMonths,
      },
    });
  }
}
