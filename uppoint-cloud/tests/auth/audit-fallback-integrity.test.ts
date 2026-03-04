import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendFileMock,
  mkdirMock,
  readFileMock,
  writeFileMock,
  headersMock,
  transactionMock,
} = vi.hoisted(() => ({
  appendFileMock: vi.fn().mockResolvedValue(undefined),
  mkdirMock: vi.fn().mockResolvedValue(undefined),
  readFileMock: vi.fn().mockRejectedValue(new Error("ENOENT")),
  writeFileMock: vi.fn().mockResolvedValue(undefined),
  headersMock: vi.fn().mockResolvedValue(new Headers()),
  transactionMock: vi.fn().mockRejectedValue(new Error("DB_DOWN")),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("fs/promises", () => ({
  appendFile: appendFileMock,
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
}));

vi.mock("@/db/client", () => ({
  prisma: {
    $transaction: transactionMock,
  },
}));

import { logAudit } from "@/lib/audit-log";

describe("audit fallback integrity chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appendFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    readFileMock.mockRejectedValue(new Error("ENOENT"));
    writeFileMock.mockResolvedValue(undefined);
    headersMock.mockResolvedValue(new Headers());
    transactionMock.mockRejectedValue(new Error("DB_DOWN"));
  });

  it("writes fallback records with signed integrity metadata", async () => {
    await logAudit("password_reset_failed", "203.0.113.1", "user_1", {
      reason: "DB_DOWN",
      token: "sensitive-value",
      attempts: ["Bearer abc.def.ghi"],
    });

    expect(appendFileMock).toHaveBeenCalledTimes(1);
    const [, line] = appendFileMock.mock.calls[0] as [string, string];
    const parsed = JSON.parse(line.trim()) as Record<string, unknown>;
    const metadata = parsed.metadata as Record<string, unknown>;

    expect(metadata.token).toBe("[REDACTED]");
    expect(metadata.attempts).toEqual(["[REDACTED]"]);
    expect(parsed.fallbackIntegrity).toEqual(
      expect.objectContaining({
        version: "fallback/v1",
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        signature: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(writeFileMock).toHaveBeenCalledTimes(1);
  });

  it("recovers previous hash from fallback log when chain-state file is missing", async () => {
    const previousHash = "b".repeat(64);
    readFileMock.mockImplementation(async (path: string) => {
      if (path.includes("audit-fallback-chain.state")) {
        throw new Error("ENOENT");
      }

      if (path.includes("audit-fallback.log")) {
        return JSON.stringify({
          fallbackIntegrity: {
            version: "fallback/v1",
            hash: previousHash,
            signature: "c".repeat(64),
          },
        });
      }

      throw new Error("ENOENT");
    });

    await logAudit("password_reset_failed", "203.0.113.2", "user_2", {
      reason: "DB_DOWN",
    });

    expect(appendFileMock).toHaveBeenCalledTimes(1);
    const [, line] = appendFileMock.mock.calls[0] as [string, string];
    const parsed = JSON.parse(line.trim()) as Record<string, unknown>;
    const fallbackIntegrity = parsed.fallbackIntegrity as Record<string, unknown>;

    expect(fallbackIntegrity.previousHash).toBe(previousHash);
    expect(fallbackIntegrity.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
