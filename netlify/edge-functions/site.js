export const BACKEND = 'https://amasyaisipompasi.taraftar38.workers.dev';

export default async function site(req) {
  const url = new URL(req.url);
  const target = new URL(url.pathname + url.search, BACKEND);
  // Management stays entirely on Cloudflare, including its session cookies.
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    return Response.redirect(target, 302);
  }
  if (url.pathname.startsWith('/api/admin/')) return new Response('Yönetim için Cloudflare panelini kullanın.', {status:403});
  const isInquiry = url.pathname === '/api/inquiries' && req.method === 'POST';
  if (!['GET','HEAD'].includes(req.method) && !isInquiry) return new Response('Method not allowed', {status:405});
  const headers = new Headers();
  for (const name of ['accept','accept-language','content-type']) if (req.headers.has(name)) headers.set(name, req.headers.get(name));
  if (isInquiry) {
    // Validate the visitor origin before translating it for the backend.
    if (req.headers.get('origin') !== url.origin || req.headers.get('sec-fetch-site') === 'cross-site') return new Response('Geçersiz kaynak', {status:403});
    const body = await req.text();
    if (new TextEncoder().encode(body).length > 12000) return new Response('İstek çok büyük', {status:413});
    headers.set('origin', BACKEND);
    return forward(target, {method:'POST', headers, body, redirect:'manual'}, url.origin);
  }
  return forward(target, {method:req.method, headers, redirect:'manual'}, url.origin);
}

async function forward(target, init, publicOrigin) {
  try {
    const upstream = await fetch(target, init);
    const headers = new Headers(upstream.headers);
    headers.delete('set-cookie');
    headers.set('cache-control','no-store');
    const location = headers.get('location');
    if (location && location.startsWith(BACKEND)) headers.set('location', location.replace(BACKEND, publicOrigin));
    const type = headers.get('content-type') || '';
    if (init.method !== 'HEAD' && /text\/html|application\/xml|text\/plain|text\/vcard/.test(type)) {
      const body = (await upstream.text()).replaceAll(BACKEND, publicOrigin);
      headers.delete('content-length'); headers.delete('content-encoding'); headers.delete('etag');
      return new Response(body, {status:upstream.status, headers});
    }
    return new Response(upstream.body, {status:upstream.status, headers});
  } catch {
    return new Response('Siteye şu anda ulaşılamıyor. Lütfen kısa süre sonra tekrar deneyin.', {status:502, headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
  }
}
