let appList = null;
let loading = false;
let usageData = {};

async function init() {
  loading = true;
  try {
    const [apps, usage] = await Promise.all([
      window.trim.searchApps(),
      window.trim.getUsage(),
    ]);
    appList = Array.isArray(apps) ? apps : [];
    usageData = usage || {};
  } catch {
    appList = [];
  }
  loading = false;
}

// Levenshtein distance for typo tolerance
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Optimization: skip if length difference is too large
  if (Math.abs(a.length - b.length) > 3) return 999;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[b.length][a.length];
}

async function search(query) {
  if (!appList && !loading) await init();
  if (!appList) return [];

  const q = query.toLowerCase().trim();
  if (!q) {
    // Empty query: show most-used apps first, then alphabetical
    return appList
      .slice()
      .sort((a, b) => (usageData[b.name.toLowerCase()] || 0) - (usageData[a.name.toLowerCase()] || 0))
      .slice(0, 8)
      .map(mapResult);
  }

  const scored = appList
    .map(app => {
      const name = app.name.toLowerCase();
      let score = 0;

      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else {
        // Fuzzy: all chars appear in order
        let qi = 0;
        for (let i = 0; i < name.length && qi < q.length; i++) {
          if (name[i] === q[qi]) qi++;
        }
        if (qi === q.length) score = 40;
      }

      // Typo tolerance: Levenshtein on the full name or on each word
      if (score === 0 && q.length >= 3) {
        const dist = levenshtein(q, name.slice(0, q.length + 2));
        if (dist <= 1) score = 35;
        else if (dist <= 2) score = 20;
        else {
          // Check individual words
          const words = name.split(/[\s\-_]+/);
          for (const word of words) {
            const wDist = levenshtein(q, word);
            if (wDist <= 1) { score = 30; break; }
            else if (wDist <= 2) { score = 15; break; }
          }
        }
      }

      // Usage bonus: boost frequently launched apps
      const usage = usageData[name] || 0;
      if (score > 0 && usage > 0) {
        score += Math.min(usage * 3, 30);
      }

      return { app, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return scored.map(s => mapResult(s.app));
}

function mapResult(app) {
  const isUWP = !app.target && app.appId;
  return {
    type: 'app',
    icon: null,
    iconPath: app.target || app.iconPath || null,
    title: app.name,
    subtitle: isUWP ? 'Microsoft Store App' : app.target,
    action: () => {
      window.trim.openApp(app.lnkPath || app.target || app.appId, app.name);
      // Update local usage data immediately for next search
      const key = app.name.toLowerCase();
      usageData[key] = (usageData[key] || 0) + 1;
    },
  };
}

async function loadIcon(exePath) {
  try {
    return await window.trim.getIcon(exePath);
  } catch {
    return null;
  }
}

// Pre-fetch on module load
init();

window._appSearch = { search, loadIcon };
