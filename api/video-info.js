const { DownloaderError, getVideoInfo } = require('../lib/downloader');

module.exports = async function videoInfo(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    response.end('Method not allowed');
    return;
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const parsedUrl = new URL(request.url, 'http://localhost');
    const submittedUrl = request.query?.url || parsedUrl.searchParams.get('url') || '';
    const data = await getVideoInfo(Array.isArray(submittedUrl) ? submittedUrl[0] : submittedUrl, process.env.RAPIDAPI_KEY);
    response.statusCode = 200;
    response.end(JSON.stringify(data));
  } catch (error) {
    const status = error instanceof DownloaderError ? error.status : 500;
    response.statusCode = status;
    response.end(JSON.stringify({ error: error instanceof DownloaderError ? error.message : 'The video could not be processed.' }));
  }
};
