import "server-only";

import { sendSmsNotification } from "@/modules/notifications/server/channel-delivery";

export async function sendAuthSms(options: {
  to: string;
  message: string;
}) {
  await sendSmsNotification({
    to: options.to,
    message: options.message,
  });
}
