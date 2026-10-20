# NM Run deployment notes (Person 4)

## Separate client and server

The root package is the static browser client. P3 owns the Node.js/Socket.IO server in `server/`. Static hosting providers do not run the Socket.IO Node process. Deploy the two parts separately.

## Client URL configuration

The browser needs a public server URL. Set it before `src/main.js` loads, for example in `index.html`:

```html
<script>window.NM_RUN_SERVER_URL = 'https://your-nm-run-server.example.com';</script>
<script type="module" src="/src/main.js"></script>
```

For local Vite development, the default is `http://localhost:3000`. `VITE_NM_RUN_SERVER_URL` can be used at build time. Do not put credentials, API secrets or private keys in client configuration: browser values are public.

## Client hosting

### Netlify

1. Push the integrated repository to GitHub.
2. Create a Netlify site from the repository.
3. Build command: `npm run build`.
4. Publish directory: `dist`.
5. Set `VITE_NM_RUN_SERVER_URL` to the deployed server URL if using the build-time fallback, or use the explicit `window.NM_RUN_SERVER_URL` override.
6. Redeploy and verify browser console/network requests.

### Vercel

1. Import the repository.
2. Framework preset: Vite/Other (static client).
3. Build command: `npm run build`; output directory: `dist`.
4. Set the public server URL as described above.
5. Deploy and test from the deployed HTTPS origin.

### GitHub Pages

Vite's default root base works when the site is served from a domain root. For a repository subpath, configure Vite's `base` to `/<repository-name>/` and update absolute asset paths in `index.html` if needed. The current entry uses root-absolute paths and therefore requires that adjustment for project pages. Use HTTPS Pages with an HTTPS/WSS server endpoint.

## Node server hosting (P3-owned)

Deploy the `server/` package independently on Render or Railway, following `README_PERSON3.md`. Configure the service's start command, Node version, allowed client origins/CORS, and port binding per P3's server implementation. Use the provider's assigned port via `process.env.PORT` on the server. Do not assume a free instance stays awake; cold starts/sleep may make the first connection slow or unavailable.

## HTTPS, WebSocket and CORS

- If the client is hosted on HTTPS, use an HTTPS server origin and secure WebSockets (`wss://`) through the Socket.IO URL. Browsers block insecure mixed content.
- The Socket.IO server must explicitly allow the exact deployed client origin(s) through CORS. CORS is configured on the server, not by the browser client.
- Keep WebSocket transport enabled. Socket.IO may fall back to HTTP long-polling if WebSocket is unavailable, depending on server/client configuration. Do not claim fallback is working without testing it.
- Do not use `localhost` as the server URL for a deployed client: it points to the visitor's own computer.
- Test connection, disconnect and reconnect behavior from the deployed origin, not only from localhost.

## Verification checklist

- [ ] Static build succeeds.
- [ ] Client is served over HTTPS.
- [ ] Server is reachable and uses HTTPS/WSS.
- [ ] Server CORS allowlist includes the exact client origin.
- [ ] Two or more independent real browsers can join the same room.
- [ ] No secrets are included in client bundles or Git history.
- [ ] Hosting provider logs confirm server startup and no repeated crash/restart loop.

No deployment has been performed or verified by this delivery.
