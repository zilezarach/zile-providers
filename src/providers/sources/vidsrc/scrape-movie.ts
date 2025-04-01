import { getVidSrcMovieSources } from '@/providers/sources/vidsrc/scrape';
import { MovieScrapeContext } from '@/utils/context';
import { getVidSrcMovieSourcesNew } from '@/providers/sources/vidsrc/index';
export async function scrapeMovie(ctx: MovieScrapeContext) {
  try {
    // Try original scraper first
    return {
      embeds: await getVidSrcMovieSources(ctx),
    };
  } catch (error) {
    console.log('Original scraper failed, falling back to Playwright');
    try {
      return {
        embeds: await getVidSrcMovieSourcesNew(ctx),
      };
    } catch (playwrightError) {
      console.error('Playwright scraper also failed:', playwrightError);
      return { embeds: [] };
    }
  }
}
