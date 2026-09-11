/*
 * cat-health-card.js — v1.1.0
 * Carte Lovelace de suivi santé pour chat, conçue pour le package
 * « chat_minou.yaml » (input_datetime vétérinaire/vaccin/vermifuge,
 * poids cible, moyenne 7 j, compteur de visites, état de santé).
 *
 * Auto-détection : fusion des entités du package (sensor.<chat>_poids…)
 * et des capteurs de litière (sensor.<chat>_weight, sensor.<chat>_visits_today,
 * sensor.<chat>_last_visit) — ex. ha-neakasa-litterbox. Surcharge via `entities`.
 * Seuils de santé configurables (visites, heures, écart poids).
 *
 * https://github.com/junkoku38/cat-health-card
 */

const CH_DAY = 86400000;
const CH_HEALTH = { ok: 'ok', surveiller: 'surveiller', alerte: 'alerte' };
let CH_UID = 0;

const chSlug = (s) =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const chNum = (v, d = 1) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const chMid = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

function chSpan(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "à l'instant";
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  return `${Math.floor(m / 1440)} j`;
}
const chAgo = (t) => { const s = chSpan(Date.now() - t); return s === "à l'instant" ? s : `il y a ${s}`; };
const chDays = (t) => { const d = new Date(t); return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); };

const CH_CSS = `
  :host {
    --ch-ok: #8fcaa9; --ch-warn: #d9b36a; --ch-alert: #e38b7a;
    --ch-text: #ecebe6; --ch-dim: #9a9ea6; --ch-faint: #6f747c; --ch-line: rgba(255,255,255,.06);
  }
  ha-card {
    display: block; overflow: hidden; padding: 22px 24px 20px; border-radius: 24px;
    background: linear-gradient(180deg, #1e2126 0%, #16181c 100%);
    border: 1px solid rgba(255,255,255,.07); color: var(--ch-text); font-family: inherit;
  }
  [data-more] { cursor: pointer; }
  [data-more]:focus-visible { outline: 2px solid var(--ch-ok); outline-offset: 2px; border-radius: 8px; }
  .head { display: flex; align-items: center; gap: 14px; }
  .ico {
    flex: none; width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center;
    color: #f1efe9; --mdc-icon-size: 24px;
    background: radial-gradient(circle at 50% 30%, #2b2e34, #1a1c20);
    border: 1px solid rgba(255,255,255,.09); transition: color .3s, border-color .3s;
  }
  .ico.ok { color: var(--ch-ok); border-color: rgba(143,202,169,.5); }
  .ico.warn { color: var(--ch-warn); border-color: rgba(217,179,106,.5); }
  .ico.alert { color: var(--ch-alert); border-color: rgba(227,139,122,.5); }
  .who { flex: 1; min-width: 0; }
  .title { font-size: 18px; font-weight: 600; color: #f4f3ef; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 13px; color: var(--ch-dim); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub.ok { color: var(--ch-ok); } .sub.warn { color: var(--ch-warn); } .sub.alert { color: var(--ch-alert); }
  .pill {
    flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
    border-radius: 999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em;
    background: rgba(255,255,255,.07); color: var(--ch-text);
  }
  .pill.ok { background: rgba(143,202,169,.16); color: var(--ch-ok); }
  .pill.warn { background: rgba(217,179,106,.16); color: var(--ch-warn); }
  .pill.alert { background: rgba(227,139,122,.16); color: var(--ch-alert); }
  .pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }

  .main { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 18px; margin-top: 20px; align-items: stretch; }
  .panel { background: rgba(255,255,255,.03); border: 1px solid var(--ch-line); border-radius: 16px; padding: 14px 16px; min-width: 0; }
  .label { font-size: 11px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: #8b9098; }
  .w { display: flex; align-items: baseline; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  .w .kg { font-size: 32px; font-weight: 200; color: #f6f5f1; }
  .w .d { font-size: 12px; color: var(--ch-dim); }
  .goal { margin-top: 10px; font-size: 12px; color: var(--ch-dim); }
  .goal .bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.08); margin-top: 6px; overflow: hidden; }
  .goal .bar i { display: block; height: 100%; border-radius: 3px; background: var(--ch-ok); transition: width .4s; }
  .goal .bar i.warn { background: var(--ch-warn); } .goal .bar i.alert { background: var(--ch-alert); }
  .visits .n { font-size: 32px; font-weight: 200; color: #f6f5f1; margin-top: 8px; }
  .visits .u { font-size: 12px; color: var(--ch-dim); }
  .chart { height: 60px; margin-top: 8px; }
  .chart svg { width: 100%; height: 100%; overflow: visible; display: block; }

  .events { margin-top: 22px; border-top: 1px solid var(--ch-line); padding-top: 16px; display: grid; gap: 12px; }
  .ev { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .ev .ic {
    flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
    --mdc-icon-size: 17px; background: rgba(255,255,255,.06); color: var(--ch-dim);
  }
  .ev.due .ic { background: rgba(217,179,106,.16); color: var(--ch-warn); }
  .ev.late .ic { background: rgba(227,139,122,.16); color: var(--ch-alert); }
  .ev .tx { flex: 1; min-width: 0; }
  .ev .tx .t { font-size: 14px; color: var(--ch-text); }
  .ev .tx .s { font-size: 12px; color: var(--ch-faint); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ev .when { flex: none; font-size: 13px; color: var(--ch-dim); text-align: right; }
  .ev.due .when { color: var(--ch-warn); } .ev.late .when { color: var(--ch-alert); font-weight: 600; }
  .notes { margin-top: 16px; padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,.04);
    font-size: 13px; color: var(--ch-dim); line-height: 1.5; }
  .warn-msg { padding: 16px; font-size: 14px; color: var(--ch-alert); }
  .hint { margin-top: 14px; font-size: 12px; color: var(--ch-faint); line-height: 1.5; }
`;

class CatHealthCard extends HTMLElement {
  constructor() {
    super();
    this._uid = `ch${++CH_UID}`;
    this._connected = false;
    this._fetching = false;
  }

  setConfig(config) {
    const cat = config.cat_name || 'Minou';
    this._config = {
      name: cat,
      show_notes: true,
      ...config,
      cat_name: cat,
    };
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this._history = null;
    this._sig = null;
    this._detected = false;
    this._entities = null;
  }

  /* Résolution des entités : fusion package chat_minou + capteurs de
   * litière, surcharge explicite en priorité. */
  _detect(hass) {
    if (this._detected) return;
    const c = this._config;
    const S = hass.states;
    const slug = chSlug(c.cat_name);
    const cfg = c.entities || {};
    const get = (id) => (id && S[id] ? id : null);

    // fusion : le package d'abord, la litière en secours champ par champ
    const e = {
      weight: get(`sensor.${slug}_poids`) || get(`sensor.${slug}_weight`),
      weight_avg: get(`sensor.${slug}_poids_moyen_7j`) || get(`sensor.${slug}_weight_avg_7d`),
      visits: get(`sensor.${slug}_visites_du_jour`) || get(`sensor.${slug}_visits_today`),
      last_visit: get(`sensor.${slug}_derniere_visite`) || get(`sensor.${slug}_last_visit`),
      stay_time: get(`sensor.${slug}_duree_derniere_visite`) || get(`sensor.${slug}_last_stay_time`),
      health: get(`sensor.${slug}_etat_de_sante`) || get(`sensor.${slug}_health`),
      target: get(`input_number.${slug}_poids_cible`) || get(`input_number.${slug}_target_weight`),
      vet_last: get(`input_datetime.${slug}_dernier_veterinaire`) || get(`input_datetime.${slug}_vet_last`),
      vaccine_next: get(`input_datetime.${slug}_prochain_vaccin`) || get(`input_datetime.${slug}_vaccine_next`),
      worm_last: get(`input_datetime.${slug}_dernier_vermifuge`) || get(`input_datetime.${slug}_wormer_last`),
      notes: get(`input_text.${slug}_notes`),
    };
    // surcharges explicites (priorité absolue, même si absentes → null forcé)
    Object.keys(cfg).forEach((k) => { e[k] = cfg[k] ? get(cfg[k]) : null; });
    this._entities = e;
    this._detected = true;
    this._mode = (e.health || e.target || e.vet_last || e.vaccine_next || e.worm_last || e.weight_avg || e.notes) ? 'package' : (e.weight ? 'litterbox' : 'none');
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._detect(hass);
    const e = this._entities;
    const sig = Object.values(e).map((id) => id && hass.states[id]?.state).join('|');
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
      if (!this._history && e.weight) this._fetch();
    }
  }

  connectedCallback() {
    if (this._connected) return;
    this._connected = true;
    const root = this.shadowRoot;
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-more]');
      if (t) this._moreInfo(t.dataset.more);
    });
    root.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const t = ev.target.closest?.('[data-more]');
      if (t) { ev.preventDefault(); this._moreInfo(t.dataset.more); }
    });
    this._tick = setInterval(() => this._render(), 60000);
  }
  disconnectedCallback() { this._connected = false; clearInterval(this._tick); }

  getCardSize() { return 5; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }
  static getStubConfig() { return { cat_name: 'Minou' }; }

  static async getConfigElement() {
    await chEnsureHaForm();
    return document.createElement('cat-health-card-editor');
  }

  async _fetch() {
    if (!this._hass || this._fetching || !this._entities?.weight) return;
    this._fetching = true;
    const e = this._entities;
    try {
      const start = new Date(chMid(Date.now()) - 13 * CH_DAY);
      this._history = await this._hass.callWS({
        type: 'history/history_during_period',
        start_time: start.toISOString(),
        end_time: new Date().toISOString(),
        entity_ids: [e.weight],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      }) || {};
    } catch (err) {
      console.warn('[cat-health-card] historique indisponible', err);
      this._history = this._history || {};
    } finally {
      this._fetching = false;
    }
    if (this.isConnected) this._render();
  }

  _data() {
    const e = this._entities;
    const S = this._hass.states;
    const st = (id) => (id ? S[id]?.state : undefined);
    const now = Date.now();
    const th = this._config.thresholds || {};

    const wNow = parseFloat(st(e.weight));
    const wAvg = parseFloat(st(e.weight_avg));
    const visits = parseInt(st(e.visits), 10);
    const target = parseFloat(st(e.target));
    const health = st(e.health);
    const stay = parseFloat(st(e.stay_time));

    const lastVisitT = Date.parse(st(e.last_visit) || '');
    const hoursSince = isNaN(lastVisitT) ? null : (now - lastVisitT) / 3600000;

    // Seuils (défaut = ceux du package chat_minou.yaml)
    const T = {
      visits_warn: th.visits_warn ?? 6,
      visits_alert: th.visits_alert ?? 8,
      hours_warn: th.hours_warn ?? 16,
      hours_alert: th.hours_alert ?? 24,
      weight_warn: th.weight_warn ?? 5,   // % d'écart vs moyenne
      weight_alert: th.weight_alert ?? 10,
      vet_warn_days: th.vet_warn_days ?? 300,
      vet_alert_days: th.vet_alert_days ?? 365,
    };

    // Écart poids vs moyenne ou vs cible
    const ecartPct = !isNaN(wNow) && !isNaN(wAvg) && wAvg > 0
      ? Math.abs((wNow - wAvg) / wAvg * 100) : null;

    // Événements calendaires : input_datetime « YYYY-MM-DD » ou
    // « YYYY-MM-DD HH:MM:SS » (has_time: true) — les deux sont acceptés
    const parseDt = (v) => {
      if (!v) return NaN;
      const s = String(v).trim();
      return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
    };
    const mkEv = (label, icon, id, kind) => {
      if (!id || !S[id]) return null;
      const t = parseDt(st(id));
      if (isNaN(t)) return null;
      if (kind === 'next') {
        const days = Math.round((chMid(t) - chMid(now)) / CH_DAY);
        let cls = '';
        if (days < 0) cls = 'late';
        else if (days <= 14) cls = 'due';
        return { label, icon, cls, id, when: days < 0 ? `en retard de ${-days} j` : days === 0 ? "aujourd'hui" : `dans ${days} j`, sub: chDays(t) };
      }
      const elapsed = Math.round((chMid(now) - chMid(t)) / CH_DAY);
      let cls = '';
      if (elapsed > T.vet_alert_days) cls = 'late';
      else if (elapsed > T.vet_warn_days) cls = 'due';
      return { label, icon, cls, id, when: elapsed === 0 ? "aujourd'hui" : `il y a ${elapsed} j`, sub: chDays(t) };
    };
    const events = [
      mkEv('Prochain vaccin', 'mdi:needle', e.vaccine_next, 'next'),
      mkEv('Vétérinaire', 'mdi:stethoscope', e.vet_last, 'last'),
      mkEv('Vermifuge', 'mdi:pill', e.worm_last, 'last'),
    ].filter(Boolean);

    // Série de poids 14 jours (moyenne par jour)
    const H = this._history || {};
    const wd = Array.from({ length: 14 }, () => ({ v: 0, n: 0 }));
    const ts = (x) => (x.lu ?? x.lc) * 1000;
    (H[e.weight] || []).forEach((x) => {
      const v = parseFloat(x.s), i = Math.round((chMid(now) - chMid(ts(x))) / CH_DAY);
      if (!isNaN(v) && v > 0 && i >= 0 && i < 14) { wd[i].v += v; wd[i].n += 1; }
    });
    if (!isNaN(wNow) && wNow > 0) { wd[0].v += wNow; wd[0].n += 1; }
    const series = wd.map((d, i) => (d.n ? { i, v: d.v / d.n } : null));

    // État de santé dérivé (si pas d'entité template du package)
    let derived = null;
    let reasons = [];
    if (!health) {
      const hrs = hoursSince ?? 999;
      if ((!isNaN(visits) && visits >= T.visits_alert) || hrs >= T.hours_alert || (ecartPct !== null && ecartPct >= T.weight_alert)) derived = 'alerte';
      else if ((!isNaN(visits) && visits >= T.visits_warn) || hrs >= T.hours_warn || (ecartPct !== null && ecartPct >= T.weight_warn)) derived = 'surveiller';
      else derived = 'ok';
      if (!isNaN(visits) && visits >= T.visits_warn) reasons.push(`visites fréquentes (${visits})`);
      if (hrs >= T.hours_warn) reasons.push(`pas de visite depuis ${Math.round(hrs)} h`);
      if (ecartPct !== null && ecartPct >= T.weight_warn) reasons.push(`poids ${chNum(ecartPct, 1)} % vs moyenne 7 j`);
    } else {
      derived = CH_HEALTH[health] ? health : 'ok';
      const r = S[e.health]?.attributes?.raison;
      if (r) reasons.push(r);
    }
    const state = derived === 'ok' ? 'ok' : derived === 'surveiller' ? 'warn' : 'alert';

    return { now, wNow, wAvg, visits, target, health, hoursSince, ecartPct, events, series, state, derived, reasons, stay };
  }

  _chart(series, target) {
    const pts = series.filter(Boolean);
    if (pts.length < 2) return '';
    const W = 240, H = 60, PAD = 4;
    const vals = pts.map((p) => p.v);
    let lo = Math.min(...vals, target && !isNaN(target) ? target : Infinity);
    let hi = Math.max(...vals, target && !isNaN(target) ? target : -Infinity);
    if (hi - lo < 0.2) { const c2 = (hi + lo) / 2; lo = c2 - 0.1; hi = c2 + 0.1; }
    const x = (i) => (PAD + (1 - i / 13) * (W - 2 * PAD)).toFixed(1);
    const y = (v) => (PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD)).toFixed(1);
    let g = '';
    if (target && !isNaN(target)) {
      g += `<line x1="${x(13)}" y1="${y(target)}" x2="${x(0)}" y2="${y(target)}" stroke="rgba(143,202,169,.45)" stroke-width="1" stroke-dasharray="4 3"/>
            <text x="${W - 4}" y="${(+y(target) - 3).toFixed(1)}" text-anchor="end" font-size="9" fill="rgba(143,202,169,.7)">cible ${chNum(target, 1)} kg</text>`;
    }
    const path = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(' ');
    g += `<path d="${path}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.4" stroke-linejoin="round"/>`;
    pts.forEach((p, k) => {
      if (k === pts.length - 1) g += `<circle cx="${x(p.i)}" cy="${y(p.v)}" r="2.4" fill="#f4f3ef"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${g}</svg>`;
  }

  _render() {
    if (!this._hass || !this._config || !this.shadowRoot) return;
    const c = this._config, S = this._hass.states, e = this._entities;
    if (!e?.weight || !S[e.weight]) {
      this.shadowRoot.innerHTML = `<style>${CH_CSS}</style><ha-card><div class="warn-msg">
        Aucun capteur de poids trouvé pour « ${c.cat_name} ».<br>
        Installe le package <code>chat_${chSlug(c.cat_name)}.yaml</code> ou vérifie
        <code>entities.weight</code> (ex. <code>sensor.${chSlug(c.cat_name)}_weight</code>).</div></ha-card>`;
      return;
    }

    const D = this._data();
    const cat = c.cat_name;
    const state = D.state;

    const subMap = {
      ok: `${cat} va bien`,
      warn: `À surveiller${D.reasons.length ? ` : ${D.reasons[0]}` : ''}`,
      alert: `Alerte${D.reasons.length ? ` : ${D.reasons.join(' · ')}` : ''}`,
    };
    const sub = subMap[state] || subMap.ok;

    const pillTxt = { ok: 'Ok', warn: 'Surveiller', alert: 'Alerte' }[state];

    // Poids : cible et progression
    let goal = '';
    if (!isNaN(D.target) && D.target > 0 && !isNaN(D.wNow)) {
      const pct = Math.max(0, Math.min(100, (D.wNow / D.target) * 100));
      const cls = Math.abs(pct - 100) <= 5 ? '' : Math.abs(pct - 100) <= 15 ? 'warn' : 'alert';
      goal = `<div class="goal">cible ${chNum(D.target, 1)} kg
        <div class="bar"><i class="${cls}" style="width:${pct}%"></i></div></div>`;
    }
    const delta = D.ecartPct !== null
      ? `<span class="d" style="color:${D.ecartPct >= 10 ? 'var(--ch-alert)' : D.ecartPct >= 5 ? 'var(--ch-warn)' : 'var(--ch-dim)'}">${chNum(D.ecartPct, 1)} % vs moy. 7 j</span>` : '';

    const notes = c.show_notes && e.notes && S[e.notes]?.state && S[e.notes].state !== 'unknown'
      ? `<div class="notes">${S[e.notes].state}</div>` : '';

    const hint = this._mode === 'litterbox'
      ? `<div class="hint">Mode litière : installe le package <code>chat_${chSlug(cat)}.yaml</code> pour ajouter vétérinaire, vaccin, vermifuge, poids cible et état de santé.</div>` : '';

    this.shadowRoot.innerHTML = `
      <style>${CH_CSS}</style>
      <ha-card>
        <div class="head">
          <div class="ico ${state}" data-more="${e.health || e.weight}" tabindex="0"><ha-icon icon="mdi:cat"></ha-icon></div>
          <div class="who">
            <div class="title">${c.name}</div>
            <div class="sub ${state}">${sub}</div>
          </div>
          <span class="pill ${state}"><i></i>${pillTxt}</span>
        </div>

        <div class="main">
          <div class="panel" data-more="${e.weight}" tabindex="0" role="button">
            <div class="label">Poids</div>
            <div class="w"><span class="kg">${isNaN(D.wNow) ? '—' : chNum(D.wNow, 2)}</span><span class="d">kg</span>${delta}</div>
            <div class="chart">${this._chart(D.series, D.target)}</div>
            ${goal}
          </div>
          <div class="panel" data-more="${e.visits || e.last_visit}" tabindex="0" role="button">
            <div class="label">Litière aujourd'hui</div>
            <div class="visits"><span class="n">${isNaN(D.visits) ? '—' : D.visits}</span>
              <span class="u">passage${(!isNaN(D.visits) && D.visits > 1) ? 's' : ''}</span></div>
            <div class="goal">${D.hoursSince !== null && !isNaN(D.hoursSince)
              ? `dernier passage ${chAgo(Date.now() - D.hoursSince * 3600000)}${!isNaN(D.stay) && D.stay > 0 ? ` · resté ${chSpan(D.stay * 1000)}` : ''}`
              : 'aucun passage enregistré'}</div>
          </div>
        </div>

        ${D.events.length ? `
        <div class="events">
          ${D.events.map((ev) => `
          <div class="ev ${ev.cls}" data-more="${ev.id}" tabindex="0" role="button">
            <div class="ic"><ha-icon icon="${ev.icon}"></ha-icon></div>
            <div class="tx"><div class="t">${ev.label}</div><div class="s">${ev.sub}</div></div>
            <div class="when">${ev.when}</div>
          </div>`).join('')}
        </div>` : ''}

        ${notes}
        ${hint}
      </ha-card>`;
  }

  _moreInfo(entityId) {
    if (!entityId || !this._hass.states[entityId]) return;
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }
}

/* ═════════════════════════ Éditeur visuel ═════════════════════════ */

const chFireEvent = (node, type, detail = {}) => {
  const ev = new Event(type, { bubbles: true, cancelable: false, composed: true });
  ev.detail = detail;
  node.dispatchEvent(ev);
};

async function chEnsureHaForm() {
  if (customElements.get('ha-form')) return true;
  try {
    const helpers = await window.loadCardHelpers();
    const card = helpers.createCardElement({ type: 'entities', entities: [] });
    if (card?.constructor?.getConfigElement) await card.constructor.getConfigElement();
  } catch (err) {
    console.warn('[cat-health-card] ha-form indisponible', err);
  }
  return !!customElements.get('ha-form');
}

const CH_EDIT_KEYS = ['cat_name', 'name', 'show_notes', 'visits_warn', 'visits_alert', 'hours_warn', 'hours_alert', 'weight_warn', 'weight_alert', 'vet_warn_days', 'vet_alert_days'];
const CH_EDIT_ROLES = ['weight', 'weight_avg', 'visits', 'last_visit', 'stay_time', 'health', 'target', 'vet_last', 'vaccine_next', 'worm_last', 'notes'];
const CH_EDIT_LABELS = {
  cat_name: 'Nom du chat',
  name: 'Titre affiché',
  show_notes: 'Afficher les notes',
  weight: 'Poids (kg)',
  weight_avg: 'Moyenne 7 j',
  visits: 'Visites du jour',
  last_visit: 'Dernière visite',
  stay_time: 'Durée de la dernière visite (s)',
  health: 'État de santé (template)',
  target: 'Poids cible',
  vet_last: 'Dernier vétérinaire',
  vaccine_next: 'Prochain vaccin',
  worm_last: 'Dernier vermifuge',
  notes: 'Notes',
  visits_warn: 'Visites · surveiller',
  visits_alert: 'Visites · alerte',
  hours_warn: 'Absence · surveiller (h)',
  hours_alert: 'Absence · alerte (h)',
  weight_warn: 'Écart poids · surveiller (%)',
  weight_alert: 'Écart poids · alerte (%)',
  vet_warn_days: 'Ancienneté véto · surveiller (j)',
  vet_alert_days: 'Ancienneté véto · alerte (j)',
};
const CH_EDIT_HELPERS = {
  cat_name: 'Détermine les entités auto-détectées (sensor.<chat>_poids, sensor.<chat>_weight, input_datetime.<chat>_dernier_veterinaire…). Ex. : Luna',
  weight: 'Par défaut : sensor.<chat>_poids ou sensor.<chat>_weight. Laisser vide pour l\'auto-détection.',
  visits_warn: 'Seuil de visites quotidiennes au-delà duquel l\'état passe en « surveiller » (défaut 6).',
  visits_alert: 'Idem pour « alerte » (défaut 8).',
  hours_warn: 'Heures sans visite avant « surveiller » (défaut 16).',
  hours_alert: 'Heures sans visite avant « alerte » (défaut 24).',
  weight_warn: 'Écart de poids vs moyenne 7 j en % avant « surveiller » (défaut 5).',
  weight_alert: 'Idem pour « alerte » (défaut 10).',
  vet_warn_days: 'Jours depuis le dernier vétérinaire/vermifuge avant mise en avant orange (défaut 300).',
  vet_alert_days: 'Idem pour rouge (défaut 365).',
};
const CH_EDIT_SCHEMA = [
  { name: 'cat_name', selector: { text: {} } },
  { name: 'name', selector: { text: {} } },
  { name: 'show_notes', selector: { boolean: {} } },
  {
    type: 'expandable', name: '', title: 'Entités (surcharge)', icon: 'mdi:link-variant',
    schema: CH_EDIT_ROLES.map((k) => ({ name: `ent__${k}`, selector: { entity: { domain: k === 'target' ? ['input_number', 'number'] : k.startsWith('vet') || k.startsWith('vac') || k.startsWith('worm') ? ['input_datetime', 'sensor'] : k === 'notes' ? ['input_text', 'sensor'] : 'sensor' } } })),
  },
  {
    type: 'expandable', name: '', title: 'Seuils de santé', icon: 'mdi:heart-pulse',
    schema: [
      { type: 'grid', name: '', schema: [
        { name: 'visits_warn', selector: { number: { min: 1, max: 30, mode: 'box' } } },
        { name: 'visits_alert', selector: { number: { min: 1, max: 40, mode: 'box' } } },
        { name: 'hours_warn', selector: { number: { min: 1, max: 72, mode: 'box', unit_of_measurement: 'h' } } },
        { name: 'hours_alert', selector: { number: { min: 2, max: 96, mode: 'box', unit_of_measurement: 'h' } } },
      ] },
      { type: 'grid', name: '', schema: [
        { name: 'weight_warn', selector: { number: { min: 1, max: 50, mode: 'box', unit_of_measurement: '%' } } },
        { name: 'weight_alert', selector: { number: { min: 2, max: 100, mode: 'box', unit_of_measurement: '%' } } },
        { name: 'vet_warn_days', selector: { number: { min: 30, max: 730, mode: 'box', unit_of_measurement: 'j' } } },
        { name: 'vet_alert_days', selector: { number: { min: 60, max: 1095, mode: 'box', unit_of_measurement: 'j' } } },
      ] },
    ],
  },
];

class CatHealthCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
  }

  setConfig(config) { this._config = config ? { ...config } : {}; this._render(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; }
  connectedCallback() { chEnsureHaForm().then(() => this._render()); }

  _data() {
    const c = this._config || {};
    const d = {};
    const th = c.thresholds || {};
    CH_EDIT_KEYS.forEach((k) => { if (c[k] !== undefined) d[k] = c[k]; else if (th[k] !== undefined) d[k] = th[k]; });
    const ents = c.entities || {};
    CH_EDIT_ROLES.forEach((k) => { if (ents[k]) d[`ent__${k}`] = ents[k]; });
    return d;
  }

  _merge(v) {
    const out = { ...this._config };
    CH_EDIT_KEYS.forEach((k) => {
      const val = v[k];
      if (val === '' || val === undefined || val === null) delete out[k];
      else out[k] = val;
    });
    const ents = { ...(out.entities || {}) };
    CH_EDIT_ROLES.forEach((k) => {
      const val = v[`ent__${k}`];
      if (val) ents[k] = val; else delete ents[k];
    });
    if (Object.keys(ents).length) out.entities = ents; else delete out.entities;
    // seuils renseignés → regroupés dans thresholds
    const th = { ...(out.thresholds || {}) };
    ['visits_warn', 'visits_alert', 'hours_warn', 'hours_alert', 'weight_warn', 'weight_alert', 'vet_warn_days', 'vet_alert_days'].forEach((k) => {
      if (out[k] !== undefined) { th[k] = out[k]; delete out[k]; }
    });
    if (Object.keys(th).length) out.thresholds = th; else delete out.thresholds;
    return out;
  }

  _unmanaged() {
    const managed = [...CH_EDIT_KEYS, 'type', 'entities', 'thresholds'];
    return Object.keys(this._config || {}).filter((k) => !managed.includes(k));
  }

  _render() {
    if (!this.shadowRoot) return;
    if (!customElements.get('ha-form')) {
      this.shadowRoot.innerHTML = `<style>${CatHealthCardEditor.styles}</style>
        <div class="warn">Le composant <code>ha-form</code> n'a pas pu être chargé.
        Utilisez l'éditeur YAML de la carte.</div>`;
      return;
    }
    if (!this._form) {
      this.shadowRoot.innerHTML = `<style>${CatHealthCardEditor.styles}</style>
        <div class="wrap"></div><div class="note"></div>`;
      this._form = document.createElement('ha-form');
      this._form.computeLabel = (s) => CH_EDIT_LABELS[s.name] || CH_EDIT_LABELS[s.name.replace(/^ent__/, '')] || s.name;
      this._form.computeHelper = (s) => CH_EDIT_HELPERS[s.name] || CH_EDIT_HELPERS[s.name.replace(/^ent__/, '')] || '';
      this._form.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        chFireEvent(this, 'config-changed', { config: this._merge(ev.detail.value) });
      });
      this.shadowRoot.querySelector('.wrap').appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = CH_EDIT_SCHEMA;
    this._form.data = this._data();
    const extra = this._unmanaged();
    const note = this.shadowRoot.querySelector('.note');
    if (extra.length) {
      note.innerHTML = `<div class="keep">Conservé sans être éditable ici : <b></b>. Passez par l'éditeur YAML pour y toucher.</div>`;
      note.querySelector('b').textContent = extra.join(', ');
    } else note.innerHTML = '';
  }
}

CatHealthCardEditor.styles = `
:host{display:block;}
.warn,.keep{margin-top:12px;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.5;}
.warn{background:var(--warning-color,#dfb37a);color:#1c1c1c;}
.keep{background:rgba(143,176,201,.16);color:var(--primary-text-color);border:1px solid rgba(143,176,201,.4);}
code{font-family:monospace;}
`;

if (!customElements.get('cat-health-card')) {
  customElements.define('cat-health-card', CatHealthCard);
}
if (!customElements.get('cat-health-card-editor')) {
  customElements.define('cat-health-card-editor', CatHealthCardEditor);
}
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'cat-health-card',
  name: 'Santé du chat',
  description: 'Suivi santé : poids vs cible et moyenne 7 j, passages litière, vétérinaire, vaccin, vermifuge, notes.',
  preview: false,
  documentationURL: 'https://github.com/junkoku38/cat-health-card',
});