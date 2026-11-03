import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '../frontend/src');
const read = (relative) => fs.readFileSync(path.join(frontend, relative), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const permissions = read('utils/quyen.js');
const sidebar = read('components/Sidebar.jsx');
const quickSearch = read('components/QuickSearch.jsx');
const router = read('AppRouter.jsx');

assert(/export function laSuperadmin\(\)/.test(permissions), 'Frontend permission helper is missing laSuperadmin()');
assert(/modules\.includes\('__superadmin__'\)/.test(permissions), 'coQuyen does not enforce __superadmin__');
assert(/settings\/backup[^\n]+__superadmin__/.test(sidebar), 'Sidebar exposes full-system backup outside __superadmin__');
assert(/settings\/backup[^\n]+__superadmin__/.test(quickSearch), 'Quick Search exposes full-system backup outside __superadmin__');
assert(/function SuperadminGuard\(\)/.test(router), 'AppRouter is missing SuperadminGuard');
assert(/<Route element=\{<SuperadminGuard \/>\}>[\s\S]*settings\/backup[\s\S]*settings\/cloudflare[\s\S]*admin\/users[\s\S]*<\/Route>/.test(router),
  'Platform-only routes are not grouped behind SuperadminGuard');

console.log('PLATFORM UI BOUNDARY SMOKE PASSED: backup/tunnel/admin routes are hidden and direct-route guarded for tenant users');
