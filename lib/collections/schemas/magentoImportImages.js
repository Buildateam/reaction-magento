import SimpleSchema from "simpl-schema";
import { Mongo } from "meteor/mongo";

/**
 * Magento import responses in requests.
 */
export const MagentoImportImages = new Mongo.Collection("MagentoImportImages");

MagentoImportImages.attachSchema(new SimpleSchema({
  productId: {
    type: String
  },
  url: {
    type: String
  },
  variantId: {
    type: String
  },
  shopId: {
    type: String
  }
}));
