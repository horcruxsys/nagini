// This file has been automatically migrated to valid ESM format by Storybook.
import { dirname, join } from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

function getAbsolutePath(value) {
  return dirname(require.resolve(join(value, "package.json")));
}

const config = {
  stories: ["../stories/*.stories.tsx", "../stories/**/*.stories.tsx"],

  addons: [
    getAbsolutePath("@storybook/addon-links"),
    getAbsolutePath("@storybook/addon-docs")
  ],

  framework: {
    name: getAbsolutePath("@storybook/react-vite"),
    options: {},
  },

  core: {},

  async viteFinal(config) {
    return {
      ...config,
      define: { "process.env": {} },
      resolve: {
        ...(config.resolve ?? {}),
        alias: {
          ...((config.resolve && config.resolve.alias) || {}),
          "@horcruxsys/nagini/ui": `${workspaceRoot}/packages/ui/src`,
        },
      },
    };
  }
};

export default config;
