/* Interacción, filtros y animaciones de scroll.
   GSAP 3.14 (ScrollTrigger, SplitText, DrawSVG) + Lenis para el scroll suave. */
(function () {
  "use strict";

  const D = window.DASHBOARD;
  const { fmt } = window.Charts;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  const hasSplit = hasGsap && typeof window.SplitText !== "undefined";
  const hasDraw = hasGsap && typeof window.DrawSVGPlugin !== "undefined";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  if (hasGsap) gsap.registerPlugin(...[ScrollTrigger, window.SplitText, window.DrawSVGPlugin].filter(Boolean));

  /* ---------- Scroll suave ---------- */
  let lenis = null;
  if (hasGsap && !reduced && typeof window.Lenis !== "undefined") {
    lenis = new Lenis({ duration: 1.1, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  $$('a[href^="#"]').forEach(a => a.addEventListener("click", e => {
    const target = $(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.3 });
    else target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }));

  /* ---------- Contador animado ---------- */
  function countTo(node, to, dec = 0, from = 0, duration = 1.4) {
    if (!hasGsap || reduced) { node.textContent = fmt(to, dec); return; }
    const o = { v: from };
    gsap.to(o, { v: to, duration, ease: "power3.out", onUpdate: () => (node.textContent = fmt(o.v, dec)) });
  }

  /* =========================================================
     1. RESUMEN: réplica del dashboard con filtros Año / Estación
     ========================================================= */
  const SEASONS = ["Invierno", "Primavera", "Verano", "Otoño"];
  const YEARS = [...new Set(D.celdas.map(c => c.a))].sort();
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const filt = { anio: null, estacion: null };
  const kpiNodes = { energia: $("#k-energia"), costo: $("#k-costo"), promedio: $("#k-promedio"), potencia: $("#k-potencia") };
  const kpiPrev = { energia: 0, costo: 0, promedio: 0, potencia: 0 };

  function buildPills(container, values, key) {
    [{ v: null, t: "Todos" }, ...values.map(v => ({ v, t: String(v) }))].forEach(({ v, t }) => {
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
    return { energia: e, costo: cost, promedio: d ? e / d : 0, potencia: p, dias: d };
  }

  const monthData = () => D.celdas.map(c => ({
    key: c.am,
    value: c.e,
    dim: !inFilter(c),
    tip: `<b>${MESES[c.m - 1]} ${c.a}</b>, ${c.s.toLowerCase()}<br>${fmt(c.e)} kWh y € ${fmt(c.c)}<br>${c.d} días medidos`,
  }));
  const yearData = () => YEARS.map(y => {
    const cs = D.celdas.filter(c => c.a === y && (filt.estacion == null || c.s === filt.estacion));
    const e = cs.reduce((s, c) => s + c.e, 0);
    const d = cs.reduce((s, c) => s + c.d, 0);
    return {
      key: y, label: String(y), value: e,
      valueText: e >= 1000 ? fmt(e / 1000, 1) + " mil" : fmt(e),
      dim: filt.anio != null && filt.anio !== y,
      tip: `<b>${y}</b>${filt.estacion ? ", " + filt.estacion.toLowerCase() : ""}<br>${fmt(e)} kWh en ${d} días`,
    };
  });

  const monthChart = window.Charts.barChart($("#chart-mes"), monthData(), {
    gap: 0.3,
    stagger: 0.012,
    tickEvery: (i, d) => {
      const [y, m] = d.key.split("-");
      return m === "01" ? (window.innerWidth < 560 ? "’" + y.slice(2) : y) : null;
    },
  });
  const yearChart = window.Charts.barChart($("#chart-anio"), yearData(), { gap: 0.4, yAxis: false, valueLabels: true, stagger: 0.06 });

  function renderKpis(animate) {
    const k = computeKpis();
    const dec = { energia: 0, costo: 0, promedio: 2, potencia: 2 };
    for (const key in kpiNodes) {
      if (animate) countTo(kpiNodes[key], k[key], dec[key], kpiPrev[key], 0.6);
      else kpiNodes[key].textContent = fmt(k[key], dec[key]);
      kpiPrev[key] = k[key];
    }
    $("#k-dias").textContent = `${fmt(k.dias)} días con medición`;
    const scope = [filt.anio, filt.estacion].filter(Boolean).join(", ");
    $("#k-energia-sub").textContent = scope ? `Filtro: ${scope}` : "de dic-2006 a nov-2010";
  }

  function refresh(animate) {
    renderKpis(animate);
    monthChart.update(monthData(), animate);
    yearChart.update(yearData(), animate);
  }

  /* =========================================================
     2. ZONAS, ESTACIONES, CLIMA, TIPO DE DÍA
     ========================================================= */
  const ZONE_BG = ["var(--yellow)", "var(--lilac)", "var(--sky)", "var(--mint)"];
  const ZONE_STROKE = ["#f2b92c", "#9a7bff", "#47aee0", "#1d1d1f"];
  const ZONE_TAG = ["Submedidor 1", "Submedidor 2", "Submedidor 3", "Calculado"];
  D.zonas.forEach((z, i) => {
    const a = document.createElement("article");
    a.className = "zcard";
    a.style.setProperty("--c", ZONE_BG[i]);
    a.innerHTML = `
      <div class="zcard__top"><span class="tag">${ZONE_TAG[i]}</span>
      <span class="zcard__pct"><span data-zpct="${z.pct}">0</span>%</span></div>
      <h3>${z.zona}</h3>
      <p>${z.equipos}</p>
      <div class="progress"><span>Energía</span><span>${fmt(z.kwh)} kWh</span></div>
      <div class="progress__track"><div class="progress__fill" data-fill="${z.pct / 100}"></div></div>`;
    $("#zona-cards").appendChild(a);
  });
  const donutChart = window.Charts.donut($("#donut"), D.zonas, ZONE_STROKE);

  const SEASON_BG = { Invierno: "var(--sky)", Primavera: "var(--mint)", Verano: "var(--yellow)", "Otoño": "var(--peach)" };
  D.estacion.forEach(s => {
    const g = document.createElement("div");
    g.className = "gauge";
    g.style.setProperty("--c", SEASON_BG[s.estacion]);
    g.innerHTML = `<div class="gauge__dial">${window.Charts.gaugeSVG(s.kwh_dia, 40).html}
        <div class="gauge__read"><span class="gauge__val" data-count="${s.kwh_dia}" data-decimals="1">0</span><span class="gauge__unit">kWh por día</span></div>
      </div>
      <span class="tag">${s.estacion}</span>`;
    g.addEventListener("pointerenter", e => window.Charts.showTip(`<b>${s.estacion}</b><br>${fmt(s.kwh_dia, 2)} kWh por día en promedio`, e));
    g.addEventListener("pointermove", window.Charts.moveTip);
    g.addEventListener("pointerleave", window.Charts.hideTip);
    $("#gauges").appendChild(g);
  });

  function hbars(container, rows, colors, max) {
    rows.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "hrow";
      row.innerHTML = `<span class="hrow__name">${r.name}<small>${r.sub}</small></span>
        <span class="hrow__track"><span class="hrow__fill" style="background:${colors[i]}" data-fill="${r.value / max}"></span></span>
        <span class="hrow__val" data-count="${r.value}" data-decimals="1">0</span>`;
      container.appendChild(row);
    });
  }
  hbars($("#termica"), D.termica.map(t => ({ name: t.categoria, sub: `${fmt(t.temp, 1)} °C, ${t.dias} días`, value: t.kwh_dia })),
    ["var(--sky)", "var(--mint)", "var(--peach)"], 36);
  const tipos = ["Laborable", "Fin de semana", "Festivo"].map(t => D.tipo_dia.find(x => x.tipo === t));
  hbars($("#tipodia"), tipos.map(t => ({ name: t.tipo, sub: `${t.dias} días`, value: t.kwh_dia })),
    ["var(--lilac)", "var(--yellow)", "var(--mint)"], 36);

  /* =========================================================
     3. GRÁFICA HORARIA
     ========================================================= */
  const day = window.Charts.dayChart($("#chart-hora"), D.perfil_horario);
  const sun = $("#sky-sun"), sky = $(".sky");
  const diaHora = $("#dia-hora"), diaFranja = $("#dia-franja"), diaKwh = $("#dia-kwh");
  function setDay(t) {
    const r = day.set(t);
    const p = D.perfil_horario[r.hora];
    diaHora.textContent = p.etiqueta;
    diaFranja.textContent = p.franja;
    diaKwh.textContent = fmt(r.kwh, 2);
    // El sol recorre un arco: sale a las 5:00 y se pone a las 21:00
    const arc = Math.sin(Math.PI * Math.min(1, Math.max(0, (t * 23 - 5) / 16)));
    const x = t * (sky.clientWidth - 36);
    sun.style.transform = `translate(${x}px, ${54 - arc * 54}px)`;
    sun.style.opacity = 0.35 + arc * 0.65;
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
    wireCommon();
    return;
  }

  /* =========================================================
     5. MOMENTO PRINCIPAL: la casa se arma al cargar
     ========================================================= */
  const heroTl = gsap.timeline({ defaults: { ease: "expo.out" } });
  heroTl.from(".nav", { y: -24, opacity: 0, duration: 0.8 }, 0);
  if (hasSplit) {
    SplitText.create("#hero-title", {
      type: "lines", mask: "lines", autoSplit: true,
      onSplit: self => heroTl.from(self.lines, { yPercent: 105, duration: 1.1, stagger: 0.08 }, 0.1),
    });
  }
  heroTl
    .from(".hero-in", { y: 16, opacity: 0, duration: 0.9, stagger: 0.08 }, 0.45)
    .from(".house__ground", { scaleX: 0, duration: 0.9, ease: "power3.inOut" }, 0.2)
    .from(".room", { scaleY: 0, transformOrigin: "50% 100%", duration: 0.9, stagger: { each: 0.1, from: "start" } }, 0.45)
    .from(".house__roof", { yPercent: -45, opacity: 0, duration: 1 }, 0.85)
    .from(".house__caption", { opacity: 0, duration: 0.6 }, 1.2);
  $$(".house [data-count]").forEach(n => heroTl.add(() => countTo(n, +n.dataset.count, +(n.dataset.decimals || 0), 0, 1.6), 0.7));

  // Parallax: al bajar, la casa se "despieza" en capas a distintas velocidades
  ScrollTrigger.matchMedia({
    "(min-width: 861px)": () => {
      $$(".house [data-speed]").forEach(layer => {
        const s = parseFloat(layer.dataset.speed);
        gsap.to(layer, {
          y: () => s * window.innerHeight * 0.55,
          ease: "none",
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6, invalidateOnRefresh: true },
        });
      });
      gsap.to(".hero__copy", {
        y: () => window.innerHeight * 0.18, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6 },
      });
    },
  });

  /* ---------- Títulos de sección: líneas que suben desde una máscara ---------- */
  if (hasSplit) {
    $$(".split").forEach(h => SplitText.create(h, {
      type: "lines", mask: "lines", autoSplit: true,
      onSplit: self => gsap.from(self.lines, {
        yPercent: 105, duration: 1, ease: "expo.out", stagger: 0.08,
        scrollTrigger: { trigger: h, start: "top 88%", once: true },
      }),
    }));
  }

  /* ---------- Contadores al entrar en pantalla ---------- */
  $$("[data-count]:not(.house [data-count])").forEach(n => ScrollTrigger.create({
    trigger: n, start: "top 92%", once: true,
    onEnter: () => countTo(n, +n.dataset.count, +(n.dataset.decimals || 0)),
  }));

  /* ---------- Pasos del ETL: la secuencia se recorre con el scroll ---------- */
  gsap.from(".step", {
    y: (i) => 24 + i * 22, ease: "none",
    scrollTrigger: { trigger: "#steps", start: "top bottom", end: "top 55%", scrub: 0.6 },
  });

  /* ---------- Resumen ---------- */
  ScrollTrigger.create({
    trigger: ".board", start: "top 72%", once: true,
    onEnter: () => { monthChart.play(); yearChart.play(); renderKpis(true); },
  });
  gsap.from(".board", {
    y: 80, rotate: -1.2, ease: "none",
    scrollTrigger: { trigger: ".board", start: "top bottom", end: "top 45%", scrub: 0.6 },
  });

  /* ---------- Un día en la casa: el scroll avanza el reloj ---------- */
  setDay(0);
  ScrollTrigger.matchMedia({
    "(min-width: 861px)": () => {
      ScrollTrigger.create({
        trigger: ".dia", start: "top top", end: "+=170%", pin: ".dia__pin", scrub: 0.5,
        onUpdate: self => setDay(self.progress),
      });
    },
    "(max-width: 860px)": () => {
      ScrollTrigger.create({
        trigger: ".chart-card--day", start: "top 80%", end: "bottom 35%", scrub: 0.5,
        onUpdate: self => setDay(self.progress),
      });
    },
  });

  /* ---------- Zonas ---------- */
  ScrollTrigger.create({ trigger: ".donut-wrap", start: "top 75%", once: true, onEnter: () => donutChart.play() });
  gsap.fromTo("#donut", { rotation: -150 }, {
    rotation: -90, ease: "none",
    scrollTrigger: { trigger: ".zonas", start: "top bottom", end: "center center", scrub: 0.6 },
  });
  gsap.from(".zcard", {
    y: (i) => 30 + (i % 2) * 50, ease: "none",
    scrollTrigger: { trigger: ".zona-cards", start: "top bottom", end: "top 50%", scrub: 0.6 },
  });
  ScrollTrigger.create({
    trigger: ".zona-cards", start: "top 75%", once: true,
    onEnter: () => $$(".zcard").forEach((card, i) => {
      const f = $("[data-fill]", card), p = $("[data-zpct]", card);
      gsap.to(f, { scaleX: +f.dataset.fill, duration: 1.2, delay: i * 0.08, ease: "power3.out" });
      countTo(p, +p.dataset.zpct, 1);
    }),
  });

  /* ---------- Clima ---------- */
  ScrollTrigger.create({
    trigger: "#gauges", start: "top 80%", once: true,
    onEnter: () => $$(".gauge__arc").forEach((a, i) => gsap.to(a, {
      strokeDashoffset: +a.dataset.target, duration: 1.4, delay: i * 0.1, ease: "power3.inOut",
    })),
  });
  gsap.from(".gauge", {
    y: (i) => 20 + i * 24, ease: "none",
    scrollTrigger: { trigger: "#gauges", start: "top bottom", end: "top 55%", scrub: 0.6 },
  });
  $$(".clima__grid .card").forEach(card => ScrollTrigger.create({
    trigger: card, start: "top 80%", once: true,
    onEnter: () => $$(".hrow__fill", card).forEach((f, i) => gsap.to(f, {
      scaleX: +f.dataset.fill, duration: 1.1, delay: i * 0.08, ease: "power3.out",
    })),
  }));

  /* ---------- Pipeline: la línea se dibuja y enciende cada paso ---------- */
  const steps = $$(".flow__step");
  const flowVars = hasDraw ? { drawSVG: "0% 0%" } : { strokeDasharray: 1000, strokeDashoffset: 1000 };
  gsap.fromTo("#flow-path", flowVars, {
    ...(hasDraw ? { drawSVG: "0% 100%" } : { strokeDashoffset: 0 }),
    ease: "none",
    scrollTrigger: {
      trigger: "#flow", start: "top 80%", end: "bottom 50%", scrub: 0.5,
      onUpdate: self => steps.forEach((s, i) => s.classList.toggle("is-on", self.progress >= i / (steps.length - 1) - 0.02)),
    },
  });
  gsap.from(".source", {
    y: (i) => 30 + i * 28, ease: "none",
    scrollTrigger: { trigger: ".sources", start: "top bottom", end: "top 50%", scrub: 0.6 },
  });

  /* ---------- Dashboard: la pantalla se endereza ---------- */
  gsap.fromTo(".device__screen",
    { rotateX: 24, scale: 0.88, y: 30 },
    { rotateX: 0, scale: 1, y: 0, ease: "none", scrollTrigger: { trigger: "#device", start: "top 95%", end: "top 30%", scrub: 0.6 } });

  wireCommon();

  /* ---------- Comunes: nav, pantalla completa, resize ---------- */
  function wireCommon() {
    const nav = $("#nav");
    let lastY = window.scrollY;
    const links = $$(".nav__links a");
    const sections = links.map(a => $(a.getAttribute("href")));
    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      nav.classList.toggle("is-hidden", y > lastY && y > 400);
      lastY = y;
      let current = null;
      sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top < window.innerHeight * 0.4) current = i; });
      links.forEach((a, i) => a.classList.toggle("is-active", i === current));
    }, { passive: true });

    $("#btn-full").addEventListener("click", () => {
      const f = $("#pbi");
      const req = f.requestFullscreen || f.webkitRequestFullscreen;
      if (req) req.call(f); else window.open(f.src, "_blank", "noopener");
    });

    let rt, lastW = window.innerWidth;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (window.innerWidth === lastW) return; // ignora la barra del navegador móvil
        lastW = window.innerWidth;
        monthChart.resize(); yearChart.resize(); day.resize();
        if (hasGsap) ScrollTrigger.refresh();
      }, 200);
    });
  }
})();
