export function vercelAdapter(handler) {
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Rewrites can expose either the original path or /api/index to the function.
    const query = req.query;
    const route = url.searchParams.get('__sos_route') || (typeof query?.__sos_route === 'string' ? query.__sos_route : null);
    // Vercel also exposes :path* from the rewrite source in its query helper.
    // Remove it only when it matches the actual captured REST path.
    const capturedPath = query?.path ?? url.searchParams.get('path');
    const pathMetadata = route?.startsWith('v1/') && (Array.isArray(capturedPath) ? capturedPath.join('/') : capturedPath) === route.slice(3);
    if (pathMetadata) url.searchParams.delete('path');
    if (url.pathname === '/api/index' && route?.startsWith('v1/')) url.pathname = '/api/' + route;
    // Some runtime wrappers expose rewrite/query parameters only via req.query.
    for (const [key, value] of Object.entries(query || {})) {
      if (key !== '__sos_route' && !(key === 'path' && pathMetadata) && !url.searchParams.has(key)) {
        for (const item of Array.isArray(value) ? value : [value]) if (typeof item === 'string') url.searchParams.append(key, item);
      }
    }
    url.searchParams.delete('__sos_route');
    req.url = url.pathname + url.search;
    return handler(req, res);
  };
}
