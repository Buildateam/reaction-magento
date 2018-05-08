import { Meteor } from "meteor/meteor";
import { AutoForm } from "meteor/aldeed:autoform";

import "./templates/settings.html";
import "./templates/settings.js";

AutoForm.hooks({
  "magento-import-products-start-form": {
    onSuccess: function () {
      Meteor.call("magentoImportProductsStart", function (error, result) {
        return Alerts.toast("Import started", "success");
      });
    },
    onError: function () {
      return Alerts.toast("Error while starting import", "error");
    }
  },
  "magento-import-customers-start-form": {
    onSuccess: function () {
      Meteor.call("magentoImportCustomersStart", function (error, result) {
        return Alerts.toast("Import started", "success");
      });
    },
    onError: function () {
      return Alerts.toast("Error while starting import", "error");
    }
  },
  "magento-import-orders-start-form": {
    onSuccess: function () {
      Meteor.call("magentoImportOrdersStart", function (error, result) {
        return Alerts.toast("Import started", "success");
      });
    },
    onError: function () {
      return Alerts.toast("Error while starting import", "error");
    }
  }
});
