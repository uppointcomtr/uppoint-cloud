import { describe, expect, it } from "vitest";

import {
  findApprovedImageByCode,
  loadApprovedInstanceImageCatalog,
} from "@/modules/instances/server/image-catalog";

describe("approved instance image catalog", () => {
  it("loads only approved image manifests from the module catalog folder", async () => {
    await expect(loadApprovedInstanceImageCatalog()).resolves.toEqual([
      { code: "almalinux-9", label: "AlmaLinux 9", family: "linux" },
      { code: "debian-12", label: "Debian 12", family: "linux" },
      { code: "ubuntu-24-04-lts", label: "Ubuntu Server 24.04 LTS", family: "linux" },
    ]);
  });

  it("finds images from a caller-provided approved catalog", () => {
    expect(
      findApprovedImageByCode(
        [{ code: "images:ubuntu/24.04/cloud", label: "Ubuntu 24.04 Cloud", family: "linux" }],
        "images:ubuntu/24.04/cloud",
      ),
    ).toEqual({
      code: "images:ubuntu/24.04/cloud",
      label: "Ubuntu 24.04 Cloud",
      family: "linux",
    });
  });
});
