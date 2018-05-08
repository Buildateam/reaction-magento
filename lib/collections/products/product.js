import SimpleSchema from "simpl-schema";
import { Random } from "meteor/random";
import { Meteor } from "meteor/meteor";
import { shopDefaultCountry, shopIdAutoValue } from "/lib/collections/schemas/helpers";
import { Metafield } from "/lib/collections/schemas/metafield";
import { ShippingParcel } from "/lib/collections/schemas/shipping";
import { Workflow } from "/lib/collections/schemas/workflow";
import { getSlug, ReactionProduct } from "/lib/api";

import { Products } from "/lib/collections";
import { Event } from "/lib/collections/schemas/event";

const PriceRange = new SimpleSchema({
  range: {
    type: String,
    defaultValue: "0.00"
  },
  min: {
    type: Number,
    // decimal: true,
    defaultValue: 0,
    optional: true
  },
  max: {
    type: Number,
    // decimal: true,
    defaultValue: 0,
    optional: true
  }
});

const ReplaceProductSchema = new SimpleSchema({
  _id: {
    type: String,
    label: "Product Id"
  },
  ancestors: {
    type: Array,
    defaultValue: []
  },
  "ancestors.$": String,
  shopId: {
    type: String,
    autoValue: shopIdAutoValue,
    index: 1,
    label: "Product ShopId"
  },
  title: {
    type: String,
    defaultValue: "",
    label: "Product Title"
  },
  sku: {
    type: String,
    index: 1,
    label: "SKU",
    optional: true
  },
  pageTitle: {
    type: String,
    optional: true
  },
  description: {
    type: String,
    optional: true
  },
  productType: {
    type: String,
    optional: true
  },
  originCountry: {
    type: String,
    optional: true,
    autoValue: shopDefaultCountry
  },
  type: {
    label: "Type",
    type: String,
    defaultValue: "simple"
  },
  vendor: {
    type: String,
    optional: true
  },
  metafields: {
    type: Array,
    optional: true
  },
  "metafields.$": Metafield,
  positions: {
    type: Object, // ProductPosition
    blackbox: true,
    optional: true
  },
  price: {
    label: "Price",
    type: PriceRange
  },
  isLowQuantity: {
    label: "Indicates that the product quantity is too low",
    type: Boolean,
    optional: true
  },
  isSoldOut: {
    label: "Indicates when the product quantity is zero",
    type: Boolean,
    optional: true
  },
  isBackorder: {
    label: "Indicates when the seller has allowed the sale of product which" +
    " is not in stock",
    type: Boolean,
    optional: true
  },
  requiresShipping: {
    label: "Require a shipping address",
    type: Boolean,
    defaultValue: true,
    optional: true
  },
  parcel: {
    type: ShippingParcel,
    optional: true
  },
  hashtags: {
    type: Array,
    optional: true,
    index: 1
  },
  "hashtags.$": String,
  twitterMsg: {
    type: String,
    optional: true,
    max: 140
  },
  facebookMsg: {
    type: String,
    optional: true,
    max: 255
  },
  googleplusMsg: {
    type: String,
    optional: true,
    max: 255
  },
  pinterestMsg: {
    type: String,
    optional: true,
    max: 255
  },
  metaDescription: {
    type: String,
    optional: true
  },
  handle: {
    type: String,
    optional: true,
    index: 1,
    autoValue: function () {
      let slug = getSlug(this.value);

      if (!slug && this.siblingField("title").value) {
        slug = getSlug(this.siblingField("title").value);
      } else if (!slug) {
        slug = this.siblingField("_id").value || Random.id();
      }
      if (this.isInsert) {
        return slug;
      } else if (this.isUpsert) {
        return {
          $setOnInsert: slug
        };
      }
    }
  },
  shopUrl: {
    type: String,
    optional: true,
    index: 1
  },
  isDeleted: {
    type: Boolean,
    index: 1,
    defaultValue: false
  },
  isVisible: {
    type: Boolean,
    index: 1,
    defaultValue: false
  },
  template: {
    label: "Template",
    type: String,
    defaultValue: "customProductDetailSimple"
  },
  createdAt: {
    type: Date,
    autoValue: function () {
      if (this.isInsert) {
        return new Date;
      } else if (this.isUpsert) {
        return {
          $setOnInsert: new Date
        };
      }
    }
  },
  updatedAt: {
    type: Date,
    autoValue: function () {
      return new Date;
    },
    optional: true
  },
  publishedAt: {
    type: Date,
    optional: true
  },
  publishedScope: {
    type: String,
    optional: true
  },
  workflow: {
    type: Workflow,
    optional: true
  }
});
const ReplaceProductVariantSchema = new SimpleSchema({
  _id: {
    type: String,
    label: "Variant ID"
  },
  ancestors: {
    type: Array,
    defaultValue: []
  },
  "ancestors.$": String,
  index: {
    label: "Variant position number in list",
    type: Number,
    optional: true
  },
  isVisible: {
    type: Boolean,
    index: 1,
    defaultValue: false
  },
  isDeleted: {
    type: Boolean,
    index: 1,
    defaultValue: false
  },
  isGroupCombination: {
    label: "Option is a group combination",
    type: Boolean,
    index: true,
    optional: true
  },
  optionCombinations: {
    label: "Option is a group combination",
    type: Array,
    index: true,
    optional: true
  },
  "optionCombinations.$": String,
  groupIsRequired: {
    label: "Option group is required",
    type: String,
    optional: true
  },
  groupSort: {
    label: "Option group sort",
    type: String,
    optional: true
  },
  optionPriceType: {
    label: "Option group price type",
    type: String,
    optional: true
  },
  optionPrice: {
    label: "Option option price",
    type: String,
    optional: true
  },
  optionDiff: {
    label: "Option price diff",
    type: String,
    optional: true
  },
  optionSku: {
    label: "Option sku",
    type: String,
    optional: true
  },
  optionSortOrder: {
    label: "Option sort order",
    type: String,
    optional: true
  },
  groupId: {
    label: "Option group id",
    type: String,
    index: 1,
    optional: true
  },
  groupTitle: {
    label: "Option group title",
    type: String,
    optional: true
  },
  groupType: {
    label: "Option group type",
    type: String,
    index: 1,
    optional: true
  },
  optionId: {
    label: "Option single id",
    type: String,
    index: 1,
    optional: true
  },
  optionVariantTitle: {
    label: "Option single title",
    type: String,
    index: 1,
    optional: true
  },
  optionSortIndex: {
    label: "Option sort index",
    type: Number,
    optional: true
  },
  barcode: {
    label: "Barcode",
    type: String,
    optional: true,
    custom: function () {
      if (Meteor.isClient) {
        if (this.siblingField("type").value === "inventory" && !this.value) {
          return "required";
        }
      }
    }
  },
  handle: {
    type: String,
    optional: true,
    index: 1,
    autoValue: function () {
      let slug = getSlug(this.value);

      if (!slug && this.siblingField("title").value) {
        slug = getSlug(this.siblingField("title").value);
      } else if (!slug) {
        slug = this.siblingField("_id").value || Random.id();
      }
      if (this.isInsert) {
        return slug;
      } else if (this.isUpsert) {
        return {
          $setOnInsert: slug
        };
      }
    }
  },
  shopUrl: {
    type: String,
    optional: true,
    index: 1
  },
  compareAtPrice: {
    label: "Compare At Price",
    type: Number,
    optional: true,
    // decimal: true,
    min: 0,
    defaultValue: 0.00
  },
  fulfillmentService: {
    label: "Fulfillment service",
    type: String,
    optional: true
  },
  weight: {
    label: "Weight",
    type: Number,
    min: 0,
    optional: true,
    // decimal: true,
    defaultValue: 0,
    custom: function () {
      if (Meteor.isClient) {
        if (!(this.siblingField("type").value === "inventory" || this.value ||
            this.value === 0)) {
          return "required";
        }
      }
    }
  },
  length: {
    label: "Length",
    type: Number,
    min: 0,
    optional: true,
    // decimal: true,
    defaultValue: 0
  },
  width: {
    label: "Width",
    type: Number,
    min: 0,
    optional: true,
    // decimal: true,
    defaultValue: 0
  },
  height: {
    label: "Height",
    type: Number,
    min: 0,
    optional: true,
    // decimal: true,
    defaultValue: 0
  },
  inventoryManagement: {
    type: Boolean,
    label: "Inventory Tracking",
    optional: true,
    defaultValue: true,
    custom: function () {
      if (Meteor.isClient) {
        if (!(this.siblingField("type").value === "inventory" || this.value ||
            this.value === false)) {
          return "required";
        }
      }
    }
  },
  inventoryPolicy: {
    type: Boolean,
    label: "Deny when out of stock",
    optional: true,
    defaultValue: false,
    custom: function () {
      if (Meteor.isClient) {
        if (!(this.siblingField("type").value === "inventory" || this.value ||
            this.value === false)) {
          return "required";
        }
      }
    }
  },
  lowInventoryWarningThreshold: {
    type: Number,
    label: "Warn at",
    min: 0,
    optional: true,
    defaultValue: 0
  },
  inventoryQuantity: {
    type: Number,
    label: "Quantity",
    optional: true,
    defaultValue: 0,
    custom: function () {
      if (Meteor.isClient) {
        if (this.siblingField("type").value !== "inventory") {
          if (ReactionProduct.checkChildVariants(this.docId) === 0 && !this.value) {
            return "required";
          }
        }
      }
    }
  },
  minOrderQuantity: {
    label: "Minimum order quantity",
    type: Number,
    optional: true
  },
  isLowQuantity: {
    label: "Indicates that the product quantity is too low",
    type: Boolean,
    optional: true
  },
  isSoldOut: {
    label: "Indicates when the product quantity is zero",
    type: Boolean,
    optional: true
  },
  price: {
    label: "Price",
    type: Number,
    index: true,
    // decimal: true,
    defaultValue: 0.00,
    min: 0,
    optional: true
  },
  shopId: {
    type: String,
    autoValue: shopIdAutoValue,
    index: 1,
    label: "Variant ShopId"
  },
  sku: {
    label: "SKU",
    type: String,
    index: true,
    optional: true
  },
  type: {
    label: "Type",
    type: String,
    defaultValue: "variant"
  },
  taxable: {
    label: "Taxable",
    type: Boolean,
    defaultValue: true,
    optional: true
  },
  taxCode: {
    label: "Tax Code",
    type: String,
    defaultValue: "0000",
    optional: true
  },
  taxDescription: {
    type: String,
    optional: true,
    label: "Tax Description"
  },
  title: {
    label: "Label",
    type: String,
    defaultValue: ""
  },
  optionTitle: {
    label: "Option",
    type: String,
    optional: true,
    defaultValue: "Untitled Option"
  },
  metafields: {
    type: Array,
    optional: true
  },
  "metafields.$": Metafield,
  createdAt: {
    label: "Created at",
    type: Date,
    optional: true
  },
  updatedAt: {
    label: "Updated at",
    type: Date,
    optional: true
  },
  eventLog: {
    label: "Variant Event Log",
    type: Array,
    optional: true
  },
  "eventLog.$": Event,
  workflow: {
    type: Workflow,
    optional: true
  },
  originCountry: {
    type: String,
    optional: true,
    autoValue: shopDefaultCountry
  }
});

Products.attachSchema(ReplaceProductSchema, { replace: true, selector: { type: "simple" } });
Products.attachSchema(ReplaceProductVariantSchema, { replace: true, selector: { type: "variant" } });

export {
  Products
};
