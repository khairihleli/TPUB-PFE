// Cron-only worker: pings the backend health endpoint so the Render instance never idles.
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(ping(env.TARGET_URL));
  },
};

async function ping(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "zelqane-keepalive" } });
    console.log(`keepalive ${res.status}`);
  } catch (err) {
    console.log(`keepalive failed: ${err}`);
  }
}
