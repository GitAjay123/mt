const cheerio = require("cheerio");
const axios = require("axios");

const usage = "https://metaagrabber.vercel.app/api?url=https://discord.com";

// Use non-global regex so exec() doesn't advance lastIndex unexpectedly
const titleRegexp = /<title>([\s\S]*?)<\/title>/i;
const descriptionRegex = /<meta[^>]*name=["']description["'][^>]*content=["']([^']*)["'][^>]*\/?>/i;

async function meta(urrl) {
  const res = await axios.get(urrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.5005.61 Safari/537.36"
    },
    // allow redirects (axios does by default)
    maxRedirects: 5,
    timeout: 15000
  });

  const page = res.data;
  const $ = cheerio.load(page);
  const html = $.html();

  // detect amazon more robustly: original url OR final response URL OR page HTML markers
  const finalUrl = (res.request && res.request.res && res.request.res.responseUrl) || urrl;
  const isAmzn =
    /amazon\./i.test(finalUrl) ||
    /amzn\.to/i.test(finalUrl) ||
    /m\.media-amazon\.com/i.test(html) ||
    /dp\/[A-Z0-9]{10}/i.test(html); // fallback check for ASIN pattern

  const isFlipkart = /flipkart\.com/i.test(finalUrl);

  // Title (use your order of fallbacks, but avoid calling exec twice)
  const titleMeta = $('meta[property="og:title"]').attr('content');
  let title = titleMeta || $('title').text() || $('meta[name="title"]').attr('content');
  if ((!title || title.trim() === "") && titleRegexp.test(html)) {
    const tmatch = titleRegexp.exec(html);
    if (tmatch && tmatch[1]) title = tmatch[1];
  }
  title = (title || "").trim();

  // Description (use og:description, meta[name="description"], or regex)
  const descMeta = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content');
  let description = descMeta;
  if ((!description || description.trim() === "") && descriptionRegex.test(html)) {
    const dmatch = descriptionRegex.exec(html);
    if (dmatch && dmatch[1]) description = dmatch[1];
  }
  description = (description || "").trim();

  // URL: prefer og:url, then canonical, then finalUrl or input
  const ogUrl = $('meta[property="og:url"]').attr('content');
  const canonical = $('link[rel="canonical"]').attr('href');
  const url = ogUrl || canonical || finalUrl || urrl;

  // Site name
  let site_name = $('meta[property="og:site_name"]').attr('content') || '';
  if (isAmzn) site_name = "Amazon";
  else if (isFlipkart) site_name = "Flipkart";

  // Image: prefer og:image or og:image:url or twitter:image
  let image = $('meta[property="og:image"]').attr('content') || $('meta[property="og:image:url"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || "";

  // AMAZON-specific fallback: match m.media-amazon.com images like your original code
  if (isAmzn && !image) {
    const amazonImageMatches = html.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[^;"']*_.jpg/g);
    if (amazonImageMatches) {
      // filter out ones with commas (as you did) and pick first
      const filtered = amazonImageMatches.filter(img => !img.includes(","));
      if (filtered.length) image = filtered[0];
    }
  }

  // FLIPKART-specific fallback (keep simple detection; you can add classes you prefer)
  if (isFlipkart && !image) {
    const imgEl = $('img[class*="_396cs4"], img[class*="_2r_T1I"], img[class*="_3exPp9"]').first();
    image = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-srcset')?.split(" ")[0] || image;
  }

  // normalize protocol-less urls
  if (image && image.startsWith("//")) image = "https:" + image;

  // Icon fallback: mirror your Amazon code behavior
  const rawIcon = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href') || "";
  const icon = isAmzn ? `https://www.amazon.com/favicon.ico` : (isFlipkart ? `https://www.flipkart.com/favicon.ico` : rawIcon);

  if (!image) image = icon;
  image = (image || "").replace(/amp;/g, "");

  // Keywords
  const keywords = $('meta[property="og:keywords"]').attr('content') || $('meta[name="keywords"]').attr('content') || "";

  const json = {
    title,
    description,
    url: url || urrl,
    site_name,
    image: image || icon,
    icon,
    keywords
  };

  console.log(json);
  return json;
}

module.exports = async (request, response) => {
  const { url } = request.query;
  if (!url || url == "" || url == " ") {
    return response.status(400).json({
      success: false,
      error: "No url query specified.",
      usage
    });
  }
  try {
    let metaRes = await meta(url);
    metaRes.success = true;
    response.status(200).json(metaRes);
  } catch (error) {
    response.status(400).json({
      success: false,
      url,
      erData: error.toString(),
      erMessage: error.message,
      error: "The server encountered an error. You may have inputted an invalid query.",
      usage
    });
  }
};
