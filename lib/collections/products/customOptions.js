import SimpleSchema from "simpl-schema";
import { Metafield } from "/lib/collections/schemas/metafield";
import { Mongo } from "meteor/mongo";

ProductOptions = new SimpleSchema({
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
    defaultValue: true
  },
  isDeleted: {
    type: Boolean,
    index: 1,
    defaultValue: false
  },
  groupIsRequired: {
    label: "Option group is required",
    type: String,
    optional: true
  },
  groupSort: {
    label: "Option group sort",
    type: Number,
    optional: true
  },
  optionPriceType: {
    label: "Option group price type",
    type: String,
    optional: true
  },
  optionPrice: {
    label: "Option option price",
    type: Number,
    optional: true
  },
  optionDiff: {
    label: "Option price diff",
    type: Number,
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
  weight: {
    label: "Weight",
    type: Number,
    min: 0,
    optional: true,
    // decimal: true,
    defaultValue: 0
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
  inventoryQuantity: {
    type: Number,
    label: "Quantity",
    optional: true,
    defaultValue: 99
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
  sku: {
    label: "SKU",
    type: String,
    index: true,
    optional: true,
    defaultValue: ""
  },
  type: {
    label: "Type",
    type: String,
    defaultValue: "variant"
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
  }
});

export default ProductOptions;

export {
  ProductOptions
};
