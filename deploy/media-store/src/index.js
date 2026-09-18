// PUT/GET/DELETE /o/<key>  and  DELETE /prefix/<prefix>  on the zelqane-media R2 bucket.
export default {
  async fetch(request, env) {
    if (!authorized(request, env.MEDIA_TOKEN)) {
      return new Response("unauthorized", { status: 401 });
    }
    const url = new URL(request.url);
    const [, kind, ...rest] = url.pathname.split("/");
    const key = decodeURIComponent(rest.join("/"));
    if (!key || key.includes("..") || key.startsWith("/")) {
      return new Response("bad key", { status: 400 });
    }

    if (kind === "o") {
      if (request.method === "PUT") {
        await env.MEDIA.put(key, request.body, {
          httpMetadata: { contentType: request.headers.get("content-type") ?? undefined },
        });
        return new Response(null, { status: 204 });
      }
      if (request.method === "GET") {
        const object = await env.MEDIA.get(key);
        if (!object) return new Response("not found", { status: 404 });
        return new Response(object.body, { headers: { "content-length": String(object.size) } });
      }
      if (request.method === "DELETE") {
        await env.MEDIA.delete(key);
        return new Response(null, { status: 204 });
      }
    }

    if (kind === "prefix" && request.method === "DELETE") {
      let cursor;
      let deleted = 0;
      do {
        const page = await env.MEDIA.list({ prefix: key, cursor });
        if (page.objects.length) {
          await env.MEDIA.delete(page.objects.map((o) => o.key));
          deleted += page.objects.length;
        }
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return Response.json({ deleted });
    }

    return new Response("not found", { status: 404 });
  },
};

function authorized(request, token) {
  if (!token) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
