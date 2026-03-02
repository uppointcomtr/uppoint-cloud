import { describe, expect, it, vi } from "vitest";

import {
  dispatchNotificationOutboxBatch,
  enqueueEmailNotification,
} from "@/modules/notifications/server/outbox";

describe("notification outbox", () => {
  it("skips enqueue when email backend is disabled", async () => {
    const createOutboxRecord = vi.fn();

    await enqueueEmailNotification(
      {
        to: "user@example.com",
        subject: "Test",
        text: "Body",
      },
      { createOutboxRecord },
    );

    expect(createOutboxRecord).not.toHaveBeenCalled();
  });

  it("dispatches and marks sent notifications", async () => {
    const findDueRecords = async () => ([
      {
        id: "evt_1",
        channel: "EMAIL" as const,
        recipient: "user@example.com",
        subject: "Subject",
        body: "Body",
        attemptCount: 0,
        maxAttempts: 5,
      },
    ]);
    const acquireLock = vi.fn(async () => true);
    const sendEmail = vi.fn(async () => {});
    const sendSms = vi.fn(async () => {});
    const markSent = vi.fn(async () => {});
    const markFailedAttempt = vi.fn(async () => {});

    const result = await dispatchNotificationOutboxBatch(
      { batchSize: 10, lockOwner: "worker-a" },
      {
        now: () => new Date("2026-03-02T08:00:00.000Z"),
        createOutboxRecord: vi.fn(async () => {}),
        findDueRecords,
        acquireLock,
        markSent,
        markFailedAttempt,
        sendEmail,
        sendSms,
      },
    );

    expect(result).toEqual({ inspected: 1, sent: 1, failed: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(markSent).toHaveBeenCalledTimes(1);
    expect(markFailedAttempt).not.toHaveBeenCalled();
  });

  it("marks notification as failed after max attempts", async () => {
    const now = new Date("2026-03-02T08:00:00.000Z");
    const markFailedAttempt = vi.fn(async () => {});

    const result = await dispatchNotificationOutboxBatch(
      { batchSize: 10, lockOwner: "worker-b" },
      {
        now: () => now,
        createOutboxRecord: vi.fn(async () => {}),
        findDueRecords: async () => ([
          {
            id: "evt_2",
            channel: "SMS" as const,
            recipient: "+905551112233",
            subject: null,
            body: "123456",
            attemptCount: 4,
            maxAttempts: 5,
          },
        ]),
        acquireLock: async () => true,
        markSent: vi.fn(async () => {}),
        markFailedAttempt,
        sendEmail: vi.fn(async () => {}),
        sendSms: vi.fn(async () => {
          throw new Error("provider down");
        }),
      },
    );

    expect(result).toEqual({ inspected: 1, sent: 0, failed: 1 });
    expect(markFailedAttempt).toHaveBeenCalledTimes(1);
    expect(markFailedAttempt).toHaveBeenCalledWith(expect.objectContaining({
      id: "evt_2",
      nextStatus: "FAILED",
      nextAttemptCount: 5,
      errorMessage: "provider down",
    }));
  });
});
