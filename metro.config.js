const { getDefaultConfig } = require('expo/metro-config');
const { withDevkit } = require('miaoda-expo-devkit/metro');

const config = getDefaultConfig(__dirname);
const devkitConfig = withDevkit(config);

// The devkit pins esbuild 0.12, whose platform binary installer is unreliable
// on current Node versions. Metro's maintained Terser minifier is portable.
devkitConfig.transformer.minifierPath = require.resolve('metro-minify-terser');

module.exports = devkitConfig;
