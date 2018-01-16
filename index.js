const path = require('path');
const grpc = require('grpc');
const debug = require('debug')('predix-eventhub-client');
const uuidv4 = require('uuid/v4');
const uaa = require('predix-uaa-client');

const HEALTH_CHECK_INTERVAL = 30000;
const EVENT_PROTO_PATH = path.join(__dirname, 'eventhub.proto');
const HEALTH_PROTO_PATH = path.join(__dirname, 'healthcheck.proto');
const eventhub_proto = grpc.load(EVENT_PROTO_PATH).predix.eventhub;
const health_proto = grpc.load(HEALTH_PROTO_PATH).grpc.health.v1;

/**
 * Creates an instance of UAA authentication CallCredentials.
 * @param {string} uaaUrl of the UAA issuer, including /oauth/token
 * @param {string} clientId UAA clientId to use to get a token
 * @param {string} clientSecret UAA secret for the client
 * @param {string} zoneIdProp header name for zoneId value
 * @param {string} zoneId header value for zoneId
 * @return {CallCredentials} gRPC credentials that has the authorization header set with a valid Bearer Token.
 */
function createUaaBearerTokenCredentials(uaaUrl, clientId, clientSecret, zoneIdProp, zoneId) {
  return grpc.credentials.createFromMetadataGenerator((auth_context, callback) => {
    uaa.getToken(uaaUrl, clientId, clientSecret).then(token => {
      const metadata = new grpc.Metadata();
      metadata.add('authorization', `${token.access_token}`);
      metadata.add(zoneIdProp, zoneId);
      callback(null, metadata);
    }).catch((err) => {
      debug('Error getting token', err);
      callback(err);
    });
  });
}

/**
 * Creates an instance of ChannelCredentials with the required filters.
 * @param {string} uaaUrl of the UAA issuer, including /oauth/token
 * @param {string} clientId UAA clientId to use to get a token
 * @param {string} clientSecret UAA secret for the client
 * @param {string} zoneIdProp header name for zoneId value
 * @param {string} zoneId header value for zoneId
 * @return {ChannelCredentials} gRPC credentials that has TLS and authorization headers enabled.
 */
function getCreds(uaaUrl, clientId, clientSecret, zoneIdProp, zoneId) {
  const callCreds = createUaaBearerTokenCredentials(uaaUrl, clientId, clientSecret, zoneIdProp, zoneId);
  const sslCreds = grpc.credentials.createSsl();
  const combinedCreds = grpc.credentials.combineChannelCredentials(sslCreds, callCreds);
  return combinedCreds;
}

/**
 * Creates and configures a function that can be used to ping a healthCheck
 * endpoint as a keep-alive and test of the socket link health.
 * @param {Channel} channel of another connection to use (optional).
 * @param {string} uri gRPC target uri
 * @param {ChannelCredentials} combinedCreds credentials to use when connecting.
 * @return {Function} a function that will send a ping message.
 */
function createHealthCheck(channel, uri, combinedCreds) {
  debug(`Creating HealthCheck for uri ${uri}`);
  const healthCheckRequest = {
    service: 'predix-event-hub.grpc.health'
  };

  const healthcheckClient = new health_proto.Health(uri, combinedCreds);

  // Use the same channel on which our subscriber is connected
  if (channel) {
    healthcheckClient.$channel = channel;
  }

  return () => {
    debug(`Sending HeathCheck to uri ${uri}`);
    healthcheckClient.check(healthCheckRequest, (err, res) => {
      if (err) {
        debug('HealthCheck Error:', err);
      } else {
        debug('HealthCheck Response:', res);
      }
    });
  };
}

/**
 * Helper function to check options to Publisher or Subscriber are provided.
 * @param {Object} options the options to validate.
 * @return {boolean} true if all provided, else false.
 */
function validateOptions(options) {
  if (!options) {
    debug('Missing options object');
    return false;
  }
  if (!options.uri) {
    debug('Missing required field - uri');
    return false;
  }
  if (!options.zoneId) {
    debug('Missing required field - zoneId');
    return false;
  }
  if (!options.uaaUrl) {
    debug('Missing required field - uaaUrl');
    return false;
  }
  if (!options.clientId) {
    debug('Missing required field - clientId');
    return false;
  }
  if (!options.clientSecret) {
    debug('Missing required field - clientSecret');
    return false;
  }
  if (!options.zoneIdProp) {
    debug('Missing optional field - zoneIdProp, using default "Predix-Zone-Id"');
    options.zoneIdProp = 'Predix-Zone-Id';
  }
  if (!options.subscriberName) {
    // If we're in CF, use the appliction name and space name as the default
    if (process.env.VCAP_APPLICATION) {
      const vApp = JSON.parse(process.env.VCAP_APPLICATION);
      options.subscriberName = `${vApp['application_name']}.${vApp['space_name']}`;
    } else {
      options.subscriberName = 'DEFAULT_SUBSCRIBER';
    }
    debug(`Missing optional field - subscriberName, using default value '${options.subscriberName}'`);
  }
  if (!options.subscriberInstance) {
    debug('Missing optional field - subscriberInstance, using default "1"');
    options.subscriberInstance = '1';
  }
  return true;
}

/**
 * Try to parse data as JSON
 * @param {Any} data The data to try to parse
 * @return {Object} The parsed data as an Object, or the data as was on error.
 */
function tryParse(data) {
  try {
    return JSON.parse(data);
  } catch (e) {
    debug('Error parsing data as JSON', e);
    return data;
  }
}

/**
 *  Class representing an Event Hub Publisher.
 */
class Publisher {
  /**
   * Create a new Publisher instance.
   * @param {Object} options the connection and authentication values for this publisher.
   */
  constructor(options) {
    if (validateOptions(options)) {
      this.uri = options.uri;
      this.zoneIdProp = options.zoneIdProp;
      this.zoneId = options.zoneId;
      this.uaaUrl = options.uaaUrl;
      this.clientId = options.clientId;
      this.clientSecret = options.clientSecret;
    } else {
      throw new Error('Required options missing, see debug log');
    }
  }

  /**
   * Create a publisher and get the raw stream.
   * @return {WritableStream} the raw stream to which events can be written.
   */
  get stream() {
    // Create a new subscription and return the raw stream
    const creds = getCreds(this.uaaUrl, this.clientId, this.clientSecret, this.zoneIdProp, this.zoneId);
    const client = new eventhub_proto.Publisher(this.uri, creds);

    // Start a health check on this channel to ensure the socket is kept open
    const hc = setInterval(createHealthCheck(client.$channel, this.uri, creds), HEALTH_CHECK_INTERVAL);
    const s = client.send();

    s.on('close', () => {
      debug('Publish stream closed');
      clearInterval(hc);
      // Cleanup the postStream stream so it gets recreated on the next postEvent call.
      delete this.postStream;
    });
    s.on('end', () => {
      debug('Publish stream ended');
      clearInterval(hc);
      delete this.postStream;
    });
    s.on('data', data => {
      if (data && data.ack) {
        debug('Publish stream received acks', data.ack.map(a => `${a.id}=${a.status_code}`));
      }
    });
    s.on('status', status => {
      debug('Publish Status:', status);
    });
    s.on('error', err => {
      debug('Publish Error:', err);
      clearInterval(hc);
      delete this.postStream;
    });

    return s;
  }

  /**
   * Post a single event.  This will connect a stream if one does not already exist.
   * @param {Object} eventBody The body of the event to post.  Can be a string or an object.
   * @param {Object} tags optional object of tags to pass along with the event.
   */
  postEvent(eventBody, tags) {
    if (this.postStream === undefined) {
      this.postStream = this.stream;
    }

    // Ensure the body is a string
    if (typeof eventBody !== 'string') {
      eventBody = JSON.stringify(eventBody);
    }

    // Ensure all tag values are strings
    const sTags = Object.keys(tags || {}).reduce((o, k) => {
      o[k] = '' + tags[k];
      return o;
    }, {});

    const messages = {
      messages: {
        msg: [{
          id: uuidv4(),
          body: Buffer.from(eventBody, 'utf-8'),
          zone_id: this.zoneId,
          tags: sTags,
          timestamp: {
            seconds: Math.floor(Date.now() / 1000),
            nanos: process.hrtime()[1]
          }
        }]
      }
    };

    debug(`Posting event ${messages.messages.msg[0].id}...`);
    this.postStream.write(messages);

    // TODO: Internally listen to acks and errors on this stream
    // How should these errors be provided to the caller?
  }
}

/**
 *  Class representing an Event Hub Subsciber.
 */
class Subscriber {
  /**
   * Create a new Subscriber instance.
   * @param {Object} options the connection and authentication values for this subscriber.
   */
  constructor(options) {
    if (validateOptions(options)) {
      this.uri = options.uri;
      this.zoneIdProp = options.zoneIdProp;
      this.zoneId = options.zoneId;
      this.name = options.subscriberName;
      this.instance = options.subscriberInstance;
      this.uaaUrl = options.uaaUrl;
      this.clientId = options.clientId;
      this.clientSecret = options.clientSecret;
    } else {
      throw new Error('Required options missing, see debug log');
    }
  }

  /**
   * Create a subscription and get the raw stream.
   * @return {ReadableStream} the raw stream of events.
   */
  get stream() {
    // Create a new subscription and return the raw stream
    const creds = getCreds(this.uaaUrl, this.clientId, this.clientSecret, this.zoneIdProp, this.zoneId);
    const client = new eventhub_proto.Subscriber(this.uri, creds);

    // Start a health check on this channel to ensure the socket is kept open
    const hc = setInterval(createHealthCheck(client.$channel, this.uri, creds), HEALTH_CHECK_INTERVAL);
    const s = client.receive({
      zone_id: this.zoneId,
      subscriber: this.name,
      instance_id: this.instance
    });

    s.on('close', () => {
      debug('Subscribe stream closed');
      clearInterval(hc);
    });

    s.on('end', () => {
      debug('Subscribe stream ended');
      clearInterval(hc);
    });

    return s;
  }

  /**
   * Create a subscription that will pass events to a callback.
   * @param {Function} cb Callback(err, body, data) function to execute on events.
   */
  registerCallback(cb) {
    // Create a new subscription and use the internal
    // event handlers to process the stream.  Call cb(err, body, data)
    // when an error or data is received.
    const s = this.stream;
    s.on('data', data => {
      cb(null, tryParse(data.body), data);
    });
    s.on('end', () => {
      debug('Subscription End');
      cb(new Error('Subscription End'));
    });
    s.on('close', () => {
      debug('Subscription Closed');
      cb(new Error('Subscription Closed'));
    });
    s.on('readable', () => {
      debug('Subscription Readable');
    });
    s.on('status', status => {
      debug('Subscription Status:', status);
    });
    s.on('error', err => {
      debug('Subscription Error:', err);
      cb(err);
    });
  }
}

/**
 * Class representing an Event Hub Client.
 * This wraps the Subscriber and Publisher classes
 * to allow configuration to occur only once.
 */
class EHClient {
  /**
   * Create a new Event Hub client instance.
   * @param {Object} options the connection and authentication values for this client.
   */
  constructor(options) {
    this.options = options;

    if (options.vcapServiceName) {
      // Resolve the event hub connection details from VCAP_SERVICES
      const vcap = require('./vcap');
      const ehService = vcap.getServiceByName(options.vcapServiceName);

      const publisherCreds = ehService.publish;
      const subscriberCreds = ehService.subscribe;
      this.options.zoneId = publisherCreds['zone-http-header-value'];
      this.options.zoneIdProp = publisherCreds['zone-http-header-name'];
      this.options.sConn = subscriberCreds.protocol_details.find(p => p.protocol === 'grpc');
      this.options.pConn = publisherCreds.protocol_details.find(p => p.protocol === 'grpc');
    }
  }

  /**
   * Create a new Subscriber instance using the connection and authentication of the client.
   * @return {Subscriber} the Subscriber instance.
   */
  get Subscriber() {
    const sOpt = {
      uri: this.options.sConn.uri,
      zoneIdProp: this.options.zoneIdProp,
      zoneId: this.options.zoneId,
      uaaUrl: this.options.uaaUrl,
      clientId: this.options.clientId,
      clientSecret: this.options.clientSecret,
      subscriberName: this.options.subscriberName,
      subscriberInstance: this.options.subscriberInstance
    };
    return new Subscriber(sOpt);
  }

  /**
   * Create a new Publisher instance using the connection and authentication of the client.
   * @return {Publisher} the Publisher instance.
   */
  get Publisher() {
    const pOpt = {
      uri: this.options.pConn.uri,
      zoneIdProp: this.options.zoneIdProp,
      zoneId: this.options.zoneId,
      uaaUrl: this.options.uaaUrl,
      clientId: this.options.clientId,
      clientSecret: this.options.clientSecret,
      subscriberName: this.options.subscriberName,
      subscriberInstance: this.options.subscriberInstance
    };
    return new Publisher(pOpt);
  }
}

module.exports = {
  Publisher,
  Subscriber,
  EHClient
};
