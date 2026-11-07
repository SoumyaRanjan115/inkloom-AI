import { handle } from './lib/backend.js';
import * as DB from './lib/db.js';

// Same call signature the UI always used, but served by the in-browser backend (no network).
export async function api(path, { method = 'GET', body, form } = {}) { await new Promise((r) => setTimeout(r, 40)); return handle(method, path, body, form); }
export const imgUrl = (id) => DB.state().assets[id]?.url || '';
export async function download(path, name) {
  const d = await api(path); const u = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u);
}
export const resetDemo = () => { DB.reset(); localStorage.removeItem('ik_email'); location.href = '/'; };
export const ROLE = { creator: 'Content Creator', brand: 'Brand Manager', compliance: 'Compliance Reviewer' };
export const ROLE_DESC = { creator: 'Writes, fixes, submits and publishes', brand: 'Owns rules & glossary, reviews every submission', compliance: 'Owns claims & facts, signs off claims' };
export const STATUS = { draft: 'Draft', in_brand_review: 'Brand review', in_compliance_review: 'Compliance review', approved: 'Approved', published: 'Published' };
export const fmt = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const fmtD = (d) => (d ? new Date(d).toLocaleDateString([], { dateStyle: 'medium' }) : '');
