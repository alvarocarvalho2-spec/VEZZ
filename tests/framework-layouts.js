async (page) => {
  const base = "http://127.0.0.1:5174",
    results = [],
    violations = [];
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const external = [];
  await page.context().unroute("**/*");
  await page.context().route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === base || ["data:", "blob:"].includes(url.protocol)) return route.continue();
    external.push(url.hostname); return route.abort();
  });
  const route = async (hash) => {
    await page.evaluate((hash) => {
      location.hash = hash;
    }, hash);
    await page.waitForFunction(
      (hash) =>
        document.querySelector("#app").dataset.route ===
          hash.slice(1).split("?")[0] &&
        !document.querySelector("#app[aria-busy]") &&
        document.querySelector("main h1"),
      hash,
    );
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.v-route')).opacity === '1');
  };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base);
  await page.locator("#hero-title").waitFor();
  await page.evaluate(async () => {
    window.api = (await import("/js/lib/db.js")).db();
  });
  assert(
    await page.evaluate(() => api.constructor.name === "LocalAdapter"),
    "Local data required",
  );
  await page.evaluate(async () => api.signOut());
  const publicRoutes = [
    "#/",
    "#/como-funciona",
    "#/clinicas",
    "#/clinica/cli_sol",
    "#/login",
    "#/cadastro",
    "#/recuperar-senha",
    "#/solicitar-clinica",
    "#/admin-vezz",
    "#/convite/invalid",
  ];
  const patientRoutes = [
    "#/paciente",
    "#/paciente/fila",
    "#/paciente/historico",
    "#/agendar/cli_sol",
  ];
  const managerRoutes = [
    "#/gestor",
    "#/gestor/fila",
    "#/gestor/consultas",
    "#/gestor/pacientes",
    "#/gestor/clinica",
    "#/gestor/novo-gestor",
  ];
  for (const [role, routes] of [
    ["public", publicRoutes],
    ["patient", patientRoutes],
    ["manager", managerRoutes],
  ]) {
    if (role !== "public")
      await page.evaluate(async (role) => {
        await api.signIn(
          role === "patient" ? "ana.silva@email.com" : "ricardo@clinicasol.com",
          "demo123",
        );
      }, role);
    for (const hash of routes) {
      await route(hash);
      for (const [width, height] of [
        [320, 568],
        [375, 812],
        [768, 1024],
        [1280, 800],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width, height });
        const fit = await page.evaluate(() => ({
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          viewport: innerWidth,
        }));
        assert(
          fit.document <= fit.viewport && fit.body <= fit.viewport,
          hash + " overflow " + width + ": " + JSON.stringify(fit),
        );
        results.push(hash + " fits " + width + "x" + height);
      }
      await page.addScriptTag({ url: base + "/output/playwright/axe.min.js" });
      const axe = await page.evaluate(async () => {
        const result = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        });
        return result.violations
          .filter((v) => ["serious", "critical"].includes(v.impact))
          .map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          }));
      });
      if (axe.length) violations.push({ route: hash, violations: axe });
      // Collect all screens so contrast corrections can be assessed together.
      results.push("accessibility " + hash);
      if (
        ["#/", "#/login", "#/paciente/fila", "#/gestor/fila"].includes(hash)
      ) {
        await page.screenshot({
          path:
            "output/playwright/framework-" +
            role +
            "-" +
            (hash.includes("fila") ? "queue" : "page") +
            "-desktop.png",
          fullPage: true,
        });
        await page.setViewportSize({ width: 375, height: 812 });
        await page.screenshot({
          path:
            "output/playwright/framework-" +
            role +
            "-" +
            (hash.includes("fila") ? "queue" : "page") +
            "-mobile.png",
          fullPage: true,
        });
      }
    }
  }
  await page.evaluate(async () => api.signOut());
  await route("#/");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  assert(
    (await page
      .getByRole("button", { name: "Fechar menu" })
      .getAttribute("aria-expanded")) === "true",
    "Expanded state",
  );
  await page.keyboard.press("Escape");
  assert(
    await page.evaluate(
      () => document.activeElement.getAttribute("aria-label") === "Abrir menu",
    ),
    "Escape focus",
  );
  results.push("mobile menu keyboard and Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await page.locator("canvas").waitFor();
  assert(
    (await page.locator(".v-experience.is-active").count()) === 1,
    "3D inactive",
  );
  await page
    .getByRole("button", { name: "Pausar movimento", exact: true })
    .click();
  assert(
    (await page.locator(".v-experience.is-active").count()) === 0,
    "Pause did not stop scene",
  );
  await page
    .getByRole("button", { name: "Retomar movimento", exact: true })
    .click();
  results.push("3D scene loads, pauses and resumes");
  await page.screenshot({ path: "output/playwright/framework-3d-desktop.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator("#hero-title").waitFor();
  assert(
    (await page.locator("canvas").count()) === 0,
    "Reduced motion loaded 3D",
  );
  results.push("reduced motion uses light fallback");
  await page.evaluate(() => document.querySelector(".skip").click());
  assert(
    await page.evaluate(() => document.activeElement.tagName === "MAIN"),
    "Skip link",
  );
  results.push("skip link focuses main content");
  await route(
    "#/clinicas?q=" + encodeURIComponent("<img src=x onerror=window.__xss=1>"),
  );
  assert(await page.evaluate(() => !window.__xss), "Search XSS");
  results.push("search input stays text");
  assert(external.length === 0, "External connections: " + JSON.stringify(external));
  assert(violations.length === 0, "Accessibility: " + JSON.stringify(violations));
  return { passed: results.length, results, violations };
}
