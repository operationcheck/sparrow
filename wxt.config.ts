import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // WXT defaults to MV3, but we pin it explicitly.
  manifestVersion: 3,
  // Keep the existing source layout under src/.
  srcDir: "src",
  publicDir: "public",
  manifest: {
    permissions: ["contextMenus", "storage", "notifications"],
    action: {
      default_title: "Atlas",
      default_icon: {
        "16": "/icon-16.png",
        "19": "/icon-19.png",
        "38": "/icon-38.png",
        "128": "/icon-128.png",
      },
    },
    icons: {
      "16": "/icon-16.png",
      "19": "/icon-19.png",
      "38": "/icon-38.png",
      "128": "/icon-128.png",
    },
  },
});
