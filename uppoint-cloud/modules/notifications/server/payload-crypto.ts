import "server-only";

import { env } from "@/lib/env";
import {
  PAYLOAD_PREFIX,
  openNotificationPayloadWithSecret,
  sealNotificationPayloadWithSecret,
} from "@/modules/notifications/server/payload-crypto-core.mjs";

function getPayloadSecret(): string | null {
  return env.NOTIFICATION_PAYLOAD_SECRET ?? null;
}

export function sealNotificationPayload(plainText: string): string {
  const secret = getPayloadSecret();
  if (!secret) {
    return plainText;
  }

  return sealNotificationPayloadWithSecret(plainText, secret);
}

export function openNotificationPayload(storedValue: string): string {
  const prefix = `${PAYLOAD_PREFIX}:`;
  if (!storedValue.startsWith(prefix)) {
    return storedValue;
  }

  const secret = getPayloadSecret();
  if (!secret) {
    throw new Error("NOTIFICATION_PAYLOAD_SECRET is required to decrypt stored notification payload");
  }

  return openNotificationPayloadWithSecret(storedValue, secret);
}
