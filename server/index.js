/* eslint-disable no-unused-vars,no-console,camelcase,no-use-before-define,no-shadow,comma-dangle,quote-props */
import async from "async";
import Fiber from "fibers";
import { Meteor } from "meteor/meteor";
import { Match, check } from "meteor/check";
import { ProductSearch, Media, Shops, Tags, Revisions } from "/lib/collections";
import { Reaction } from "/server/api";
import { Random } from "meteor/random";
import _ from "lodash";
import find from "lodash/find";
import filter from "lodash/filter";
import findIndex from "lodash/findIndex";
import each from "lodash/each";
import map from "lodash/map";
import { Logger } from "/server/api";
import "./meteorMethods";
import { Products } from "../lib/collections/products";
import {
  getDefaultShopModel,
  createCombinationFromGroup,
  createGroupCombinations,
  detectMultiplyValues,
  createOptionPriceAndSkuFromCombination,
  groupedProductOptions,
  createCustomOptionObject,
  createCustomGroupedOptionObject,
  createCustomVariantObject,
  getAssociatedProductFromCSV,
  getShopsFromCSV } from "./helpers";
import { PRODUCT_STATUS, PRODUCT_TYPE, PRODUCT_VISIBLE } from "./magentoConsts";
import { exportCustomers } from "./customers";
import { exportOrders } from "./orders";
import { magento, checkInDBOrRequest, createSuccessPromise } from "./magento";
import { Roles } from "meteor/alanning:roles";

const replace = true;

function processor(connection) {
  const self = this;
  this.categories = [];
  this.shops = [];
  this.connection = connection;
  this.mediaQueueLen = 0;
  this.requestQueueLen = 0;
  this.associatedProducts = [];
  this.queueDec = () => {
    this.requestQueueLen -= this.requestQueueLen > 0 ? 1 : 0;
  };
  this.queueInc = () => {
    this.requestQueueLen++;
  };
  this.getQueueLength = function () {
    return self.requestQueueLen + self.mediaQueueLen;
  };
  this.getAssociatedProducts = function (sku, storeView) {
    const data = find(self.associatedProducts, item => item.sku === sku);
    if (data && data.childrenSku && data.childrenSku.length) {
      return createSuccessPromise(checkInDBOrRequest(self.getConnectionAttributes(), "catalogProduct", {
        filters: {
          sku: data.childrenSku,
        },
        storeView
      }), []);
    }
    return Promise.resolve([]);
  };
  this.getConnection = function () {
    return this.connection;
  };
  this.setConnection = function (connection) {
    self.connection = connection;
  };
  this.getConnectionAttributes = function () {
    return {
      connection: self.getConnection(),
      set: self.setConnection,
    };
  };
  this.start = function (cb) {
    if (Meteor.isServer) {
      self.queueInc();
      self.startTime = Math.round(Date.now() / 1000);
      Promise.resolve()
        .then(() => {
          Logger.info({}, "start:run");

          if (replace) {
            Media.remove({});
            Logger.info({}, "start:mediaRemove:success");
            Products.rawCollection().drop();
            Logger.info({}, "start:dropProducts:success");
            ProductSearch.remove({});
            Logger.info({}, "start:dropSearch:success");
            Tags.remove({});
            Logger.info({}, "start:dropTags:success");
            Revisions.remove({});
          }

          Logger.info({}, "start:success");

          return self.buildCategoriesCallback();
        })
        .then(() => {
          self.queueDec();
          Logger.info({}, "DONE!!!");
          cb();
        })
        .catch(err => {
          Logger.error(err, "start");
          self.requestQueueLen = 0;
          self.queueDec();
          cb(err);
        });
    }
  };

  this.tagIdentifierByStoreViewIdentifier = function (storeViewIdentifier) {
    const shop = find(self.shops, ({ magentoStore }) => {
      if (magentoStore && magentoStore.code) {
        return magentoStore.code === storeViewIdentifier;
      }

      return false;
    });

    if (shop && shop.reactionShopTag && shop.reactionShopTag._id) {
      return shop.reactionShopTag._id;
    }

    return null;
  };

  this.fixUrls = function () {
    checkInDBOrRequest(self.getConnectionAttributes(), "catalogCategory", {}, "categoryTree")
      .then(categoryTree => {
        const categories = categoryTree.children[0].children;
        const catsAssociated = [
          { key: "Engine", value: "engine" },
          { key: "Transmission & Drivetrain", value: "transmission-drivetrain" },
          { key: "Exhaust", value: "exhaust" },
          { key: "Camshafts & Valvetrain", value: "camshafts-valvetrain" },
          { key: "Suspension & Brakes", value: "suspension-brakes-handling" },
          { key: "Air Intake", value: "air-intake" },
          { key: "Turbo Parts & Kits", value: "turbo-parts-kits" },
          { key: "Intercooling", value: "intercooling" },
          { key: "Fueling", value: "fueling" },
          { key: "Electronics", value: "electronics" },
          { key: "Wire Harnesses & Adapters", value: "wire-harnesses-adapters" },
          { key: "Gauge & Gauge Pods", value: "gauge-gauge-pods" },
          { key: "Pulleys & Belts", value: "pulleys-belts" },
          { key: "Superchargers & Eaton Parts", value: "superchargers-eaton-parts" },
          { key: "Gaskets & Adhesives", value: "gaskets-adhesives" },
          { key: "Bolts", value: "bolts" },
          { key: "Stage Kits", value: "stage-kits" },
          { key: "Misc", value: "misc" },
          { key: "Apparel & Accessories", value: "apparel-accessories" },
          { key: "Ignition", value: "ignition" },
          { key: "Polaris Slingshot", value: "polaris-slingshot" },
        ];

        each(categories, o => {
          const el = find(catsAssociated, item => item.key === o.name);
          let catSlug = o.name.toLowerCase().replace(/[ &]+/i, "-");

          if (el) {
            catSlug = el.value;
          }

          const selector = {
            name: o.name
          };
          const update = {
            $set: {
              slug: catSlug,
              metafields: [{
                key: "type",
                value: "category"
              }]
            }
          };
          const info = Tags.update(selector, update);

          Logger.info({ info, selector, update }, "CATEGORY FIX");
        });
      }).catch(Logger.errorFunc({ title: "categoryTree" }));

    checkInDBOrRequest(self.getConnectionAttributes(), "store")
      .then(stores => {
        const validStores = [
          { key: "en_3800", value: "3800" },
          { key: "en_ats", value: "ats" },
          { key: "en_ecotec", value: "ecotec" },
          { key: "en_lsx", value: "lsx" },
          { key: "en_sonic", value: "sonic" }
        ];

        each(stores, o => {
          const el = find(validStores, item => item.key === o.code);
          if (el) {
            Tags.update({
              name: o.name
            }, {
              $set: {
                slug: el.value,
                metafields: [{
                  key: "type",
                  value: "shop"
                }]
              }
            });
          }
        });
      }).catch(Logger.errorFunc({ title: "stores" }));

    const productUpdate = (data, _id, next) => {
      Fiber(() => {
        const item = Products.findOne({
          _id
        });
        const selector = {
          _id: item._id
        };

        Logger.info({
          urlKey: data.url_key,
          shopUrl: data.product_id
        }, "PRODUCT_ID OR URL_KEY");

        const update = {
          $set: {
            handle: data && data.url_key ? data.url_key : item.handle ? item.handle : item.shopUrl,
            shopUrl: data && data.product_id ? data.product_id : item.shopUrl ? item.shopUrl : item.handle
          }
        };
        const info = Products.rawCollection().update(selector, update);

        Logger.info({ info, selector, update }, "Product url fix");
        if (!data) {
          Logger.error({
            data: "null",
            _id
          }, "fixUrl:product:fetch");
        }
        next();
      }).run();
    };

    const chunkAsyncHelper = async.queue(({ productId, _id }, cb) => {
      Fiber(() => {
        self.getConnection().catalogProduct.info({ id: productId }, (error, product) => {
          if (error) {
            cb(error);

            return;
          }

          return productUpdate(product, _id, cb);
        });
      }).run();
    }, 25);

    Products.find({}, { _id: 1, handle: 1 }).forEach(({ handle, _id }) => {
      const regex = /^\d+$/i;
      if (regex.test(`${handle}`)) {
        chunkAsyncHelper.push({
          productId: `${handle}`,
          _id
        }, () => {});
      }
    });
  };

  this.tagIdentifierByCategoryIdentifier = function (categoryIdentifier) {
    const category = find(self.categories, ({ magentoCategory }) => {
      if (magentoCategory && magentoCategory.category_id) {
        return +magentoCategory.category_id === +categoryIdentifier;
      }

      return false;
    });

    if (category && category.reactionCategoryTag && category.reactionCategoryTag._id) {
      return category.reactionCategoryTag._id;
    }

    return null;
  };

  this.buildCategoriesCallback = function () {
    return checkInDBOrRequest(self.getConnectionAttributes(), "catalogCategory", {}, "categoryTree")
      .then(categoryTree => {
        const categories = categoryTree.children[0].children;

        for (let i = 0; i < categories.length; i++) {
          const category = categories[i];
          const categoryNameLowerCase = category.name.toLowerCase().replace(/[ &]+/i, "-");
          const catsAssociated = [
            { key: "Engine", value: "engine" },
            { key: "Transmission & Drivetrain", value: "transmission-drivetrain" },
            { key: "Exhaust", value: "exhaust" },
            { key: "Camshafts & Valvetrain", value: "camshafts-valvetrain" },
            { key: "Suspension & Brakes", value: "suspension-brakes-handling" },
            { key: "Air Intake", value: "air-intake" },
            { key: "Turbo Parts & Kits", value: "turbo-parts-kits" },
            { key: "Intercooling", value: "intercooling" },
            { key: "Fueling", value: "fueling" },
            { key: "Electronics", value: "electronics" },
            { key: "Wire Harnesses & Adapters", value: "wire-harnesses-adapters" },
            { key: "Gauge & Gauge Pods", value: "gauge-gauge-pods" },
            { key: "Pulleys & Belts", value: "pulleys-belts" },
            { key: "Superchargers & Eaton Parts", value: "superchargers-eaton-parts" },
            { key: "Gaskets & Adhesives", value: "gaskets-adhesives" },
            { key: "Bolts", value: "bolts" },
            { key: "Stage Kits", value: "stage-kits" },
            { key: "Misc", value: "misc" },
            { key: "Apparel & Accessories", value: "apparel-accessories" },
            { key: "Ignition", value: "ignition" },
            { key: "Polaris Slingshot", value: "polaris-slingshot" },
          ];
          const el = find(catsAssociated, o => o.key === category.name);
          let catSlug = categoryNameLowerCase;

          if (el) {
            catSlug = el.value;
          }

          let tagModel = Tags.findOne({
            slug: catSlug,
            name: category.name,
            isTopLevel: true,
            shopId: Reaction.getShopId(),
            metafields: [{
              key: "type",
              value: "category"
            }, {
              key: "name",
              value: categoryNameLowerCase
            }]
          });

          if (!tagModel) {
            tagModel = {
              slug: categoryNameLowerCase,
              name: category.name,
              isTopLevel: true,
              shopId: Reaction.getShopId(),
              updatedAt: Date.now()
            };
            const categoryTagIdentifier = Tags.insert(tagModel, {
              type: "tag"
            });
            tagModel._id = categoryTagIdentifier;
          }

          self.categories.push({
            reactionCategoryTag: tagModel,
            magentoCategory: category
          });
        }

        return self.onStores();
      });
  };
  this.onStores = function () {
    self.shops = [];

    return Promise.all([
      checkInDBOrRequest(self.getConnectionAttributes(), "catalogProductType"),
      checkInDBOrRequest(self.getConnectionAttributes(), "store"),
      getAssociatedProductFromCSV(),
    ])
      .then(([productTypes, stores, productData]) => {
        self.associatedProducts = productData;
        const storesCode = map(stores, item => {
          const store = item;
          let urlValue = store.code;
          const validStores = [
            { key: "en_3800", value: "3800" },
            { key: "en_ats", value: "ats" },
            { key: "en_ecotec", value: "ecotec" },
            { key: "en_lsx", value: "lsx" },
            { key: "en_sonic", value: "sonic" }
          ];
          const el = find(validStores, item => item.key === store.code);

          if (el) {
            urlValue = el.value;
          }

          let shopDocument = Shops.findOne({
            domains: [urlValue]
          });

          if (!shopDocument) {
            shopDocument = getDefaultShopModel(store, Random.id());
            Shops.insert(shopDocument, {
              type: "shop"
            });
          }

          let tagModel = Tags.findOne({
            slug: urlValue,
            name: store.name,
            isTopLevel: true,
            shopId: Reaction.getShopId(),
            metafields: [{
              key: "type",
              value: "shop"
            }, {
              key: "name",
              value: store.code
            }]
          });

          if (!tagModel) {
            tagModel = {
              slug: store.code,
              name: store.name,
              isTopLevel: true,
              shopId: Reaction.getShopId(),
              updatedAt: Date.now()
            };
            Tags.insert(tagModel, {
              type: "tag"
            });
          }

          self.shops.push({
            magentoStore: store,
            reactionShop: shopDocument,
            reactionShopTag: tagModel
          });

          return store.code;
        });

        return {
          storesCode,
          productTypes
        };
      })
      .then(({ storesCode, productTypes }) => {
        return new Promise((resolve, reject) => {
          const callStores = (indexStore, indexType) => {
            if (storesCode && storesCode.length && indexStore < storesCode.length && storesCode[indexStore]) {
              self.queueInc();
              self.buildProductsCallback(storesCode[indexStore], productTypes[indexType])
                .then(() => { self.queueDec(); callStores(indexStore + 1, indexType); })
                .catch(err => { self.queueDec(); reject(err); });
            } else {
              Promise.resolve()
                .then(() => { self.queueDec(); callTypes(0, indexType + 1); })
                .catch(err => { self.queueDec(); reject(err); });
            }
          };
          const callTypes = (indexStore, indexType) => {
            if (productTypes && productTypes.length && indexType < productTypes.length && productTypes[indexType]) {
              Promise.resolve()
                .then(() => callStores(indexStore, indexType))
                .catch(err => reject(err));
            } else {
              resolve(true);
            }
          };

          callTypes(0, 0);
        });
      })
      .catch(err => {
        self.requestQueue = 0;
        Logger.error(err, "onStores");
      });
  };
  this.onProcessProductFetch = function (products, storeCode) {
    return Promise.all(map(products, ({ product_id, sku, type }) => {
      const dropProducts = [];

      if (dropProducts.indexOf(`${product_id}`) !== -1) {
        return Promise.resolve([null, null, null, null]);
      }

      const tDoc = self.documentIsInserted({
        shopUrl: product_id,
        type,
        sku,
      });

      if (tDoc) {
        const reactionStoreViewTagIdentifier = self.tagIdentifierByStoreViewIdentifier(storeCode);
        return self.checkStoreAndUpdate(tDoc, reactionStoreViewTagIdentifier);
      }

      return Promise.all([
        createSuccessPromise(checkInDBOrRequest(self.getConnectionAttributes(), "catalogProduct", {
          id: product_id
        }, "info"), null, "catalogProduct", { product_id }),
        createSuccessPromise(checkInDBOrRequest(self.getConnectionAttributes(), "catalogInventoryStockItem", {
          products: [product_id]
        }), {}, "catalogInventoryStockItem", { product_id }),
        createSuccessPromise(checkInDBOrRequest(self.getConnectionAttributes(), "catalogProductCustomOption", {
          productId: product_id
        }), [], "catalogProductCustomOption", { product_id }),
        createSuccessPromise(checkInDBOrRequest(self.getConnectionAttributes(), "catalogProductAttributeSet", {
          product: product_id
        }), [], "catalogProductAttributeSet", { product_id })
      ])
        .then(([
          productInfo,
          productInventory,
          productOptions,
          productAttributeSetList
        ]) => {
          if (!productInfo || productInfo.status !== PRODUCT_STATUS.ENABLE) {
            return Promise.resolve(true);
          }
          self.queueInc();
          return self.detectProductCategory(productInfo)({
            productInfo,
            productInventory,
            productOptions: groupedProductOptions(productOptions),
            productAttributeSetList,
            storeCode
          })
            .then(res => {
              self.queueDec();
              return res;
            });
        });
    }));
  };

  this.detectProductCategory = function ({ type }) {
    if (type === PRODUCT_TYPE.CONFIGURABLE) {
      return self.createConfigurableProduct;
    } else if (type === PRODUCT_TYPE.SIMPLE) {
      return self.createSimpleProduct;
    } else if (type === PRODUCT_TYPE.DOWNLOADABLE) {
      return self.dropProduct;
    } else if (type === PRODUCT_TYPE.GIFTCARD) {
      return self.dropProduct;
    } else if (type === PRODUCT_TYPE.GROUPED) {
      return self.dropProduct;
    } else if (type === PRODUCT_TYPE.VIRTUAL) {
      return self.dropProduct;
    }
    return self.dropProduct;
  };

  this.createSimpleProduct = function ({
    productInfo,
    productInventory,
    productOptions: { selected, text },
    productAttributeSetList,
    storeCode
  }) {
    const { sku } = productInfo;

    return Promise.all([
      [],
      Promise.all(map(selected, ({ option_id }) =>
        createSuccessPromise(checkInDBOrRequest(self.getConnectionAttributes(), "catalogProductCustomOptionValue", {
          optionId: option_id
        }), null, "catalogProductCustomOptionValue:map", { option_id, sku }))),
    ])
      .then(([
        metafields,
        tProductOptionValuesSelected,
      ]) => {
        const productOptionValues = filter(tProductOptionValuesSelected, item => item !== null);
        const reactionStoreViewTagIdentifier = self.tagIdentifierByStoreViewIdentifier(storeCode);
        const tData = self.createCustomProductObject(productInfo, storeCode, []);
        const productData = {
          ...tData,
          metafields
        };
        const document = self.documentIsInserted(productData);
        const waitArr = [];

        if (!document) {
          const insertedProduct = self.findOrInsertProduct(productData);
          const objectVariant = self.createCustomVariantObject(insertedProduct, productInfo, productInventory[0]);
          const variant = self.findOrInsertProduct(objectVariant);
          waitArr.push(createSuccessPromise(self.createOptionsForVariants(
            { selected, text }, {
              optionValues: productOptionValues,
            },
            [variant],
            insertedProduct
          ), []));
          const variantIds = [variant._id];
          waitArr.push(self.onProductMedia(insertedProduct, variantIds));
          return Promise.all(waitArr);
        }

        return self.checkStoreAndUpdate(document, reactionStoreViewTagIdentifier);
      })
      .catch(Logger.errorFunc({
        title: "createSimpleProduct",
        productInfo,
        productInventory,
        productOptions: { selected, text },
        productAttributeSetList,
        storeCode
      }));
  };

  this.checkStoreAndUpdate = function (document, reactionStoreViewTagIdentifier) {
    if (
      document &&
      document._id &&
      Array.isArray(document.hashtags) &&
      document.type === "simple" &&
      reactionStoreViewTagIdentifier &&
      typeof reactionStoreViewTagIdentifier === "string" &&
      findIndex(document.hashtags, item => item === reactionStoreViewTagIdentifier) === -1
    ) {
      Products.rawCollection().update({ _id: document._id }, { $addToSet: { hashtags: reactionStoreViewTagIdentifier } });
    } else {
      return false;
    }
  };

  this.createConfigurableProduct = function ({
    productInfo,
    productOptions: { selected, text },
    productAttributeSetList,
    storeCode
  }) {
    const { sku } = productInfo;

    return Promise.all([
      createSuccessPromise(self.onCustomAttributes(productInfo, productAttributeSetList), []),
      Promise.all(map(selected, ({ option_id }) =>
        createSuccessPromise(checkInDBOrRequest(self.getConnectionAttributes(), "catalogProductCustomOptionValue", {
          optionId: option_id
        }), null, "catalogProductCustomOptionValue:map", { option_id, sku }))),
      self.getAssociatedProducts(sku, storeCode),
    ])
      .then(([
        metafields,
        productOptionValuesSelected,
        associatedProducts
      ]) => {
        const productOptionVals = filter(productOptionValuesSelected, item => item !== null);
        const childrenProducts = filter(associatedProducts, ({ category_ids }) => !category_ids.length);
        const childrenIds = map(associatedProducts, ({ product_id }) => product_id);

        return Promise.all([
          metafields,
          productOptionVals,
          Promise.all(map(childrenProducts, ({ product_id }) =>
            createSuccessPromise(checkInDBOrRequest(self.getConnectionAttributes(), "catalogProduct", {
              id: product_id
            }, "info"), null, "catalogProduct:map"))),
          checkInDBOrRequest(self.getConnectionAttributes(), "catalogInventoryStockItem", {
            products: childrenIds
          }),
        ]);
      })
      .then(([
        metafields,
        productOptionValues,
        tAssociatedProducts,
        tAssociatedInventory,
      ]) => {
        const associatedProducts = filter(tAssociatedProducts, item => item !== null);
        const associatedInventory = filter(tAssociatedInventory, item => item !== null);
        const reactionStoreViewTagIdentifier = self.tagIdentifierByStoreViewIdentifier(storeCode);
        const productData = {
          ...self.createCustomProductObject(productInfo, storeCode, associatedProducts),
          metafields
        };
        const document = self.documentIsInserted(productData);
        const waitArr = [];

        if (!document) {
          const insertedProduct = self.findOrInsertProduct(productData);
          const insertedVariants = map(associatedProducts, item => {
            const inventory = find(associatedInventory, inventoryItem =>
              inventoryItem.product_id === item.product_id);
            const objectVariant = self.createCustomVariantObject(insertedProduct, item, inventory);

            return self.findOrInsertProduct(objectVariant);
          });
          waitArr.push(createSuccessPromise(self.createOptionsForVariants(
            { selected, text }, {
              optionValues: productOptionValues,
            },
            insertedVariants,
            insertedProduct
          ), []));
          const variantIds = [];
          each([
            ...insertedVariants
          ], ({ _id }) => {
            if (findIndex(variantIds, (item) => item._id === _id) === -1) {
              variantIds.push(_id);
            }
          });
          waitArr.push(self.onProductMedia(insertedProduct, variantIds));

          return Promise.all(waitArr);
        }

        return self.checkStoreAndUpdate(document, reactionStoreViewTagIdentifier);
      })
      .catch(Logger.errorFunc({
        productInfo,
        productOptions: { selected, text },
        productAttributeSetList,
        storeCode
      }));
  };

  this.dropProduct = function () {
    return Promise.resolve(true);
  };

  this.createOptionsForVariants = function (
    { selected, text },
    { optionValues, optionValuesText },
    productVariants,
    productData
  ) {
    const optionKeys = selected;
    const arrOptions = [];

    return new Promise((resolve) => {
      Promise.resolve({
        optionKeys,
        optionValues,
        optionValuesText,
        productVariants,
        productData,
      })
        .then((object) => {
          // resolve(self.createOptionsCombinationsForVariants(object));
        })
        .catch(error => {
          Logger.error(error, "createOptionsForVariants:combinations");

          resolve([]);
        });
    })
      .then(() => {
        const optionsTextType = text;

        each(optionKeys, (item, index) => {
          if (optionValues[index]) {
            each(optionValues[index], optionSingle => {
              arrOptions.push({
                groupId: item.option_id,
                groupTitle: item.title,
                groupType: item.type,
                groupIsRequired: item.is_require,
                groupSort: item.sort_order,
                optionId: optionSingle.value_id,
                optionVariantTitle: optionSingle.title,
                optionSortIndex: optionSingle.sort_index,
                optionPriceType: optionSingle.price_type,
                optionPrice: optionSingle.price,
                optionDiff: optionSingle.price,
                optionSku: optionSingle.sku,
                optionSortOrder: optionSingle.sort_order
              });
            });
          }
        });

        each(optionsTextType, (item) => {
          arrOptions.push({
            groupId: item.option_id,
            groupTitle: item.title,
            groupType: item.type,
            groupIsRequired: item.is_require,
            groupSort: item.sort_order,
          });
        });

        const insertedDocs = [];

        each(productVariants, item => {
          each(arrOptions, optionData => {
            const optionObject = self.createCustomOptionObject(productData, item, optionData);
            const insertedDoc = self.findOrInsertProduct(optionObject, true);
            if (insertedDoc) {
              insertedDocs.push(insertedDoc);
            }
          });
        });

        return insertedDocs;
      });
  };

  this.createOptionsCombinationsForVariants = function ({ optionKeys, optionValues, productVariants, productData }) {
    const linkTable = [];
    const arrayToCombined = [];

    each(optionKeys, (item, index) => {
      const values = optionValues[index] ? optionValues[index] : [];
      const { option_id, is_require, type } = item;
      const resValue = createGroupCombinations(values, is_require === "1", detectMultiplyValues(type));

      if (resValue) {
        arrayToCombined.push(resValue);
      }

      each(optionValues[index], ({ value_id }) => {
        linkTable.push({
          option_id,
          value_id,
          index,
        });
      });
    });

    const options = [];

    each(optionValues, (items) => {
      each(items, (item) => { options.push(item); });
    });

    const combinationsFromGroup = createCombinationFromGroup(arrayToCombined);
    const insertedIds = [];

    each(combinationsFromGroup, o => {
      const { combination, prefixSku, priceDiff } = createOptionPriceAndSkuFromCombination(o, options, optionKeys, linkTable);
      each(productVariants, (variant) => {
        const sku = variant && variant.sku ? `${variant.sku}${prefixSku}` : `${productData.sku}${prefixSku}`;
        const optionObject = self.createCustomGroupedOptionObject(productData, variant, {
          isGroupCombination: true,
          optionCombinations: [combination],
          sku,
          price: priceDiff,
        });
        const product = Products.findOne({
          isGroupCombination: true,
          sku,
          price: optionObject.price,
        });

        if (product) {
          Products.rawCollection().update({
            isGroupCombination: true,
            sku,
            price: optionObject.price,
          }, {
            $addToSet: { optionCombinations: combination }
          });
        } else {
          const insertId = Products.insert(optionObject, {
            type: "variant"
          });
          if (insertId) {
            insertedIds.push(insertId);
          }
        }
      });
    });

    return insertedIds;
  };

  this.createCustomProductObject = function (productInfo, storeCode, childProducts = []) {
    const reactionStoreViewTagIdentifier = self.tagIdentifierByStoreViewIdentifier(storeCode);
    const { category_ids, product_id, sku, name, status, price, description, visibility, url_key } = productInfo;
    const categories = map(category_ids, item => self.tagIdentifierByCategoryIdentifier(item));
    let tPriceStr = "0.00";
    let tPriceFloat = 0.00;

    if (price) {
      tPriceStr = (+price).toFixed(2);
      tPriceFloat = isNaN(+(+price).toFixed(2)) ? +price : +(+price).toFixed(2);
    }

    const priceData = {
      range: tPriceStr,
      min: tPriceFloat,
      max: tPriceFloat
    };

    if (childProducts.length) {
      each(childProducts, ({ price }) => {
        if (price) {
          let tPrice = +(+price).toFixed(2);
          let isChange = false;
          if (isNaN(tPrice)) {
            tPrice = +price;
          }
          if (tPrice < priceData.min) {
            priceData.min = tPrice;
            isChange = true;
          }
          if (tPrice > priceData.max) {
            priceData.max = tPrice;
            isChange = true;
          }
          if (isChange) {
            priceData.range = `${priceData.min} - ${priceData.max}`;
          }
        }
      });
    }

    return {
      handle: url_key,
      storeUrl: product_id,
      sku,
      title: name,
      pageTitle: name,
      description,
      ancestors: [],
      hashtags: filter(categories.concat([reactionStoreViewTagIdentifier]), (item) => item !== null),
      isVisible: `${visibility}` !== PRODUCT_VISIBLE.NOT_VISIBLE && `${status}` === PRODUCT_STATUS.ENABLE,
      isLowQuantity: false,
      isSoldOut: false,
      isBackorder: false,
      shopUrl: product_id,
      metafields: [],
      type: "simple",
      price: priceData
    };
  };

  this.createCustomVariantObject = createCustomVariantObject;
  this.createCustomGroupedOptionObject = createCustomGroupedOptionObject;
  this.createCustomOptionObject = createCustomOptionObject;
  this.findOrInsertProduct = function (data, isOption = false) {
    let findProduct = null;
    if (isOption) {
      findProduct = Products.findOne({
        sku: data.sku,
        type: data.type,
        groupId: data.groupId,
        groupType: data.groupType,
        optionId: data.optionId
      });
    } else {
      findProduct = Products.findOne({
        $or: [
          {
            sku: data.sku,
            type: data.type
          }, {
            shopUrl: data.shopUrl || "none",
            type: data.type
          }
        ]
      });
    }
    if (!findProduct) {
      const insertId = Products.insert(data, {
        type: data.type
      });
      findProduct = Products.findOne({
        _id: insertId
      });
    }

    return findProduct;
  };
  this.documentIsInserted = function (data, isOption = false) {
    let findProduct = null;

    if (isOption) {
      findProduct = Products.findOne({
        sku: data.sku,
        type: data.type,
        groupId: data.groupId,
        groupType: data.groupType,
        optionId: data.optionId
      });
    } else {
      findProduct = Products.findOne({
        $or: [
          {
            sku: data.sku,
            type: "simple"
          }, {
            shopUrl: data.shopUrl || "none",
            type: "simple"
          }
        ]
      });
    }

    if (!findProduct) {
      return false;
    }

    return findProduct;
  };
  this.buildProductsCallback = function (storeCode, { type }) {
    return checkInDBOrRequest(self.getConnectionAttributes(), "catalogProduct", {
      filters: {
        type,
        status: PRODUCT_STATUS.ENABLE,
        visibility: [PRODUCT_VISIBLE.IN_CATALOG, PRODUCT_VISIBLE.IN_SEARCH, PRODUCT_VISIBLE.BOTH]
      },
      storeView: storeCode
    })
      .then(products => {
        const size = 10;
        const from = 0;

        return new Promise((resolve) => {
          const errRes = [];
          const f = (from, size, count) => {
            const insertTime = Math.round(Date.now() / 1000) - self.startTime;
            const productIds = map(products.slice(from, from + size), ({ product_id }) => product_id);

            if (count <= 0) {
              resolve(true);
            } else if (from + size <= count) {
              self.onProcessProductFetch(products.slice(from, from + size), storeCode)
                .then(() => {
                  f(from + size, size, count);
                })
                .catch(err => {
                  errRes.push({
                    from,
                    to: from + size,
                    count,
                    productType: type,
                    products: productIds,
                    storeCode,
                    countRetry: 0
                  });
                  Logger.error(err, "onProcessProductFetch");
                  f(from + size, size, count);
                });

              Logger.info({
                from,
                to: from + size,
                products: productIds,
                count,
                productType: type,
                storeCode,
                insertTime
              }, "buildProductsCallback");
            } else if ((from + size) - count < size) {
              Logger.info({
                from,
                to: (from + size) - count,
                count,
                productType: type,
                products: productIds,
                storeCode,
                insertTime
              }, "buildProductsCallback");

              f(from, (from + size) - count, count);
            } else {
              if (errRes.length) {
                Logger.error(errRes, "IMPORT_ERR_PRODUCTS");
              }
              self.queueDec();

              resolve(true);
            }
          };

          f(from, size, products.length);
        });
      });
  };
  this.onCustomAttributes = function (product, attributeSets) {
    const { product_id } = product;
    const attributeListPromises = map(attributeSets, (attributeSet) => {
      return createSuccessPromise(checkInDBOrRequest(self.getConnectionAttributes(), "catalogProductAttribute", {
        product: product_id,
        setId: attributeSet.set_id
      }), null, "onCustomAttributes", { product_id, setId: attributeSet.set_id });
    });

    return createSuccessPromise(Promise.all(filter(attributeListPromises, item => item !== null))
      .then((attributesBySets) => {
        const attributeIdentifiers = [];

        for (let i = 0; i < attributesBySets.length; i++) {
          const attributes = attributesBySets[i];
          for (let k = 0; k < attributes.length; k++) {
            const attribute = attributes[k];
            if (findIndex(attributeIdentifiers, item => item === attribute.code) === -1) {
              attributeIdentifiers.push(attribute.code);
            }
          }
        }
        const customAttributes = {};

        for (let i = 0; i < attributeIdentifiers.length; i++) {
          const attributeIdentifier = attributeIdentifiers[i] || null;
          if (attributeIdentifier) {
            const attributeValue = product[attributeIdentifier] || null;
            if (attributeValue && typeof attributeValue === "string") {
              customAttributes[attributeIdentifier] = attributeValue;
            }
          }
        }

        return _.map(customAttributes, (value, key) => ({ key, value }));
      }), [], "customAttributes", { product, attributeSets });
  };
  this.onProductMedia = function (product, productVariations) {
    return checkInDBOrRequest(self.getConnectionAttributes(), "catalogProductAttributeMedia", {
      product: product.shopUrl
    })
      .then(mediaItems => {
        const fDownload = (media, variantId) => {
          self.queueInc();

          return createSuccessPromise(new Promise((resolve, reject) => {
            try {
              const uri = media.url;
              const file = new FS.File(uri);
              file.metadata = {
                productId: product._id,
                variantId,
                shopId: product.shopId,
                toGrid: 1,
                workflow: "published"
              };
              self.queueDec();
              return resolve(Media.insert(file));
            } catch (err) {
              return reject(err);
            }
          }), null, "imageDownload", {
            productId: product._id,
            variantId,
          });
        };
        const fIterator = (items = [], cb, i = 0) => {
          if (items  && items.length && i < items.length && items[i]) {
            Promise.all(map(
              productVariations,
              (variantId) => {
                return fDownload(items[i], variantId).then(() => {
                  self.queueDec();
                });
              }
            )).then(() => {
              fIterator(items, cb, i + 1);
            }).catch(err => {
              cb(err, null);
            });
          } else {
            cb(null, true);
          }
        };

        return new Promise((resolve, reject) => {
          fIterator(mediaItems, (err, data) => {
            if (err) {
              return reject(err);
            }

            return resolve(data);
          });
        });
      })
      .catch(error => {
        Logger.error(error, "productMediaCallback");
      });
  };
}

let processorInstance = null;

let customersIsWork = 0;
let ordersIsWork = 0;

const magentoImportProductsStartFixTags = () => {
  return getShopsFromCSV()
    .then(data => {
      each(data, dataForProduct => {
        const findConditionOfProducts = {
          $or: [
            { sku: dataForProduct.sku },
            { handle: dataForProduct.urlKey }
          ],
          type: "simple"
        };
        const product = Products.findOne(findConditionOfProducts);

        if (product) {
          const findTagsCondition = {
            _id: { $in: product.hashtags },
          };
          const resultTagIdArr = [];
          const names = [];
          const dropNames = [];
          const tags = Tags.find(findTagsCondition).fetch();

          each(tags, o => {
            if (o.metafields) {
              each(o.metafields, mo => {
                if (mo.key === "type" && mo.value === "category") {
                  resultTagIdArr.push(o._id);
                } else if (mo.key === "type" && mo.value === "shop") {
                  const shopObject = find(dataForProduct.shops, so => o.slug && (so.store === o.slug || so.tagStoreName === o.slug));
                  if (shopObject && shopObject.visibility) {
                    names.push(o.name);
                    resultTagIdArr.push(o._id);
                  } else {
                    dropNames.push(o.name);
                  }
                }
              });
            } else {
              dropNames.push(o.name);
            }
          });

          each(dataForProduct.shops, so => {
            if (so.visibility) {
              const tag = Tags.findOne({
                $or: [
                  { slug: so.store },
                  { slug: so.tagStoreName }
                ]
              });
              if (tag) {
                if (findIndex(resultTagIdArr, t => t === tag._id) === -1) {
                  names.push(tag.name);
                  resultTagIdArr.push(tag._id);
                }
              }
            }
          });

          const updateRes = Products.rawCollection().update({
            _id: product._id
          }, {
            $set: {
              hashtags: resultTagIdArr
            }
          });

          updateRes
            .then(({ result }) => {
              Logger.info({
                _id: product._id,
                result,
              }, "UPDATE PRODUCT");
            });
        } else {
          Logger.error({
            message: "Not found",
            findConditionOfProducts
          });
        }
      });

      Logger.info({}, "UPDATE PRODUCT TAGS: DONE");
    }).catch(Logger.errorFunc({
      title: "CSV SHOPS"
    }));
}

Meteor.methods({
  magentoImportProductsStart() {
    if (!Roles.userIsInRole(Meteor.userId(), ['owner','admin'])) {
      throw new Meteor.Error("403", "Forbidden");
    }

    magento((err, { connection }) => {
      if (err) {
        Logger.error(err, "connection");
        throw err;
      }

      if (processorInstance === null) {
        processorInstance = new processor(connection);
      }

      if (+processorInstance.getQueueLength() === 0) {
        processorInstance.start((importError) => {
          if (importError) {
            Logger.error(importError, "magentoImportProductStart");
            throw importError;
          } else {
            magentoImportProductsStartFixTags();
          }
        });
      }
    });
  },
  magentoImportProductsStartFixUrls() {
    magento((err, { connection }) => {
      if (err) {
        Logger.error(err, "connection");
        throw err;
      }
      if (processorInstance === null) {
        processorInstance = new processor(connection);
      }
      processorInstance.fixUrls();
    });
  },
  magentoImportCustomersStart() {
    if (!Roles.userIsInRole(Meteor.userId(), ['owner','admin'])) {
      throw new Meteor.Error("403", "Forbidden");
    }

    magento((err, { connection }) => {
      if (err) {
        Logger.error(err, "magentoImportCustomersStart");
        throw err;
      }

      customersIsWork = 1;
      exportCustomers(connection, (err) => {
        if (err) {
          Logger.error(err, "exportCustomers:err");
        }

        Logger.info({}, "customers:Done");

        customersIsWork = 0;
        magento((errRes, res) => {
          if (errRes) {
            return Logger.error(errRes, "magentoImportOrdersStart");
          }

          ordersIsWork = 1;
          exportOrders(res.connection, () => {
            Logger.info({}, "orders:Done");
            ordersIsWork = 0;
          });
        });
      });
    });
  },
  magentoImportOrdersStart() {
    if (!Roles.userIsInRole(Meteor.userId(), ['owner','admin'])) {
      throw new Meteor.Error("403", "Forbidden");
    }

    console.log("magentoImportOrdersStart");
    magento((err, { connection }) => {
      if (err) {
        Logger.error(err, "magentoImportOrdersStart");
        return;
      }

      ordersIsWork = 1;
      exportOrders(connection, () => {
        console.log("orders:Done");
        ordersIsWork = 0;
      });
    });
  },
  magentoImportProgress() {
    if (!Roles.userIsInRole(Meteor.userId(), ['owner','admin'])) {
      throw new Meteor.Error("403", "Forbidden");
    }

    let length = 0;

    if (processorInstance) {
      length = processorInstance.getQueueLength();
    }

    return length;
  },

  magentoCall(...args) {
    check(args[0], String);
    check(args[1], String);
    check(args[2], Match.Maybe(Match.Any));

    const callMagentoService = (service, method, params, next) => {
      magento((err, { connection }) => {
        if (err) {
          return next(err);
        }

        if (!connection[service] || !connection[service][method]) {
          return next(new Meteor.Error(404, "Service/method not found"));
        }

        if (params) {
          return connection[service][method](params, next);
        }

        connection[service][method](next);
      });
    };

    if (!Meteor.isDevelopment) {
      throw new Meteor.Error(505, "This method works only for Development mode");
    }

    return Meteor.wrapAsync(callMagentoService)(...args);
  }
});
