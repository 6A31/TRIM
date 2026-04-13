// Browser automation agent — DOM-based control via Playwright
// Uses the system browser (Edge on Windows, Chrome on macOS) — no bundled binaries.
// Designed for structured text extraction + precise selector-based actions.
// Future: screenshot fallback slot for non-browser (desktop) control.

const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let browser = null;
let context = null;
let page = null;
let elementMap = new Map(); // index → Playwright locator selector

function getStoragePath() {
  return path.join(app.getPath('userData'), 'browser-cookies.json');
}

async function launch() {
  if (browser) return;

  // Use the system browser — no Playwright download needed
  const channel = process.platform === 'darwin' ? 'chrome' : 'msedge';

  browser = await chromium.launch({
    headless: false,
    channel,
  });

  // Load saved cookies/storage if available
  const storagePath = getStoragePath();
  const contextOpts = { viewport: { width: 1280, height: 900 } };
  if (fs.existsSync(storagePath)) {
    try {
      contextOpts.storageState = storagePath;
    } catch {}
  }

  context = await browser.newContext(contextOpts);
  page = await context.newPage();
}

async function navigate(url) {
  ensurePage();
  // Normalise bare domains: "google.com" → "https://google.com"
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  // Also wait for network to settle (catches SPAs, lazy JS)
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  return { url: page.url(), title: await page.title() };
}

async function getContent() {
  ensurePage();
  elementMap.clear();

  const result = await page.evaluate(() => {
    // Clean previous markers
    document.querySelectorAll('[data-trim-idx]').forEach(el => el.removeAttribute('data-trim-idx'));

    const elements = [];
    let idx = 1;
    const seen = new Set();

    const els = document.querySelectorAll(
      'a[href], button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"]'
    );

    for (const el of els) {
      if (seen.has(el)) continue;
      seen.add(el);

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;

      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute('type') || '';
      const text = (
        el.innerText || el.value || el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') || el.getAttribute('title') || ''
      ).trim().slice(0, 80);
      const href = tag === 'a' ? (el.getAttribute('href') || '') : '';

      if (!text && !href) continue;

      let desc;
      if (tag === 'a') {
        const shortHref = href.length > 60 ? href.slice(0, 60) + '…' : href;
        desc = `link "${text}"${href ? ' → ' + shortHref : ''}`;
      } else if (tag === 'button' || el.getAttribute('role') === 'button') {
        desc = `button "${text}"`;
      } else if (tag === 'input') {
        desc = `input[${type || 'text'}]${text ? ' "' + text + '"' : ''}`;
      } else if (tag === 'textarea') {
        desc = `textarea${text ? ' "' + text + '"' : ''}`;
      } else if (tag === 'select') {
        // Show first few option texts
        const opts = [...el.options].slice(0, 5).map(o => o.text.trim()).filter(Boolean).join(', ');
        desc = `select "${text || opts}"`;
      } else {
        desc = `${tag} "${text}"`;
      }

      el.setAttribute('data-trim-idx', String(idx));
      elements.push({ idx, desc });
      idx++;
    }

    return {
      url: location.href,
      title: document.title,
      text: (document.body?.innerText || '').slice(0, 6000),
      elements,
    };
  });

  // Build selector map for later actions
  for (const el of result.elements) {
    elementMap.set(el.idx, `[data-trim-idx="${el.idx}"]`);
  }

  // Format as structured text for the model
  let content = `URL: ${result.url}\nTitle: ${result.title}\n\n`;
  content += `## Page Content\n${result.text}\n\n`;
  if (result.elements.length > 0) {
    content += `## Interactive Elements\n`;
    for (const el of result.elements) {
      content += `[${el.idx}] ${el.desc}\n`;
    }
  }

  return content;
}

async function click(index) {
  ensurePage();
  const selector = elementMap.get(index);
  if (!selector) throw new Error(`Element [${index}] not found — call browser_get_content first`);
  await page.click(selector, { timeout: 5000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  return { success: true, url: page.url() };
}

async function type(index, text, submit = false) {
  ensurePage();
  const selector = elementMap.get(index);
  if (!selector) throw new Error(`Element [${index}] not found — call browser_get_content first`);
  await page.fill(selector, text);
  if (submit) await page.press(selector, 'Enter');
  return { success: true };
}

async function selectOption(index, value) {
  ensurePage();
  const selector = elementMap.get(index);
  if (!selector) throw new Error(`Element [${index}] not found`);
  await page.selectOption(selector, { label: value });
  return { success: true };
}

async function scroll(direction = 'down') {
  ensurePage();
  const delta = direction === 'up' ? -800 : 800;
  await page.mouse.wheel(0, delta);
  // Wait for lazy-loaded content to arrive
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
  return { success: true };
}

async function goBack() {
  ensurePage();
  await page.goBack({ timeout: 10000 }).catch(() => {});
  return { url: page.url() };
}

// === Future: screenshot fallback for non-browser/desktop control ===
async function screenshot() {
  ensurePage();
  const buf = await page.screenshot({ type: 'png' });
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function close() {
  elementMap.clear();
  if (context) {
    // Save cookies + localStorage for next session
    try {
      const state = await context.storageState();
      fs.writeFileSync(getStoragePath(), JSON.stringify(state, null, 2));
    } catch {}
  }
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    context = null;
    page = null;
  }
}

function isRunning() {
  return browser !== null && browser.isConnected();
}

function hasSavedCookies() {
  return fs.existsSync(getStoragePath());
}

function clearSavedCookies() {
  try { fs.unlinkSync(getStoragePath()); } catch {}
}

function ensurePage() {
  if (!page) throw new Error('Browser not launched');
}

module.exports = {
  launch,
  navigate,
  getContent,
  click,
  type,
  selectOption,
  scroll,
  goBack,
  screenshot,
  close,
  isRunning,
  hasSavedCookies,
  clearSavedCookies,
};
