import "server-only";

import { env } from "@/lib/env";

function getRequiredSmsConfig() {
  if (
    !env.UPPOINT_SMS_API_URL ||
    !env.UPPOINT_SMS_USERNAME ||
    !env.UPPOINT_SMS_PASSWORD ||
    !env.UPPOINT_SMS_SOURCE_ADDR
  ) {
    throw new Error("SMS configuration is incomplete");
  }

  return {
    apiUrl: env.UPPOINT_SMS_API_URL,
    username: env.UPPOINT_SMS_USERNAME,
    password: env.UPPOINT_SMS_PASSWORD,
    sourceAddr: env.UPPOINT_SMS_SOURCE_ADDR,
    validFor: env.UPPOINT_SMS_VALID_FOR,
    datacoding: env.UPPOINT_SMS_DATACODING,
  };
}

function normalizeSmsDestination(phone: string) {
  return phone.replace(/\D/g, "");
}

function buildBasicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export async function sendAuthSms(options: {
  to: string;
  message: string;
}) {
  if (!env.UPPOINT_SMS_ENABLED) {
    return;
  }

  const smsConfig = getRequiredSmsConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  const body: Record<string, unknown> = {
    source_addr: smsConfig.sourceAddr,
    valid_for: smsConfig.validFor,
    datacoding: smsConfig.datacoding,
    messages: [
      {
        msg: options.message,
        dest: normalizeSmsDestination(options.to),
      },
    ],
  };

  // Backward-compatibility toggle for SMS providers requiring body credentials.
  if (env.UPPOINT_SMS_INCLUDE_BODY_CREDENTIALS) {
    body.username = smsConfig.username;
    body.password = smsConfig.password;
  }

  const response = await fetch(smsConfig.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildBasicAuthHeader(smsConfig.username, smsConfig.password),
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });

  if (!response.ok) {
    const upstreamRequestId =
      response.headers.get("x-request-id")
      || response.headers.get("x-correlation-id")
      || response.headers.get("x-trace-id");
    throw new Error(
      upstreamRequestId
        ? `SMS request failed: status ${response.status}, request ${upstreamRequestId}`
        : `SMS request failed: status ${response.status}`,
    );
  }
}
