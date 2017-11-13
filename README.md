# predix-eventhub-client
Node module to interact with Predix Event Hub supporting publish/subscribe.
For more information on Predix Event Hub, [see documentation here](https://docs.predix.io/en-US/content/service/data_management/event_hub/).

## Installation

`npm install --save predix-eventhub-client`

## Subscriber
To subscribe to an Event Hub stream, create an instance of Subscriber.  e.g.

```
const Subscriber = require('predix-eventhub-client').Subscriber;

const options = {
  uri: 'event-hub-aws-usw02.data-services.predix.io:443',
  zoneId: '<YOUR EVENT HUB ZONE ID>',
  uaaUrl: 'https://<YOUR_UAA_URL>/oauth/token',
  clientId: '<YOUR UAA CLIENT>',
  clientSecret: '<YOUR UAA SECRET>',
  subscriberName: 'SUB-123'
};

const sub = new Subscriber(options);

console.log('Subscribing...');

sub.registerCallback((err, body, data) => {
  if (err) {
    console.log('Got Error', err);
    return;
  }
  console.log('Got Message:', body, 'tags:', data.tags);
});

```

> NOTE: `subscriberName` is used to determine the different between subscribers.  Subscribers using the same name will have their messages load-balanced between instances.

## Publisher
To publish to an Event Hub stream, create an instance of Publisher.  e.g:

```
const Publisher = require('predix-eventhub-client').Publisher;

const options = {
  uri: 'event-hub-aws-usw02.data-services.predix.io:443',
  zoneId: '<YOUR EVENT HUB ZONE ID>',
  uaaUrl: 'https://<YOUR_UAA_URL>/oauth/token',
  clientId: '<YOUR UAA CLIENT>',
  clientSecret: '<YOUR UAA SECRET>'
};

const pub = new Publisher(options);

let c = 0;
setInterval(() => {
  const tags = {
    count: c++
  };
  pub.postEvent('Hello, Event Hub', tags);
}, 1000);

```

> NOTE: Tags are optional, but the values *will* be converted into a String.  Only string values are allowed in the tags object.

## Pub/Sub
If both publish and subscribe are needed, there is a convenience wrapper class, `EHClient`.  e.g.

```
const EHClient = require('predix-eventhub-client').EHClient;

const options = {
  // Load the Event Hub details from VCAP_SERVICES for me!
  vcapServiceName: process.env.EVENT_HUB_SERVICE_NAME,
  uaaUrl: process.env.UAA_URL,
  clientId: process.env.UAA_CLIENT_ID,
  clientSecret: process.env.UAA_CLIENT_SECRET
};

const client = new EHClient(options);

const pub = client.Publisher;
const sub = client.Subscriber;

let c = 0;
setInterval(() => {
  pub.postEvent('Hello, Event Hub', { count: `${c++}` });
}, 1000);

sub.registerCallback((err, body, data) => {
  if (err) {
    console.log('Got Error', err);
    return;
  }
  console.log('Got Message:', body, 'tags:', data.tags);
});

```

> NOTE: In this example we have the Event Hub connection details being provided from the Cloud Foundry VCAP_SERVICES environment variable.  To use this feature, set the `vcapServiceName` option to the name of the bound service.

See examples in the [example](example) folder
