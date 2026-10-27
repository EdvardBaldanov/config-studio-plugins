const fs = require('fs');
const path = require('path');

const registryPath = path.join(__dirname, '..', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

async function fetchJSON(url) {
  const headers = { 'User-Agent': 'ConfigStudio-RegistrySync' };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function sync() {
  let changed = false;
  for (const plugin of registry.plugins) {
    if (plugin.homepage && plugin.homepage.includes('github.com/')) {
      const parts = plugin.homepage.split('github.com/')[1].split('/');
      const owner = parts[0];
      const repo = parts[1];
      const expectedLatestUrl = `https://github.com/${owner}/${repo}/releases/latest/download/${plugin.id}.cspkg`;
      
      if (plugin.downloadUrl !== expectedLatestUrl) {
        console.log(`[${plugin.id}] Updating downloadUrl to: ${expectedLatestUrl}`);
        plugin.downloadUrl = expectedLatestUrl;
        changed = true;
      }

      try {
        const latestRel = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
        const latestTag = latestRel.tag_name || '';
        const cleanVersion = latestTag.replace(/^v/, '');
        if (cleanVersion && cleanVersion !== plugin.version) {
          console.log(`[${plugin.id}] Version updated from ${plugin.version} -> ${cleanVersion}`);
          plugin.version = cleanVersion;
          changed = true;
        }

        // Try to fetch latest plugin.json from main branch
        try {
          const rawManifest = await fetchJSON(`https://raw.githubusercontent.com/${owner}/${repo}/main/plugin.json`);
          if (rawManifest.name && plugin.name !== rawManifest.name) {
            console.log(`[${plugin.id}] Name updated: ${plugin.name} -> ${rawManifest.name}`);
            plugin.name = rawManifest.name;
            changed = true;
          }
          if (rawManifest.description && plugin.description !== rawManifest.description) {
            plugin.description = rawManifest.description;
            changed = true;
          }
          if (rawManifest.locales) {
            plugin.locales = rawManifest.locales;
            changed = true;
          }
        } catch (e) {
          console.warn(`[${plugin.id}] Notice: plugin.json sync:`, e.message);
        }
      } catch (err) {
        console.warn(`[${plugin.id}] Notice: release sync:`, err.message);
      }
    }
  }

  if (changed) {
    registry.updatedAt = new Date().toISOString();
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
    console.log('✓ Successfully synchronized registry.json with GitHub latest releases!');
  } else {
    console.log('registry.json is already up to date with all latest releases.');
  }
}

sync().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
