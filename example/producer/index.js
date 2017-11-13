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
  pub.postEvent('Hello, Event Hub', { count: `${c++}` });
}, 1000);
