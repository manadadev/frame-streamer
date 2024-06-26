import { Hono } from "hono";
import { type FC, Fragment } from "hono/jsx";
import { stream } from "hono/streaming";
import puppeteer, { type Page } from "puppeteer";
import sharp from "sharp";

const app = new Hono();
const port = Number.parseInt(process.env.PORT ?? "3000");
const baseUrl = "https://cloudlines-stream-trial-59.localcan.dev";
const streamUrl = `${baseUrl}/api/stream`;
const latestUrl = `${baseUrl}/api/latest`;
const waitDelay = 1000;
const screenshotInterval = 40;
// const vp = { width: 640, height: 360 };
const vp = { width: 1280, height: 720 };
let latestScreenshotBuffer: Buffer | null = null;

const clients = [];

const FarcasterStream: FC = (_props) => {
  return (
    <Fragment>
      <title>Cloudlines</title>
      <link rel="preload" as="image" href={"/api/stream"} />
      <meta name="fc:frame" content="vNext" />
      <meta name="fc:frame:post_url" content={`${baseUrl}/api/next-frame`} />
      <meta name="fc:frame:image" content={streamUrl} />
    </Fragment>
  );
};

const MainFrame: FC = (_props) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <FarcasterStream />
        <meta property="fc:frame:button:1" content="Cause a storm!" />
        <meta property="fc:frame:button:1:action" content="post" />
        <meta
          property="fc:frame:button:1:target"
          content={`${baseUrl}/api/next-frame`}
        />
        <meta property="og:title" content="Cloudlines" />
        <meta property="og:image" content={latestUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Cloudlines" />
        <meta name="twitter:image" content={latestUrl} />
      </head>
      <body>
        <h1>Cloudlines Stream</h1>
        <img src="/api/stream" alt="Live stream of Cloudlines" />
      </body>
    </html>
  );
};

app.get("/api/stream", (c) => {
  const multipart = "--totalmjpeg";
  c.header(
    "Content-Type",
    `multipart/x-mixed-replace; boundary="${multipart}"`
  );
  c.header("Cache-Control", "private, no-cache, no-store, max-age=0");
  c.header("Connection", "close");
  c.header("Pragma", "no-cache");

  return stream(c, async (stream) => {
    let live = true;
    const client = {
      mjpegwrite: (buffer: Buffer) => {
        stream.write(`--${multipart}\r\n`);
        stream.write("Content-Type: image/jpeg\r\n");
        stream.write(`Content-Length: ${buffer.length}\r\n`);
        stream.write("\r\n");
        stream.write(buffer);
        stream.write("\r\n");
      },
      mjpegend: () => {
        stream.close();
      },
    };
    clients.push(client);

    stream.onAbort(() => {
      live = false;
      client.mjpegend();
    });

    while (live) {
      if (latestScreenshotBuffer) {
        client.mjpegwrite(latestScreenshotBuffer);
      }
      await stream.sleep(screenshotInterval);
    }
  });
});

app.get("/api/latest", async (c) => {
  if (latestScreenshotBuffer) {
    c.header("Content-Type", "image/jpeg");
    c.header("Cache-Control", "private, no-cache, no-store, max-age=0");
    c.header("Connection", "close");
    c.header("Pragma", "no-cache");

    if (!latestScreenshotBuffer) return c.status(418);
    return stream(c, async (stream) => {
      stream.onAbort(() => {
        console.log("Aborted!");
      });
      await stream.write(latestScreenshotBuffer as Uint8Array);
    });
  }
  return c.status(404);
});

app.get("*", (c) => {
  return c.html(<MainFrame />);
});

const main = async () => {
  const capture = async (page: Page) => {
    const buffer = await page.screenshot({
      encoding: "binary",
      type: "jpeg",
      quality: 100,
    });

    latestScreenshotBuffer = await sharp(buffer)
      .resize(640)
      .avif({ effort: 2 })
      .toBuffer();

    setTimeout(async () => {
      await capture(page);
    }, screenshotInterval); // 1-second interval
  };

  console.log("Starting browser...");
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: "new",
  });
  const page = await browser.newPage();

  console.log(`Setting viewport to ${vp.width}x${vp.height}...`);
  await page.setViewport(vp);

  console.log("Loading page...");
  await page.goto("https://game.manada.dev/?cinematic&c_zoom=0.175");

  console.log("Waiting to load...");
  await new Promise((resolve) => setTimeout(resolve, waitDelay));

  console.log("Capturing screenshots...");
  await capture(page);
};

main();

export default {
  port,
  fetch: app.fetch,
};
