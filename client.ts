// testClient.ts
import { WebtorClient } from './webtor.ts';

async function runTests() {
  // Adjust the base URL if needed
  const client = new WebtorClient('http://localhost:8080');

  try {
    console.log('Testing addResource...');
    // Use a valid torrent or magnet URI for testing.
    const resource = await client.addResource(
      'magnet:?xt=urn:btih:43D8135EB4EA2036FF1D22D4DCEDED5587A953E0&dn=John+Wick%3A+Chapter+3+-+Parabellum+%282019%29+%5BWEBRip%5D+%5B1080p%5D+%5BYTS%5D+%5BYIFY%5D&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.com%3A2710%2Fannounce&tr=udp%3A%2F%2Fp4p.arenabg.com%3A1337&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=http%3A%2F%2Ftracker.openbittorrent.com%3A80%2Fannounce&tr=udp%3A%2F%2Fopentracker.i2p.rocks%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Fcoppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.zer0day.to%3A1337%2Fannounce',
    );
    console.log('Resource added:', resource);

    const resourceId = resource.id; // Make sure your API returns an id

    console.log('Testing getResourceContent...');
    const content = await client.getResourceContent(resourceId);
    console.log('Resource content:', content);

    console.log('Testing getExportUrls...');
    const urls = await client.getExportUrls(resourceId);
    console.log('Export URLs:', urls);
  } catch (error) {
    console.error('Error during test:', error);
  }
}

runTests();
