import { Mongo } from "meteor/mongo";
import { registerSchema } from "@reactioncommerce/schemas";
import SimpleSchema from "simpl-schema";

/**
 * Magento import responses in requests.
 */
export const MagentoResponses = new Mongo.Collection("MagentoResponses");

MagentoResponses.attachSchema(new SimpleSchema({
  search: {
    type: String,
    unique: true,
    index: true
  },
  jsonSearch: {
    type: String
  },
  dataSearch: {
    type: Object
  },
  data: {
    type: Object
  }
}));
