
const { DownloaderError, verifyStreamToken } = require('../lib/downloader');

module.exports = async function download(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    response.end('Method not allowed');
    return;
  }

  try {
    const parsedUrl = new URL(request.url, 'http://localhost');
    const rawToken = request.query?.token || parsedUrl.searchParams.get('token') || '';
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
    const item = verifyStreamToken(token, process.env.RAPIDAPI_KEY);
    const streamUrl = new URL(item.url);
    streamUrl.searchParams.set('title', item.filename.replace(/\.[a-z0-9]+$/i, ''));
    response.writeHead(302, { Location: streamUrl.toString() });
    response.end();
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    response.statusCode = error instanceof DownloaderError ? error.status : 500;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(error instanceof DownloaderError ? error.message : 'The download could not be started.');
  }
};
