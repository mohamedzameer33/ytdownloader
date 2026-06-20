module.exports = function status(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    response.end('Method not allowed');
    return;
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.statusCode = 200;
  response.end(JSON.stringify({ configured: Boolean(process.env.RAPIDAPI_KEY) }));
};
