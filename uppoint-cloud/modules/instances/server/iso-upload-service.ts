import "server-only";

import { randomUUID } from "crypto";
import { once } from "events";
import { createWriteStream } from "fs";
import { chmod, mkdir, rename, unlink } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { z } from "zod";

const ISO_UPLOAD_CONTENT_TYPES = new Set([
  "",
  "application/octet-stream",
  "application/x-cd-image",
  "application/x-iso9660-image",
]);

const isoUploadDescriptorSchema = z.object({
  originalFileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().max(120).nullable().optional(),
  declaredSizeBytes: z.coerce.number().int().min(0).nullable().optional(),
  maxSizeBytes: z.number().int().min(1),
});

export type InstanceIsoUploadErrorCode =
  | "VALIDATION_FAILED"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "MISSING_BODY"
  | "EMPTY_UPLOAD"
  | "STORAGE_WRITE_FAILED";

export class InstanceIsoUploadError extends Error {
  constructor(
    public readonly code: InstanceIsoUploadErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "InstanceIsoUploadError";
  }
}

export interface IsoUploadDescriptor {
  originalFileName: string;
  storedFileName: string;
  declaredSizeBytes: number | null;
}

export interface IsoUploadTarget {
  targetDirectory: string;
  temporaryPath: string;
  finalPath: string;
}

function normalizeContentType(value: string | null | undefined): string {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function normalizeFileName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/[.-]+$/, "");
}

export function sanitizeIsoFileName(value: string): string {
  const normalized = normalizeFileName(value.trim());
  const withExtension = /\.iso$/i.test(normalized) ? normalized : `${normalized}.iso`;
  return withExtension.length > 0 ? withExtension.slice(0, 180) : "upload.iso";
}

export function createSafePathSegment(value: string): string {
  const normalized = normalizeFileName(value.trim());
  return normalized.length > 0 ? normalized.slice(0, 120) : "tenant";
}

export function prepareIsoUploadDescriptor(input: {
  originalFileName: string;
  contentType?: string | null;
  declaredSizeBytes?: number | null;
  maxSizeBytes: number;
}): IsoUploadDescriptor {
  const parsed = isoUploadDescriptorSchema.safeParse(input);
  if (!parsed.success) {
    throw new InstanceIsoUploadError("VALIDATION_FAILED", "Invalid ISO upload metadata", 400);
  }

  const originalFileName = parsed.data.originalFileName;
  if (/[/\\\0]/.test(originalFileName) || !/\.iso$/i.test(originalFileName)) {
    throw new InstanceIsoUploadError("VALIDATION_FAILED", "Only plain .iso file names are accepted", 400);
  }

  const contentType = normalizeContentType(parsed.data.contentType);
  if (!ISO_UPLOAD_CONTENT_TYPES.has(contentType)) {
    throw new InstanceIsoUploadError("UNSUPPORTED_FILE_TYPE", "Unsupported ISO upload content type", 415);
  }

  const declaredSizeBytes = parsed.data.declaredSizeBytes ?? null;
  if (declaredSizeBytes !== null && declaredSizeBytes > parsed.data.maxSizeBytes) {
    throw new InstanceIsoUploadError("FILE_TOO_LARGE", "ISO upload exceeds configured size limit", 413);
  }

  const safeFileName = sanitizeIsoFileName(originalFileName);
  const storedFileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}-${safeFileName}`;

  return {
    originalFileName,
    storedFileName,
    declaredSizeBytes,
  };
}

export function resolveIsoUploadTarget(input: {
  rootDirectory: string;
  pathSegment: string;
  storedFileName: string;
}): IsoUploadTarget {
  const rootDirectory = path.resolve(input.rootDirectory);
  const targetDirectory = path.resolve(rootDirectory, input.pathSegment);
  const finalPath = path.resolve(targetDirectory, input.storedFileName);
  const temporaryPath = path.resolve(targetDirectory, `${input.storedFileName}.${randomUUID()}.uploading`);
  const allowedPrefix = `${rootDirectory}${path.sep}`;

  if (
    !targetDirectory.startsWith(allowedPrefix)
    || !finalPath.startsWith(`${targetDirectory}${path.sep}`)
    || !temporaryPath.startsWith(`${targetDirectory}${path.sep}`)
  ) {
    throw new InstanceIsoUploadError("VALIDATION_FAILED", "Invalid ISO upload storage path", 400);
  }

  return {
    targetDirectory,
    temporaryPath,
    finalPath,
  };
}

async function finishWrite(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.end(resolve);
  });
}

export async function writeIsoUploadStream(input: {
  body: ReadableStream<Uint8Array> | null;
  target: IsoUploadTarget;
  maxSizeBytes: number;
}): Promise<{ sizeBytes: number }> {
  if (!input.body) {
    throw new InstanceIsoUploadError("MISSING_BODY", "ISO upload body is required", 400);
  }

  await mkdir(input.target.targetDirectory, { recursive: true, mode: 0o750 });

  const source = Readable.fromWeb(input.body as NodeReadableStream<Uint8Array>);
  const output = createWriteStream(input.target.temporaryPath, {
    flags: "wx",
    mode: 0o640,
  });
  let sizeBytes = 0;

  try {
    for await (const rawChunk of source) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      sizeBytes += chunk.byteLength;

      if (sizeBytes > input.maxSizeBytes) {
        source.destroy();
        throw new InstanceIsoUploadError("FILE_TOO_LARGE", "ISO upload exceeds configured size limit", 413);
      }

      if (!output.write(chunk)) {
        await once(output, "drain");
      }
    }

    await finishWrite(output);

    if (sizeBytes === 0) {
      throw new InstanceIsoUploadError("EMPTY_UPLOAD", "ISO upload body is empty", 400);
    }

    await rename(input.target.temporaryPath, input.target.finalPath);
    await chmod(input.target.finalPath, 0o640);

    return { sizeBytes };
  } catch (error) {
    output.destroy();
    await unlink(input.target.temporaryPath).catch(() => undefined);

    if (error instanceof InstanceIsoUploadError) {
      throw error;
    }

    throw new InstanceIsoUploadError("STORAGE_WRITE_FAILED", "ISO upload could not be written", 500);
  }
}
