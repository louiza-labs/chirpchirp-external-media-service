// moultrieAuth.ts
import { chromium } from "playwright";

const LOGIN_URL =
  "https://login.moultriemobile.com/moultriemobile.onmicrosoft.com/b2c_1a_signup_signin/oauth2/v2.0/authorize?client_id=ab523e40-983c-4f89-adf8-e258d78cb689&scope=offline_access%20openid%20profile&redirect_uri=https%3A%2F%2Fweb.moultriemobile.com%2Fauthentication%2Flogin-callback&client-request-id=62f664ef-2783-421e-bf6a-df427d33573c&response_mode=fragment&response_type=code&x-client-SKU=msal.js.browser&x-client-VER=2.33.0&client_info=1&code_challenge=AJ57WDLf5r9Sf1UqZsBUNOLz2jN0m_1uQ_xGe-RFGP8&code_challenge_method=S256&nonce=cdf0e182-14e0-47b2-b959-d03ef6b90b53&state=eyJpZCI6ImFjZjRhNmEwLWQ1YWYtNGIzMS04N2VjLWIwMDUwMTlkZmVhZiIsIm1ldGEiOnsiaW50ZXJhY3Rpb25UeXBlIjoicmVkaXJlY3QifX0%3D%7C72452aaa-270c-4479-accc-3883369a720e";

let cachedToken: string | null = null;

export async function getValidToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  // Launch with persistent user data dir to preserve localStorage/cookies
  const browser = await chromium.launchPersistentContext("/tmp/chromium-data", {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  });

  const page = await browser.newPage();

  try {
    console.log("🌐 Navigating to Moultrie login...");
    await page.goto(LOGIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const currentUrl = page.url();
    const isLoginPage =
      currentUrl.includes("login.moultriemobile.com") ||
      currentUrl.includes("b2c_1a_signup_signin");

    if (isLoginPage) {
      if (!process.env.MOULTRIE_EMAIL || !process.env.MOULTRIE_PASSWORD) {
        console.log(
          "⚠️  Missing credentials, falling back to static bearer token."
        );
        await browser.close();
        return process.env.BEARER_TOKEN || "";
      }

      console.log("✅ Found email/password, performing login...");
      await page.waitForSelector("#signInName", { timeout: 15000 });
      await page.fill("#signInName", process.env.MOULTRIE_EMAIL!);
      await page.fill("#password", process.env.MOULTRIE_PASSWORD!);
      await Promise.all([page.click("#next")]);
    }

    // Wait for redirect to main app domain
    await page.waitForURL(/https?:\/\/web\.moultriemobile\.com/, {
      timeout: 60000,
    });
    await page.waitForLoadState("domcontentloaded");
    await new Promise((r) => setTimeout(r, 3000)); // let Blazor boot fully

    console.log("🪣 Attempting to read token from localStorage...");
    let token: string | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        token = await page.evaluate(() =>
          localStorage.getItem("MMBlazorBearerToken")
        );
        if (token) break;
      } catch (err) {
        const msg = String(err);
        if (msg.includes("Execution context was destroyed")) {
          console.log(
            "🔄 Navigation detected mid-read, waiting for stability..."
          );
          await page
            .waitForLoadState("networkidle", { timeout: 15000 })
            .catch(() => {});
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw err;
      }
      if (!token) {
        console.log(`🕓 Retry ${attempt + 1}/5: token not yet found...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    if (!token) {
      throw new Error(
        "❌ No MMBlazorBearerToken found in localStorage after retries."
      );
    }

    // Clean token formatting
    token = token.trim();
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      token = token.slice(1, -1).trim();
    }

    cachedToken = token;
    console.log("🔐 Successfully retrieved and cached token.");
    return token;
  } finally {
    await browser.close();
  }
}

export function clearTokenCache(): void {
  cachedToken = null;
}
