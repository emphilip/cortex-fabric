import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx|mdx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: ["../public"],
  viteFinal: async (cfg) => {
    // Storybook runs outside of Next, so stub next/link and next/navigation
    // to keep component stories renderable in isolation.
    const path = await import("node:path");
    cfg.resolve = cfg.resolve || {};
    cfg.resolve.alias = {
      ...(cfg.resolve.alias as Record<string, string> | undefined),
      "next/link": path.resolve(__dirname, "./mocks/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "./mocks/next-navigation.ts"),
      "@": path.resolve(__dirname, "../src"),
    };
    cfg.build = {
      ...cfg.build,
      // Storybook's own docs/runtime bundles exceed Vite's generic 500 kB
      // warning threshold. They are tooling-only and are not shipped with the
      // admin application.
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        ...cfg.build?.rollupOptions,
        onwarn(warning, warn) {
          // Storybook core currently contains two eval calls in its preview
          // runtime. Suppress that dependency warning while preserving every
          // project-code warning.
          if (
            warning.code === "EVAL" &&
            warning.id?.includes("@storybook/core")
          ) {
            return;
          }
          warn(warning);
        },
      },
    };
    return cfg;
  },
};

export default config;
