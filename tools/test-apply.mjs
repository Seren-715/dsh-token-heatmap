// Drive the plugin's apply() against a stub Cordis context.
//
//   node test-apply.mjs
//
// Verifies module loading, route registration and HTTP handler responses.
// Browser rendering is covered separately by test-client.mjs.

const plugin = await import(new URL('../lib/index.js', import.meta.url).href);

console.log(`module loaded: name=${String(plugin.name)}, apply is ${typeof plugin.apply}`);

const routes = [];
const teardown = [];

const ctx = {
  on(event) {
    // Route registration does not require host event subscriptions.
    throw new Error(`unexpected event subscription: ${event}`);
  },
  effect(callback) {
    const dispose = callback();
    if (typeof dispose === 'function') teardown.push(dispose);
    return () => {};
  },
  inject(services, callback) {
    if (!Array.isArray(services) || !services.includes('webServer'))
      throw new Error(`unexpected inject: ${String(services)}`);
    const scoped = {
      webServer: {
        register(route) {
          routes.push(route);
          return () => {
            const index = routes.indexOf(route);
            if (index !== -1) routes.splice(index, 1);
          };
        }
      },
      config: {},
      get: () => undefined,
      logger: { info: (message) => console.log(`  [log] ${message}`) }
    };
    const dispose = callback(scoped);
    if (typeof dispose === 'function') teardown.push(dispose);
  }
};

plugin.apply(ctx);

console.log('');
console.log(`routes registered : ${String(routes.length)}`);
for (const route of routes) console.log(`  ${String(route.kind)} ${String(route.path)}`);

const failures = [];
const paths = routes.map((route) => route.path);
if (!paths.includes('/dsh-token-heatmap/client.js')) failures.push('client.js route missing');
if (!paths.includes('/dsh-token-heatmap/data')) failures.push('data route missing');
if (routes.length !== 2) failures.push(`expected exactly 2 routes, got ${String(routes.length)}`);

const makeResponse = () => ({
  status: null,
  headers: null,
  body: '',
  writeHead(status, headers) {
    this.status = status;
    this.headers = headers;
  },
  end(body) {
    this.body = body;
  }
});

// Data route: the browser calls this for the heatmap payload.
const dataRoute = routes.find((route) => route.path === '/dsh-token-heatmap/data');
if (dataRoute !== undefined) {
  const response = makeResponse();
  await dataRoute.handler({ url: '/dsh-token-heatmap/data', headers: {} }, response);
  console.log('');
  console.log(
    `data route  : HTTP ${String(response.status)} (${String(response.body.length)} bytes)`
  );
  if (response.status !== 200) failures.push(`data route returned ${String(response.status)}`);
  try {
    const parsed = JSON.parse(response.body);
    console.log(
      `  days=${String(parsed.days.length)} totalTokens=${parsed.totalTokens.toLocaleString('en-US')} files=${String(parsed.files)}`
    );
    if (!Array.isArray(parsed.days)) failures.push('payload.days is not an array');
    if (typeof parsed.totalTokens !== 'number')
      failures.push('payload.totalTokens is not a number');
  } catch (error) {
    failures.push(`data route body is not JSON: ${String(error)}`);
  }
}

// Client route: must serve the module-loader artifact that registers the settings section.
const clientRoute = routes.find((route) => route.path === '/dsh-token-heatmap/client.js');
if (clientRoute !== undefined) {
  const response = makeResponse();
  clientRoute.handler({ url: '/dsh-token-heatmap/client.js', headers: {} }, response);
  console.log(
    `client route: HTTP ${String(response.status)}, content-type ${String(response.headers?.['content-type'])}, ${String(response.body.length)} bytes`
  );
  if (response.status !== 200) failures.push(`client route returned ${String(response.status)}`);
  const body = String(response.body);
  if (!body.includes('__ModuleLoader__.load'))
    failures.push('client script is not a module-loader artifact');
  if (!/ctx\.slots\.inject\(\s*['"]settings\.section['"]/.test(body))
    failures.push('client script does not register the settings section');
  if (!body.includes("id: 'dsh-token-heatmap'"))
    failures.push('client module id does not match the package name');
}

for (const dispose of teardown.reverse()) dispose();
if (routes.length !== 0) failures.push('routes remain registered after disposal');

console.log('');
if (failures.length > 0) {
  console.error(`FAILURES:\n  ${failures.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log('all apply() checks passed');
}
