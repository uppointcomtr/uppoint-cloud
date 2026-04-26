import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  createSafePathSegment,
  InstanceIsoUploadError,
  prepareIsoUploadDescriptor,
  resolveIsoUploadTarget,
  sanitizeIsoFileName,
  writeIsoUploadStream,
} from "@/modules/instances/server/iso-upload-service";

function streamFromText(value: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(value));
      controller.close();
    },
  });
}

describe("ISO upload service", () => {
  it("normalizes ISO filenames and storage path segments", () => {
    expect(sanitizeIsoFileName("Ubuntu Server 24.04.iso")).toBe("Ubuntu-Server-24.04.iso");
    expect(createSafePathSegment("tenant/../one")).toBe("tenant-..-one");
  });

  it("rejects non-ISO filenames and unsupported content types", () => {
    expect(() =>
      prepareIsoUploadDescriptor({
        originalFileName: "ubuntu.img",
        contentType: "application/octet-stream",
        maxSizeBytes: 1024,
      }),
    ).toThrow(InstanceIsoUploadError);

    expect(() =>
      prepareIsoUploadDescriptor({
        originalFileName: "ubuntu.iso",
        contentType: "text/plain",
        maxSizeBytes: 1024,
      }),
    ).toThrow(InstanceIsoUploadError);
  });

  it("rejects declared sizes above the configured limit", () => {
    expect(() =>
      prepareIsoUploadDescriptor({
        originalFileName: "ubuntu.iso",
        contentType: "application/octet-stream",
        declaredSizeBytes: 2048,
        maxSizeBytes: 1024,
      }),
    ).toThrow(InstanceIsoUploadError);
  });

  it("streams uploads to a temporary file before final rename", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uppoint-iso-upload-"));

    try {
      const target = resolveIsoUploadTarget({
        rootDirectory: root,
        pathSegment: "tenant-1",
        storedFileName: "test.iso",
      });

      const result = await writeIsoUploadStream({
        body: streamFromText("iso-data"),
        target,
        maxSizeBytes: 1024,
      });

      await expect(readFile(target.finalPath, "utf8")).resolves.toBe("iso-data");
      expect(result.sizeBytes).toBe(8);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects streamed uploads once the configured size limit is exceeded", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uppoint-iso-upload-"));

    try {
      const target = resolveIsoUploadTarget({
        rootDirectory: root,
        pathSegment: "tenant-1",
        storedFileName: "oversized.iso",
      });

      await expect(
        writeIsoUploadStream({
          body: streamFromText("too-large"),
          target,
          maxSizeBytes: 3,
        }),
      ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
