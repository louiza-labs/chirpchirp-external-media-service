// moultrieAuth.ts
import { chromium } from "playwright";

const LOGIN_URL =
  "https://login.moultriemobile.com/moultriemobile.onmicrosoft.com/b2c_1a_signup_signin/oauth2/v2.0/authorize?client_id=ab523e40-983c-4f89-adf8-e258d78cb689&scope=offline_access%20openid%20profile&redirect_uri=https%3A%2F%2Fweb.moultriemobile.com%2Fauthentication%2Flogin-callback&client-request-id=62f664ef-2783-421e-bf6a-df427d33573c&response_mode=fragment&response_type=code&x-client-SKU=msal.js.browser&x-client-VER=2.33.0&client_info=1&code_challenge=AJ57WDLf5r9Sf1UqZsBUNOLz2jN0m_1uQ_xGe-RFGP8&code_challenge_method=S256&nonce=cdf0e182-14e0-47b2-b959-d03ef6b90b53&state=eyJpZCI6ImFjZjRhNmEwLWQ1YWYtNGIzMS04N2VjLWIwMDUwMTlkZmVhZiIsIm1ldGEiOnsiaW50ZXJhY3Rpb25UeXBlIjoicmVkaXJlY3QifX0%3D%7C72452aaa-270c-4479-accc-3883369a720e";

let cachedToken: string | null = null;

export async function getValidToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  // Launch headless Chromium with all container-safe flags
  const browser = await chromium.launchPersistentContext("/tmp/chromium-data", {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--window-size=1280,800",
      "--start-maximized",
      "--disable-infobars",
      "--ignore-certificate-errors",
      "--enable-features=NetworkService,NetworkServiceInProcess",
      "--disable-features=IsolateOrigins,site-per-process",
      "--lang=en-US,en",
    ],
  });

  const page = await browser.newPage();

  // 🕵️ Add small stealth patches so Azure B2C treats this as real browser
  await browser.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  await browser.setExtraHTTPHeaders({
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36",
  });

  try {
    console.log("🌐 Navigating to Moultrie login...");
    await page.goto(LOGIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const currentUrl = page.url();
    const isLoginPage =
      currentUrl.includes("login.moultriemobile.com") ||
      currentUrl.includes("b2c_1a_signup_signin");

    if (isLoginPage) {
      if (!process.env.MOULTRIE_EMAIL || !process.env.MOULTRIE_PASSWORD) {
        console.log("⚠️  Missing credentials, using fallback bearer token.");
        await browser.close();
        return process.env.BEARER_TOKEN || "";
      }

      console.log("✅ Found email/password, performing login...");
      await page.waitForSelector("#signInName", { timeout: 20000 });
      await page.focus("#signInName");
      await page.keyboard.type(process.env.MOULTRIE_EMAIL!, { delay: 50 });
      await page.focus("#password");
      await page.keyboard.type(process.env.MOULTRIE_PASSWORD!, { delay: 50 });

      // Small pause to let validation scripts run
      await page.waitForTimeout(1000);

      // Sometimes #next is disabled until validation finishes
      await page
        .waitForFunction(
          () => {
            const btn = document.querySelector(
              "#next"
            ) as HTMLButtonElement | null;
            return btn && !btn.disabled;
          },
          { timeout: 10000 }
        )
        .catch(() => console.log("⚠️ Continue even if #next stays disabled"));

      console.log("👆 Clicking login button now...");
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 120000 }),
        page.click("#next", { delay: 100 }),
      ]);

      console.log("➡️ Clicked login, waiting for redirect...");
    }

    // Wait until redirected into the app
    try {
      await page.waitForURL(/https?:\/\/web\.moultriemobile\.com/, {
        timeout: 120000,
      });
      console.log("✅ Redirected to Moultrie web app");
    } catch {
      console.log(
        "⚠️ Timed out waiting for redirect, current URL:",
        page.url()
      );
    }

    // Wait for app to stabilize
    await page.waitForLoadState("domcontentloaded", { timeout: 60000 });
    await page.waitForTimeout(4000);

    console.log("🪣 Attempting to read token from localStorage...");
    let token: string | null = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        token = await page.evaluate(() =>
          localStorage.getItem("MMBlazorBearerToken")
        );
        if (token) break;
      } catch (err) {
        if (String(err).includes("Execution context was destroyed")) {
          console.log("🔄 Navigation detected mid-read, retrying...");
          await page.waitForTimeout(1500);
          continue;
        }
        throw err;
      }
      console.log(`🕓 Retry ${attempt + 1}/6: token not yet found...`);
      await page.waitForTimeout(2000);
    }

    if (!token) {
      throw new Error("❌ MMBlazorBearerToken not found after retries.");
    }

    // Cleanup token
    token = token.trim().replace(/^['"]|['"]$/g, "");
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
