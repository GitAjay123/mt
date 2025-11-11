const cheerio = require("cheerio");
const axios = require("axios");

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

// ===============================
// 🏪 DETA SCRAPER FUNCTION
// ===============================
async function meta(urrl) {
  const page = await fetchPage(urrl);
  if (!page) {
    return {
      success: false,
      url: urrl,
      title: "",
      description: "",
      image: "",
      icon: "",
      site_name: "",
      error: "Failed to fetch page or request timed out."
    };
  }

  const $ = cheerio.load(page);
  const html = $.html();

  const isAmzn = urrl.includes("amazon.") || urrl.includes("amzn.");
  const isFlipkart = urrl.includes("flipkart.com"); || urrl.includes("fkrt."); || urrl.includes("fktr.");

  // ==================================================
  // 🟢 AMAZON SECTION
  // ==================================================
  if (isAmzn) {
    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text() ||
      $('meta[name="title"]').attr("content") ||
      (titleRegexp.exec(html) && titleRegexp.exec(html)[1]) ||
      "";

    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      (descriptionRegex.exec(html) && descriptionRegex.exec(html)[1]) ||
      "";

    const url =
      $('meta[property="og:url"]').attr("content") ||
      $('link[rel="canonical"]').attr("href") ||
      urrl;

    let image =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[property="og:image:url"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      "";

    const amazonImageMatches = html.match(
      /https:\/\/m\.media-amazon\.com\/images\/I\/[^;"']*_.jpg/g
    );
    if (!image && amazonImageMatches) {
      image = amazonImageMatches.filter((img) => !img.includes(","))[0];
    }

    if (image && image.startsWith("//")) image = "https:" + image;

    const icon = "https://www.amazon.com/favicon.ico";

    return {
      success: true,
      site_name: "Amazon",
      title: title.trim(),
      description: description.trim(),
      url: url || urrl,
      image: (image || icon).replace(/amp;/g, ""),
      icon
    };
  }

  // ==================================================
  // 🟠 FLIPKART SECTION
  // ==================================================
  if (isFlipkart) {
    const title =
      $("span.B_NuCI").text().trim() ||
      $('meta[property="og:title"]').attr("content") ||
      $("title").text().trim() ||
      "";

    const description =
      $("div._1mXcCf").text().trim() ||
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      "";

    let image =
      $("img._396cs4").attr("src") ||
      $("img._2r_T1I").attr("src") ||
      $("img._3exPp9").attr("src") ||
      $('meta[property="og:image"]').attr("content") ||
      "";

    if (image && image.startsWith("//")) image = "https:" + image;

    const icon = "https://www.flipkart.com/favicon.ico";

    return {
      success: true,
      site_name: "Flipkart",
      title: title.trim(),
      description: description.trim(),
      url: urrl,
      image: (image || icon).replace(/amp;/g, ""),
      icon
    };
  }

  // ==================================================
  // ⚪ GENERIC FALLBACK SECTION
  // ==================================================
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text() ||
    $('meta[name="title"]').attr("content") ||
    (titleRegexp.exec(html) && titleRegexp.exec(html)[1]) ||
    "";

  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    (descriptionRegex.exec(html) && descriptionRegex.exec(html)[1]) ||
    "";

  const url =
    $('meta[property="og:url"]').attr("content") ||
    $('link[rel="canonical"]').attr("href") ||
    urrl;

  let image =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    "";

  if (image && image.startsWith("//")) image = "https:" + image;

  const icon =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    "";

  return {
    success: true,
    site_name:
      $('meta[property="og:site_name"]').attr("content") || "Website",
    title: title.trim(),
    description: description.trim(),
    url: url || urrl,
    image: (image || icon).replace(/amp;/g, ""),
    icon
  };
}

// ===============================
// 🧠 EXPRESS / VERCEL HANDLER
// ===============================
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
