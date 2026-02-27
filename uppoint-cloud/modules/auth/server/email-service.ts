import "server-only";

import nodemailer from "nodemailer";

import { env } from "@/lib/env/server";

let transporter: nodemailer.Transporter | null = null;

function getRequiredSmtpConfig() {
  if (
    !env.UPPOINT_EMAIL_HOST ||
    !env.UPPOINT_EMAIL_PORT ||
    !env.UPPOINT_EMAIL_HOST_USER ||
    !env.UPPOINT_EMAIL_HOST_PASSWORD ||
    !env.UPPOINT_DEFAULT_FROM_EMAIL
  ) {
    throw new Error("SMTP configuration is incomplete");
  }

  return {
    fromEmail: env.UPPOINT_DEFAULT_FROM_EMAIL,
    host: env.UPPOINT_EMAIL_HOST,
    port: env.UPPOINT_EMAIL_PORT,
    user: env.UPPOINT_EMAIL_HOST_USER,
    password: env.UPPOINT_EMAIL_HOST_PASSWORD,
  };
}

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const smtpConfig = getRequiredSmtpConfig();

  transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: false,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.password,
    },
    requireTLS: env.UPPOINT_EMAIL_USE_TLS,
  });

  return transporter;
}

export async function sendAuthEmail(options: {
  to: string;
  subject: string;
  text: string;
}) {
  if (env.UPPOINT_EMAIL_BACKEND === "disabled") {
    return;
  }

  const smtpConfig = getRequiredSmtpConfig();
  const smtpTransporter = getTransporter();

  await smtpTransporter.sendMail({
    from: smtpConfig.fromEmail,
    to: options.to,
    subject: options.subject,
    text: options.text,
  });
}
