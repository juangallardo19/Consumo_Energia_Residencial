/* Interacción, filtros y animaciones de scroll (GSAP + ScrollTrigger + Lenis). */
(function () {
  "use strict";

  const D = window.DASHBOARD;
  const { fmt } = window.Charts;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ---------- Scroll suave ---------- */
  let lenis = null;
  if (hasGsap && !reduced && typeof window.Lenis !== "undefined") {
    lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  $$('a[href^="#"]').forEach(a => a.addEventListener("click", e => {
    const target = $(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
    else target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }));

  /* ---------- Contador animado ---------- */
  function countTo(node, to, dec = 0, from = 0, duration = 1.6) {
    if (!hasGsap || reduced) { node.textContent = fmt(to, dec); return; }
    const o = { v: from };
    gsap.to(o, { v: to, duration, ease: "power3.out", onUpdate: () => (node.textContent = fmt(o.v, dec)) });
  }

  /* =========================================================
     1. RESUMEN: réplica del dashboard con filtros Año / Estación
     ========================================================= */
  const SEASONS = ["Invierno", "Primavera", "Verano", "Otoño"];
  const YEARS = [...new Set(D.celdas.map(c => c.a))].sort();
  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const filt = { anio: null, estacion: null };
  const kpiNodes = { energia: $("#k-energia"), costo: $("#k-costo"), promedio: $("#k-promedio"), potencia: $("#k-potencia") };
  const kpiPrev = { energia: 0, costo: 0, promedio: 0, potencia: 0 };

  function buildPills(container, values, key) {
    const all = [{ v: null, t: "Todos" }, ...values.map(v => ({ v, t: String(v) }))];
    all.forEach(({ v, t }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pill";
      b.textContent = t;
      b.setAttribute("aria-pressed", String(v === filt[key]));
      b.addEventListener("click", () => {
        filt[key] = v;
        $$(".pill", container).forEach(p => p.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        refresh(true);
      });
      container.appendChild(b);
    });
  }
  buildPills($("#f-anio"), YEARS, "anio");
  buildPills($("#f-estacion"), SEASONS, "estacion");

  const inFilter = c => (filt.anio == null || c.a === filt.anio) && (filt.estacion == null || c.s === filt.estacion);

  function computeKpis() {
    const sel = D.celdas.filter(inFilter);
    const e = sel.reduce((s, c) => s + c.e, 0);
    const cost = sel.reduce((s, c) => s + c.c, 0);
    const d = sel.reduce((s, c) => s + c.d, 0);
    const p = sel.reduce((m, c) => Math.max(m, c.p), 0);
    return { energia: e, costo: cost, promedio: d ? e / d : 0, potencia: p, dias: d, meses: sel.length };
  }

  function monthData() {
    return D.celdas.map(c => ({
      key: c.am,
      value: c.e,
      dim: !inFilter(c),
      tip: `<b>${MESES[c.m - 1]} ${c.a}</b> · ${c.s}<br>${fmt(c.e)} kWh · € ${fmt(c.c)}<br>${c.d} días medidos`,
    }));
  }
  function yearData() {
    return YEARS.map(y => {
      const cs = D.celdas.filter(c => c.a === y && (filt.estacion == null || c.s === filt.estacion));
      const e = cs.reduce((s, c) => s + c.e, 0);
      const d = cs.reduce((s, c) => s + c.d, 0);
      return {
        key: y, label: String(y), value: e,
        valueText: e >= 1000 ? fmt(e / 1000, 1) + " mil" : fmt(e),
        dim: filt.anio != null && filt.anio !== y,
        tip: `<b>${y}</b>${filt.estacion ? " · " + filt.estacion : ""}<br>${fmt(e)} kWh en ${d} días`,
      };
    });
  }

  const monthChart = window.Charts.barChart($("#chart-mes"), monthData(), {
    gap: 0.3,
    stagger: 0.012,
    tickEvery: (i, d) => {
      const [y, m] = d.key.split("-");
      if (m === "01") return window.innerWidth < 560 ? "’" + y.slice(2) : y;
      return null;
    },
  });
  const yearChart = window.Charts.barChart($("#chart-anio"), yearData(), { gap: 0.4, yAxis: false, valueLabels: true, stagger: 0.06 });

  function renderKpis(animate) {
    const k = computeKpis();
    const dec = { energia: 0, costo: 0, promedio: 2, potencia: 2 };
    for (const key in kpiNodes) {
      if (animate) countTo(kpiNodes[key], k[key], dec[key], kpiPrev[key], 0.9);
      else kpiNodes[key].textContent = fmt(k[key], dec[key]);
      kpiPrev[key] = k[key];
    }
    $("#k-dias").textContent = `${fmt(k.dias)} días con medición`;
    const scope = [filt.anio, filt.estacion].filter(Boolean).join(" · ");
    $("#k-energia-sub").textContent = scope ? `Filtro: ${scope}` : "dic-2006 a nov-2010";
  }

  function refresh(animate) {
    renderKpis(animate);
    monthChart.update(monthData(), animate);
    yearChart.update(yearData(), animate);
  }

  /* =========================================================
     2. ZONAS, ESTACIONES, CLIMA, TIPO DE DÍA (contenido)
     ========================================================= */
  const ZONE_BG = ["var(--yellow)", "var(--lilac)", "var(--sky)", "var(--mint)"];
  const ZONE_STROKE = ["#f2b92c", "#9a7bff", "#47aee0", "#1d1d1f"];
  const zonas = D.zonas;
  const zonaCards = $("#zona-cards");
  zonas.forEach((z, i) => {
    const a = document.createElement("article");
    a.className = "zcard";
    a.style.setProperty("--c", ZONE_BG[i]);
    a.innerHTML = `
      <div class="zcard__top"><span class="tag">${["Submedidor 1", "Submedidor 2", "Submedidor 3", "Calculado"][i]}</span>
      <span class="zcard__pct"><span data-zpct="${z.pct}">0</span>%</span></div>
      <h3>${z.zona}</h3>
      <p>${z.equipos}</p>
      <div class="progress"><span>Energía</span><span>${fmt(z.kwh)} kWh</span></div>
      <div class="progress__track"><div class="progress__fill" data-fill="${z.pct / 100}"></div></div>`;
    zonaCards.appendChild(a);
  });
  const donutChart = window.Charts.donut($("#donut"), zonas, ZONE_STROKE);

  const SEASON_COLOR = { Invierno: "#a8dcf5", Primavera: "#bfe8cc", Verano: "#ffd666", "Otoño": "#ff8a3d" };
  const gaugesEl = $("#gauges");
  const gMax = 40;
  D.estacion.forEach(s => {
    const g = document.createElement("div");
    g.className = "gauge reveal-card";
    g.innerHTML = `${window.Charts.gaugeSVG(s.kwh_dia, gMax, SEASON_COLOR[s.estacion]).html}
      <div class="gauge__val" data-count="${s.kwh_dia}" data-decimals="1">0</div>
      <div class="gauge__unit">kWh / día</div>
      <div class="gauge__name">${s.estacion}</div>`;
    g.addEventListener("pointerenter", e => window.Charts.showTip(`<b>${s.estacion}</b><br>${fmt(s.kwh_dia, 2)} kWh por día en promedio`, e));
    g.addEventListener("pointermove", window.Charts.moveTip);
    g.addEventListener("pointerleave", window.Charts.hideTip);
    gaugesEl.appendChild(g);
  });

  function hbars(container, rows, color, max) {
    rows.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "hrow";
      row.innerHTML = `<span class="hrow__name">${r.name}<small>${r.sub}</small></span>
        <span class="hrow__track"><span class="hrow__fill" style="display:block;background:${color[i]}" data-fill="${r.value / max}"></span></span>
        <span class="hrow__val" data-count="${r.value}" data-decimals="1">0</span>`;
      container.appendChild(row);
    });
  }
  hbars($("#termica"), D.termica.map(t => ({ name: t.categoria, sub: `${fmt(t.temp, 1)} °C · ${t.dias} días`, value: t.kwh_dia })),
    ["#a8dcf5", "#bfe8cc", "#ff8a3d"], 36);
  const tipoOrden = ["Laborable", "Fin de semana", "Festivo"];
  const tipos = tipoOrden.map(t => D.tipo_dia.find(x => x.tipo === t));
  hbars($("#tipodia"), tipos.map(t => ({ name: t.tipo, sub: `${t.dias} días`, value: t.kwh_dia })),
    ["#cdbcff", "#ffb547", "#ffd666"], 36);

  /* =========================================================
     3. GRÁFICA HORARIA
     ========================================================= */
  const day = window.Charts.dayChart($("#chart-hora"), D.perfil_horario);
  const sun = $("#sky-sun");
  const diaHora = $("#dia-hora"), diaFranja = $("#dia-franja"), diaKwh = $("#dia-kwh");
  function setDay(t) {
    const r = day.set(t);
    const p = D.perfil_horario[r.hora];
    diaHora.textContent = p.etiqueta;
    diaFranja.textContent = p.franja;
    diaKwh.textContent = fmt(r.kwh, 2);
    // El sol sale y se pone siguiendo un arco sobre la gráfica
    const arc = Math.sin(Math.PI * Math.min(1, Math.max(0, (t * 23 - 5) / 16)));
    sun.style.left = `calc(${t * 100}% - ${t * 44}px)`;
    sun.style.transform = `translateY(${70 - arc * 70}px)`;
    sun.style.opacity = 0.25 + arc * 0.75;
  }

  /* =========================================================
     4. SIN GSAP (offline o movimiento reducido): todo estático
     ========================================================= */
  if (!hasGsap || reduced) {
    refresh(false);
    donutChart.play();
    setDay(20 / 23);
    $$("[data-count]").forEach(n => (n.textContent = fmt(+n.dataset.count, +(n.dataset.decimals || 0))));
    $$("[data-zpct]").forEach(n => (n.textContent = fmt(+n.dataset.zpct, 1)));
    $$("[data-fill]").forEach(n => (n.style.transform = `scaleX(${n.dataset.fill})`));
    $$(".gauge__arc").forEach(a => a.setAttribute("stroke-dashoffset", a.dataset.target));
    $$(".flow__step").forEach(s => s.classList.add("is-on"));
    $("#flow-path").style.strokeDashoffset = 0;
    $$(".fstep").forEach(s => s.style.setProperty("--p", 1));
    wireCommon();
    return;
  }

  /* =========================================================
     5. ANIMACIONES CON GSAP
     ========================================================= */

  // Títulos: cada palabra sube desde una máscara
  $$(".split").forEach(h => {
    h.innerHTML = h.textContent.trim().split(/\s+/).map(w => `<span class="w"><span>${w}</span></span>`).join(" ");
    gsap.from($$(".w > span", h), {
      yPercent: 110, rotate: 4, duration: 1, ease: "power4.out", stagger: 0.05,
      scrollTrigger: { trigger: h, start: "top 85%" },
    });
  });

  // Intro del hero
  const intro = gsap.timeline({ defaults: { ease: "power4.out" } });
  intro
    .from(".nav", { y: -40, opacity: 0, duration: 1 })
    .from(".hero__title .line > span", { yPercent: 115, duration: 1.2, stagger: 0.1 }, "<0.1")
    .from(".hero .reveal", { y: 24, opacity: 0, duration: 1, stagger: 0.1 }, "<0.4")
    .from(".orb", { scale: 0.6, opacity: 0, duration: 1.4, ease: "elastic.out(1, 0.7)" }, 0.3)
    .from(".house", { y: 80, opacity: 0, duration: 1.2 }, 0.5)
    .from(".chip", { scale: 0.7, opacity: 0, duration: 0.8, stagger: 0.12, ease: "back.out(2)" }, 0.9)
    .from(".scroll-hint", { opacity: 0, duration: 1 }, 1.2);
  $$(".hero [data-count]").forEach(n => countTo(n, +n.dataset.count, +(n.dataset.decimals || 0), 0, 2.4));

  // Parallax del hero por capas (data-speed)
  $$(".hero [data-speed]").forEach(layer => {
    const s = parseFloat(layer.dataset.speed);
    gsap.to(layer, {
      y: () => s * window.innerHeight * 0.9,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true },
    });
  });
  gsap.to(".hero__copy", {
    y: () => window.innerHeight * 0.25, opacity: 0, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
  });

  // Parallax con el mouse (solo punteros finos)
  if (window.matchMedia("(pointer: fine)").matches) {
    gsap.set("[data-mouse]", { "--mx": "0px", "--my": "0px" });
    const movers = $$("[data-mouse]").map(n => ({
      n, k: +n.dataset.mouse,
      x: gsap.quickTo(n, "--mx", { duration: 0.9, ease: "power3.out" }),
      y: gsap.quickTo(n, "--my", { duration: 0.9, ease: "power3.out" }),
    }));
    $(".hero").addEventListener("pointermove", e => {
      const cx = e.clientX / window.innerWidth - 0.5, cy = e.clientY / window.innerHeight - 0.5;
      movers.forEach(m => { m.x(cx * m.k + "px"); m.y(cy * m.k + "px"); });
    });
  }

  // Revelados genéricos
  $$(".reveal:not(.hero .reveal)").forEach(n => gsap.from(n, {
    y: 30, opacity: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: n, start: "top 88%" },
  }));
  ScrollTrigger.batch(".reveal-card", {
    start: "top 88%",
    onEnter: els => gsap.fromTo(els, { y: 60, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 1.1, ease: "power3.out", stagger: 0.1, overwrite: true }),
  });
  gsap.set(".reveal-card", { opacity: 0 });

  // Contadores (fuera del hero)
  $$("[data-count]:not(.hero [data-count])").forEach(n => {
    ScrollTrigger.create({
      trigger: n, start: "top 90%", once: true,
      onEnter: () => countTo(n, +n.dataset.count, +(n.dataset.decimals || 0)),
    });
  });

  // Embudo
  gsap.from(".fstep", {
    y: 50, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.12,
    scrollTrigger: { trigger: ".funnel__steps", start: "top 85%" },
  });
  $$(".fstep").forEach((s, i) => gsap.to(s, {
    "--p": 1, duration: 1.2, delay: 0.3 + i * 0.15, ease: "power2.inOut",
    scrollTrigger: { trigger: ".funnel__steps", start: "top 80%" },
  }));

  // Resumen: KPIs y barras al entrar
  ScrollTrigger.create({
    trigger: "#resumen .panel", start: "top 75%", once: true,
    onEnter: () => { monthChart.play(); yearChart.play(); renderKpis(true); },
  });
  $$("#resumen .kpi").forEach((k, i) => gsap.from(k, {
    y: 40, opacity: 0, duration: 0.9, delay: i * 0.08, ease: "power3.out",
    scrollTrigger: { trigger: "#resumen .kpis", start: "top 85%" },
  }));

  // Un día en la casa: sección fija; el scroll avanza el reloj de 00:00 a 23:00
  setDay(0);
  ScrollTrigger.matchMedia({
    "(min-width: 861px)": () => {
      ScrollTrigger.create({
        trigger: ".dia", start: "top top", end: "+=180%", pin: ".dia__pin", scrub: true,
        onUpdate: self => setDay(self.progress),
      });
    },
    "(max-width: 860px)": () => {
      ScrollTrigger.create({
        trigger: ".dia__chart", start: "top 80%", end: "bottom 35%", scrub: true,
        onUpdate: self => setDay(self.progress),
      });
    },
  });

  // Zonas
  ScrollTrigger.create({ trigger: ".donut-wrap", start: "top 75%", once: true, onEnter: () => donutChart.play() });
  gsap.fromTo("#donut", { rotation: -160 }, {
    rotation: -90, ease: "none",
    scrollTrigger: { trigger: ".zonas", start: "top bottom", end: "bottom top", scrub: true },
  });
  ScrollTrigger.batch(".zcard", {
    start: "top 88%",
    onEnter: els => {
      gsap.fromTo(els, { y: 70, opacity: 0, rotate: 2 }, { y: 0, opacity: 1, rotate: 0, duration: 1, ease: "power3.out", stagger: 0.1 });
      els.forEach(card => {
        const f = $("[data-fill]", card), p = $("[data-zpct]", card);
        gsap.to(f, { scaleX: +f.dataset.fill, duration: 1.4, delay: 0.3, ease: "power3.out" });
        countTo(p, +p.dataset.zpct, 1);
      });
    },
  });
  gsap.set(".zcard", { opacity: 0 });
  $(".light").addEventListener("mouseleave", window.Charts.hideTip);

  // Estaciones: arcos de los medidores
  $$(".gauge__arc").forEach((a, i) => gsap.to(a, {
    strokeDashoffset: +a.dataset.target, duration: 1.6, delay: i * 0.12, ease: "power3.inOut",
    scrollTrigger: { trigger: "#gauges", start: "top 80%" },
  }));
  $$(".hrow__fill").forEach(f => gsap.to(f, {
    scaleX: +f.dataset.fill, duration: 1.3, ease: "power3.out",
    scrollTrigger: { trigger: f.closest(".panel"), start: "top 80%" },
  }));

  // Pipeline: la línea se dibuja con el scroll y enciende cada paso
  const steps = $$(".flow__step");
  gsap.to("#flow-path", {
    strokeDashoffset: 0, ease: "none",
    scrollTrigger: {
      trigger: "#flow", start: "top 80%", end: "bottom 45%", scrub: true,
      onUpdate: self => steps.forEach((s, i) => s.classList.toggle("is-on", self.progress >= i / (steps.length - 1) - 0.02)),
    },
  });
  gsap.from(".source", {
    y: (i) => 40 + i * 30, ease: "none",
    scrollTrigger: { trigger: ".sources", start: "top bottom", end: "bottom 60%", scrub: true },
  });

  // Dashboard: la "laptop" se endereza y crece con el scroll
  gsap.fromTo(".device__screen",
    { rotateX: 28, scale: 0.86, y: 40 },
    { rotateX: 0, scale: 1, y: 0, ease: "none", scrollTrigger: { trigger: "#device", start: "top 95%", end: "top 25%", scrub: true } });

  wireCommon();

  /* ---------- Comunes: nav, pantalla completa, resize ---------- */
  function wireCommon() {
    const nav = $("#nav");
    let lastY = window.scrollY;
    const links = $$(".nav__links a");
    const sections = links.map(a => $(a.getAttribute("href")));
    const onScroll = () => {
      const y = window.scrollY;
      nav.classList.toggle("is-hidden", y > lastY && y > 400);
      lastY = y;
      let current = null;
      sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top < window.innerHeight * 0.4) current = i; });
      links.forEach((a, i) => a.classList.toggle("is-active", i === current));
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    $("#btn-full").addEventListener("click", () => {
      const f = $("#pbi");
      (f.requestFullscreen || f.webkitRequestFullscreen || (() => window.open(f.src, "_blank"))).call(f);
    });

    let rt;
    let lastW = window.innerWidth;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (window.innerWidth === lastW) return; // ignora cambios de alto (barra del navegador móvil)
        lastW = window.innerWidth;
        monthChart.resize(); yearChart.resize(); day.resize();
        if (hasGsap) ScrollTrigger.refresh();
      }, 200);
    });
  }
})();
