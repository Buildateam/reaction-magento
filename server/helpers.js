/* eslint-disable camelcase */
import { Meteor } from "meteor/meteor";
import Fiber from "fibers";
import find from "lodash/find";
import filter from "lodash/filter";
import findIndex from "lodash/findIndex";
import each from "lodash/each";
import map from "lodash/map";
import sortedIndexBy from "lodash/sortedIndexBy";
import getCSV from "get-csv";
import { OPTION_TYPES, PRODUCT_TYPE } from "./magentoConsts";
import { onError, onLog } from "./magento";

export const getAssociatedProductFromCSV = () => {
  onLog("getAssociatedProductFromCSV", {
    absoluteURL: Meteor.absoluteUrl(),
    rootEnv: process.env.ROOT_URL
  });
  return getCSV(`${Meteor.absoluteUrl()}custom/magento-csv/catalog_product_20180115_092048.csv`)
    .then((data) => {
      onLog("getAssociatedProductFromCSV:data", {
        dataLength: data.length
      });

      const arr = [];
      let isStartGetAssosiated = false;
      let tSku = null;
      let tArrSku = [];

      each(data, ({ sku, _type, _super_products_sku }) => {
        if (sku.length && tSku !== sku) {
          if (isStartGetAssosiated) {
            arr.push({
              sku: tSku,
              childrenSku: tArrSku
            });
            tArrSku = [];
            isStartGetAssosiated = false;
            tSku = null;
          }
          if (_type === PRODUCT_TYPE.CONFIGURABLE) {
            tSku = sku;
            isStartGetAssosiated = true;
          }
        } else if (isStartGetAssosiated && _super_products_sku.length && findIndex(tArrSku, item => item === _super_products_sku) === -1) {
          tArrSku.push(_super_products_sku);
        }
      });
      return arr;
    });
};

export const getShopsFromCSV = () => {
  onLog("getShopsFromCSV", {
    absoluteURL: Meteor.absoluteUrl(),
    rootEnv: process.env.ROOT_URL
  });

  const validStores = [
    { key: "en_3800", value: "3800" },
    { key: "en_ats", value: "ats" },
    { key: "en_ecotec", value: "ecotec" },
    { key: "en_lsx", value: "lsx" },
    { key: "en_sonic", value: "sonic" }
  ];

  return getCSV(`${Meteor.absoluteUrl()}custom/magento-csv/catalog_product_20180115_092048.csv`)
    .then((data) => {
      onLog("getShopsFromCSV:data", {
        dataLength: data.length
      });

      const arr = [];
      let tSku = null;
      let tShops = [];

      each(data, ({ sku, _store, visibility, _type, url_key }) => {
        if (sku.length && tSku !== sku) {
          if (tSku) {
            arr.push({
              sku: tSku,
              type: _type,
              shops: tShops,
              urlKey: url_key
            });
            tShops = [];
          }
          tSku = sku;
        } else if (tSku && _store && _store !== "") {
          const findShopIndex = findIndex(validStores, o => o.key === _store);
          tShops.push({
            store: _store,
            visibility: +visibility === 1,
            tagStoreName: findShopIndex !== -1 ? validStores[findShopIndex].value : null
          });
        }
      });

      return filter(arr, o => o.shops && o.shops.length);
    });
};

export const getCustomersFromCSV = () => {
  onLog("getCustomersFromCSV", {
    absoluteURL: Meteor.absoluteUrl(),
    rootEnv: process.env.ROOT_URL
  });

  return getCSV(`${Meteor.absoluteUrl()}custom/magento-csv/customers.csv`)
    .then((data) => {
      onLog("getCustomersFromCSV:data", {
        dataLength: data.length
      });

      return data;
    });
};

export const fiberCallback = (callback) => {
  return (err, res) => {
    return Fiber(() => callback(err, res)).run();
  };
};

export const getMetafields = (data = {}) => {
  return _.map(data, (value, key) => {
    return {
      key: (`${key}`).trim().substring(0, 29),
      value: (`${value}`)
    };
  });
};

export const valueOrNone = (value = "", none) => {
  const valueAsString = (`${value}`).trim();

  return valueAsString.length ? valueAsString : (none || "none");
};

export const getDefaultShopModel = (store, id) => ({
  _id: id,
  domains: [store.code],
  currencies: {
    USD: {
      enabled: true,
      format: "%s%v",
      symbol: "$"
    }
  },
  currency: "USD",
  languages: [{
    label: "English",
    i18n: "en",
    enabled: true
  }],
  locales: {
    continents: {
      NA: "North America"
    },
    countries: {
      US: {
        name: "United States",
        native: "United States",
        phone: "1",
        continent: "NA",
        capital: "Washington D.C.",
        currency: "USD,USN,USS",
        languages: "en",
        states: {
          AL: {
            name: "Alabama"
          },
          AK: {
            name: "Alaska"
          },
          AS: {
            name: "American Samoa"
          },
          AZ: {
            name: "Arizona"
          },
          AR: {
            name: "Arkansas"
          },
          CA: {
            name: "California"
          },
          CO: {
            name: "Colorado"
          },
          CT: {
            name: "Connecticut"
          },
          DE: {
            name: "Delaware"
          },
          DC: {
            name: "District Of Columbia"
          },
          FM: {
            name: "Federated States Of Micronesia"
          },
          FL: {
            name: "Florida"
          },
          GA: {
            name: "Georgia"
          },
          GU: {
            name: "Guam"
          },
          HI: {
            name: "Hawaii"
          },
          ID: {
            name: "Idaho"
          },
          IL: {
            name: "Illinois"
          },
          IN: {
            name: "Indiana"
          },
          IA: {
            name: "Iowa"
          },
          KS: {
            name: "Kansas"
          },
          KY: {
            name: "Kentucky"
          },
          LA: {
            name: "Louisiana"
          },
          ME: {
            name: "Maine"
          },
          MH: {
            name: "Marshall Islands"
          },
          MD: {
            name: "Maryland"
          },
          MA: {
            name: "Massachusetts"
          },
          MI: {
            name: "Michigan"
          },
          MN: {
            name: "Minnesota"
          },
          MS: {
            name: "Mississippi"
          },
          MO: {
            name: "Missouri"
          },
          MT: {
            name: "Montana"
          },
          NE: {
            name: "Nebraska"
          },
          NV: {
            name: "Nevada"
          },
          NH: {
            name: "New Hampshire"
          },
          NJ: {
            name: "New Jersey"
          },
          NM: {
            name: "New Mexico"
          },
          NY: {
            name: "New York"
          },
          NC: {
            name: "North Carolina"
          },
          ND: {
            name: "North Dakota"
          },
          MP: {
            name: "Northern Mariana Islands"
          },
          OH: {
            name: "Ohio"
          },
          OK: {
            name: "Oklahoma"
          },
          OR: {
            name: "Oregon"
          },
          PW: {
            name: "Palau"
          },
          PA: {
            name: "Pennsylvania"
          },
          PR: {
            name: "Puerto Rico"
          },
          RI: {
            name: "Rhode Island"
          },
          SC: {
            name: "South Carolina"
          },
          SD: {
            name: "South Dakota"
          },
          TN: {
            name: "Tennessee"
          },
          TX: {
            name: "Texas"
          },
          UT: {
            name: "Utah"
          },
          VT: {
            name: "Vermont"
          },
          VI: {
            name: "Virgin Islands"
          },
          VA: {
            name: "Virginia"
          },
          WA: {
            name: "Washington"
          },
          WV: {
            name: "West Virginia"
          },
          WI: {
            name: "Wisconsin"
          },
          WY: {
            name: "Wyoming"
          }
        }
      }
    }
  },
  name: store.name,
  taxes: [{
    taxesIncluded: null,
    taxShipping: null,
    countyTaxes: true
  }],
  timezone: "US/Pacific",
  baseUOM: "GR",
  unitsOfMeasure: [{
    uom: "GR",
    label: "Grams"
  }],
  addressBook: [],
  defaultVisitorRole: [
    "anonymous",
    "guest",
    "account/verify",
    "product",
    "tag",
    "index",
    "cart/checkout",
    "cart/completed"
  ],
  defaultRoles: [
    "account/profile",
    "guest",
    "product",
    "account/verify",
    "tag",
    "index",
    "cart/checkout",
    "cart/completed"
  ]
});

export const createCombinationFromGroup = (array) => {
  const f = (indexRow, groups, combinedEl = []) => {
    if (indexRow < groups.length) {
      return map(groups[indexRow], rowItem =>
        map(f(indexRow + 1, groups, rowItem), item => combinedEl.concat(item)));
    }

    return combinedEl;
  };

  const checkLastLevel = (tArr) => {
    let returnValue = true;
    each(tArr, (item) => {
      if (Array.isArray(item)) {
        returnValue = false;
      }
    });

    return returnValue;
  };

  const structureStack = (tArr) => {
    const resArr = [];
    if (!checkLastLevel(tArr)) {
      const tEl = find(tArr, item => !Array.isArray(item));
      each(tArr, (item) => {
        if (Array.isArray(item)) {
          const resNextLevel = structureStack(item);
          each(resNextLevel, nlItem => resArr.push([tEl, ...nlItem]));
        }
      });
    } else {
      return [tArr];
    }

    return resArr;
  };

  const levelArray = f(0, array);
  let resArray = [];

  each(levelArray, (lItems) => {
    each(lItems, (subItems) => {
      each(subItems, (temp) => {
        if (!checkLastLevel(temp)) {
          if (Array.isArray(temp)) {
            resArray = resArray.concat(structureStack(temp));
          }
        } else {
          resArray.push([temp]);
        }
      });
    });
  });

  return resArray;
};

export const createMultiplyCombination = (valuesParent, combLenParent = 1) => {
  const f = (index, values, combLen) => {
    let tIndex = index;

    if (index < combLen) {
      const resultArr = [];
      const nextLayerArr = f(index + 1, values, combLen);

      while (tIndex < values.length) {
        const tVal = values[tIndex];
        tIndex += 1;

        if (nextLayerArr.length) {
          each(nextLayerArr, (itemNextLayer) => {
            const findIndexNextLayer = findIndex(itemNextLayer, item => item === tVal);

            if (findIndexNextLayer === -1) {
              const tItem = [
                tVal,
                ...itemNextLayer
              ];
              const inArray = findIndex(resultArr, (resItem) => {
                if (tItem.length !== resItem.length) {
                  return false;
                }

                let isSearch = true;

                each(tItem, (elInTItem) => {
                  if (findIndex(resItem, tElement => tElement === elInTItem) === -1) {
                    isSearch = false;
                  }
                });

                return isSearch;
              });
              if (inArray === -1) {
                resultArr.push(tItem);
              }
            }
          });
        } else {
          return map(values.slice(index, values.length), item => [item]);
        }
      }

      return resultArr;
    }

    return [];
  };

  return f(0, valuesParent, combLenParent);
};

export const createGroupCombinations = (values, isRequired = true, isMultiply = false) => {
  let result  = [];

  if (!isRequired) {
    result.push([]);
  }

  const optionIds = map(values, ({ value_id }) => value_id);

  if (isMultiply) {
    let startCombinedVariantLength = 1;

    while (startCombinedVariantLength < values.length) {
      const elements = createMultiplyCombination(optionIds, startCombinedVariantLength++);
      result = result.concat(elements);
    }
  } else {
    each(optionIds, item => {
      result.push([item]);
    });
  }

  return result;
};

export const detectMultiplyValues = (type) => {
  switch (type) {
    case "drop_down": return false;
    case "radio": return false;
    case "checkbox": return true;
    case "multiple": return true;

    default: return false;
  }
};

export const createOptionPriceAndSkuFromCombination = (combination, options, groups, linkTable) => {
  const groupedCombinationOptions = [];

  each(groups, ({ option_id, sort_order }) => {
    const insertIndex = sortedIndexBy(groupedCombinationOptions, { sort_order }, o => +o.sort_order);
    groupedCombinationOptions.splice(insertIndex, 0, {
      sort_order: +sort_order,
      option_id,
      values: []
    });
  });

  each(combination, (item) => {
    const findLinkElement = find(linkTable, ({ value_id }) => value_id === item);
    const findOption = find(options, ({ value_id }) => value_id === item);

    if (findLinkElement) {
      const { option_id } = findLinkElement;
      const { sort_order } = findOption;
      const indexGroup = findIndex(
        groupedCombinationOptions,
        tItem => option_id === tItem.option_id
      );
      const insertIndex =
        sortedIndexBy(groupedCombinationOptions[indexGroup].values, { sort_order }, o => +o.sort_order);
      groupedCombinationOptions[indexGroup].values.splice(insertIndex, 0, {
        sort_order: +sort_order,
        item
      });
    }
  });

  const sortedCombination = [];

  each(groupedCombinationOptions, ({ values }) => {
    each(values, ({ item }) => {
      sortedCombination.push(item);
    });
  });

  let prefixSku = "";
  let priceDiff = 0.0;

  each(sortedCombination, (item) => {
    const element = find(options, ({ value_id }) => value_id === item);

    if (element) {
      const { sku, price } = element;

      if (sku && sku.length && sku !== "") {
        prefixSku = `${prefixSku}-${sku}`;
      }

      priceDiff += isNaN(+(+price).toFixed(2)) ? +price : +(+price).toFixed(2);
    }
  });

  return {
    combination: sortedCombination.join(","),
    prefixSku,
    priceDiff
  };
};

export const groupedProductOptions = (options) => {
  const result = {
    selected: [],
    text: []
  };

  each(options, option => {
    if (findIndex(OPTION_TYPES.SELECTED, item => item === option.type) !== -1) {
      result.selected.push(option);
    } else if (findIndex(OPTION_TYPES.TEXT, item => item === option.type) !== -1) {
      result.text.push(option);
    } else {
      onError({
        message: "not fount option type",
        type: option.type,
        optionObject: option
      }, "groupedProductOptions");
    }
  });

  return result;
};

export const createCustomOptionObject = (productInfo, variantInfo, {
  groupId,
  groupTitle,
  groupType,
  groupIsRequired,
  groupSort,
  optionId,
  optionVariantTitle,
  optionSortIndex,
  optionPriceType,
  optionPrice,
  optionDiff,
  optionSku,
  optionSortOrder
}) => {
  let price = (+(+variantInfo.price).toFixed(2));
  const data = {
    groupId,
    groupTitle,
    groupType,
    groupIsRequired,
    groupSort
  };

  if (optionId) {
    data.optionId = optionId;
  }
  if (optionVariantTitle) {
    data.optionVariantTitle = optionVariantTitle;
  }
  if (optionSortIndex) {
    data.optionSortIndex = optionSortIndex;
  }
  if (optionPriceType) {
    data.optionPriceType = optionPriceType;
  }
  if (optionPrice) {
    data.optionPrice = optionPrice;
    price += isNaN(+(+optionPrice).toFixed(2)) ? +optionPrice : +(+optionPrice).toFixed(2);
  }
  if (optionDiff) {
    data.optionDiff = optionDiff;
  }
  if (optionSku) {
    data.optionSku = optionSku;
  }
  if (optionSortOrder) {
    data.optionSortOrder = optionSortOrder;
  }

  return {
    ...data,
    ancestors: [productInfo._id, variantInfo._id],
    handle: variantInfo.handle || productInfo.handle,
    shopUrl: variantInfo.shopUrl || productInfo.shopUrl,
    barcode: variantInfo.barcode || productInfo.barcode || "",
    compare_at_price: 1,
    description: variantInfo.description || productInfo.description,
    sku: variantInfo.sku || productInfo.sku,
    requiresShipping: variantInfo.requires_shipping || productInfo.requires_shipping,
    weight: +(+variantInfo.weight).toFixed(3),
    weightInGrams: (+variantInfo.weight || +productInfo.weight) * 1000,
    isVisible: true,
    compareAtPrice: variantInfo.compareAtPrice || productInfo.compareAtPrice,
    createdAt: new Date(),
    height: 0,
    inventoryManagement: true,
    inventoryPolicy: true,
    inventoryQuantity: variantInfo.inventoryQuantity,
    isDeleted: false,
    length: 0,
    lowInventoryWarningThreshold: 0,
    metafields: [],
    optionTitle: optionVariantTitle || variantInfo.title || productInfo.title,
    price,
    taxable: true,
    taxCode: "",
    title: optionVariantTitle || variantInfo.title || productInfo.title,
    type: "variant",
    updatedAt: new Date(),
    width: 0,
    workflow: {
      status: "synced",
      workflow: ["imported"]
    },
    skipRevision: true
  };
};

export const createCustomGroupedOptionObject = (productInfo, variantInfo, {
  isGroupCombination,
  optionCombinations,
  sku,
  price
}) => {
  return {
    isGroupCombination,
    optionCombinations,
    ancestors: [productInfo._id, variantInfo._id],
    handle: variantInfo.handle || productInfo.handle,
    shopUrl: variantInfo.shopUrl || productInfo.shopUrl,
    barcode: variantInfo.barcode || productInfo.barcode || "",
    compare_at_price: 1,
    description: variantInfo.description || productInfo.description,
    sku,
    requiresShipping: variantInfo.requires_shipping || productInfo.requires_shipping,
    weight: +(+variantInfo.weight).toFixed(3),
    weightInGrams: (+variantInfo.weight || +productInfo.weight) * 1000,
    isVisible: true,
    compareAtPrice: variantInfo.compareAtPrice || productInfo.compareAtPrice,
    createdAt: new Date(),
    height: 0,
    inventoryManagement: true,
    inventoryPolicy: true,
    inventoryQuantity: variantInfo.inventoryQuantity,
    isDeleted: false,
    length: 0,
    lowInventoryWarningThreshold: 0,
    metafields: [],
    optionTitle: variantInfo.title || productInfo.title,
    price: (+(+variantInfo.price).toFixed(2)) + price,
    taxable: true,
    taxCode: "",
    title: variantInfo.title || productInfo.title,
    type: "variant",
    updatedAt: new Date(),
    width: 0,
    workflow: {
      status: "synced",
      workflow: ["imported"]
    },
    skipRevision: true
  };
};

export const createCustomVariantObject = (productInfo, variantInfo, inventoryStock) => {
  let inventoryQuantity = 0;

  if (inventoryStock && inventoryStock.qty) {
    inventoryQuantity = +(+inventoryStock.qty).toFixed(0);
    if (inventoryQuantity < 0) {
      inventoryQuantity = Math.abs(inventoryQuantity);
    }
  }

  if (inventoryStock && `${inventoryStock.is_in_stock}` === "1" && inventoryQuantity <= 0) {
    inventoryQuantity = 1;
  }

  // @TODO - ulimit inventory delete (net-suite connect)
  inventoryQuantity = 99999;
  const productPrice = productInfo.price;
  const variantPrice = variantInfo.price;
  let tPriceFloat = 0.00;

  if (productPrice) {
    tPriceFloat = isNaN(+(+productPrice).toFixed(2)) ? +productPrice : +(+productPrice).toFixed(2);
  }

  if (variantPrice && isNaN(tPriceFloat)) {
    tPriceFloat = isNaN(+(+variantPrice).toFixed(2)) ? +variantPrice : +(+variantPrice).toFixed(2);
  }
  
  return {
    ancestors: [productInfo._id],
    handle: variantInfo.url_key,
    shopUrl: variantInfo.product_id,
    barcode: variantInfo.barcode || productInfo.barcode || "",
    compare_at_price: 1,
    description: variantInfo.description || productInfo.description,
    sku: variantInfo.sku || productInfo.sku,
    requiresShipping: variantInfo.requires_shipping || productInfo.requires_shipping,
    weight: +(+variantInfo.weight).toFixed(3),
    weightInGrams: (+variantInfo.weight || +productInfo.weight) * 1000,
    isVisible: true,
    compareAtPrice: variantInfo.compare_at_price || productInfo.compare_at_price,
    createdAt: new Date(),
    height: 0,
    inventoryManagement: true,
    inventoryPolicy: true,
    inventoryQuantity,
    isDeleted: false,
    length: 0,
    lowInventoryWarningThreshold: 0,
    metafields: [],
    optionTitle: variantInfo.name || productInfo.name,
    price: !isNaN(tPriceFloat) && tPriceFloat ? tPriceFloat : 0,
    taxable: true,
    taxCode: "",
    title: variantInfo.name || productInfo.name,
    type: "variant",
    updatedAt: new Date(),
    width: 0,
    workflow: {
      status: "synced",
      workflow: ["imported"]
    },
    skipRevision: true
  };
};
