/* Gráficas SVG hechas a mano: barras, curva horaria, dona y medidores.
   Sin librerías de gráficos para controlar cada animación con GSAP. */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const hasGsap = () => typeof window.gsap !== "undefined";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /** Formato es-ES con punto de miles siempre (Intl no agrupa números de 4 cifras en español). */
  function fmt(n, dec = 0) {
    const s = Math.abs(n).toFixed(dec).split(".");
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (n < 0 ? "−" : "") + s.join(",");
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * p;
  }

  /* ---------------- Tooltip ---------------- */
  const tip = document.getElementById("tooltip");
  function showTip(html, evt) {
    tip.innerHTML = html;
    tip.classList.add("is-on");
    moveTip(evt);
  }
  function moveTip(evt) {
    const pad = 14;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY - h - pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y < 8) y = evt.clientY + pad;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hideTip() { tip.classList.remove("is-on"); }

  /* ---------------- Barras ----------------
     data: [{key, label, value, dim, tip}]  · opts.tickEvery(i,d) => texto del eje o null */
  function barChart(container, data, opts = {}) {
    const state = { data, built: false };
    let svg, bars = [], labels = [], gridG, w, h;
    const m = { t: 18, r: 8, b: 28, l: opts.yAxis === false ? 8 : 44 };

    function scaleY(max) { return v => h - m.b - (v / max) * (h - m.t - m.b); }

    function build() {
      container.innerHTML = "";
      w = container.clientWidth; h = container.clientHeight;
      svg = el("svg", { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "none" }, container);
      gridG = el("g", { class: "axis" }, svg);
      const n = state.data.length;
      const band = (w - m.l - m.r) / n;
      const gap = Math.max(2, band * (opts.gap ?? 0.28));
      bars = []; labels = [];
      state.data.forEach((d, i) => {
        const x = m.l + i * band + gap / 2;
        const bw = Math.max(1, band - gap);
        const r = el("rect", { class: "bar", x, y: h - m.b, width: bw, height: 0, rx: Math.min(6, bw / 3) }, svg);
        bars.push(r);
        if (opts.valueLabels) {
          const t = el("text", { class: "val-label", x: x + bw / 2, y: h - m.b - 6, "text-anchor": "middle" }, svg);
          labels.push(t);
        }
        const tick = opts.tickEvery ? opts.tickEvery(i, d) : d.label;
        if (tick) {
          const t = el("text", { x: x + bw / 2, y: h - 8, "text-anchor": "middle" }, gridG);
          t.textContent = tick;
        }
        const hit = el("rect", { class: "bar-hit", x: m.l + i * band, y: m.t, width: band, height: h - m.t - m.b }, svg);
        hit.addEventListener("pointerenter", e => { r.classList.add("is-hover"); showTip(state.data[i].tip, e); });
        hit.addEventListener("pointermove", moveTip);
        hit.addEventListener("pointerleave", () => { r.classList.remove("is-hover"); hideTip(); });
      });
      state.built = true;
    }

    function drawGrid(max) {
      gridG.querySelectorAll(".gridline, .ytick").forEach(n => n.remove());
      if (opts.yAxis === false) return;
      const y = scaleY(max);
      for (let i = 0; i <= 4; i++) {
        const v = (max / 4) * i;
        const yy = y(v);
        el("line", { class: "gridline", x1: m.l, x2: w - m.r, y1: yy, y2: yy }, gridG);
        const t = el("text", { class: "ytick", x: m.l - 8, y: yy + 4, "text-anchor": "end" }, gridG);
        t.textContent = v >= 1000 ? fmt(v / 1000, v % 1000 ? 1 : 0) + " mil" : fmt(v);
      }
    }

    function render(animate = true, duration = 0.9) {
      if (!state.built) build();
      const max = opts.max || niceMax(Math.max(...state.data.map(d => d.value), 1) * 1.05);
      drawGrid(max);
      const y = scaleY(max);
      state.data.forEach((d, i) => {
        const r = bars[i];
        r.classList.toggle("is-dim", !!d.dim);
        const ty = y(d.value), th = h - m.b - ty;
        if (animate && hasGsap() && !reduced) {
          gsap.to(r, { attr: { y: ty, height: th }, duration, ease: "power3.out", delay: opts.stagger ? i * opts.stagger : 0 });
        } else {
          r.setAttribute("y", ty); r.setAttribute("height", th);
        }
        if (labels[i]) {
          labels[i].textContent = d.valueText ?? fmt(d.value);
          labels[i].setAttribute("y", ty - 8);
          labels[i].style.opacity = d.dim ? 0.35 : 1;
        }
      });
    }

    return {
      update(newData, animate = true) { state.data = newData; render(animate, 0.7); },
      play() { render(true, 1.1); },
      resize() { state.built = false; render(false); },
      zero() { if (!state.built) build(); },
    };
  }

  /* ---------------- Curva horaria ---------------- */
  function smoothPath(pts) {
    // Catmull-Rom → Bézier (tensión 0.5): curva suave que pasa por cada punto real.
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  function dayChart(container, perfil) {
    let svg, clipRect, dot, vline, xs, ys, w, h, pts;
    const m = { t: 24, r: 16, b: 30, l: 44 };
    let progress = 0;

    function build() {
      container.innerHTML = "";
      w = container.clientWidth; h = container.clientHeight;
      svg = el("svg", { viewBox: `0 0 ${w} ${h}` }, container);
      const defs = el("defs", {}, svg);
      const g = el("linearGradient", { id: "areaG", x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
      el("stop", { offset: 0, "stop-color": "#ff8a3d", "stop-opacity": .45 }, g);
      el("stop", { offset: 1, "stop-color": "#ff8a3d", "stop-opacity": 0 }, g);
      const clip = el("clipPath", { id: "dayClip" }, defs);
      clipRect = el("rect", { x: 0, y: 0, width: m.l, height: h }, clip);

      const max = niceMax(Math.max(...perfil.map(p => p.kwh)) * 1.08);
      xs = hr => m.l + (hr / 23) * (w - m.l - m.r);
      ys = v => h - m.b - (v / max) * (h - m.t - m.b);

      // Franjas horarias (Dim_Hora[Franja_Horaria])
      const bands = [];
      perfil.forEach(p => {
        const last = bands[bands.length - 1];
        if (!last || last.name !== p.franja) bands.push({ name: p.franja, from: p.hora, to: p.hora });
        else last.to = p.hora;
      });
      bands.forEach((b, i) => {
        const x1 = i === 0 ? m.l : (xs(b.from) + xs(b.from - 1)) / 2;
        const x2 = i === bands.length - 1 ? w - m.r : (xs(b.to) + xs(b.to + 1)) / 2;
        if (i % 2 === 0) el("rect", { class: "band", x: x1, y: m.t - 18, width: x2 - x1, height: h - m.b - m.t + 18 }, svg);
        const t = el("text", { class: "band-label", x: (x1 + x2) / 2, y: m.t - 4, "text-anchor": "middle" }, svg);
        t.textContent = b.name;
      });

      const axis = el("g", { class: "axis" }, svg);
      for (let i = 0; i <= 4; i++) {
        const v = (max / 4) * i, yy = ys(v);
        el("line", { class: "gridline", x1: m.l, x2: w - m.r, y1: yy, y2: yy }, axis);
        const t = el("text", { x: m.l - 8, y: yy + 4, "text-anchor": "end" }, axis);
        t.textContent = fmt(v, 1);
      }
      const step = w < 520 ? 6 : 3;
      perfil.forEach(p => {
        if (p.hora % step) return;
        const t = el("text", { x: xs(p.hora), y: h - 8, "text-anchor": "middle" }, axis);
        t.textContent = p.etiqueta;
      });

      pts = perfil.map(p => [xs(p.hora), ys(p.kwh)]);
      const line = smoothPath(pts);
      const area = `${line} L${pts[pts.length - 1][0]},${h - m.b} L${pts[0][0]},${h - m.b} Z`;
      const grp = el("g", { "clip-path": "url(#dayClip)" }, svg);
      el("path", { class: "area", d: area }, grp);
      el("path", { class: "line", d: line }, grp);

      vline = el("line", { class: "cursor-line", y1: m.t, y2: h - m.b }, svg);
      dot = el("circle", { class: "cursor-dot", r: 7 }, svg);
      set(progress);
    }

    function valueAt(hr) {
      const i = Math.min(22, Math.floor(hr));
      const f = hr - i;
      return perfil[i].kwh + (perfil[i + 1].kwh - perfil[i].kwh) * f;
    }

    function set(t) {
      progress = Math.max(0, Math.min(1, t));
      const hr = progress * 23;
      const x = xs(hr), y = ys(valueAt(hr));
      clipRect.setAttribute("width", x + 2);
      dot.setAttribute("cx", x); dot.setAttribute("cy", y);
      vline.setAttribute("x1", x); vline.setAttribute("x2", x);
      return { hora: Math.round(hr), kwh: valueAt(hr), x: x / w, y: y / h };
    }

    build();
    return { set, resize() { build(); } };
  }

  /* ---------------- Dona ---------------- */
  function donut(svgEl, zonas, colors) {
    const r = 84, c = 2 * Math.PI * r;
    svgEl.innerHTML = "";
    el("circle", { cx: 110, cy: 110, r, stroke: "rgba(29,29,31,.08)" }, svgEl);
    let acc = 0;
    const segs = zonas.map((z, i) => {
      const len = (z.pct / 100) * c;
      const gapLen = 3;
      const s = el("circle", {
        cx: 110, cy: 110, r,
        stroke: colors[i],
        "stroke-dasharray": `0 ${c}`,
        "stroke-dashoffset": -acc,
      }, svgEl);
      s.dataset.len = Math.max(0, len - gapLen);
      s.dataset.c = c;
      acc += len;
      s.addEventListener("pointerenter", e => showTip(`<b>${z.zona}</b><br>${fmt(z.kwh)} kWh · ${fmt(z.pct, 1)} %`, e));
      s.addEventListener("pointermove", moveTip);
      s.addEventListener("pointerleave", hideTip);
      return s;
    });
    return {
      play() {
        segs.forEach((s, i) => {
          const len = +s.dataset.len, cc = +s.dataset.c;
          if (hasGsap() && !reduced) {
            const o = { v: 0 };
            gsap.to(o, { v: len, duration: 1.2, delay: i * 0.18, ease: "power3.inOut",
              onUpdate: () => s.setAttribute("stroke-dasharray", `${o.v} ${cc}`) });
          } else s.setAttribute("stroke-dasharray", `${len} ${cc}`);
        });
      },
    };
  }

  /* ---------------- Medidor (arco de 270°) ---------------- */
  function gaugeSVG(value, max, color) {
    const r = 70, cx = 90, cy = 90, sweep = 270;
    const a0 = (135 * Math.PI) / 180;
    const arc = (deg) => {
      const a1 = a0 + (deg * Math.PI) / 180;
      const large = deg > 180 ? 1 : 0;
      return `M${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)}`;
    };
    const len = (Math.PI * 2 * r * sweep) / 360;
    const frac = Math.min(1, value / max);
    return {
      html: `<svg viewBox="0 0 180 160" aria-hidden="true">
        <path class="gauge__track" d="${arc(sweep)}"/>
        <path class="gauge__arc" d="${arc(sweep)}" stroke="${color}" stroke-dasharray="${len}" stroke-dashoffset="${len}" data-target="${len * (1 - frac)}"/>
      </svg>`,
    };
  }

  window.Charts = { barChart, dayChart, donut, gaugeSVG, fmt, showTip, moveTip, hideTip };
})();
