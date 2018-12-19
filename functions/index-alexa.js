'use strict';

// put on the top to estimate performance of "start"
const pipeline = require('./src/performance/pipeline');
pipeline.stage(pipeline.START);

const actions = require('./src/actions');
const alexaHandler = require('./src/platform/alexa/handler');
const setup = require('./src/setup');
const logAppStart = require('./src/utils/logger/log-app-start');

const actionsMap = actions.fromFiles();

logAppStart(actionsMap);

setup({ platform: 'alexa' });

/**
 * Alexa Lambda Endpoint
 *
 * @type {HttpsFunction}
 */
exports.handler = alexaHandler(actionsMap);

// end of "start" phase of pipeline, now we are waiting for request
pipeline.stage(pipeline.IDLE);
