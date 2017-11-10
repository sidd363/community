'use strict'

/**
 * New Relic agent configuration.
 *
 * See lib/config.defaults.js in the agent distribution for a more complete
 * description of configuration variables and their potential values.
 */
exports.config = {
  /**
   * Array of application names.
   */
  app_name: ['Shrofile Community'],
  /**
   * Your New Relic license key.
   */
  //license_key: '148d9e2230dbc1bcf5be144be897b33e0992ab8e',
  license_key: '6704dddf10a9fa8aa22c5b337930d08556e84b3a',
  logging: {
    /**
     * Level at which to log. 'trace' is most useful to New Relic when diagnosing
     * issues with the agent, 'info' and higher will impose the least overhead on
     * production applications.
     */
    level: 'info'
  }
}
