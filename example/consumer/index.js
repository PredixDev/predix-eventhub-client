const Subscriber = require('predix-eventhub-client').Subscriber;

const options = {
  uri: 'event-hub-aws-usw02.data-services.predix.io:443',
  zoneId: '<YOUR EVENT HUB ZONE ID>',
  uaaUrl: 'https://<YOUR_UAA_URL>/oauth/token',
  clientId: '<YOUR UAA CLIENT>',
  clientSecret: '<YOUR UAA SECRET>'
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
