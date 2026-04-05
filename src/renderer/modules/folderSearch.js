async function search(query) {
  if (!query.trim()) return [];

  try {
    const payload = await window.trim.searchFolders(query);
    const results = Array.isArray(payload) ? payload : (payload?.results || []);
    return results.map(entry => ({
      type: 'folder',
      icon: entry.isDirectory ? 'folder' : 'description',
      title: entry.name,
      subtitle: entry.path,
      action: () => window.trim.openFolder(entry.path),
    }));
  } catch {
    return [];
  }
}

window._folderSearch = { search };
