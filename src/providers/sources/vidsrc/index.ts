import { makeSourcerer } from '@/providers/base';
import { scrapeMovie } from '@/providers/sources/vidsrc/scrape-movie';
import { scrapeShow } from '@/providers/sources/vidsrc/scrape-show';

export const vidsrcScraper = makeSourcerer({
  id: 'vidsrc',
  name: 'VidSrc',
  rank: 130,
  disabled: true,
  flags: [],
  scrapeMovie,
  scrapeShow,
});

async function extractStreamUrlsWithPlaywright(url: string): Promise<SourcererEmbed[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  });

  try {
    const page = await context.newPage();

    // Enable request interception to capture media URLs
    const mediaUrls: Set<string> = new Set();

    page.on('request', (request) => {
      const url = request.url();
      // Look for video stream URLs (.m3u8, .mp4, etc.)
      if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('/hls/') || url.includes('/dash/')) {
        mediaUrls.add(url);
      }
    });

    // Navigate to the page
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for and click on server options if available
    try {
      // Click on server buttons to trigger different stream sources
      const serverButtons = await page.$$('.server');
      for (const button of serverButtons) {
        await button.click();
        // Wait a bit for new requests to be made
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('No server buttons found or error clicking them');
    }

    // Wait a bit more for any final requests
    await page.waitForTimeout(2000);

    // Create SourcererEmbed objects from the captured URLs
    const embeds: SourcererEmbed[] = Array.from(mediaUrls).map((url, index) => ({
      embedId: `vidsrc-${index}`,
      url: url,
      // Extract referer from the URL or use a default
      headers: {
        Referer: new URL(url).origin,
      },
    }));

    return embeds;
  } finally {
    await browser.close();
  }
}

// New implementation for scraping movies
export async function getVidSrcMovieSourcesNew(ctx: MovieScrapeContext) {
  const url = `https://vidsrc.to/embed/movie/${ctx.media.tmdbId}`;
  return extractStreamUrlsWithPlaywright(url);
}

// New implementation for scraping shows
export async function getVidSrcShowSourcesNew(ctx: ShowScrapeContext) {
  const url = `https://vidsrc.to/embed/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
  return extractStreamUrlsWithPlaywright(url);
}
