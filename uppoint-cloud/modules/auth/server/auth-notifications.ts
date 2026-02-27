import "server-only";

import { env } from "@/lib/env/server";

import { sendAuthEmail } from "./email-service";
import { sendAuthSms } from "./sms-service";

interface AuthNotificationInput {
  email: string;
  name: string | null;
  phone?: string | null;
}

export async function sendRegistrationNotifications(input: AuthNotificationInput) {
  const displayName = input.name?.trim() || "User";

  if (env.UPPOINT_EMAIL_BACKEND !== "disabled") {
    await sendAuthEmail({
      to: input.email,
      subject: "Welcome to Uppoint Cloud",
      text: `Hello ${displayName}, your Uppoint Cloud account has been created successfully.`,
    });
  }

  if (env.UPPOINT_SMS_ENABLED && input.phone) {
    await sendAuthSms({
      to: input.phone,
      message: `Uppoint Cloud: Hello ${displayName}, your account is now active.`,
    });
  }
}
