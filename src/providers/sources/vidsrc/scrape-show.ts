import { getVidSrcShowSources } from '@/providers/sources/vidsrc/scrape';
import { ShowScrapeContext } from '@/utils/context';
import { getVidSrcShowSourcesNew } from '@/providers/sources/vidsrc/index';
export async function scrapeShow(ctx: ShowScrapeContext) {
  try {
    // Try original scraper first
    return {
      embeds: await getVidSrcShowSources(ctx),
    };
  } catch (error) {
    console.log('Original scraper failed, falling back to Playwright');
    try {
      return {
        embeds: await getVidSrcShowSourcesNew(ctx),
      };
    } catch (playwrightError) {
      console.error('Playwright scraper also failed:', playwrightError);
      return { embeds: [] };
    }
  }
}
