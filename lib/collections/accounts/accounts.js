import SimpleSchema from "simpl-schema";
import { shopIdAutoValue } from "/lib/collections/schemas/helpers";
import { Metafield } from "/lib/collections/schemas/metafield";
import { Email, Profile } from "/lib/collections/schemas/accounts";

import { Accounts } from "/lib/collections";

/**
 * @name TaxSettings
 * @memberof schemas
 * @type {SimpleSchema}
 * @property {String} exemptionNo optional
 * @property {String} customerUsageType optional
 */
const TaxSettings = new SimpleSchema({
  exemptionNo: {
    type: String,
    optional: true
  },
  customerUsageType: {
    type: String,
    optional: true
  }
}, { check, tracker: Tracker });

/**
 * @name Accounts
 * @memberof schemas
 * @type {SimpleSchema}
 * @property {String} userId required
 * @property {String[]} sessions optional, Array of strings
 * @property {String} shopId required
 * @property {String} name optional
 * @property {String} username optional
 * @property {Email[]} emails optional, Array of strings
 * @property {Boolean} acceptsMarketing optional
 * @property {String} state optional
 * @property {TaxSettings} taxSettings optional
 * @property {String} note optional
 * @property {Profile} profile optional
 * @property {String[]} groups optional, Array of groupIds of the groups the user belongs to
 * @property {Metafield[]} metafields optional
 * @property {Date} createdAt required
 * @property {Date} updatedAt optional
 * @property {magentoCustmerId} magentoCustmerId optional
 */
export const ReplaceAccountSchema = new SimpleSchema({
  _id: {
    type: String,
    optional: true
  },
  userId: {
    type: String,
    // regEx: SimpleSchema.RegEx.Id,
    index: 1,
    label: "Accounts ShopId"
  },
  sessions: {
    type: Array,
    optional: true,
    index: 1
  },
  "sessions.$": String,
  shopId: {
    type: String,
    autoValue: shopIdAutoValue,
    // regEx: SimpleSchema.RegEx.Id,
    index: 1
  },
  name: {
    type: String,
    optional: true
  },
  username: {
    type: String,
    optional: true
  },
  emails: {
    type: Array,
    optional: true
  },
  "emails.$": Email,
  acceptsMarketing: {
    type: Boolean,
    defaultValue: false,
    optional: true
  },
  state: {
    type: String,
    defaultValue: "new",
    optional: true
  },
  "taxSettings": {
    type: TaxSettings,
    optional: true
  },
  note: {
    type: String,
    optional: true
  },
  "profile": {
    type: Profile,
    optional: true
  },
  groups: {
    type: Array, // groupIds that user belongs to
    optional: true,
    defaultValue: []
  },
  "groups.$": String,
  metafields: {
    type: Array,
    optional: true
  },
  "metafields.$": Metafield,
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert) {
        return new Date;
      } else if (this.isUpsert) {
        return {
          $setOnInsert: new Date
        };
      }
    }
  },
  magentoCustomerId: { type: String, optional: true },
  updatedAt: {
    type: Date,
    autoValue() {
      if (this.isUpdate) {
        return {
          $set: new Date
        };
      } else if (this.isUpsert) {
        return {
          $setOnInsert: new Date
        };
      }
    },
    optional: true
  }
});

Accounts.attachSchema(ReplaceAccountSchema, { replace: true });
