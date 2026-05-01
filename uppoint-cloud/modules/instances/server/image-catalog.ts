import "server-only";

import { readFile, readdir } from "fs/promises";
import path from "path";
import { z } from "zod";

import type { ImageCatalogItem } from "@/modules/instances/domain/catalog";

const APPROVED_IMAGE_CATALOG_DIRECTORY = path.join(
  process.cwd(),
  "modules",
  "instances",
  "image-catalog",
);

const imageManifestSchema = z.object({
  code: z.string().trim().min(2).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*[A-Za-z0-9]$/),
  label: z.string().trim().min(2).max(120),
  family: z.enum(["linux", "windows"]),
  enabled: z.boolean().optional().default(true),
});

export class InstanceImageCatalogError extends Error {
  constructor(
    public readonly code:
      | "IMAGE_CATALOG_UNREADABLE"
      | "IMAGE_CATALOG_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "InstanceImageCatalogError";
  }
}

function resolveCatalogDirectory(): string {
  return APPROVED_IMAGE_CATALOG_DIRECTORY;
}

export async function loadApprovedInstanceImageCatalog(): Promise<ImageCatalogItem[]> {
  const catalogDirectory = resolveCatalogDirectory();
  let entries: string[];

  try {
    entries = await readdir(catalogDirectory);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw new InstanceImageCatalogError(
      "IMAGE_CATALOG_UNREADABLE",
      `Instance image catalog cannot be read from ${catalogDirectory}`,
    );
  }

  const imageManifests = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right))
      .map(async (entry) => {
        const filePath = path.join(catalogDirectory, entry);
        const raw = await readFile(filePath, "utf8");
        let manifest: unknown;

        try {
          manifest = JSON.parse(raw);
        } catch {
          throw new InstanceImageCatalogError(
            "IMAGE_CATALOG_INVALID",
            `Instance image catalog manifest is invalid JSON: ${entry}`,
          );
        }

        const parsed = imageManifestSchema.safeParse(manifest);

        if (!parsed.success) {
          throw new InstanceImageCatalogError(
            "IMAGE_CATALOG_INVALID",
            `Instance image catalog manifest is invalid: ${entry}`,
          );
        }

        return parsed.data;
      }),
  );

  const approvedImages = imageManifests
    .filter((image) => image.enabled)
    .map(({ code, label, family }) => ({ code, label, family }));

  const seenCodes = new Set<string>();
  for (const image of approvedImages) {
    if (seenCodes.has(image.code)) {
      throw new InstanceImageCatalogError(
        "IMAGE_CATALOG_INVALID",
        `Instance image catalog contains duplicate image code: ${image.code}`,
      );
    }
    seenCodes.add(image.code);
  }

  return approvedImages;
}

export function findApprovedImageByCode(
  imageCatalog: ImageCatalogItem[],
  code: string,
): ImageCatalogItem | null {
  return imageCatalog.find((item) => item.code === code) ?? null;
}
