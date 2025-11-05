// moultrieAuth.ts
import { chromium } from "playwright";

const LOGIN_URL =
  "https://login.moultriemobile.com/moultriemobile.onmicrosoft.com/b2c_1a_signup_signin/oauth2/v2.0/authorize?client_id=ab523e40-983c-4f89-adf8-e258d78cb689&scope=offline_access%20openid%20profile&redirect_uri=https%3A%2F%2Fweb.moultriemobile.com%2Fauthentication%2Flogin-callback&client-request-id=62f664ef-2783-421e-bf6a-df427d33573c&response_mode=fragment&response_type=code&x-client-SKU=msal.js.browser&x-client-VER=2.33.0&client_info=1&code_challenge=AJ57WDLf5r9Sf1UqZsBUNOLz2jN0m_1uQ_xGe-RFGP8&code_challenge_method=S256&nonce=cdf0e182-14e0-47b2-b959-d03ef6b90b53&state=eyJpZCI6ImFjZjRhNmEwLWQ1YWYtNGIzMS04N2VjLWIwMDUwMTlkZmVhZiIsIm1ldGEiOnsiaW50ZXJhY3Rpb25UeXBlIjoicmVkaXJlY3QifX0%3D%7C72452aaa-270c-4479-accc-3883369a720e";

let cachedToken: string | null = null;

export async function getValidToken(): Promise<string> {
  // Return cached token if available
  if (cachedToken) {
    return cachedToken;
  }
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // Reduces memory usage
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Go to URL
    await page.goto(LOGIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // 2. Check if we're on login page - if so, login
    const currentUrl = page.url();
    const isLoginPage =
      currentUrl.includes("login.moultriemobile.com") ||
      currentUrl.includes("b2c_1a_signup_signin");

    if (isLoginPage) {
      if (process.env.MOULTRIE_EMAIL && process.env.MOULTRIE_PASSWORD) {
        console.log("found email and password to use");
      } else {
        console.log(
          "no email and password found, falling back to hardcoded bearer token"
        );
        return process.env.BEARER_TOKEN || "";
      }

      await page.waitForSelector("#signInName", { timeout: 15000 });
      await page.fill("#signInName", process.env.MOULTRIE_EMAIL!);
      await page.fill("#password", process.env.MOULTRIE_PASSWORD!);
      await Promise.all([
        // page.waitForNavigation({ waitUntil: "networkidle", timeout: 60000 }),
        page.click("#next"),
      ]);
    }

    // 3. Wait for redirect to Moultrie web app
    await page.waitForURL(/https?:\/\/web\.moultriemobile\.com/, {
      timeout: 60000,
    });

    // Wait for network idle with longer timeout (some pages keep making requests)
    // If networkidle times out, try to get token anyway - it might already be there
    try {
      await page.waitForLoadState("networkidle", { timeout: 60000 });
    } catch (e) {
      // If networkidle times out, wait a bit and try to get token anyway
      console.log("⚠️  Network idle timeout, waiting a bit and continuing...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // 4. Get token from localStorage
    let token = await page.evaluate(() =>
      localStorage.getItem("MMBlazorBearerToken")
    );

    if (!token) {
      throw new Error("❌ No MMBlazorBearerToken found in localStorage.");
    }

    // Remove quotes from token if present
    token = token.trim();
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      token = token.slice(1, -1).trim();
    }

    // 5. Cache and return token
    cachedToken = token;
    return token;
  } finally {
    await browser.close();
  }
}

// Function to clear the cached token (useful if token becomes invalid)
export function clearTokenCache(): void {
  cachedToken = null;
}
