// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactNativePlugin = require('eslint-plugin-react-native');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    plugins: {
      'react-native': reactNativePlugin,
    },
    rules: {
      'react-native/no-raw-text': ['error', { skip: ['ThemedText'] }],
    },
  },
]);
