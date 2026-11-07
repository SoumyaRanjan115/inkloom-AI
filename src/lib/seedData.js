// Demo data for the Northwind Analytics workspace. Pure data + pure helpers (unit-tested, no DB).
import { deterministic, heuristicClaims } from './engine.js';

export const KIT = () => ({
  rules: [
    { code: 'CP-3.2', title: 'Superlative claims', category: 'claims', text: 'Superlatives such as fastest, best, leading or #1 require dated third-party evidence in the claim library.' },
    { code: 'CP-3.4', title: 'Numeric claims', category: 'claims', text: 'Numeric and percentage claims must match an approved claim or fact record that has not expired.' },
    { code: 'BG-2.1', title: 'Brand voice', category: 'voice', text: 'Write in a confident, plain and human voice. Avoid hype and shouting. At most one exclamation mark per piece.' },
    { code: 'BG-3.3', title: 'Headlines', category: 'voice', text: 'Headlines state the customer benefit in plain words and stay under twelve words.' },
    { code: 'BG-5.1', title: 'Colour palette', category: 'visual', text: 'Approved text colours on light backgrounds are dark grey #374151 and near-black #111827.' },
    { code: 'BG-6.2', title: 'Logo clear space', category: 'visual', text: 'Keep clear space around the logo equal to the height of the N. Never recolour or stretch it.' },
    { code: 'BG-7.4', title: 'Alt text', category: 'accessibility', text: 'Every image requires meaningful alt text describing what it shows.' },
    { code: 'LG-1.2', title: 'No guarantees', category: 'legal', text: 'Never promise guaranteed outcomes, savings or returns.' },
    { code: 'LG-2.1', title: 'Customer data', category: 'legal', text: 'Never imply we share customer data. Privacy and security claims need legal approval.' },
  ],
  facts: [
    { topic: 'Connectors', statement: 'Northwind Insights connects to 12 data sources.', owner: 'Product', source: 'Product Fact Sheet v3.2', days: 90 },
    { topic: 'Free trial', statement: 'The free trial lasts 14 days.', owner: 'Growth', source: 'Pricing page', days: 60 },
    { topic: 'Pricing', statement: 'The Starter plan costs 29 dollars per user per month.', owner: 'Pricing team', source: 'Pricing sheet Q3', days: -10 },
    { topic: 'Enterprise support', statement: 'Enterprise customers get 24 hour support.', owner: 'Support', source: 'Support policy', days: 25 },
  ],
  claims: [
    { statement: 'Dashboards load in under 2 seconds', approvedWording: 'Built for fast reporting: dashboards load in under 2 seconds in our benchmark (v3.2).', evidence: 'Internal benchmark v3.2, 12 Sep 2026', owner: 'Engineering', days: 120, status: 'approved' },
    { statement: 'Rated number 1 analytics tool by Analyst Weekly', evidence: 'Analyst Weekly 2024 survey', owner: 'Comms', days: -60, status: 'approved' },
    { statement: 'Teams save hours every week on reporting', approvedWording: 'Teams spend less time building reports.', evidence: 'Customer survey Oct 2026 (n=212)', owner: 'Marketing', days: 18, status: 'approved' },
  ],
  terms: [
    { banned: 'clients', preferred: 'customers', note: 'Glossary rule G-4' },
    { banned: 'Dashboard', preferred: 'Insights Hub', note: 'Product name is Insights Hub', caseSensitive: true },
    { banned: 'cheap', preferred: 'affordable', note: 'Never position us as cheap' },
    { banned: 'synergy', preferred: '', note: 'Jargon. Say what you mean.' },
  ],
});

const DEF = { textColor: '#111827', bgColor: '#FFFFFF' };
// Stages: draft | in_brand_review | in_compliance_review | approved | published
// Times are "days ago". edited/disputed are keyed by finding category.
export const ITEMS = [
  { key: 'launch', title: 'Launch post: Northwind Insights', channel: 'LinkedIn post', by: 'maya', age: 0.2, stage: 'draft', unchecked: true, ai: true, tool: 'ChatGPT',
    img: 'dashboard-banner.svg', design: { textColor: '#9CA3AF', bgColor: '#FFFFFF' },
    orig: 'Meet Northwind Insights, the world’s fastest analytics platform. It connects to 5 data sources so our clients can see everything in one Dashboard. Start your free trial today!!' },
  { key: 'news', title: 'Email: Q4 customer newsletter', channel: 'Email', by: 'maya', age: 1, stage: 'draft', openFindings: true, ai: false,
    orig: 'Hi team! Our clients love the new reports!! Pick the cheap plan: Starter is 29 dollars per user per month.' },
  { key: 'pricing', title: 'Landing page: Free trial', channel: 'Landing page', by: 'rohan', age: 3, stage: 'in_brand_review', sub: 0.5, ai: true, tool: 'Gemini',
    orig: 'Start your 30 day free trial. Choose the cheap plan that grows with your customers.',
    final: 'Start your 14 day free trial. Choose the affordable plan that grows with your customers.' },
  { key: 'adcopy', title: 'Ad copy: Analyst rating', channel: 'Ad copy', by: 'rohan', age: 4, stage: 'in_compliance_review', sub: 2, ai: false,
    orig: 'Rated the leading analytics tool by Analyst Weekly. Dashboards load in under 2 seconds. Join thousands of happy clients.',
    final: 'Loved by analytics teams worldwide. Dashboards load in under 2 seconds. Join thousands of happy customers.',
    edited: { claim: 'Removed the expired Analyst Weekly rating' },
    rev: [['brand', 'approve', 'Terminology fixed and the expired Analyst Weekly rating removed. Routing to compliance because a claim was involved.', 1.5]] },
  { key: 'press', title: 'Press release: Version 2', channel: 'Press release', by: 'maya', age: 5, stage: 'in_compliance_review', sub: 2.5, ai: true, tool: 'ChatGPT',
    orig: 'Version 2 reduces reporting time by 40%. It connects to 8 data sources. Our clients get everything in one Dashboard.',
    final: 'Version 2 helps teams build reports faster. Dashboards load in under 2 seconds in our benchmark. It connects to 12 data sources. Our customers get everything in one Insights Hub.',
    edited: { claim: 'Dashboards load in under 2 seconds in our benchmark.' },
    rev: [['brand', 'approve', 'Terms corrected and the 40% figure replaced with the benchmarked claim. Compliance, please confirm the evidence date.', 1]] },
  { key: 'blog', title: 'Blog: Why customers choose Northwind', channel: 'Blog article', by: 'maya', age: 6, stage: 'approved', sub: 4, ai: false,
    orig: 'Why customers choose Northwind. Teams tell us the best part is how simple setup feels. Our clients connect 12 data sources in an afternoon.',
    final: 'Why customers choose Northwind. Teams tell us their favourite part is how simple setup feels. Our customers connect 12 data sources in an afternoon.',
    edited: { claim: 'their favourite part is' },
    rev: [['brand', 'approve', 'Superlative reworded, terminology fixed. Sending to compliance.', 3.5], ['compliance', 'approve', 'Superlative removed. The 12 connectors figure matches Fact Sheet v3.2.', 3]] },
  { key: 'story', title: 'LinkedIn: Customer story', channel: 'LinkedIn post', by: 'rohan', age: 9, stage: 'published', sub: 6, pub: 5, ai: false,
    orig: 'Meet Dana, who runs analytics at a retail chain. Her clients see results faster. Dashboard setup took one afternoon!!',
    final: 'Meet Dana, who runs analytics at a retail chain. Her customers see results faster. Insights Hub setup took one afternoon!!',
    disputed: { tone: 'This is Dana’s own quote, so the double exclamation mark stays as she wrote it.' },
    rev: [['brand', 'approve', 'Terminology fixed. I accept the dispute: it is a direct customer quote.', 5.5]] },
  { key: 'webinar', title: 'LinkedIn: Webinar invite', channel: 'LinkedIn post', by: 'maya', age: 11, stage: 'published', sub: 8, pub: 7, ai: false, img: 'webinar-panel.svg',
    alt: 'Panel of three speakers on a stage', design: DEF,
    orig: 'Join our webinar on faster reporting! Our clients will share their playbooks.',
    final: 'Join our webinar on faster reporting! Our customers will share their playbooks.',
    rev: [['brand', 'approve', 'Clean. Alt text is good.', 7.5]] },
  { key: 'notes', title: 'Email: Release notes', channel: 'Email', by: 'rohan', age: 2, stage: 'draft', sub: 1.2, ai: true, tool: 'ChatGPT',
    orig: 'Release notes: faster, smarter, cheaper than any competitor. Connects to 5 data sources!',
    final: 'Release notes: faster and smarter reporting [needs evidence]. Connects to 12 data sources!',
    rev: [['brand', 'reject', 'A “[needs evidence]” placeholder is still in the copy. Remove the comparison or get evidence, then resubmit.', 1]] },
  { key: 'q3', title: 'Blog: Q3 product roundup', channel: 'Blog article', by: 'rohan', age: 14, stage: 'published', sub: 11, pub: 10, ai: true, tool: 'Gemini',
    orig: 'Q3 recap: our best release yet. Clients asked for faster exports and we delivered. The Dashboard now exports in one click.',
    final: 'Q3 recap: our most requested release yet. Customers asked for faster exports and we delivered. The Insights Hub now exports in one click.',
    edited: { claim: 'most requested release yet' },
    rev: [['brand', 'approve', 'Good rewrite of the superlative.', 10.6], ['compliance', 'approve', 'No unsupported claims remain.', 10.2]] },
  { key: 'security', title: 'Email: Security overview', channel: 'Email', by: 'maya', age: 16, stage: 'published', sub: 13, pub: 12, ai: false,
    orig: 'Your data stays yours, guaranteed. Every record is encrypted at rest and in transit.',
    final: 'Your data stays yours, protected by encryption. Every record is encrypted at rest and in transit.',
    edited: { claim: 'protected by encryption' },
    rev: [['brand', 'approve', 'Removed the guarantee per LG-1.2.', 12.6], ['compliance', 'approve', 'Encryption statement verified with Security.', 12.2]] },
];

const order = { block: 0, fix: 1, advise: 2 };
export function analyse(text, it, kb) {
  const base = { text, altText: it.alt || '', hasImage: !!it.img, design: it.design || DEF };
  return [...deterministic(base, { terms: kb.terms, settings: kb.settings }, null), ...heuristicClaims(text, kb)]
    .sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)).map((f, i) => ({ ...f, fid: `f${i + 1}` }));
}
export function resolve(it, findings) {
  return findings.map((f) => {
    if (it.openFindings) return f;
    if (it.disputed?.[f.category]) return { ...f, status: 'disputed', disputeReason: it.disputed[f.category] };
    if (it.edited?.[f.category]) return { ...f, status: 'edited', resolvedValue: it.edited[f.category] };
    return { ...f, status: 'accepted', resolvedValue: f.fix?.to || '' };
  });
}
export const svg = (title, accent) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240"><rect width="600" height="240" fill="#f4efe3"/><rect x="40" y="130" width="60" height="70" fill="${accent}" opacity=".5"/><rect x="120" y="100" width="60" height="100" fill="${accent}" opacity=".7"/><rect x="200" y="70" width="60" height="130" fill="${accent}"/><rect x="280" y="90" width="60" height="110" fill="${accent}" opacity=".8"/><path d="M40 120 L150 90 L230 60 L310 80 L560 30" stroke="#15203a" stroke-width="4" fill="none"/><text x="40" y="40" font-family="Georgia" font-size="22" fill="#15203a">${title}</text></svg>`;
