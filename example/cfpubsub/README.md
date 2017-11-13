## Example of using Predix Event Hub client in a Cloud Foundry App

## Usage

1. Create an eventhub instance in your space.  In this example and manifest, it's called `eventhub`
  ```
    cf cs predix-event-hub Tiered eventhub -c '{ "trustedIssuerIds":["<your_uaa_url>/oauth/token"] }'
  ```
2. Prepare the sample app & library
  ```
    npm run init
  ```
3. Create a UAA client and add scopes to it
  ```
    Goto: https://uaa-dashboard.run.aws-usw02-pr.ice.predix.io/#/login/<your_uaa_zone_id> to create clients and add services to it
  ```
4. Set your UAA options in manifest.yml
  ```
    env:
      EVENT_HUB_SERVICE_NAME: eventhub
      UAA_URL: https://<YOUR UAA URL>/oauth/token
      UAA_CLIENT_ID: <YOUR UAA CLIENT>
      UAA_CLIENT_SECRET: <YOUR UAA SECRET>
  ```
5. Push this sample app
  ```
    cf push
  ```
