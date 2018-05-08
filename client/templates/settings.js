import { AutoForm } from "meteor/aldeed:autoform";
import { Template } from "meteor/templating";
import { Reaction, i18next } from "/client/api";
import { Packages } from "/lib/collections";
import { MagentoImportPackageConfig } from "../../lib/collections/schemas";
import { Meteor } from "meteor/meteor";
import { Session } from "meteor/session";
import * as Collections from "/lib/collections";
import { Roles } from "meteor/alanning:roles";

Template.magentoImportSettings.helpers({
  MagentoImportPackageConfig() {
    return MagentoImportPackageConfig;
  },
  packageData() {
    return Packages.findOne({
      name: "magento-import",
      shopId: Reaction.getShopId()
    });
  }
});

Template.magentoImportSettings.rendered = function () {
  const self = this;

  if (self.interval) {
    clearInterval(self.interval);
    delete self.interval;
  }

  self.lastLogId = "";
  self.lastErrorId = "";
  self.lastTaskLen = 0;
  
  self.interval = Meteor.setInterval(function () {
    Meteor.call("magentoImportProgress", function () {
      const progress = Meteor.apply("magentoImportProgress", [], {
        returnStubValue: true
      }, function (error, serverProgress) {
        const progressDiv = $("#magento-import-start-form-progress");
        const submitButton = $("#magento-import-start-form-submit");
        if (self.lastTaskLen !== serverProgress) {
          console.log("magentoImportProgress", serverProgress, new Date());
          self.lastTaskLen = serverProgress;
        }
        if (serverProgress) {
          progressDiv.show();
          submitButton.hide();
          progressDiv.html("Processing " + serverProgress + " task(s)");
        } else {
          progressDiv.hide();
          submitButton.show();
        }
      });
    });
  }, 1000);
};
