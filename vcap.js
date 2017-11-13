// Parse VCAP_SERVICES once on startup
if (!process.env.VCAP_SERVICES) throw new Error('No VCAP_SERVICES');
const vcap = JSON.parse(process.env.VCAP_SERVICES);
// Create a map of services by name
const services = Object.keys(vcap).reduce((svcs, t) => {
  vcap[t].forEach((s) => {
    svcs[s.name] = s.credentials;
  });
  return svcs;
}, {});

module.exports = {
  getServiceByName(name) {
    return services[name];
  },
  getServiceByEnv(envVar) {
    return services[process.env[envVar]];
  },
};
