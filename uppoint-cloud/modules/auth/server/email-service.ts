import "server-only";

import { sendEmailNotification } from "@/modules/notifications/server/channel-delivery";

export async function sendAuthEmail(options: {
  to: string;
  subject: string;
  text: string;
}) {
  await sendEmailNotification({
    to: options.to,
    subject: options.subject,
    text: options.text,
  });
}
