import "server-only";

import nodemailer from "nodemailer";

import { env } from "@/lib/env";

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
  const enforceTls = env.NODE_ENV === "production" ? true : env.UPPOINT_EMAIL_USE_TLS;
  const useImplicitTls = enforceTls && smtpConfig.port === 465;

  transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: useImplicitTls,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.password,
    },
    requireTLS: enforceTls,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
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
