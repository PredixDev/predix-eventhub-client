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
