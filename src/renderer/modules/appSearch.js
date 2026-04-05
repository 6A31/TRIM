let appList = null;
let loading = false;

async function init() {
  loading = true;
  try {
    appList = await window.trim.searchApps();
    if (!Array.isArray(appList)) appList = [];
  } catch {
    appList = [];
  }
  loading = false;
}

async function search(query) {
  if (!appList && !loading) await init();
  if (!appList) return [];

  const q = query.toLowerCase().trim();
  if (!q) return appList.slice(0, 8).map(mapResult);

  const scored = appList
    .map(app => {
      const name = app.name.toLowerCase();
      let score = 0;
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else {
        // Fuzzy: check if all chars appear in order
        let qi = 0;
        for (let i = 0; i < name.length && qi < q.length; i++) {
          if (name[i] === q[qi]) qi++;
        }
        if (qi === q.length) score = 30;
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
    action: () => window.trim.openApp(app.lnkPath || app.target || app.appId),
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
