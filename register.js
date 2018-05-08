import { Reaction } from "/server/api";

Reaction.registerPackage({
  label: "Magento Import",
  name: "magento-import",
  icon: "fa fa-clone",
  autoEnable: true,
  settings: {
    name: "Magento Import",
    enabled: true,
    host: "",
    port: "",
    path: "/api/xmlrpc/",
    login: "",
    password: ""
  },
  registry: [{
    provides: "settings",
    name: "settings/magento-import",
    label: "Magento Import",
    description: "Configure Magento import",
    icon: "fa fa-clone",
    template: "magentoImportSettings"
  }]
});
