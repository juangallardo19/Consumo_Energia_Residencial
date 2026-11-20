import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { gsap } from 'gsap';
import { Motion, Reveal, Split, Stagger } from '../core/motion';
import { PBI } from '../data/modelo';

const URL_PBI = 'https://app.powerbi.com/view?r=eyJrIjoiMDk2Mjc3ZTQtOTkwNS00YzcxLWI5MGItOWQ0MjgwMjU5OWIzIiwidCI6IjhkMzY4MzZlLTZiNzUtNGRlNi1iYWI5LTVmNGIxNzc1NDI3ZiIsImMiOjR9';

/* ================================================================ Navegación */
@Component({
  selector: 'app-nav',
  template: `
    <header class="nav" [class.is-hidden]="oculto()">
      <span class="nav__progress" [style.transform]="'scaleX(' + progreso() + ')'" aria-hidden="true"></span>
      <button type="button" class="brand" (click)="motion.irA('#inicio')" aria-label="Volver al inicio">
        <span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6z" /></svg></span>
        <span class="brand__text">Energía en casa</span>
      </button>
      <nav class="nav__links" aria-label="Secciones">
        @for (l of links; track l.id; let i = $index) {
          <a [href]="'#' + l.id" [class.is-active]="activo() === i" (click)="ir($event, l.id)">{{ l.txt }}</a>
        }
      </nav>
      <button type="button" class="btn btn--coral btn--sm" (click)="motion.irA('#dashboard')">Ver dashboard</button>
    </header>`,
})
export class Nav {
  protected readonly motion = inject(Motion);
  protected readonly links = [
    { id: 'proyecto', txt: 'Proyecto' }, { id: 'resumen', txt: 'Resumen' }, { id: 'patrones', txt: 'Patrones' },
    { id: 'eventos', txt: 'Eventos' }, { id: 'zonas', txt: 'Zonas' }, { id: 'clima', txt: 'Clima' },
    { id: 'costo', txt: 'Costo' }, { id: 'anova', txt: 'ANOVA' },
  ];
  protected readonly oculto = signal(false);
  protected readonly activo = signal<number | null>(null);
  protected readonly progreso = signal(0);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      let ultimo = window.scrollY;
      const onScroll = () => {
        const y = window.scrollY;
        this.oculto.set(y > ultimo && y > 400);
        ultimo = y;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        this.progreso.set(max > 0 ? y / max : 0);
        let actual: number | null = null;
        this.links.forEach((l, i) => {
          const s = document.getElementById(l.id);
          if (s && s.getBoundingClientRect().top < window.innerHeight * 0.4) actual = i;
        });
        this.activo.set(actual);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      destroy.onDestroy(() => window.removeEventListener('scroll', onScroll));
    });
  }
  protected ir(e: Event, id: string) { e.preventDefault(); this.motion.irA('#' + id); }
}

/* ================================================================ Pipeline */
@Component({
  selector: 'app-pipeline',
  imports: [Split, Stagger],
  template: `
    <section class="section" id="pipeline">
      <div class="container">
        <div class="section__head">
          <p class="eyebrow">Cómo se construyó</p>
          <h2 class="h2" appSplit>Cuatro fuentes, un modelo estrella.</h2>
        </div>
        <div class="sources" appStagger=".source" [staggerBase]="30" [staggerPaso]="28">
          <article class="source" style="--c:var(--yellow)">
            <span class="tag">Fuente 1</span><h3>UCI ML Repository</h3>
            <p>Consumo minuto a minuto: potencia, voltaje, intensidad y 3 submedidores, de dic-2006 a nov-2010.</p>
            <span class="source__meta">.txt con 2.075.259 filas</span>
          </article>
          <article class="source" style="--c:var(--lilac)">
            <span class="tag">Fuente 2</span><h3>Meteostat</h3>
            <p>Temperatura, humedad, viento y presión por hora en París-Montsouris, a 7 km de la casa.</p>
            <span class="source__meta">.csv.gz horario</span>
          </article>
          <article class="source" style="--c:var(--sky)">
            <span class="tag">Fuente 3</span><h3>calendrier.api.gouv.fr</h3>
            <p>Días festivos oficiales de Francia entre 2006 y 2010, desde la API del gobierno.</p>
            <span class="source__meta">JSON, un archivo por año</span>
          </article>
          <article class="source" style="--c:var(--mint)">
            <span class="tag">Fuente 4</span><h3>Eurostat nrg_pc_204</h3>
            <p>Precio semestral del kWh para hogares en Francia, con y sin impuestos.</p>
            <span class="source__meta">SDMX-CSV, 9 semestres</span>
          </article>
        </div>
        <div class="flow">
          <svg class="flow__line" viewBox="0 0 1000 20" preserveAspectRatio="none" aria-hidden="true"><path d="M0 10 H1000" /></svg>
          @for (s of pasos; track s.k; let i = $index) {
            <div class="flow__step" [class.is-on]="encendidos() > i"><span class="flow__icon">{{ s.k }}</span><b>{{ s.t }}</b><small>{{ s.d }}</small></div>
          }
        </div>
      </div>
    </section>`,
})
export class Pipeline {
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  private readonly motion = inject(Motion);
  protected readonly pasos = [
    { k: 'E', t: 'Scrapy', d: 'descarga las 4 fuentes con huella SHA-256' },
    { k: 'T', t: 'PySpark', d: 'limpieza, cuarentena y normalización a kWh' },
    { k: 'L', t: 'Modelo estrella', d: '5 dimensiones y 2 tablas de hechos' },
    { k: 'BI', t: 'Power BI y DAX', d: `${PBI.medidas.length} medidas, 5 páginas y segmentadores` },
    { k: 'F', t: 'ANOVA', d: '3 hipótesis con SciPy sobre los días del modelo' },
  ];
  protected readonly encendidos = signal(0);
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const path = this.host.querySelector('.flow__line path') as SVGPathElement;
      if (this.motion.reducido) { this.encendidos.set(this.pasos.length); return; }
      const ctx = gsap.context(() => {
        gsap.fromTo(path, { strokeDasharray: 1000, strokeDashoffset: 1000 }, {
          strokeDashoffset: 0, ease: 'none',
          scrollTrigger: {
            trigger: this.host.querySelector('.flow'), start: 'top 80%', end: 'bottom 50%', scrub: 0.5,
            onUpdate: s => this.encendidos.set(Math.floor(s.progress * (this.pasos.length - 1) + 1.02)),
          },
        });
      });
      destroy.onDestroy(() => ctx.revert());
    });
  }
}

/* ================================================================ Dashboard + pie */
@Component({
  selector: 'app-dashboard',
  imports: [Split, Reveal],
  template: `
    <section class="section dark" id="dashboard">
      <div class="container">
        <div class="section__head section__head--center">
          <p class="eyebrow">El reporte original</p>
          <h2 class="h2" appSplit>Dashboard en Power BI</h2>
          <p class="section__note section__note--center">{{ paginas.length }} páginas: {{ paginas.join(', ') }}. Es la fuente de todos los datos de esta página.</p>
        </div>
        <div class="device">
          <div class="device__screen">
            <div class="device__bar"><i></i><i></i><i></i><span>app.powerbi.com/Dashboard_Energia</span></div>
            <div class="device__frame">
              <iframe #pbi title="Dashboard_Energia" loading="lazy" allowfullscreen [src]="url"></iframe>
            </div>
          </div>
          <div class="device__base"></div>
        </div>
        <div class="dashboard__actions">
          <button class="btn btn--coral" type="button" (click)="completa(pbi)">Ver en pantalla completa</button>
          <a class="btn btn--line-light" target="_blank" rel="noopener" [href]="urlTexto">Abrir en una pestaña nueva</a>
        </div>
        <details class="dax" appReveal>
          <summary>Ver las {{ medidas.length }} medidas DAX del modelo</summary>
          <dl>
            @for (m of medidas; track m.nombre) { <dt>{{ m.nombre }}</dt><dd><code>{{ m.dax }}</code></dd> }
          </dl>
        </details>
      </div>
      <footer class="footer">
        <div class="container footer__inner">
          <div>
            <p class="footer__big">Grupo 7</p>
            <p class="footer__names">Juan Pablo Gallardo, Sebastián López y Juan Sebastián Castaño</p>
            <p class="footer__meta">Ingeniería de Datasets, proyecto final</p>
          </div>
          <div class="footer__links">
            <a href="https://github.com/juangallardo19/Consumo_Energia_Residencial" target="_blank" rel="noopener" class="btn btn--line-light">Ver el repositorio en GitHub</a>
            <p class="footer__meta">Datos de UCI, Meteostat, calendrier.api.gouv.fr y Eurostat<br>extraídos de {{ fuente }} el {{ generado }}</p>
          </div>
        </div>
      </footer>
    </section>`,
})
export class Dashboard {
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  private readonly motion = inject(Motion);
  protected readonly urlTexto = URL_PBI;
  protected readonly url = inject(DomSanitizer).bypassSecurityTrustResourceUrl(URL_PBI);
  protected readonly paginas = PBI.meta.paginas;
  protected readonly medidas = PBI.medidas;
  protected readonly fuente = PBI.meta.fuente;
  protected readonly generado = PBI.meta.generado;
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (this.motion.reducido) return;
      const ctx = gsap.context(() => {
        gsap.fromTo(this.host.querySelector('.device__screen'), { rotateX: 24, scale: 0.88, y: 30 }, {
          rotateX: 0, scale: 1, y: 0, ease: 'none',
          scrollTrigger: { trigger: this.host.querySelector('.device'), start: 'top 95%', end: 'top 30%', scrub: 0.6 },
        });
      });
      destroy.onDestroy(() => ctx.revert());
    });
  }
  protected completa(f: HTMLIFrameElement) {
    const req = f.requestFullscreen || (f as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen;
    if (req) req.call(f); else window.open(URL_PBI, '_blank', 'noopener');
  }
}
