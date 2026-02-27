import "server-only";

import { env } from "@/lib/env/server";

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

export async function sendAuthSms(options: {
  to: string;
  message: string;
}) {
  if (!env.UPPOINT_SMS_ENABLED) {
    return;
  }

  const smsConfig = getRequiredSmsConfig();

  const response = await fetch(smsConfig.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: smsConfig.username,
      password: smsConfig.password,
      source_addr: smsConfig.sourceAddr,
      valid_for: smsConfig.validFor,
      datacoding: smsConfig.datacoding,
      messages: [
        {
          msg: options.message,
          dest: normalizeSmsDestination(options.to),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SMS request failed: ${response.status} ${errorBody}`);
  }
}
