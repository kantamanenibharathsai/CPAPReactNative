// const { getDefaultConfig } = require('@react-native/metro-config');
// const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');

// /**
//  * Metro configuration
//  * https://reactnative.dev/docs/metro
//  *
//  * @type {import('@react-native/metro-config').MetroConfig}
//  */
// const defaultConfig = getDefaultConfig(__dirname);

// // You can customize the default config here if needed
// const customConfig = {
//   ...defaultConfig,
//   // Example: customize resolver or transformer here
//   // transformer: {
//   //   ...defaultConfig.transformer,
//   //   babelTransformerPath: require.resolve('your-custom-transformer'),
//   // },
// };

// module.exports = wrapWithReanimatedMetroConfig(customConfig);


const { getDefaultConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

// You can customize the default config here if needed
const customConfig = {
  ...defaultConfig,
  // Example: customize resolver or transformer here
  // transformer: {
  //   ...defaultConfig.transformer,
  //   babelTransformerPath: require.resolve('your-custom-transformer'),
  // },
};

module.exports = customConfig; // Removed wrapWithReanimatedMetroConfig