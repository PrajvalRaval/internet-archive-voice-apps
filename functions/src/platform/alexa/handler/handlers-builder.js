const _ = require('lodash');
const util = require('util');

const {App} = require('../app');
const jsonify = require('../../../utils/jsonify');
const {debug} = require('../../../utils/logger')('ia:platform:alexa:handler');

const fsm = require('../../../state/fsm');
const kebabToCamel = require('../../../utils/kebab-to-camel');
const camelToKebab = require('../../../utils/camel-to-kebab');

const stripAmazonIntentReg = /^AMAZON\.(.*)Intent$/;
function stripAmazonIntent (name) {
  const res = stripAmazonIntentReg.exec(name);
  if (res) {
    return res[1];
  }
  return name;
}

const stripRequestTypeReq = /^AudioPlayer\.(.*)$/;
function stripRequestType (requestType) {
  const req = stripRequestTypeReq.exec(requestType);
  if (req) {
    return req[1];
  }
  return requestType;
}

/**
 * @private
 *
 * Fetch persistant attributes
 *
 * @param handlerInput
 * @returns {Promise}
 */
function fetchAttributes (handlerInput) {
  debug('fetch attributes');
  return handlerInput.attributesManager.getPersistentAttributes()
    .catch((err) => {
      debug('we got error on gettting persistetn attributes', err);
      debug('so we drop them to default');
      return {};
    });
}

/**
 * @private
 *
 * Store persistant attributes
 *
 * @param app
 * @returns {Promise}
 */
function storeAttributes (app, handlerInput) {
  const persistentAttributes = app.persist.getData();
  debug('store attributes', util.inspect(persistentAttributes, {depth: null}));
  handlerInput.attributesManager.setPersistentAttributes(jsonify(persistentAttributes));
  return handlerInput.attributesManager.savePersistentAttributes();
}

function findHandlersByInput (actions, handlerInput) {
  let name;
  let handlers;

  name = _.get(handlerInput, 'requestEnvelope.request.intent.name');
  handlers = actions.get(camelToKebab(name));

  if (handlers) {
    return {handlers, name};
  }

  name = stripAmazonIntent(name);
  handlers = actions.get(camelToKebab(name));

  if (handlers) {
    return {handlers, name};
  }

  let requestType = _.get(handlerInput, 'requestEnvelope.request.type');
  if (requestType) {
    name = stripRequestType(requestType);
    handlers = actions.get(camelToKebab(name));
    if (handlers) {
      return {handlers, name};
    }
  }

  const splitName = name.split('_');

  while (splitName.length > 1) {
    console.log('splitName', splitName);
    splitName.pop();
    name = splitName.join('_');
    console.log('name', name);
    console.log('camelToKebab(name)', camelToKebab(name));
    handlers = actions.get(camelToKebab(name));
    if (handlers) {
      return {handlers, name};
    }
  }

  return null;
}

/**
 * Map actions to alexa handlers
 * - alexa intenets should be camel styled and Object type
 *
 * @param actions {Map}
 * @returns {Object}
 */
module.exports = (actions) => {
  if (!actions) {
    return {};
  }

  return Array
    .from(actions.entries())
    .map(([name, handlers]) => {
      const intent = kebabToCamel(name);
      return {
        intent,

        canHandle: (handlerInput) => {
          let intentName = _.get(handlerInput, 'requestEnvelope.request.intent.name');
          if (intentName) {
            // if intent starts with AMAZON we will cut this head
            const newIntentName = stripAmazonIntent(intentName);
            if (intentName !== newIntentName) {
              intentName = newIntentName;
            }
            return intentName === intent;
          }

          let requestType = _.get(handlerInput, 'requestEnvelope.request.type');
          if (requestType) {
            const newRequestType = stripRequestType(requestType);
            if (requestType !== newRequestType) {
              requestType = newRequestType;
            }
            return requestType === intent;
          }

          return false;
        },

        handle: (handlerInput) => {
          debug(`begin handle intent "${intent}"`);
          return fetchAttributes(handlerInput)
            .then((persistentAttributes) => {
              debug('got persistent attributes:', util.inspect(persistentAttributes, {depth: null}));
              const app = new App(handlerInput, persistentAttributes);
              const handler = fsm.selectHandler(app, handlers);
              return Promise.all([app, handler(app)]);
            })
            // TODO: maybe we could store and response in the same time?
            .then(([app, res]) => storeAttributes(app, handlerInput))
            .then(() => {
              debug(`end handle intent "${intent}"`);
              return handlerInput.responseBuilder.getResponse();
            });
        },
      };
    })
    .concat({
      intent: 'any',

      canHandle: () => true,

      handler: (handlerInput) => {
        debug('catch all the rest');

        const res = findHandlersByInput(actions, handlerInput);
        if (!res) {
          debug(`we haven't found any valid handler`);
          return Promise.resolve();
        }

        const {handlers, name} = res;

        debug(`begin handle intent "${name}"`);
        return fetchAttributes(handlerInput)
          .then((persistentAttributes) => {
            debug('got persistent attributes:', util.inspect(persistentAttributes, {depth: null}));
            const app = new App(handlerInput, persistentAttributes);
            const handler = fsm.selectHandler(app, handlers);
            return Promise.all([app, handler(app)]);
          })
          // TODO: maybe we could store and response in the same time?
          .then(([app, res]) => storeAttributes(app, handlerInput))
          .then(() => {
            debug(`end handle intent "${name}"`);
            return handlerInput.responseBuilder.getResponse();
          });
      },
    });
};
