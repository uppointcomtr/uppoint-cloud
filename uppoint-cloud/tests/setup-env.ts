function setEnvIfMissing(key: string, value: string) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

setEnvIfMissing("NODE_ENV", "test");
setEnvIfMissing("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
setEnvIfMissing(
  "DATABASE_URL",
  "postgresql://postgres:postgres@localhost:5432/uppoint_cloud?schema=public",
);
setEnvIfMissing("AUTH_SECRET", "test-secret-that-is-at-least-32-characters-long");
setEnvIfMissing("AUTH_TRUST_HOST", "true");
setEnvIfMissing("AUTH_BCRYPT_ROUNDS", "10");
setEnvIfMissing("UPPOINT_EMAIL_BACKEND", "disabled");
setEnvIfMissing("UPPOINT_SMS_ENABLED", "false");
