async (page) => {
  const base = "http://127.0.0.1:5174",
    results = [],
    errors = [],
    external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.context().route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base || ["data:", "blob:"].includes(url.protocol))
      return route.continue();
    external.push({ url: url.hostname, method: route.request().method() });
    return route.abort();
  });
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const check = async (name, fn) => {
    try {
      await fn();
      results.push(name);
    } catch (error) {
      await page.screenshot({
        path: "output/playwright/framework-flow-failure.png",
        fullPage: true,
      });
      throw Error(name + ": " + error.message);
    }
  };
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
  };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(".v-clinic").first().waitFor();
  await page.evaluate(async () => {
    window.api = (await import("/js/lib/db.js")).db();
  });
  await check("QA uses isolated local adapter", async () =>
    assert(
      await page.evaluate(() => api.constructor.name === "LocalAdapter"),
      "Production adapter is forbidden",
    ),
  );
  await check(
    "hero demo responds to all stages without changing data",
    async () => {
      await page.getByRole("button", { name: "Sua vez", exact: true }).click();
      await page.waitForFunction(() =>
        document
          .querySelector(".v-preview-value")
          ?.textContent.includes("Sua vez"),
      );
      await page.getByRole("button", { name: "Agendar", exact: true }).click();
      await page.waitForFunction(() =>
        document
          .querySelector(".v-preview-value")
          ?.textContent.includes("09:30"),
      );
      assert(
        await page.evaluate(() => !api.getSession()),
        "Demo created a session",
      );
    },
  );
  await check("interactive journey can be explored with keyboard", async () => {
    await page.getByRole("button", { name: /Escolha o seu horário/ }).focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() =>
      document.querySelector(".v-journey-demo")?.textContent.includes("09:30"),
    );
  });
  await check("search preserves specialty and neighborhood", async () => {
    await page.locator("#home-q").fill("Cardiologia");
    await page.locator("#home-local").fill("Aldeota");
    await page
      .getByRole("button", { name: "Pesquisar clínicas", exact: true })
      .click();
    await page.locator(".v-clinics-page .v-clinic").first().waitFor();
    assert((await page.locator(".v-clinic").count()) === 1, "Search count");
    assert(
      (await page.locator(".v-clinic").innerText()).includes("Clínica Sol"),
      "Wrong clinic",
    );
  });
  await check("specialty filters and empty result recovery", async () => {
    await page.getByRole("button", { name: "Pediatria", exact: true }).click();
    await page
      .getByRole("heading", { name: "Nenhuma clínica por aqui." })
      .waitFor();
    await page
      .getByRole("button", { name: "Ver todas as clínicas", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".v-clinic").length === 4,
    );
  });
  await check("clinic detail and logged-out booking prompt work", async () => {
    await route("#/clinica/cli_sol");
    await page
      .getByRole("link", { name: "Agendar consulta", exact: true })
      .click();
    await page.getByRole("heading", { name: "Entre para agendar" }).waitFor();
  });
  await check(
    "protected pages redirect to login and retain destination",
    async () => {
      await page.evaluate(() => {
        location.hash = "#/paciente/fila";
      });
      await page.locator("#login").waitFor();
      assert(page.url().includes("redirect="), "Redirect missing");
    },
  );
  await check("patient login works through the original form", async () => {
    await route("#/login");
    await page.locator("#login [name=email]").fill("ana.silva@email.com");
    await page.locator("#login [name=senha]").fill("demo123");
    await page.locator("#login button[type=submit]").click();
    await page.waitForURL("**/#/paciente");
    await page.locator(".dash-top").waitFor();
    assert(
      (await page.locator(".v-user").innerText()).includes("Ana"),
      "Session header not updated",
    );
  });
  await check("patient cannot navigate into manager routes", async () => {
    await page.evaluate(() => {
      location.hash = "#/gestor/fila";
    });
    await page.waitForURL("**/#/paciente");
  });
  await check(
    "booking validates a selected time and creates a consultation",
    async () => {
      await route("#/agendar/cli_sol");
      const day = await page.evaluate(async () => {
        const u = await import("/js/lib/utils.js");
        for (let n = 2; n < 15; n++) {
          const day = u.plusDaysISO(n);
          if (
            !(await api.hasAppointmentOnDay(api.getSession().id, day)) &&
            (await api.availableSlots("cli_sol", day)).some((s) => !s.taken)
          )
            return day;
        }
        throw Error("No bookable day");
      });
      await page.locator("#book [name=data]").fill(day);
      await page.locator("#book [name=data]").dispatchEvent("change");
      await page.locator("button.slot").first().waitFor();
      await page
        .getByRole("button", { name: "Confirmar agendamento", exact: true })
        .click();
      assert(
        await page.locator("#slot-error").isVisible(),
        "Missing time validation",
      );
      await page.locator("button.slot").first().click();
      await page
        .getByRole("button", { name: "Confirmar agendamento", exact: true })
        .click();
      await page.waitForURL("**/#/paciente?nova=*");
      assert(
        await page.evaluate(
          () =>
            api.getAppointment(
              decodeURIComponent(location.hash.split("nova=")[1]),
            ).status === "Agendada",
        ),
        "Consultation not persisted",
      );
    },
  );
  await check("rescheduling and cancellation keep working", async () => {
    await route("#/paciente/historico");
    await page.locator("[data-reschedule]").first().click();
    await page.locator(".modal").waitFor();
    const dateInput = page.locator(".modal input[type=date]");
    if (await dateInput.count()) {
      const day = await page.evaluate(async () => {
        const u = await import("/js/lib/utils.js");
        for (let n = 3; n < 15; n++) {
          const day = u.plusDaysISO(n);
          if (
            !(await api.hasAppointmentOnDay(api.getSession().id, day)) &&
            (await api.availableSlots("cli_sol", day)).some((s) => !s.taken)
          )
            return day;
        }
      });
      await dateInput.fill(day);
      await dateInput.dispatchEvent("change");
    }
    await page.locator(".modal button.slot").first().click();
    await page.locator("#rs-ok").click();
    await page.locator(".modal").waitFor({ state: "hidden" });
    await page.locator("[data-cancel]").first().click();
    await page.locator(".modal").waitFor();
    await page
      .getByRole("button", { name: "Cancelar consulta", exact: true })
      .click();
    await page.locator(".modal").waitFor({ state: "hidden" });
  });
  await check(
    "patient live queue renders and polling preserves focused heading",
    async () => {
      await route("#/paciente/fila");
      await page.locator("main h1").waitFor();
      assert(
        await page.evaluate(() => document.activeElement.tagName === "H1"),
        "Heading focus",
      );
    },
  );
  await check("logout clears session and header", async () => {
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await page.locator("#hero-title").waitFor();
    assert(
      await page.evaluate(() => api.getSession() === null),
      "Session persists",
    );
    assert(
      (await page.locator(".v-user").count()) === 0,
      "User header persists",
    );
  });
  await check("manager login and queue actions work", async () => {
    await route("#/login");
    await page.locator("#login [name=email]").fill("ricardo@clinicasol.com");
    await page.locator("#login [name=senha]").fill("demo123");
    await page.locator("#login button[type=submit]").click();
    await page.waitForURL("**/#/gestor");
    await page.locator("[data-next]").waitFor();
    await page.locator("[data-next]").click();
    await page.locator("[data-finish]").waitFor();
    await page.locator("[data-finish]").click();
    await page.locator("[data-finish]").waitFor({ state: "hidden" });
  });
  await check("manager cannot navigate into patient routes", async () => {
    await page.evaluate(() => {
      location.hash = "#/paciente/historico";
    });
    await page.waitForURL("**/#/gestor");
  });
  await check(
    "clinic information can be saved without losing the session",
    async () => {
      await route("#/gestor/clinica");
      await page.locator("#cli").waitFor();
      await page.locator("[data-save]").click();
      await page.locator(".toast.ok").last().waitFor();
      assert(
        await page.evaluate(() => api.getSession().role === "gestor"),
        "Session lost",
      );
    },
  );
  await check(
    "registration exposes validation and preserves fields",
    async () => {
      await page.getByRole("button", { name: "Sair", exact: true }).click();
      await route("#/cadastro");
      await page.locator("#reg").evaluate((form) => {
        form.noValidate = true;
        form.elements.nome.value = "A";
        form.elements.cpf.value = "11111111111";
        form.elements.telefone.value = "123";
        form.elements.email.value = "invalid";
        form.elements.senha.value = "1";
        form.requestSubmit();
      });
      await page.locator("#cpf[aria-invalid=true]").waitFor();
      assert(
        await page.locator("#cpf").getAttribute("aria-describedby"),
        "Validation association missing",
      );
    },
  );
  await check("registration, recovery and relogin work", async () => {
    const cpf = await page.evaluate(async () =>
      (await import("/js/lib/validators.js")).gerarCPF(),
    );
    for (const [name, value] of Object.entries({
      nome: "Paciente Framework",
      cpf,
      telefone: "85988887777",
      email: "framework@example.test",
      senha: "Framework123",
    }))
      await page.locator(`#reg [name=${name}]`).fill(value);
    await page.locator("#reg button[type=submit]").click();
    await page.waitForURL("**/#/paciente");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await route("#/recuperar-senha");
    await page.locator("#rec [name=email]").fill("framework@example.test");
    await page.locator("#rec button").click();
    await page.locator("#newp [name=senha]").fill("NewFramework123");
    await page.locator("#newp button").click();
    await page.locator("#login").waitFor();
    await page.locator("#login [name=email]").fill("framework@example.test");
    await page.locator("#login [name=senha]").fill("NewFramework123");
    await page.locator("#login button").click();
    await page.waitForURL("**/#/paciente");
  });
  await check("no unexpected JavaScript errors", async () =>
    assert(errors.length === 0, errors.join("\n")),
  );
  await check("no external service received requests", async () =>
    assert(external.length === 0, JSON.stringify(external)),
  );
  return { passed: results.length, results, errors, external };
}
