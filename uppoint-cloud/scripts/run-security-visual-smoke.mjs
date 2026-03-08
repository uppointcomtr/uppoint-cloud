#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL ?? "https://cloud.uppoint.com.tr";
const timeoutMs = Number.parseInt(process.env.E2E_VISUAL_TIMEOUT_MS ?? "30000", 10);
const outputDir = path.resolve(
  process.cwd(),
  process.env.E2E_VISUAL_ARTIFACTS_DIR ?? "artifacts/security-visual-smoke",
);
const cookieName = process.env.E2E_VISUAL_SESSION_COOKIE_NAME ?? "__Secure-next-auth.session-token";
const cookieValue = process.env.E2E_VISUAL_SESSION_COOKIE ?? "";
const cookieDomainOverride = process.env.E2E_VISUAL_SESSION_COOKIE_DOMAIN?.trim() || "";
const requireAuth = process.env.E2E_VISUAL_REQUIRE_AUTH === "1";
const locales = ["tr", "en"];
const themes = ["light", "dark"];

function parseBaseUrl(input) {
  try {
    const url = new URL(input);
    if (!url.protocol.startsWith("http")) {
      throw new Error("E2E_BASE_URL must be http(s)");
    }
    return url;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid E2E_BASE_URL: ${reason}`);
  }
}

function resolveCookieDomain(base, override) {
  if (override.length > 0) {
    return override;
  }

  return base.hostname;
}

async function run() {
  const base = parseBaseUrl(baseUrl);
  const cookieDomain = resolveCookieDomain(base, cookieDomainOverride);

  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const locale of locales) {
      for (const theme of themes) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });

        if (cookieValue) {
          await context.addCookies([
            {
              name: cookieName,
              value: cookieValue,
              domain: cookieDomain,
              path: "/",
              httpOnly: true,
              secure: base.protocol === "https:",
              sameSite: "Lax",
            },
          ]);
        }

        const page = await context.newPage();
        await page.addInitScript((currentTheme) => {
          try {
            localStorage.setItem("uppoint-theme", currentTheme);
            document.documentElement.dataset.theme = currentTheme;
            if (currentTheme === "dark") {
              document.documentElement.classList.add("dark");
            } else {
              document.documentElement.classList.remove("dark");
            }
          } catch {
            // Ignore localStorage init failures in smoke mode.
          }
        }, theme);

        const targetUrl = new URL(`/${locale}/dashboard/security`, base).toString();
        let responseStatus = null;
        let navigationError = null;

        try {
          const response = await page.goto(targetUrl, {
            waitUntil: "networkidle",
            timeout: timeoutMs,
          });
          responseStatus = response?.status() ?? null;
          await page.waitForTimeout(500);
        } catch (error) {
          navigationError = error instanceof Error ? error.message : String(error);
        }

        const finalUrl = page.url();
        let finalPath = "";
        try {
          finalPath = new URL(finalUrl).pathname;
        } catch {
          finalPath = finalUrl;
        }

        const redirectedToLogin = /\/(tr|en)\/login(\/)?$/.test(finalPath);
        const screenshotPath = path.join(outputDir, `dashboard-security-${locale}-${theme}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        results.push({
          locale,
          theme,
          targetUrl,
          finalUrl,
          finalPath,
          responseStatus,
          redirectedToLogin,
          navigationError,
          screenshotPath,
          authCookieConfigured: cookieValue.length > 0,
        });

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const summaryPath = path.join(outputDir, "summary.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl: base.toString(),
        requireAuth,
        authCookieConfigured: cookieValue.length > 0,
        results,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const markdownRows = results
    .map((item) => {
      const status = item.redirectedToLogin ? "redirected_to_login" : "dashboard_accessed";
      const nav = item.navigationError ? `error: ${item.navigationError}` : "ok";
      return `| ${item.locale} | ${item.theme} | ${item.responseStatus ?? "n/a"} | ${status} | ${nav} | ${path.basename(item.screenshotPath)} |`;
    })
    .join("\n");

  const markdown = [
    "# Dashboard Security Visual Smoke",
    "",
    `- Base URL: ${base.toString()}`,
    `- Require auth: ${requireAuth}`,
    `- Auth cookie configured: ${cookieValue.length > 0}`,
    "",
    "| Locale | Theme | HTTP | Result | Navigation | Screenshot |",
    "|---|---|---:|---|---|---|",
    markdownRows,
    "",
  ].join("\n");

  const markdownPath = path.join(outputDir, "summary.md");
  await writeFile(markdownPath, markdown, "utf8");

  const authFailures = results.filter((item) => item.redirectedToLogin || item.navigationError);
  if (requireAuth && authFailures.length > 0) {
    console.error(
      `[visual-smoke] FAIL: authenticated visual smoke expected dashboard access, failures=${authFailures.length}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[visual-smoke] completed: scenarios=${results.length} output=${outputDir} requireAuth=${requireAuth}`,
  );
}

run().catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`[visual-smoke] failed: ${reason}`);
  process.exit(1);
});
