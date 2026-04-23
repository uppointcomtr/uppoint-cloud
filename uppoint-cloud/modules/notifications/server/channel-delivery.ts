import "server-only";

import nodemailer from "nodemailer";

import { env } from "@/lib/env";
import { renderSharedEmailTemplate } from "@/modules/notifications/server/email-template";

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
    pool: true,
    maxConnections: env.UPPOINT_EMAIL_POOL_MAX_CONNECTIONS,
    maxMessages: env.UPPOINT_EMAIL_POOL_MAX_MESSAGES,
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

export async function sendEmailNotification(input: {
  to: string;
  subject: string;
  text: string;
}) {
  if (env.UPPOINT_EMAIL_BACKEND === "disabled") {
    return;
  }

  const smtpConfig = getRequiredSmtpConfig();
  const smtpTransporter = getTransporter();
  const html = renderSharedEmailTemplate({
    appUrl: env.NEXT_PUBLIC_APP_URL,
    subject: input.subject,
    text: input.text,
  });

  await smtpTransporter.sendMail({
    from: smtpConfig.fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html,
  });
}

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

export async function sendSmsNotification(input: {
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
        msg: input.message,
        dest: normalizeSmsDestination(input.to),
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
