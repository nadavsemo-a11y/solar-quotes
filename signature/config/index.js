/**
 * config/index.js — config defaults, merging, and validation
 *
 * Injected at module creation time. Nothing else in the module reads env vars
 * or hardcodes tenant values — they all come through here.
 */

export const defaultConfig = Object.freeze({
  transport: {
    baseUrl: null,       // REQUIRED at runtime — validated below
    timeoutMs: 10000,
    headers: {},
  },
  notifier: {
    companyEmail: null,  // optional
    onSaved: null,
    onError: null,
  },
  capture: {
    strokeColor: '#0A1628',
    lineWidth: 2.5,
    idValidator: 'israeli',  // 'israeli' | 'none' | function
  },
  metadata: {
    collectIp: true,
    collectUA: true,
    collectTimezone: true,
  },
});

function deepMerge(base, override) {
  if (override == null) return base;
  const out = { ...base };
  for (const key of Object.keys(override)) {
    const bv = base[key];
    const ov = override[key];
    if (bv && typeof bv === 'object' && !Array.isArray(bv) && ov && typeof ov === 'object' && !Array.isArray(ov)) {
      out[key] = deepMerge(bv, ov);
    } else if (ov !== undefined) {
      out[key] = ov;
    }
  }
  return out;
}

function validate(config) {
  if (!config.transport?.baseUrl) {
    throw new Error('signature config: transport.baseUrl is required');
  }
}

export function defineConfig(overrides = {}) {
  const merged = deepMerge(defaultConfig, overrides);
  validate(merged);
  return Object.freeze(merged);
}
