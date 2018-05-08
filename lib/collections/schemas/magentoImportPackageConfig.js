import SimpleSchema from "simpl-schema";
import { PackageConfig } from "/lib/collections/schemas/registry";

const MagentoImportPackageConfig = new SimpleSchema({});

MagentoImportPackageConfig.extend(PackageConfig);

MagentoImportPackageConfig.extend({
  "settings.enabled": {
    type: Boolean,
    label: "Enabled"
  },
  "settings.host": {
    type: String,
    label: "Host"
  },
  "settings.port": {
    type: String,
    label: "Port"
  },
  "settings.path": {
    type: String,
    label: "Path"
  },
  "settings.login": {
    type: String,
    label: "Login"
  },
  "settings.password": {
    type: String,
    label: "Password"
  }
});



export { MagentoImportPackageConfig };
