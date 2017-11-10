var configSettings = require('./config.json');

var nodeEnv = process.env.NODE_ENV || 'development',
  commonConfig = configSettings['common'],
  envConfig = configSettings[nodeEnv] || {},
  finalConfig = {};

for (var configKey in commonConfig) {
  if (commonConfig.hasOwnProperty(configKey)) {
    finalConfig[configKey] = envConfig[configKey] || commonConfig[configKey];
  }
}

exports.loadConfig = function () {
  return finalConfig;
};
