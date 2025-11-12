// universal_meta_with_playwright.js
const cheerio = require("cheerio");
const axios = require("axios");
const { chromium } = require("playwright"); // npm i playwright

const usage = "https://detaagraber.vercel.app/api?url=https://google.com";
const titleRegexp = /<title>([\s\S]*?)<\/title>/i;
const descriptionRegex = /<meta[^>]*name=['"]description['"][^>]*content=['"]([^']*)['"][^>]*\/?>/i;

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36"
];

async function fetchPage(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)],
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        Connection: "keep-alive"
      },
      maxRedirects: 5,
      timeout: 30000
    });
    return response.data;
  } catch (err) {
    console.warn("⚠️ Fetch failed:", err.message);
    return null;
  }
}

/**
 * Render page with Playwright and return the HTML and page context
 * We navigate, wait until network idle and return page content
 */
async function renderWithBrowser(url, timeout = 20000) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
    locale: "en-US"
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout });
    // Give a small extra wait for client-side render (some pages request after networkidle)
    await page.waitForTimeout(300); // 300ms
    const html = await page.content();
    // extract some meta quickly from DOM to avoid re-parsing
    const domMeta = await page.evaluate(() => {
      const get = (sel) => {
        try {
          const el = document.querySelector(sel);
          return el ? el.textContent || el.content || el.src || "" : "";
        } catch (e) { return ""; }
      };
      return {
        title: document.querySelector('meta[property="og:title"]')?.content || document.title || get('span.B_NuCI') || "",
        description: document.querySelector('meta[property="og:description"]')?.content || document.querySelector('meta[name="Description"]')?.content || document.querySelector('meta[name="description"]')?.content || "",
        ogImage: document.querySelector('meta[property="og:image"]')?.content || document.querySelector('meta[name="og_image"]')?.content || document.querySelector('meta[name="twitter:image"]')?.content || (document.querySelector('img._396cs4')?.src || document.querySelector('img._2r_T1I')?.src || document.querySelector('img._3exPp9')?.src || "")
      };
    });

    await browser.close();
    return { html, domMeta };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

// Main unified meta function
async function meta(urrl) {
  const page = await fetchPage(urrl);
  const htmlFromAxios = page || "";
  const $ = cheerio.load(htmlFromAxios);
  const html = $.html();

  const isAmzn = urrl.includes("amazon.") || urrl.includes("amzn.");
  const isFlipkart =
    urrl.includes("flipkart.") ||
    urrl.includes("fkrt.to") ||
    urrl.includes("fkrt.it") ||
    urrl.includes("fktr.in") ||
    urrl.includes("dl.flipkart.com/s/") ||
    urrl.includes("fkrt.site");

  // AMAZON: keep your static logic (axios + cheerio)
  if (isAmzn) {
    if (!htmlFromAxios) throw new Error("Failed to fetch Amazon page");
    const $a = cheerio.load(htmlFromAxios);
    const amazonHtml = $a.html();

    const title =
      $a('meta[property="og:title"]').attr("content") ||
      $a("title").text() ||
      $a('meta[name="title"]').attr("content") ||
      (titleRegexp.exec(amazonHtml) && titleRegexp.exec(amazonHtml)[1]) ||
      "";

    const description =
      $a('meta[property="og:description"]').attr("content") ||
      $a('meta[name="description"]').attr("content") ||
      (descriptionRegex.exec(amazonHtml) && descriptionRegex.exec(amazonHtml)[1]) ||
      "";

    let image =
      $a('meta[property="og:image"]').attr("content") ||
      $a('meta[property="og:image:url"]').attr("content") ||
      $a('meta[name="twitter:image"]').attr("content") ||
      "";

    const amazonImageMatches = amazonHtml.match(
      /https:\/\/m\.media-amazon\.com\/images\/I\/[^;"']*_.jpg/g
    );
    if (!image && amazonImageMatches) image = amazonImageMatches.filter((img) => !img.includes(","))[0];

    if (image && image.startsWith("//")) image = "https:" + image;

    const icon = "https://www.amazon.com/favicon.ico";

    return {
      success: true,
      site_name: "Amazon",
      title: title.trim(),
      description: description.trim(),
      url: urrl,
      image: (image || icon).replace(/amp;/g, ""),
      icon
    };
  }

  // FLIPKART: use browser rendering to get reliable data
  if (isFlipkart) {
    try {
      const { html: renderedHtml, domMeta } = await renderWithBrowser(urrl, 30000);
      const $r = cheerio.load(renderedHtml);

      // prefer DOM-evaluated meta (fast) then fallback to OG/meta tags in rendered HTML
      let title = (domMeta.title || "").trim();
      if (!title) {
        title = $r('meta[property="og:title"]').attr("content") || $r("title").text().trim() || "";
      }

      let description = (domMeta.description || "").trim();
      if (!description) {
        description = $r('meta[property="og:description"]').attr("content") ||
                      $r('meta[name="Description"]').attr("content") ||
                      $r('meta[name="description"]').attr("content") || "";
      }

      let image = (domMeta.ogImage || "").trim();
      if (!image) {
        image = $r('meta[property="og:image"]').attr("content") ||
                $r('meta[name="og_image"]').attr("content") ||
                $r('meta[name="twitter:image"]').attr("content") ||
                $r("img._396cs4").attr("src") ||
                $r("img._2r_T1I").attr("src") ||
                $r("img._3exPp9").attr("src") ||
                "";
      }
      if (image && image.startsWith("//")) image = "https:" + image;

      const icon = "https://static-assets-web.flixcart.com/www/promos/new/20150528-140547-favicon-retina.ico";

      return {
        success: true,
        site_name: "Flipkart",
        title: title,
        description: description,
        url: urrl,
        image: (image || icon).replace(/amp;/g, ""),
        icon
      };
    } catch (err) {
      // If Playwright fails, fallback to axios/cheerio attempt (may be partial)
      console.warn("Playwright flipkart render failed:", err.message);
      // try best-effort from axios HTML
      const $fallback = cheerio.load(htmlFromAxios || "");
      const title =
        $fallback('meta[property="og:title"]').attr("content") ||
        $fallback("title").text().trim() || "";
      const description =
        $fallback('meta[property="og:description"]').attr("content") ||
        $fallback('meta[name="Description"]').attr("content") ||
        $fallback('meta[name="description"]').attr("content") || "";
      let image =
        $fallback('meta[property="og:image"]').attr("content") ||
        $fallback('meta[name="og_image"]').attr("content") ||
        "";
      if (image && image.startsWith("//")) image = "https:" + image;
      const icon = "https://static-assets-web.flixcart.com/www/promos/new/20150528-140547-favicon-retina.ico";
      return {
        success: true,
        site_name: "Flipkart",
        title: title,
        description: description,
        url: urrl,
        image: (image || icon).replace(/amp;/g, ""),
        icon
      };
    }
  }

  // GENERIC fallback (axios + cheerio)
  if (!htmlFromAxios) throw new Error("Failed to fetch page");
  const $g = cheerio.load(htmlFromAxios);
  let title =
    $g('meta[property="og:title"]').attr("content") ||
    $g("title").text() ||
    $g('meta[name="title"]').attr("content") ||
    (titleRegexp.exec(htmlFromAxios) && titleRegexp.exec(htmlFromAxios)[1]) ||
    "";

  let description =
    $g('meta[property="og:description"]').attr("content") ||
    $g('meta[name="description"]').attr("content") ||
    (descriptionRegex.exec(htmlFromAxios) && descriptionRegex.exec(htmlFromAxios)[1]) ||
    "";

  let image =
    $g('meta[property="og:image"]').attr("content") ||
    $g('meta[name="twitter:image"]').attr("content") ||
    "";

  if (image && image.startsWith("//")) image = "https:" + image;

  const icon =
    $g('link[rel="icon"]').attr("href") ||
    $g('link[rel="shortcut icon"]').attr("href") ||
    "";

  return {
    success: true,
    site_name:
      $g('meta[property="og:site_name"]').attr("content") || "Website",
    title: title.trim(),
    description: description.trim(),
    url: urrl,
    image: (image || icon).replace(/amp;/g, ""),
    icon
  };
}

// Express/Vercel handler
module.exports = async (request, response) => {
  const { url } = request.query;
  if (!url || url.trim() === "") {
    return response.status(400).json({
      success: false,
      error: "No url query specified.",
      usage
    });
  }

  try {
    const metaRes = await meta(url);
    response.status(200).json(metaRes);
  } catch (error) {
    response.status(400).json({
      success: false,
      url,
      erMessage: error.message,
      error:
        "The server encountered an error. You may have inputted an invalid query.",
      usage
    });
  }
};
