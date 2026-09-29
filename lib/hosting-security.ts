/** Sites identity headers are trusted only behind the managed Sites gateway. */
export function stripSitesIdentityHeaders(request: Request): Request {
  const headers = new Headers(request.headers);
  for (const name of Array.from(headers.keys())) {
    if (name.startsWith("oai-") || name.startsWith("x-oai-")) headers.delete(name);
  }
  return new Request(request, { headers });
}
