const { Readable } = require('stream');
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 290000);
    request.once('aborted', () => controller.abort());
    response.once('close', () => clearTimeout(timeout));
    let upstream;
    try {
      upstream = await fetch(item.url, {
        headers: request.headers.range ? { Range: request.headers.range } : {},
        redirect: 'follow',
        signal: controller.signal
      });
    } catch {
      clearTimeout(timeout);
      throw new DownloaderError(502, 'The media server could not be reached. Analyze the video again.');
    }
    if (!upstream.ok && upstream.status !== 206) {
      throw new DownloaderError(502, 'The media stream is no longer available. Analyze the video again.');
    }

    response.statusCode = upstream.status === 206 ? 206 : 200;
    response.setHeader('Content-Type', upstream.headers.get('content-type') || item.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${item.filename.replace(/"/g, '')}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    for (const header of ['content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header);
      if (value) response.setHeader(header, value);
    }
    if (!upstream.body) {
      response.end();
      return;
    }
    const mediaStream = Readable.fromWeb(upstream.body);
    mediaStream.on('error', (streamError) => {
      clearTimeout(timeout);
      if (!response.destroyed) response.destroy(streamError);
    });
    mediaStream.pipe(response);
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
