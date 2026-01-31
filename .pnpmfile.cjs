const catalog = {
  "@biomejs/biome": "^2.2.6",
  "@types/react": "^19.2.2",
  "@types/react-dom": "^19.2.2",
  "@ungap/structured-clone": "^1.3.0",
  "@vitejs/plugin-react": "^5.0.4",
  "classnames": "^2.5.1",
  "framer-motion": "^12.23.24",
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "sharp": "^0.34.4",
  "typedoc": "^0.28.13",
  "typedoc-plugin-markdown": "^4.9.0",
  "typescript": "^5.9.3",
  "vite": "^7.1.11",
  "vite-plugin-dts": "^4.5.4",
  "vite-plugin-svgr": "^4.5.0",
  "vite-plugin-wasm": "^3.5.0",
};

const workspaceMap = {
  "@applemusic-like-lyrics/core":
    "github:Xionghaizi001/applemusic-like-lyrics#feat-speaker-prebuilt&path:packages/core",
  "@applemusic-like-lyrics/lyric":
    "github:Xionghaizi001/applemusic-like-lyrics#feat-speaker-prebuilt&path:packages/lyric",
  "@applemusic-like-lyrics/react":
    "github:Xionghaizi001/applemusic-like-lyrics#feat-speaker-prebuilt&path:packages/react",
};

function replaceCatalog(deps) {
  if (!deps) return;
  for (const [name, spec] of Object.entries(deps)) {
    if (spec === "catalog:" && catalog[name]) {
      deps[name] = catalog[name];
    }
  }
}

function replaceWorkspace(deps) {
  if (!deps) return;
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec === "string" && spec.startsWith("workspace:") && workspaceMap[name]) {
      deps[name] = workspaceMap[name];
    }
  }
}

module.exports = {
  hooks: {
    readPackage(pkg) {
      replaceCatalog(pkg.dependencies);
      replaceCatalog(pkg.devDependencies);
      replaceCatalog(pkg.peerDependencies);
      replaceCatalog(pkg.optionalDependencies);
      replaceWorkspace(pkg.dependencies);
      replaceWorkspace(pkg.devDependencies);
      replaceWorkspace(pkg.peerDependencies);
      replaceWorkspace(pkg.optionalDependencies);
      return pkg;
    },
  },
};
