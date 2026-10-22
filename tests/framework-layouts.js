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
        const mascots = await page.evaluate(() =>
          [...document.querySelectorAll(".v-legacy svg.bot")].map((bot) => {
            const { width, height } = bot.getBoundingClientRect();
            return { width, height };
          }),
        );
        assert(
          mascots.every(({ width, height }) =>
            width <= 200 && height <= 200 && Math.abs(width - height) < 1,
          ),
          hash + " mascot sizing " + width + ": " + JSON.stringify(mascots),
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
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 820 });
    await page.evaluate(async () => {
      const { modal, toast } = await import("/js/lib/ui.js");
      window.__mascotDialog = modal({
        title: "Mensagem de teste",
        body: "Conteúdo local para verificar o tamanho do mascote no modal.",
        actions: "",
      });
      toast("O mascote continua dentro dos limites do aviso.", "warn");
    });
    await page.locator(".modal-notices .toast-mascot .bot").waitFor();
    const modalFit = await page.evaluate(() => {
      const modal = document.querySelector(".modal");
      const toast = document.querySelector(".modal-notices .toast");
      const bot = document.querySelector(".modal-brand .bot");
      const toastBot = document.querySelector(".modal-notices .toast-mascot .bot");
      const within = (child, parent) => {
        const c = child.getBoundingClientRect(), p = parent.getBoundingClientRect();
        return c.left >= p.left - 1 && c.right <= p.right + 1 && c.top >= p.top - 1 && c.bottom <= p.bottom + 1;
      };
      return {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        modal: modal.scrollWidth <= modal.clientWidth,
        toast: toast.scrollWidth <= toast.clientWidth,
        modalBot: within(bot, document.querySelector(".modal-brand > [aria-hidden='true']")),
        toastBot: within(toastBot, document.querySelector(".toast-mascot")),
      };
    });
    assert(
      modalFit.document <= width && modalFit.modal && modalFit.toast && modalFit.modalBot && modalFit.toastBot,
      "mascot overflow in modal/toast at " + width + ": " + JSON.stringify(modalFit),
    );
    if (width === 320 || width === 1440) {
      await page.screenshot({ path: `output/playwright/mascot-modal-${width}.png` });
    }
    await page.keyboard.press("Escape");
    results.push("mascot fits modal and toast at " + width);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await page.locator(".v-earth-map > svg").waitFor();
  assert(
    (await page.locator(".v-earth-marker").count()) > 0 &&
      (await page.locator(".v-earth-map canvas").count()) === 0,
    "clinic locations missing from the 2D Earth map",
  );
  assert(
    (await page.locator(".v-earth-marker").count()) === 1,
    "clinics in one city were not grouped into a single marker",
  );
  const headerAtTop = await page.locator(".v-header").evaluate((element) =>
    getComputedStyle(element).backgroundColor,
  );
  await page.evaluate(() => window.scrollTo(0, 120));
  await page.waitForFunction(() => document.querySelector(".v-header")?.classList.contains("is-scrolled"));
  const headerOnScroll = await page.locator(".v-header").evaluate((element) =>
    getComputedStyle(element).backgroundColor,
  );
  assert(headerAtTop !== headerOnScroll, "floating header opacity did not change on scroll");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator(".v-earth-marker").first().click();
  assert((await page.locator(".v-earth-detail").count()) === 1, "clinic marker did not open its list");
  results.push("2D Earth groups clinics by location and opens clinic details");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: "output/playwright/framework-earth-desktop.png" });
  await page.locator(".v-odyssey-chapter").first().evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await page.waitForTimeout(900);
  await page.screenshot({ path: "output/playwright/framework-3d-story-desktop.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator("#hero-title").waitFor();
  assert(
    (await page.locator(".v-earth-map canvas, .v-odyssey-stage canvas").count()) === 0,
    "Reduced motion loaded a canvas scene",
  );
  results.push("reduced motion uses light fallback");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.locator(".v-odyssey-stage canvas").waitFor();
  await page.locator(".v-earth-map > svg").waitFor();
  await page.screenshot({ path: "output/playwright/framework-earth-mobile-home.png" });
  assert(
    (await page.locator(".v-earth-map canvas, .v-odyssey-stage canvas").count()) === 1,
    "Mobile Earth map is not a 2D illustration",
  );
  await page.locator(".v-odyssey-chapter").nth(1).evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await page.waitForFunction(() =>
    document.querySelector(".v-odyssey-chapter.is-current h2")?.textContent.includes("Um horário"),
  );
  await page.waitForTimeout(900);
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Mobile immersive story overflows horizontally",
  );
  await page.screenshot({ path: "output/playwright/framework-earth-mobile.png" });
  results.push("mobile keeps the 2D Earth, scroll chapters and fits the viewport");
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
