/**
 * shared/catalog-client.js
 * SEMO AGS — the ONE browser-side client for the central extras catalog.
 *
 * BROWSER ONLY (needs fetch + sessionStorage). Both seller surfaces use it:
 *   index.html   / quote-ui.js        — reads the current catalog to author a quote against
 *   extras-manager.html               — reads, edits a local draft, and publishes the next version
 *
 * WHY IT EXISTS
 * The catalog used to live in `localStorage['semo-extras-config']`, i.e. in ONE seller's browser.
 * A seller-authored upgrade therefore never reached the Worker, and the customer's document silently
 * omitted it. The catalog is now server-published and versioned; this module is the only way a
 * browser reaches it, so the session handling and the failure semantics exist in exactly one place.
 *
 * NO LOGIN
 * There is no passphrase. Catalog reads are open and writes are limited to the known seller
 * surfaces by the Worker (an Origin check — a speed bump, not a lock; see worker.js).
 *
 * FAILURE SEMANTICS — deliberate
 * There is NO fallback to a local catalog. If the catalog cannot be loaded or verified, callers are
 * told so and must BLOCK quote issuance. Falling back to a stale browser copy is precisely the
 * defect this replaces: it would let a seller price a quote against items the server will reject or
 * the customer will never see.
 */
'use strict';

const CatalogClient = (() => {
  const LEGACY_LOCAL_KEY = 'semo-extras-config';   // read ONLY by the one-time import in the manager

  let _current = null;      // { versionId, digest, items, seq, n }

  /**
   * The Worker origin. NOT same-origin: the portal is served from nadavsemo-a11y.github.io while
   * the Worker is s-a.gs, so a relative URL hits GitHub Pages and 404s. `window.__SEMO_API_BASE__`
   * overrides it for local dev.
   */
  function _base() {
    return (typeof window !== 'undefined' && window.__SEMO_API_BASE__) || 'https://s-a.gs';
  }

  async function _req(path, opts = {}) {
    const res = await fetch(_base() + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON error page */ }
    if (!res.ok) {
      const err = new Error((body && (body.detail || body.error)) || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = (body && (body.code || body.error)) || 'http_error';
      err.body = body;
      throw err;
    }
    return body;
  }

  /** The authoritative current catalog. Cached per page load; `force` re-reads it. */
  async function loadCurrent(force = false) {
    if (_current && !force) return _current;
    _current = await _req('/q/catalog/current', { method: 'GET' });
    return _current;
  }

  /** An immutable published version, by identity — what a saved quote was authored against. */
  async function loadVersion(versionId) {
    return _req('/q/catalog/version/' + encodeURIComponent(versionId), { method: 'GET' });
  }

  /** Server-minted stable id for a new custom item. The browser never invents ids any more. */
  async function mintId(label) {
    const r = await _req('/q/catalog/mint-id', { method: 'POST', body: JSON.stringify({ label }) });
    return r.id;
  }

  /**
   * Publish an edited draft as the next immutable version.
   * `baseVersionId` is the version the draft was derived from; the server rejects a stale base with
   * 409 rather than silently overwriting a colleague's newer catalog.
   */
  async function publish(baseVersionId, items, note) {
    const r = await _req('/q/catalog/publish', { method: 'POST', body: JSON.stringify({ baseVersionId, items, note: note || null }) });
    _current = null;                      // force a re-read so the UI shows the published truth
    return r;
  }

  /** The editable projection of a catalog version (what the manager mutates). */
  function toDraftItems(catalog) {
    return (catalog.items || []).map(i => ({
      id: i.id, label: i.label, category: i.category, active: i.active !== false,
      defaultPrice: i.defaultPrice, customerToggleable: i.customerToggleable, order: i.order,
      builtIn: !!i.builtIn, legacy: !!i.legacy,
    }));
  }

  /** The exact payload shape /q/catalog/publish expects (drops UI-only fields). */
  function toPublishItems(draftItems) {
    return draftItems.map((i, idx) => ({
      id: i.id, label: i.label, category: i.category, active: i.active !== false,
      defaultPrice: Number(i.defaultPrice) || 0,
      customerToggleable: i.category === 'potential' ? false : i.customerToggleable !== false,
      order: idx,
    }));
  }

  // ── one-time migration of a browser-local catalog ────────────────────────────────────────────
  // Used ONLY by the authenticated extras manager. It never runs in the quote portal: after this
  // migration the portal must not read a local catalog at all, which is the whole point.

  /** The legacy localStorage catalog, or null. Does not delete it — the operator confirms first. */
  function readLegacyLocalCatalog() {
    try {
      const raw = localStorage.getItem(LEGACY_LOCAL_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const items = [];
      for (const [key, category] of [['upgrades', 'upgrade'], ['potential', 'potential']]) {
        for (const it of (parsed[key] || [])) {
          if (it && it.id && it.label) {
            items.push({ id: String(it.id), label: String(it.label), category, active: it.active !== false, defaultPrice: Number(it.defaultPrice) || 0 });
          }
        }
      }
      return items.length ? items : null;
    } catch { return null; }
  }

  /**
   * What importing the local catalog would change, against the server's current version.
   * Shown to the operator BEFORE anything is published — an import must never be a silent merge.
   */
  function diffLegacyAgainst(serverCatalog, legacyItems) {
    const server = new Map((serverCatalog.items || []).map(i => [i.id, i]));
    const added = [], changed = [], unchanged = [];
    for (const l of legacyItems) {
      const s = server.get(l.id);
      if (!s) added.push(l);
      else if (s.label !== l.label || s.defaultPrice !== l.defaultPrice || s.category !== l.category) changed.push({ from: s, to: l });
      else unchanged.push(l);
    }
    return { added, changed, unchanged };
  }

  /** Drop the legacy key once its contents are safely published server-side. */
  function clearLegacyLocalCatalog() {
    try { localStorage.removeItem(LEGACY_LOCAL_KEY); return true; } catch { return false; }
  }

  return {
    LEGACY_LOCAL_KEY,
    loadCurrent, loadVersion, mintId, publish,
    toDraftItems, toPublishItems,
    readLegacyLocalCatalog, diffLegacyAgainst, clearLegacyLocalCatalog,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { CatalogClient };
if (typeof globalThis !== 'undefined') globalThis.CatalogClient = CatalogClient;
