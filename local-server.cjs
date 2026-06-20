const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 4173);
const root = __dirname;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png'
};

loadEnvironmentFile();
const statusHandler = require('./api/status');
const videoInfoHandler = require('./api/video-info');
const downloadHandler = require('./api/download');

function loadEnvironmentFile() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[name]) process.env[name] = value;
  }
}

function serveStatic(requestPath, response) {
  const filePath = path.resolve(root, `.${decodeURIComponent(requestPath)}`);
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(content);
  });
}

http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  request.query = Object.fromEntries(requestUrl.searchParams);
  if (request.method === 'GET' && requestUrl.pathname === '/api/status') return statusHandler(request, response);
  if (request.method === 'GET' && requestUrl.pathname === '/api/video-info') return videoInfoHandler(request, response);
  if (request.method === 'GET' && requestUrl.pathname === '/api/download') return downloadHandler(request, response);
  const requestPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  serveStatic(requestPath, response);
}).listen(port, () => {
  console.log(`Flash Downloader Free is running at http://localhost:${port}`);
  console.log(`RapidAPI: ${process.env.RAPIDAPI_KEY ? 'configured' : 'not configured'}`);
});
