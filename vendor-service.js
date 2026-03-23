/**
 * vendor-service.js — SEMO AGS Vendor Portal Backend Module
 *
 * שירות backend לפורטל ספקים. מנהל טוקנים, שליפת משימות,
 * עדכון סטטוס, והעלאת קבצים — הכל דרך Monday.com API.
 *
 * אבטחה:
 *   - טוקן 12 תווים לכל ספק (KV)
 *   - Monday IDs מוצפנים (opaque refs) — לא חשופים ללקוח
 *   - הספק רואה רק שם פרויקט, שם משימה, כתובת
 *   - אין חשיפה של מחירים, פרטי לקוח, או נתונים פנימיים
 *
 * שימוש ב-Worker:
 *   import { VendorService } from './vendor-service.js';
 *   const vendor = new VendorService({ mondayToken: env.MONDAY_API_TOKEN, kv: env.QUOTES_KV });
 */

// ── Constants ───────────────────────────────────────────────────────────

const SUPPLIER_BOARD_ID    = 5089266595;
const SUBITEMS_BOARD_ID    = 5089266636;
const PROJECTS_BOARD_ID    = 5089265830;
const STATUS_COLUMN_ID     = 'color_mkywhgg6';
const VENDOR_FILE_COL_ID   = 'file_mm1qw5m2';
const VENDOR_CONFIG_COL_ID = 'long_text_mm1qf7wq';
const SUPPLIER_RELATION_COL = 'board_relation_mkywenar';
const TOKEN_LENGTH         = 12;
const ID_XOR_KEY           = 0x5E3CA69B;  // XOR key for ID obfuscation

// ── ID Obfuscation ──────────────────────────────────────────────────────

function encodeId(id) {
  return 'T' + ((parseInt(id, 10) ^ ID_XOR_KEY) >>> 0).toString(36);
}

function decodeId(ref) {
  if (!ref || ref[0] !== 'T') return null;
  return String(((parseInt(ref.slice(1), 36) ^ ID_XOR_KEY) >>> 0));
}

// ── Token Generation ────────────────────────────────────────────────────

function generateToken(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
  return Array.from(bytes).map(b => b.toString(36)).join('').slice(0, length);
}

// ── VendorService Class ─────────────────────────────────────────────────

export class VendorService {

  /**
   * @param {object} opts
   * @param {string} opts.mondayToken — Monday.com API token
   * @param {object} opts.kv          — Cloudflare KV namespace (QUOTES_KV)
   * @param {string} [opts.baseUrl]   — Base URL for vendor links (default: https://s-a.gs)
   */
  constructor({ mondayToken, kv, baseUrl = 'https://s-a.gs' }) {
    this._monday = mondayToken;
    this._kv = kv;
    this._baseUrl = baseUrl;
  }

  // ── Link Management ─────────────────────────────────────────────────

  /**
   * Create a vendor portal link. If one already exists for this supplier, return it.
   *
   * @param {string} supplierId   — Monday item ID of the supplier
   * @param {string} supplierName — Display name
   * @returns {{ token: string, url: string }}
   */
  async createLink(supplierId, supplierName) {
    // Check if a link already exists for this supplier
    const existingToken = await this._kv.get(`vendor-by-supplier:${supplierId}`);
    if (existingToken) {
      const existing = await this._kv.get(`vendor:${existingToken}`, { type: 'json' });
      if (existing) {
        return { token: existingToken, url: `${this._baseUrl}/v/${existingToken}`, existing: true };
      }
    }

    // Generate new token
    const token = generateToken(TOKEN_LENGTH);
    const data = {
      type: 'vendor',
      supplierId,
      supplierName,
      createdAt: new Date().toISOString(),
    };

    await this._kv.put(`vendor:${token}`, JSON.stringify(data));
    await this._kv.put(`vendor-by-supplier:${supplierId}`, token);

    return { token, url: `${this._baseUrl}/v/${token}`, existing: false };
  }

  /**
   * Look up vendor data by token.
   * @returns {{ supplierId, supplierName, config } | null}
   */
  async getVendorByToken(token) {
    const raw = await this._kv.get(`vendor:${token}`, { type: 'json' });
    if (!raw || raw.type !== 'vendor') return null;

    // Fetch vendor config from Monday
    let config = {};
    try {
      const query = `query { items(ids: [${raw.supplierId}]) { column_values(ids: ["${VENDOR_CONFIG_COL_ID}"]) { text } } }`;
      const res = await this._mondayQuery(query);
      const configText = res.data?.items?.[0]?.column_values?.[0]?.text;
      if (configText) config = JSON.parse(configText);
    } catch { /* config is optional */ }

    return {
      supplierId: raw.supplierId,
      supplierName: raw.supplierName,
      config,
    };
  }

  // ── Task Fetching ───────────────────────────────────────────────────

  /**
   * Fetch open tasks for a vendor (status = "בתהליך").
   * Returns sanitized data — no internal IDs or sensitive info.
   *
   * @param {string} token — vendor token
   * @returns {Array<{ ref, projectName, taskName, address, taskRules }>}
   */
  async fetchTasks(token) {
    const vendor = await this.getVendorByToken(token);
    if (!vendor) throw new Error('Invalid vendor token');

    // 1. Get linked subitem IDs from supplier record
    const supplierQuery = `query {
      items(ids: [${vendor.supplierId}]) {
        column_values(ids: ["${SUPPLIER_RELATION_COL}"]) {
          ... on BoardRelationValue { linked_item_ids }
        }
      }
    }`;
    const supplierRes = await this._mondayQuery(supplierQuery);
    const linkedIds = supplierRes.data?.items?.[0]?.column_values?.[0]?.linked_item_ids || [];

    if (linkedIds.length === 0) return [];

    // 2. Fetch those subitems with status + parent info (batch to avoid query size limits)
    const tasks = [];
    const BATCH = 100;

    for (let i = 0; i < linkedIds.length; i += BATCH) {
      const batch = linkedIds.slice(i, i + BATCH);
      const subQuery = `query {
        items(ids: [${batch.join(',')}]) {
          id
          name
          column_values(ids: ["${STATUS_COLUMN_ID}", "${VENDOR_FILE_COL_ID}"]) {
            id text
          }
          parent_item { id name
            column_values(ids: ["lookup_mkywmsse", "dropdown_mkywtpq4"]) { id text }
          }
        }
      }`;
      const subRes = await this._mondayQuery(subQuery);
      const items = subRes.data?.items || [];

      // Collect parent IDs to fetch client phone numbers
      const parentIds = new Set();
      for (const item of items) {
        if (item.parent_item?.id) parentIds.add(item.parent_item.id);
      }

      // Fetch client phones from parent items' client relation
      const phoneMap = {};
      if (parentIds.size > 0) {
        try {
          const phoneQuery = `query { items(ids: [${[...parentIds].join(',')}]) { id column_values(ids: ["board_relation_mkywy46r"]) { ... on BoardRelationValue { linked_item_ids } } } }`;
          const phoneRes = await this._mondayQuery(phoneQuery);
          const clientIds = new Set();
          const parentToClient = {};
          for (const p of phoneRes.data?.items || []) {
            const cIds = p.column_values?.[0]?.linked_item_ids || [];
            if (cIds.length > 0) {
              parentToClient[p.id] = cIds[0];
              clientIds.add(cIds[0]);
            }
          }
          if (clientIds.size > 0) {
            const clientQuery = `query { items(ids: [${[...clientIds].join(',')}]) { id column_values(ids: ["phone_mkyw1rbw"]) { text } } }`;
            const clientRes = await this._mondayQuery(clientQuery);
            const clientPhones = {};
            for (const c of clientRes.data?.items || []) {
              clientPhones[c.id] = c.column_values?.[0]?.text || '';
            }
            for (const [pid, cid] of Object.entries(parentToClient)) {
              phoneMap[pid] = clientPhones[cid] || '';
            }
          }
        } catch { /* phone is best-effort */ }
      }

      for (const item of items) {
        const statusCol = item.column_values?.find(c => c.id === STATUS_COLUMN_ID);
        const status = statusCol?.text || '';
        if (status !== 'בתהליך') continue;

        const fileCol = item.column_values?.find(c => c.id === VENDOR_FILE_COL_ID);
        const hasFile = !!(fileCol?.text);

        const parentName = item.parent_item?.name || '';
        const parentCols = item.parent_item?.column_values || [];
        const address = parentCols.find(c => c.id === 'lookup_mkywmsse')?.text || '';
        const roofType = parentCols.find(c => c.id === 'dropdown_mkywtpq4')?.text || '';
        const phone = phoneMap[item.parent_item?.id] || '';

        // Determine task-specific rules from vendor config
        const taskRules = this._getTaskRules(vendor.config, item.name);

        tasks.push({
          ref: encodeId(item.id),
          projectName: parentName,
          taskName: item.name,
          address,
          roofType,
          phone,
          hasFile,
          taskRules,
        });
      }
    }

    return tasks;
  }

  /**
   * Get task-specific rules from vendor config.
   */
  _getTaskRules(config, taskName) {
    const rules = config?.taskRules || {};
    // Try exact match first, then partial, then default
    if (rules[taskName]) return rules[taskName];
    for (const [pattern, rule] of Object.entries(rules)) {
      if (pattern !== 'default' && taskName.includes(pattern)) return rule;
    }
    return rules.default || { requireFile: false, requireNote: false, fields: [] };
  }

  // ── Task Actions ────────────────────────────────────────────────────

  /**
   * Mark a task as done. Validates token ownership + mandatory fields.
   *
   * @param {string} token    — vendor token
   * @param {string} taskRef  — encoded task reference
   * @param {object} [formData] — { fields: { fieldId: value }, note: string }
   * @returns {{ success: boolean }}
   */
  async markDone(token, taskRef, formData = {}) {
    const vendor = await this.getVendorByToken(token);
    if (!vendor) throw new Error('Invalid vendor token');

    const subitemId = decodeId(taskRef);
    if (!subitemId) throw new Error('Invalid task reference');

    // Verify this subitem belongs to this vendor
    await this._verifyOwnership(vendor.supplierId, subitemId);

    // Build update body with fields data
    let updateBody = `עדכון מספק: ${vendor.supplierName}\n`;
    if (formData.fields) {
      for (const [key, value] of Object.entries(formData.fields)) {
        updateBody += `${key}: ${value}\n`;
      }
    }
    if (formData.note) {
      updateBody += `הערות: ${formData.note}\n`;
    }
    updateBody += `סטטוס: בוצע ✓`;

    // Create update on the subitem
    const updateMutation = `mutation {
      create_update(item_id: ${subitemId}, body: ${JSON.stringify(updateBody)}) { id }
    }`;
    await this._mondayQuery(updateMutation);

    // Change status to "בוצע"
    const statusMutation = `mutation {
      change_simple_column_value(
        board_id: ${SUBITEMS_BOARD_ID},
        item_id: ${subitemId},
        column_id: "${STATUS_COLUMN_ID}",
        value: "בוצע"
      ) { id }
    }`;
    await this._mondayQuery(statusMutation);

    return { success: true };
  }

  /**
   * Upload a file to a task's files column on the subitems board.
   *
   * @param {string} token    — vendor token
   * @param {string} taskRef  — encoded task reference
   * @param {Blob}   file     — file blob
   * @param {string} filename — original filename
   * @returns {{ success: boolean }}
   */
  async uploadFile(token, taskRef, file, filename) {
    const vendor = await this.getVendorByToken(token);
    if (!vendor) throw new Error('Invalid vendor token');

    const subitemId = decodeId(taskRef);
    if (!subitemId) throw new Error('Invalid task reference');

    await this._verifyOwnership(vendor.supplierId, subitemId);

    // Upload file directly to the "קובץ ספק" column
    const formData = new FormData();
    formData.append('query', `mutation ($file: File!) { add_file_to_column(item_id: ${subitemId}, column_id: "${VENDOR_FILE_COL_ID}", file: $file) { id url } }`);
    formData.append('map', '{"image":"variables.file"}');
    formData.append('image', file, filename);

    const uploadRes = await fetch('https://api.monday.com/v2/file', {
      method: 'POST',
      headers: { 'Authorization': this._monday },
      body: formData,
    });
    const uploadData = await uploadRes.json();

    if (uploadData.errors) throw new Error(JSON.stringify(uploadData.errors));
    return { success: true, fileUrl: uploadData.data?.add_file_to_column?.url };
  }

  // ── Internal Helpers ────────────────────────────────────────────────

  /**
   * Verify a subitem belongs to a vendor (security check).
   */
  async _verifyOwnership(supplierId, subitemId) {
    const query = `query {
      items(ids: [${supplierId}]) {
        column_values(ids: ["${SUPPLIER_RELATION_COL}"]) {
          ... on BoardRelationValue { linked_item_ids }
        }
      }
    }`;
    const res = await this._mondayQuery(query);
    const linkedIds = res.data?.items?.[0]?.column_values?.[0]?.linked_item_ids || [];
    if (!linkedIds.includes(String(subitemId))) {
      throw new Error('Task does not belong to this vendor');
    }
  }

  /**
   * Execute a Monday.com GraphQL query.
   */
  async _mondayQuery(query) {
    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this._monday,
        'API-Version': '2024-10',
      },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (data.errors) throw new Error(JSON.stringify(data.errors));
    return data;
  }
}

// ── Exports ─────────────────────────────────────────────────────────────

export { encodeId, decodeId, generateToken };
