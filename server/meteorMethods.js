/* eslint comma-dangle:0 */
/* eslint quote-props:0 */
import find from "lodash/find";
import filter from "lodash/filter";
import findIndex from "lodash/findIndex";
import each from "lodash/each";
import uniq from "lodash/uniq";
import map from "lodash/map";
import includes from "lodash/includes";

import accounting from "accounting-js";
import { Meteor } from "meteor/meteor";
import { check, Match } from "meteor/check";
import { Random } from "meteor/random";
import { Reaction, Hooks, Logger } from "/server/api";
import { Cart as CartSchema } from "/lib/collections/schemas";
import { Roles } from "meteor/alanning:roles";
import { ReplaceAccountSchema } from "../lib/collections/accounts";
import { Shipping, Accounts, Products, Cart, Packages, Orders, Groups, ProductSearch } from "/lib/collections";

const constants = {
  magentoShippingMethodName: "magento",
};

function quantityProcessing(product, variant, itemQty = 1) {
  let quantity = itemQty;
  const MIN = variant.minOrderQuantity || 1;
  const MAX = variant.inventoryQuantity || Infinity;

  if (variant.inventoryPolicy && MIN > MAX) {
    Logger.info(`productId: ${product._id}, variantId ${variant._id}: inventoryQuantity lower then minimum order`);
    return false;
  }

  switch (product.type) {
    case "not-in-stock":
      break;
    default: // type: `simple` // todo: maybe it should be "variant"
      if (quantity < MIN) {
        quantity = MIN;
      } else if (variant.inventoryPolicy && quantity > MAX) {
        quantity = MAX;
      }
  }

  return quantity;
}

function getSessionCarts(userId, sessionId, shopId) {
  const carts = Cart.find({
    $and: [{
      userId: {
        $ne: userId
      }
    }, {
      sessionId: {
        $eq: sessionId
      }
    }, {
      shopId: {
        $eq: shopId
      }
    }]
  });

  // we can't use Array.map here, because we need to reduce the number of array
  // elements if element belongs to registered user, we should throw it.
  const allowedCarts = [];

  // only anonymous user carts allowed
  carts.forEach(cart => {
    if (Roles.userIsInRole(cart.userId, "anonymous", shopId)) {
      allowedCarts.push(cart);
    }
  });

  return allowedCarts;
}

function orderCreditMethod(order) {
  const creditBillingRecords = order.billing.filter(value => value.paymentMethod.method ===  "credit");
  const billingRecord = creditBillingRecords.find((billing) => {
    return billing.shopId === Reaction.getShopId();
  });

  return billingRecord;
}

function createShipmentQuotes(cartId, shopId, rates) {
  console.log("create, meteror");

  let update = {
    $push: {
      shipping: {
        shopId,
        shipmentQuotes: [],
        shipmentQuotesQueryStatus: {
          requestStatus: "pending"
        }
      }
    }
  };

  Cart.update({ _id: cartId }, update, (error) => {
    if (error) {
      return;
    }
  });

  if (rates.length === 1 && rates[0].requestStatus === "error") {
    const errorDetails = rates[0];

    update = {
      $set: {
        "shipping.$.shipmentQuotes": [],
        "shipping.$.shipmentQuotesQueryStatus": {
          requestStatus: errorDetails.requestStatus,
          shippingProvider: errorDetails.shippingProvider,
          message: errorDetails.message
        }
      }
    };
  }

  if (rates.length > 0 && rates[0].requestStatus === undefined) {
    update = {
      $set: {
        "shipping.$.shipmentQuotes": rates,
        "shipping.$.shipmentQuotesQueryStatus": {
          requestStatus: "success",
          numOfShippingMethodsFound: rates.length
        }
      }
    };
  }

  return update;
}

function pruneShippingRecordsByShop(cart) {
  if (cart.items) {
    const cartId = cart._id;
    const itemsByShop = cart.getItemsByShop();
    const shops = Object.keys(itemsByShop);

    if (shops.length > 0 && cart.items.length > 0) {
      Cart.update(
        { _id: cartId },
        {
          $pull: {
            shipping: { shopId: { $nin: shops } }
          }
        }
      );
    } else {
      Cart.update(
        { _id: cartId },
        {
          $unset: {
            shipping: ""
          }
        }
      );
    }
  }
}

function normalizeAddresses(cart) {
  if (cart.shipping && cart.shipping.length > 0) {
    const shipping = cart.shipping;
    const cartId = cart._id;
    let address;

    shipping.forEach((shippingRecord) => {
      if (shippingRecord.address) {
        address = shippingRecord.address;
      }
    });

    const shopIds = Object.keys(cart.getItemsByShop());

    shopIds.forEach((shopId) => {
      const selector = {
        "_id": cartId,
        "shipping.shopId": shopId
      };

      const update = {
        $set: {
          "shipping.$.address": address
        }
      };
      Cart.update(selector, update);
    });
  }
}

function updateShipmentQuotes(cartId, rates, selector) {
  let update = {
    $set: {
      "shipping.$.shipmentQuotesQueryStatus": {
        requestStatus: "pending"
      }
    }
  };

  Cart.update(selector, update, (error) => {
    if (error) {
      return;
    }
  });

  if (rates.length === 1 && rates[0].requestStatus === "error") {
    const errorDetails = rates[0];

    update = {
      $set: {
        "shipping.$.shipmentQuotes": [],
        "shipping.$.shipmentQuotesQueryStatus": {
          requestStatus: errorDetails.requestStatus,
          shippingProvider: errorDetails.shippingProvider,
          message: errorDetails.message
        }
      }
    };
  }

  if (rates.length > 0 && rates[0].requestStatus === undefined) {
    update = {
      $set: {
        "shipping.$.shipmentQuotes": rates,
        "shipping.$.shipmentQuotesQueryStatus": {
          requestStatus: "success",
          numOfShippingMethodsFound: rates.length
        }
      }
    };
  }

  return update;
}

function updateShippingRecordByShop(cart, rates) {
  const cartId = cart._id;
  const itemsByShop = cart.getItemsByShop();
  const shops = Object.keys(itemsByShop);
  let update;
  let selector;

  shops.forEach((shopId) => {
    selector = {
      "_id": cartId,
      "shipping.shopId": shopId
    };
    const cartForShipping = Cart.findOne(selector);
    if (cartForShipping) {
      update = updateShipmentQuotes(cartId, rates, selector);
    } else {
      update = createShipmentQuotes(cartId, shopId, rates);
    }

    Cart.update(selector, update);
  });

  pruneShippingRecordsByShop(cart);
  normalizeAddresses(cart);
}

function getDefaultAddress(cart) {
  const userId = cart.userId;
  const account = Accounts.findOne(userId);

  if (account && account.profile && account.profile.addressBook) {
    const address = account.profile.addressBook.find((addressEntry) => addressEntry.isShippingDefault === true);

    if (!address) {
      return account.profile.addressBook[0];
    }

    return address;
  }
}

function addAddresses(cart) {
  const address = getDefaultAddress(cart);

  if (address) {
    const shopIds = Object.keys(cart.getItemsByShop());
    shopIds.forEach((shopId) => {
      Cart.update({
        _id: cart._id
      }, {
        $push: {
          shipping: {
            shopId,
            address
          }
        }
      });
    });
  }
}

const cartMergeCart = (cartId, currentSessionId) => {
  check(cartId, String);
  check(currentSessionId, Match.Optional(String));

  const currentCart = Cart.findOne(cartId);

  if (!currentCart) {
    Logger.error("we don't process current cart, but merge into it.");
    return false;
  }

  const userId = currentCart && currentCart.userId;
  const sessionId = currentSessionId || Reaction.sessionId;
  const shopId = Reaction.getShopId();

  if (Roles.userIsInRole(userId, "anonymous", shopId)) {
    return false;
  }

  const sessionCarts = getSessionCarts(userId, sessionId, shopId);

  sessionCarts.forEach(sessionCart => {
    if (sessionCart.items) {
      if (typeof currentCart.workflow === "object" &&
        typeof currentCart.workflow.workflow === "object") {
        if (currentCart.workflow.workflow.length > 2) {
          workflowRevertCartWorkflow("coreCheckoutShipping", userId);
          shippingUpdateShipmentQuotes(cartId);
        }
      } else {
        workflowRevertCartWorkflow("checkoutAddressBook", userId);
      }

      const cartSum = sessionCart.items.concat(currentCart.items);
      const mergedItems = cartSum.reduce((newItems, item) => {
        if (item) {
          const existingItem = newItems.find(cartItem => cartItem.variants._id === item.variants._id);
          if (existingItem) {
            existingItem.quantity += item.quantity;
          } else {
            newItems.push(item);
          }
        }
        return newItems;
      }, []);

      Cart.update(currentCart._id, {
        $push: {
          items: { $each: mergedItems, $slice: -(mergedItems.length) }
        }
      });
    }

    if (sessionCart.userId !== userId) {
      Cart.remove(sessionCart._id);
      Accounts.remove({
        userId: sessionCart.userId
      });
      Meteor.users.remove(sessionCart.userId);
    }
  });

  if (currentCart.workflow.status === "new") {
    workflowPushCartWorkflow("coreCartWorkflow", "checkoutLogin", cartId);
    workflowPushCartWorkflow("coreCartWorkflow", "checkoutAddressBook", cartId);
  }

  return currentCart._id;
};

const cartCreateCart = (userId, sessionId, shopId = Reaction.getShopId()) => {
  check(userId, String);
  check(shopId, String);
  check(sessionId, String);

  const anonymousUser = Roles.userIsInRole(userId, "anonymous", shopId);
  Cart.remove({ userId });

  const currentCartId = Cart.insert({
    sessionId,
    shopId,
    userId
  });

  if (!anonymousUser) {
    cartMergeCart(currentCartId, sessionId);
  }

  const account = Accounts.findOne(userId);

  if (account && account.profile && account.profile.addressBook) {
    account.profile.addressBook.forEach(address => {
      if (address.isBillingDefault) {
        cartSetPaymentAddress(currentCartId, address, userId, account.shopId);
      }

      if (address.isShippingDefault) {
        cartSetShipmentAddress(currentCartId, address, userId);
      }
    });
  }

  const currentUser = userId;
  let userCurrency = Reaction.getShopCurrency();

  if (currentUser && currentUser.profile && currentUser.profile.currency) {
    userCurrency = currentUser.profile.currency;
  }

  Meteor.call("cart/setUserCurrency", currentCartId, userCurrency);

  return currentCartId;
};

const getMagentoFreeShippingObject = (shopId = Reaction.getShopId()) => {
  check(shopId, String);

  let shipping = Shipping.findOne({
    $or: [
      { "provider.name": "flatRates", shopId },
      { name: "Default shipping provider", shopId }
    ]
  });

  if (!shipping) {
    shipping = {
      name: "Default shipping provider",
      methods: [{
        name: constants.magentoShippingMethodName,
        label: "Magento",
        group: "Free",
        cost: 0,
        handling: 0,
        rate: 0,
        enabled: false,
        _id: Random.id()
      }],
      provider: {
        name: "flatRates",
        label: "Flat Rate",
        enabled: true
      },
      shopId
    };
    shipping._id = Shipping.insert({
      name: "Default shipping provider",
      methods: [],
      provider: {
        name: "flatRates",
        label: "Flat Rate",
        enabled: true
      },
      shopId
    });
  }

  const objectToUpdate = {};
  const objectToSet = {};
  const objectToPush = {};

  if (
    shipping.provider &&
    shipping.provider.hasOwnProperty("enabled") &&
    shipping.provider.enabled === false
  ) {
    objectToSet.provider = {
      enabled: true
    };
    shipping.provider.enabled = true;
  }

  if (!find(shipping.methods, ({ name }) => name === constants.magentoShippingMethodName)) {
    const tPush = {
      name: constants.magentoShippingMethodName,
      label: "Magento",
      group: "Free",
      cost: 0,
      handling: 0,
      rate: 0,
      enabled: false,
      _id: Random.id()
    };
    objectToPush.methods = tPush;
    shipping.methods.push(tPush);
  }

  if (Object.keys(objectToSet).length) {
    objectToUpdate.$set = objectToSet;
  }

  if (Object.keys(objectToPush).length) {
    objectToUpdate.$push = objectToPush;
  }

  if (Object.keys(objectToUpdate).length) {
    Shipping.update({
      _id: shipping._id
    }, objectToUpdate);
  }

  return shipping;
};

const getMagentoShipmentMethodObject = (shopId = Reaction.getShopId(), shippingArg) => {
  check(shopId, String);
  check(shippingArg, Reaction.Schemas.Shipping);

  let shipping = shippingArg;

  if (!shipping) {
    shipping = getMagentoFreeShippingObject(shopId);
  }

  if (shipping && shipping.methods && shipping.methods.length) {
    const carrier = shipping.label || shipping.name;
    let method = find(shipping.methods, ({ name }) => name === constants.magentoShippingMethodName);

    if (!method) {
      method = shipping.methods[0];
    }
    method.carrier = carrier;

    return method;
  }

  return null;
};

const getMagentoShipmentQuotesObject = (shopId = Reaction.getShopId()) => {
  check(shopId, String);

  const shipping = getMagentoFreeShippingObject(shopId);

  if (shipping && shipping.methods && shipping.methods.length) {
    const carrier = shipping.label || shipping.name;
    const method = getMagentoShipmentMethodObject(shopId, shipping);
    return {
      carrier,
      method,
      rate: method.rate || 0,
      shopId
    };
  }

  return null;
};

const getBillingDefAddr = (account) => {
  check(account, ReplaceAccountSchema);

  let addressBook = null;

  if (
    account.profile &&
    account.profile.addressBook &&
    account.profile.addressBook.length
  ) {
    addressBook = find(account.profile.addressBook, ({ isBillingDefault }) => isBillingDefault === true);
    if (!addressBook) {
      addressBook = account.profile.addressBook[0];
    }
  }

  return addressBook;
};

const getShippingDefAddr = (account) => {
  check(account, ReplaceAccountSchema);

  let addressBook = null;

  if (
    account.profile &&
    account.profile.addressBook &&
    account.profile.addressBook.length
  ) {
    addressBook = find(account.profile.addressBook, ({ isShippingDefault }) => isShippingDefault === true);

    if (!addressBook) {
      addressBook = account.profile.addressBook[0];
    }
  }

  return addressBook;
};

export const updateUserProfile = (user) => {
  check(user, Object);

  if (user) {
    if (!user._id) {
      return false;
    }

    const account = Accounts.findOne({
      userId: user._id
    });

    if (account && user) {
      const isAddrBookUser = user.profile && user.profile.addressBook && Object.keys(user.profile.addressBook).length;
      const setObject = {
        profile: {
          preferences: {
            reaction: {
              activeShopId: account.shopId
            }
          },
          addressBook: isAddrBookUser ? user.profile.addressBook : {}
        }
      };

      let addressBook = setObject.profile.addressBook;

      if (
        account.profile &&
        account.profile.addressBook &&
        account.profile.addressBook.length
      ) {
        addressBook = find(account.profile.addressBook, ({ isBillingDefault }) => isBillingDefault === true);

        if (!addressBook) {
          addressBook = account.profile.addressBook[0];
        }

        setObject.profile.addressBook = addressBook;
      } else if (
        user.profile &&
        user.profile.addressBook &&
        Object.keys(user.profile.addressBook).length
      ) {
        Accounts.update(
          { _id: account._id },
          { $set: { "profile.addressBook": [user.profile.addressBook] } }
        );
      }
      // @TODO - DELETE AND CREATE EMAIL PASSWORD RESET METHOD
      setObject.services = {
        password: {
          bcrypt: "$2a$10$hZ1muUxD4gdhRnNi26JwZemJ7eeOlfVIKWtz/k4HX5Ki7cOyjR1d6"
        },
        resume: {
          loginTokens: []
        }
      };
      // @TODO - END
      Meteor.users.update({
        _id: user._id
      }, { $set: setObject });

      return true;
    }
  }

  return false;
};

const getProductAndVariantFromMagentoItemId = (itemId, sku, shopId = Reaction.getShopId()) => {
  check(itemId, String);
  check(sku, String);
  check(shopId, String);

  let product = null;
  let variant = null;
  let title = null;
  let type = null;
  let tItemData = Products.findOne({ sku });

  if (!tItemData) {
    tItemData = Products.findOne({
      handle: itemId,
      isGroupCombination: { $exists: false },
      groupId: { $exists: false }
    });
  }

  if (tItemData) {
    title = tItemData.title;
    type = tItemData.type;

    if (tItemData.type === "simple" || tItemData.type === "variant") {
      if (tItemData.type === "simple") {
        product = tItemData;
        variant = Products.findOne({
          ancestors: [product._id],
        });
      } else {
        variant = tItemData;
        if (variant.ancestors.length) {
          const parentObjects = Products.find({
            _id: { $in: variant.ancestors },
          });
          if (parentObjects && parentObjects.length) {
            product = find(parentObjects, o => o.type === "simple");
            if (!product) {
              product = parentObjects[0];
            }
          } else {
            product = Products.findOne({ _id: variant.ancestors[0] });
          }
        }
      }

      if (product && variant) {
        return {
          _id: Random.id(),
          shopId: shopId || Reaction.getShopId(),
          productId: product._id,
          quantity: 1,
          product,
          variants: variant,
          title,
          type,
          parcel: {
            weight: variant.weight || 0,
            length: variant.length || 0,
            height: variant.height || 0,
            width: variant.width || 0,
          }
        };
      }
    }
  }

  return null;
};

export const getProductAndVariantIdFromMagentoItemId = (itemId, sku, shopId = Reaction.getShopId()) => {
  check(itemId, String);
  check(sku, String);
  check(shopId, String);

  let product = null;
  let variant = null;
  let tItemData = Products.findOne({ sku });

  if (!tItemData) {
    tItemData = Products.findOne({
      handle: itemId,
      isGroupCombination: { $exists: false },
      groupId: { $exists: false }
    });
  }

  if (tItemData) {
    if (tItemData.type === "simple" || tItemData.type === "variant") {
      if (tItemData.type === "simple") {
        product = tItemData;
        variant = Products.findOne({
          ancestors: [product._id],
        });
      } else {
        variant = tItemData;
        if (variant.ancestors.length) {
          const parentObjects = Products.find({
            _id: { $in: variant.ancestors },
          });
          if (parentObjects && parentObjects.length) {
            product = find(parentObjects, o => o.type === "simple");
            if (!product) {
              product = parentObjects[0];
            }
          } else {
            product = Products.findOne({ _id: variant.ancestors[0] });
          }
        }
      }
      if (product && variant) {
        return {
          productId: product._id,
          variantId: variant._id
        };
      }
    }
  }

  return null;
};

export const addAddrToCustomer = (account, addresses) => {
  check(account, ReplaceAccountSchema);
  check(addresses, [Object]);

  if (account && addresses && Array.isArray(addresses) && addresses.length) {
    const setObject = {};

    if (!account.profile) {
      setObject.profile = {
        invited: true,
        name: account.name || "Name",
        username: account.name || "username",
        addressBook: addresses
      };
      Accounts.update({
        _id: account._id
      }, {
        $set: setObject
      });
    } else if (!account.profile.addressBook || !account.profile.addressBook.length) {
      Accounts.update({
        _id: account._id
      }, {
        $set: { "profile.addressBook": addresses }
      });
    } else {
      for (let i = 0; i < account.profile.addressBook.length; i += 1) {
        account.profile.addressBook[i].isBillingDefault = false;
        account.profile.addressBook[i].isShippingDefault = false;
      }
      each(addresses, addr => {
        if (
          !find(account.profile.addressBook, accAddr => {
            const props = ["city", "region", "postal", "address1", "country"];
            for (let i = 0; i < props.length; i += 1) {
              if (
                typeof accAddr[props[i]] === "string" &&
                addr[props[i]] === "string" &&
                accAddr[props[i]].toLowerCase() !== addr[props[i]].toLowerCase()
              ) {
                return false;
              }
            }
            return true;
          })
        ) {
          account.profile.addressBook.push(addr);
        }
      });

      if (!find(account.profile.addressBook, o => o.isBillingDefault === true)) {
        const billingDefAddr = find(addresses, o => o.isBillingDefault === true);
        if (billingDefAddr) {
          const indexBillingDefAddr = findIndex(account.profile.addressBook, o => o._id === billingDefAddr._id);
          if (indexBillingDefAddr !== -1) {
            account.profile.addressBook[indexBillingDefAddr].isBillingDefault = true;
          } else {
            account.profile.addressBook[0].isBillingDefault = true;
          }
        } else {
          account.profile.addressBook[0].isBillingDefault = true;
        }
      }

      if (!find(account.profile.addressBook, o => o.isShippingDefault === true)) {
        const shippingDefAddr = find(addresses, o => o.isShippingDefault === true);
        if (shippingDefAddr) {
          const indexShippingDefAddr = findIndex(account.profile.addressBook, o => o._id === shippingDefAddr._id);
          if (indexShippingDefAddr !== -1) {
            account.profile.addressBook[indexShippingDefAddr].isShippingDefault = true;
          } else {
            account.profile.addressBook[0].isShippingDefault = true;
          }
        } else {
          account.profile.addressBook[0].isShippingDefault = true;
        }
      }

      Accounts.update({
        _id: account._id
      }, {
        $set: { "profile.addressBook": account.profile.addressBook }
      });
    }
    updateUserProfile(Meteor.users.findOne({ _id: account.userId }));

    return true;
  }

  return false;
};

export const workflowPushCartWorkflow = (workflow, newWorkflowStatus, cartId) => {
  check(workflow, String);
  check(newWorkflowStatus, String);
  check(cartId, Match.Optional(String));

  const currentCart = Cart.findOne({ _id: cartId });
  const defaultPackageWorkflows = [];
  let nextWorkflowStep = {
    template: ""
  };

  if (!currentCart) {
    return [];
  }

  const currentWorkflowStatus = currentCart.workflow.status;
  const packages = Packages.find({
    "shopId": Reaction.getShopId(),
    "layout.workflow": workflow
  });

  // loop through packages and set the defaultPackageWorkflows
  packages.forEach((reactionPackage) => {
    if (!reactionPackage.layout.layout) {
      const layouts = filter(reactionPackage.layout, {
        workflow
      });
      // for every layout, process the associated workflows
      each(layouts, (layout) => {
        // audience is the layout permissions
        if (typeof layout.audience !== "object") {
          const defaultRoles = Groups.findOne({
            slug: "customer",
            shopId: Reaction.getShopId()
          }).permissions;
          layout.audience = defaultRoles;
        }

        const hasPermission = Roles.userIsInRole(currentCart.userId, layout.audience, Reaction.getShopId());

        if (hasPermission  && !layout.layout) {
          defaultPackageWorkflows.push(layout);
        }
      });
    }
  });

  // statusExistsInWorkflow boolean
  const statusExistsInWorkflow = includes(currentCart.workflow.workflow, newWorkflowStatus);
  const maxSteps = defaultPackageWorkflows.length;
  let nextWorkflowStepIndex;
  let templateProcessedinWorkflow = false;
  let gotoNextWorkflowStep = false;

  // if we haven't populated workflows lets exit
  if (!defaultPackageWorkflows.length > 0) {
    return [];
  }

  each(defaultPackageWorkflows, (tworkflow, currentStatusIndex) => {
    if (workflow.template === currentWorkflowStatus) {
      // don't go past the end of the workflow
      if (currentStatusIndex < maxSteps - 1) {
        Logger.info("currentStatusIndex, maxSteps", currentStatusIndex, maxSteps);
        Logger.info("currentStatusIndex, maxSteps", currentStatusIndex, maxSteps);
        nextWorkflowStepIndex = currentStatusIndex + 1;
      } else {
        nextWorkflowStepIndex = currentStatusIndex;
      }

      Logger.info("nextWorkflowStepIndex", nextWorkflowStepIndex);
      // set the nextWorkflowStep as the next workflow object from registry
      nextWorkflowStep = defaultPackageWorkflows[nextWorkflowStepIndex];

      Logger.info("setting nextWorkflowStep", nextWorkflowStep.template);
    }
  });

  gotoNextWorkflowStep = nextWorkflowStep.template;
  templateProcessedinWorkflow = includes(currentCart.workflow.workflow, nextWorkflowStep.template);

  if (!gotoNextWorkflowStep && currentWorkflowStatus !== newWorkflowStatus) {
    Logger.info(`######## Condition One #########: initialise the ${currentCart._id} ${workflow}: ${defaultPackageWorkflows[0].template}`);

    const result = Cart.update(currentCart._id, {
      $set: {
        "workflow.status": defaultPackageWorkflows[0].template
      }
    });

    return result;
  }

  // Condition Two
  // your're now accepted into the workflow,
  // but to begin the workflow you need to have a next step
  // and you should have already be in the current workflow template
  if (gotoNextWorkflowStep && statusExistsInWorkflow === false && templateProcessedinWorkflow === false) {
    Logger.info(
      "######## Condition Two #########: set status to: ",
      nextWorkflowStep.template
    );

    return Cart.update(currentCart._id, {
      $set: {
        "workflow.status": nextWorkflowStep.template
      },
      $addToSet: {
        "workflow.workflow": currentWorkflowStatus
      }
    });
  }

  // Condition Three
  // If you got here by skipping around willy nilly
  // we're going to do our best to ignore you.
  if (gotoNextWorkflowStep && statusExistsInWorkflow === true &&
    templateProcessedinWorkflow === false) {
    Logger.info("######## Condition Three #########: complete workflow " +
      currentWorkflowStatus + " updates and move to: ", nextWorkflowStep.template);

    return Cart.update(currentCart._id, {
      $set: {
        "workflow.status": nextWorkflowStep.template
      },
      $addToSet: {
        "workflow.workflow": currentWorkflowStatus
      }
    });
  }

  // Condition Four
  // you got here through hard work, and processed the previous template
  // nice job. now start over with the next step.
  if (gotoNextWorkflowStep && statusExistsInWorkflow === true && templateProcessedinWorkflow === true) {
    Logger.info(
      "######## Condition Four #########: previously ran, doing nothing. : ",
      newWorkflowStatus
    );

    return true;
  }
};

const workflowRevertCartWorkflow = (newWorkflowStatus, userId) => {
  check(newWorkflowStatus, String);
  check(userId, String);

  const cart = Cart.findOne({
    userId
  });

  if (!cart || typeof cart.workflow !== "object") return false;
  if (typeof cart.workflow.workflow !== "object") return false;

  const { workflow } = cart.workflow;
  const resetToIndex = workflow.indexOf(newWorkflowStatus);
  if (!~resetToIndex) return false;
  const resetedWorkflow = workflow.slice(0, resetToIndex);
  return Cart.update(cart._id, {
    $set: {
      "workflow.status": newWorkflowStatus,
      "workflow.workflow": resetedWorkflow
    }
  });
};

const shippingUpdateShipmentQuotes = (cartId) => {
  check(cartId, String);

  if (!cartId) {
    return [];
  }

  let cart = Cart.findOne(cartId);

  if (cart) {
    if (!cart.shipping || cart.shipping.length === 0) {
      addAddresses(cart);
      cart = Cart.findOne(cartId);
    }
    const rates = Meteor.call("shipping/getShippingRates", cart);

    console.log(rates, "retes");

    updateShippingRecordByShop(cart, rates);
  }
};

export const createOrUpdateUserCart = (userId) => {
  check(userId, String);

  const account = Accounts.findOne({
    userId
  });
  const user = Meteor.users.findOne({
    _id: userId
  });

  if (account && user) {
    const cartId = cartCreateCart(userId, Random.id(), account.shopId);
    let cart  = Cart.findOne({
      _id: cartId
    });
    let selector;
    let update;

    // set default billing addr to cart
    if (cart && !cart.billing.length || !cart.billing[0].address && !Object.keys(cart.billing[0].address).length) {
      const billingAddr = getBillingDefAddr(account);
      if (billingAddr) {
        selector = {
          _id: cartId
        };
        update = {
          $addToSet: {
            billing: {
              address: billingAddr,
              shopId: account.shopId,
              currency: { userCurrency: "USD" }
            }
          }
        };

        Cart.update(selector, update);
        cart = Cart.findOne({ _id: cartId });
      }
    }

    // set default shipping addr to cart
    const shipping = getMagentoFreeShippingObject();
    selector = null;
    update = null;

    if (shipping && shipping.methods && shipping.methods.length) {
      let shippingMethodId = null;
      const shipMethod = find(shipping.methods, ({ name }) => name === "magento");
      if (shipMethod) {
        shippingMethodId = shipMethod._id;
      } else {
        shippingMethodId = shipping.methods[0]._id;
      }
      if (cart && !cart.shipping.length || !cart.shipping[0].address || !Object.keys(cart.shipping[0].address).length) {
        const shippingDefAddr = getShippingDefAddr(account);
        if (shippingMethodId && shippingDefAddr) {
          selector = {
            _id: cartId
          };
          update = {
            $addToSet: {
              shipping: {
                address: shippingDefAddr,
                shopId: account.shopId
              }
            },
            $set: {
              shipmentMethod: {
                _id: shippingMethodId,
                shopId: account.shopId
              }
            }
          };
          Cart.update(selector, update);
        }
      }
    }

    return Cart.findOne({ _id: cartId });
  }

  return false;
};

export const copyCartToOrder = (cartId, meteorUserId, isImportFromMagento = false) => {
  check(cartId, String);
  check(meteorUserId, String);
  check(isImportFromMagento, Boolean);

  const cart = Cart.findOne({ _id: cartId });
  const order = Object.assign({ isImportFromMagento }, cart);
  const sessionId = cart.sessionId;

  if (!order.items || order.items.length === 0) {
    const msg = "An error occurred saving the order. Missing cart items.";
    Logger.error(msg);
    return null;
  }

  order.cartId = cart._id;

  if (order.userId && !order.email) {
    const account = Accounts.findOne({ _id: order.userId });
    if (typeof account === "object" && account.emails) {
      for (const email of account.emails) {
        if (email.provides === "orders") {
          order.email = email.address;
        } else if (email.provides === "default") {
          order.email = email.address;
        }
      }
    }
  }

  delete order.createdAt;
  delete order.updatedAt;
  delete order.getCount;
  delete order.getShippingTotal;
  delete order.getSubTotal;
  delete order.getTaxTotal;
  delete order.getDiscounts;
  delete order.getTotal;
  delete order._id;

  if (Array.isArray(order.shipping) && order.shipping.length > 0) {
    if (order.shipping.length > 0) {
      const shippingRecords = [];

      order.shipping.map((shippingRecord) => {
        const billingRecord = order.billing.find(() => true);

        if (billingRecord) {
          shippingRecord.paymentId = billingRecord._id;
          shippingRecord.items = [];
          shippingRecord.items.packed = false;
          shippingRecord.items.shipped = false;
          shippingRecord.items.delivered = false;
          shippingRecord.workflow = { status: "new", workflow: ["coreOrderWorkflow/notStarted"] };
          shippingRecords.push(shippingRecord);
        }
      });
      order.shipping = shippingRecords;
    }
  } else {
    order.shipping = [];
  }

  const currentUser = Meteor.users.findOne({ _id: meteorUserId });
  let userCurrency = Reaction.getShopCurrency();
  let exchangeRate = "1.00";

  if (currentUser && currentUser.profile && currentUser.profile.currency) {
    userCurrency = currentUser.profile.currency;
  }

  if (userCurrency !== Reaction.getShopCurrency()) {
    const userExchangeRate = Meteor.call("shop/getCurrencyRates", userCurrency);

    if (typeof userExchangeRate === "number") {
      exchangeRate = userExchangeRate;
    } else {
      Logger.error("Failed to get currency exchange rates. Setting exchange rate to null.");
      exchangeRate = null;
    }
  }

  if (!order.billing[0].currency) {
    order.billing[0].currency = {
      userCurrency
    };
  }

  order.items = order.items.map(item => {
    item.shippingMethod = order.shipping[order.shipping.length - 1];
    item.workflow = {
      status: "new",
      workflow: ["coreOrderWorkflow/created"]
    };

    return item;
  });

  each(order.items, (item) => {
    const shippingRecord = order.shipping.find(() => true);

    if (shippingRecord) {
      if (shippingRecord.items) {
        shippingRecord.items.push({
          _id: item._id,
          productId: item.productId,
          shopId: item.shopId,
          variantId: item.variants._id
        });
      } else {
        shippingRecord.items = [
          {
            _id: item._id,
            productId: item.productId,
            shopId: item.shopId,
            variantId: item.variants._id
          }
        ];
      }
    }
  });

  order.billing[0].currency.exchangeRate = exchangeRate;
  order.workflow.status = "new";
  order.workflow.workflow = ["coreOrderWorkflow/created"];

  const orderId = Orders.insert(order);

  if (orderId) {
    Cart.remove({
      _id: order.cartId
    });

    const newCartExists = Cart.find({ userId: order.userId });

    if (newCartExists.count() === 0) {
      const lCartId = cartCreateCart(order.userId, sessionId);
      if (Roles.userIsInRole(currentUser, "anonymous", Reaction.getShopId())) {
        workflowPushCartWorkflow("coreCartWorkflow", "checkoutLogin", lCartId);
      } else {
        workflowPushCartWorkflow("coreCartWorkflow", "checkoutLogin", lCartId);
        workflowPushCartWorkflow("coreCartWorkflow", "checkoutAddressBook", lCartId);
        workflowPushCartWorkflow("coreCartWorkflow", "coreCheckoutShipping", lCartId);
      }
    }

    Logger.info("Transitioned cart " + cartId + " to order " + orderId);

    if (order.email) {
      Meteor.call("orders/sendNotification", Orders.findOne(orderId), (err) => {
        if (err) {
          Logger.error(err, `Error in orders/sendNotification for order ${orderId}`);
        }
      });
    }

    return orderId;
  }

  Logger.error("bad-request", "cart/copyCartToOrder: Invalid request");

  return false;
};

const cartSetShipmentAddress = (cartId, address, userId) => {
  check(cartId, String);
  check(userId, String);
  check(address, Reaction.Schemas.Address);

  const cart = Cart.findOne({
    _id: cartId,
    userId
  });

  if (!cart) {
    Logger.error(`Cart not found for user: ${userId} :: cartSetShipmentAddress`);
    return false;
  }

  let selector;
  let update;
  let updated = false;

  if (cart.shipping && cart.shipping.length > 0 && cart.items) {
    const shopIds = Object.keys(cart.getItemsByShop());

    shopIds.forEach((shopId) => {
      selector = {
        "_id": cartId,
        "shipping.shopId": shopId
      };

      update = {
        $set: {
          "shipping.$.address": address
        }
      };
      try {
        Cart.update(selector, update);
        updated = true;
      } catch (error) {
        Logger.error("An error occurred adding the address", error);
        return false;
      }
    });
  } else {
    if (!cart.items) {
      if (!cart.shipping) {
        selector = {
          _id: cartId
        };
        update = {
          $push: {
            shipping: {
              address,
              shopId: cart.shopId
            }
          }
        };

        try {
          Cart.update(selector, update);
          updated = true;
        } catch (error) {
          Logger.error(error);
          return false;
        }
      } else {
        selector = {
          "_id": cartId,
          "shipping.shopId": cart.shopId
        };
        update = {
          $set: {
            "shipping.$.address": address
          }
        };
      }
    } else {
      const shopIds = Object.keys(cart.getItemsByShop());
      shopIds.map((shopId) => {
        selector = {
          _id: cartId
        };
        update = {
          $addToSet: {
            shipping: {
              address,
              shopId
            }
          }
        };
      });
    }
  }
  if (!updated) {
    try {
      Cart.update(selector, update);
    } catch (error) {
      Logger.error(error);
      return false;
    }
  }

  shippingUpdateShipmentQuotes(cartId);

  if (typeof cart.workflow !== "object") {
    return false;
  }

  if (typeof cart.workflow.workflow === "object" &&
    cart.workflow.workflow.length < 2) {
    return false;
  }

  if (typeof cart.workflow.workflow === "object" &&
    cart.workflow.workflow.length > 2) {
    workflowRevertCartWorkflow("coreCheckoutShipping", userId);
  }

  return true;
};

const cartSetPaymentAddress = (cartId, address, userId, shopId = Reaction.getShopId()) => {
  check(cartId, String);
  check(userId, String);
  check(shopId, String);
  check(address, Reaction.Schemas.Address);

  const cart = Cart.findOne({
    _id: cartId,
    userId,
  });

  if (!cart) {
    Logger.error(`Cart not found for user: ${userId} :: cartSetPaymentAddress`);
    return false;
  }

  let selector;
  let update;

  if (Array.isArray(cart.billing) && cart.billing.length > 0) {
    selector = {
      "_id": cartId,
      "billing._id": cart.billing[0]._id
    };
    update = {
      $set: {
        "billing.$.address": address,
        "billing.$.shopId": shopId,
      }
    };
  } else {
    selector = {
      _id: cartId
    };
    update = {
      $addToSet: {
        billing: {
          address,
          shopId,
        }
      }
    };
  }

  return Cart.update(selector, update);
};

export const cartAddToCart = (userId, productId, variantId, itemQty, additionalOptions) => {
  check(userId, String);
  check(productId, String);
  check(variantId, String);
  check(itemQty, Number);
  check(additionalOptions, Object);

  // Copy additionalOptions into an options object to use througout the method
  const options = {
    overwriteExistingMetafields: false, // Allows updating of metafields on quantity change
    metafields: undefined, // Array of MetaFields to set on the CartItem
    ...additionalOptions || {}
  };

  const cart = Cart.findOne({ userId });
  if (!cart) {
    Logger.error(`Cart not found for user: ${userId} :: cartAddToCart`);
    return false;
  }
  // With the flattened model we no longer need to work directly with the
  // products. But product still could be necessary for a `quantityProcessing`
  // TODO: need to understand: do we really need product inside
  // `quantityProcessing`?
  let product;
  let variant;

  Products.find({ _id: { $in: [
    productId,
    variantId
  ] } }).forEach(doc => {
    if (doc.type === "simple") {
      product = doc;
    } else {
      variant = doc;
    }
  });

  if (!product) {
    Logger.error(`Product: ${productId} was not found in database`);
    return false;
  }

  if (!variant) {
    Logger.error(`Product variant: ${variantId} was not found in database`);
    return false;
  }

  // performs calculations admissibility of adding product to cart
  const quantity = quantityProcessing(product, variant, itemQty);
  // performs search of variant inside cart
  const cartVariantExists = cart.items && cart.items
    .some(item => item.variants._id === variantId);

  if (cartVariantExists) {
    let modifier = {};

    if (options.overwriteExistingMetafields) {
      modifier = {
        $set: {
          "items.$.metafields": options.metafields
        }
      };
    }

    return Cart.update({
      "_id": cart._id,
      "items.product._id": productId,
      "items.variants._id": variantId
    }, {
      $inc: {
        "items.$.quantity": quantity
      },
      ...modifier
    }, (error, result) => {
      if (error) {
        Logger.error("error adding to cart", Cart.simpleSchema().namedContext().invalidKeys());
        return error;
      }
      shippingUpdateShipmentQuotes(cart._id);
      workflowRevertCartWorkflow("coreCheckoutShipping", cart.userId);
      cartResetShipmentMethod(cart._id, cart.userId);

      return result;
    });
  }

  const immediateAncestors = variant.ancestors.filter((ancestor) => ancestor !== product._id);
  const immediateAncestor = Products.findOne({ _id: immediateAncestors[0] });
  let parcel = null;

  if (immediateAncestor) {
    if (immediateAncestor.weight || immediateAncestor.height || immediateAncestor.width || immediateAncestor.length) {
      parcel = { weight: immediateAncestor.weight, height: immediateAncestor.height, width: immediateAncestor.width, length: immediateAncestor.length };
    }
  }

  if (variant.weight || variant.height || variant.width || variant.length) {
    parcel = { weight: variant.weight, height: variant.height, width: variant.width, length: variant.length };
  }

  if (!product.createdAt) {
    let createdAt = product.metafields.find(field => field.key === "created_at");

    if (!createdAt) {
      createdAt = {
        value: new Date()
      };
    }

    product.createdAt = createdAt.value;
  }

  return Cart.update({
    _id: cart._id
  }, {
    $addToSet: {
      items: {
        _id: Random.id(),
        shopId: product.shopId,
        productId,
        quantity,
        product,
        variants: variant,
        metafields: options.metafields,
        title: product.title,
        type: product.type,
        parcel
      }
    }
  }, (error, result) => {
    if (error) {
      Logger.error(error);
      return error;
    }

    Meteor.call("shipping/updateShipmentQuotes", cart._id);
    Meteor.call("workflow/revertCartWorkflow", "coreCheckoutShipping");
    cartResetShipmentMethod(cart._id, cart.userId);

    Logger.info(`cart: add variant ${variantId} to cartId ${cart._id}`);

    return result;
  });
};

const cartResetShipmentMethod = (cartId, userId) => {
  check(cartId, String);
  check(userId, String);

  const cart = Cart.findOne({
    _id: cartId,
    userId
  });
  if (!cart) {
    Logger.error(`Cart not found for user: ${userId}`);
    return false;
  }

  return Cart.update({ _id: cartId }, {
    $unset: { "shipping.0.shipmentMethod": "" }
  });
};

const shippingGetShippingRates = cart => {
  check(cart, CartSchema);

  const rates = [];
  const retrialTargets = [];

  console.log(rates, "rates test");
  console.log("get rates");

  Hooks.Events.run("onGetShippingRates", [rates, retrialTargets], cart);

  // Try once more.
  if (retrialTargets.length > 0) {
    Hooks.Events.run("onGetShippingRates", [rates, retrialTargets], cart);

    if (retrialTargets.length > 0) {
      Logger.warn("Failed to get shipping methods from these packages:", retrialTargets);
    }
  }

  console.log(rates, "rates");

  let newRates;
  const didEveryShippingProviderFail = rates.every((shippingMethod) => {
    return shippingMethod.requestStatus && shippingMethod.requestStatus === "error";
  });

  if (didEveryShippingProviderFail) {
    newRates = [{
      requestStatus: "error",
      shippingProvider: "all",
      message: "All requests for shipping methods failed."
    }];
  } else {
    newRates = rates.filter((shippingMethod) => {
      return !(shippingMethod.requestStatus) || shippingMethod.requestStatus !== "error";
    });
  }

  Logger.info("getShippingRates returning rates", rates);

  return newRates;
};

const workflowPushOrderWorkflow = (workflow, status, orderId) => {
  check(workflow, String);
  check(status, String);
  check(orderId, String);

  const order = Orders.findOne({
    _id: orderId
  });

  if (!order) {
    return false;
  }

  const workflowStatus = `${workflow}/${status}`;

  const result = Orders.update({
    _id: order._id
  }, {
    $set: {
      "workflow.status": `${workflow}/${status}`
    },
    $addToSet: {
      "workflow.workflow": workflowStatus
    }
  });

  return result;
};

const ordersShipmentShipped = (orderId, shipment) => {
  check(orderId, String);
  check(shipment, Object);

  const order = Orders.findOne({
    _id: orderId
  });

  if (!order) {
    return false;
  }

  let completedItemsResult;
  let completedOrderResult;

  const itemIds = shipment.items.map((item) => {
    return item._id;
  });

  Hooks.Events.run("onOrderShipmentShipped", order, itemIds);
  const workflowResult = workflowPushItemWorkflow("coreOrderItemWorkflow/shipped", order._id);

  if (workflowResult === 1) {
    // Move to completed status for items
    completedItemsResult = workflowPushItemWorkflow("coreOrderItemWorkflow/completed", order._id);

    if (completedItemsResult === 1) {
      // Then try to mark order as completed.
      completedOrderResult = workflowPushOrderWorkflow("coreOrderWorkflow", "completed", order._id);
    }
  }

  Orders.update({
    "_id": order._id,
    "shipping._id": shipment._id
  }, {
    $set: {
      "shipping.$.workflow.status": "coreOrderWorkflow/shipped"
    }, $push: {
      "shipping.$.workflow.workflow": "coreOrderWorkflow/shipped"
    }
  });

  return {
    workflowResult,
    completedItems: completedItemsResult,
    completedOrder: completedOrderResult
  };
};

export const ordersUpdateShipmentTracking = (orderId, tracking) => {
  check(orderId, String);
  check(tracking, String);

  const order = Orders.findOne({ _id: orderId });

  return Orders.update({
    "_id": orderId,
    "shipping._id": { $in: map(order.shipping, ({ _id }) => _id) }
  }, {
    $set: {
      ["shipping.$.tracking"]: tracking
    }
  });
};

const workflowPushItemWorkflow = (status, orderId) => {
  check(status, String);
  check(orderId, String);

  const order = Orders.findOne({
    _id: orderId
  });

  if (!order) {
    return false;
  }

  const items = order.items.map((item) => {
    if (item.workflow.status !== "new") {
      const workflows = item.workflow.workflow || [];

      workflows.push(status);
      item.workflow.workflow = uniq(workflows);
    }

    item.workflow.status = status;
    return item;
  });

  const result = Orders.update({
    _id: order._id
  }, {
    $set: {
      items
    }
  });

  return result;
};

const ordersShipmentPacked = (orderId) => {
  check(orderId, String);

  const order = Orders.findOne({
    _id: orderId
  });

  if (!order) {
    return false;
  }

  const result = workflowPushItemWorkflow("coreOrderItemWorkflow/packed", order._id);

  if (result) {
    const shipmentIds = map(order.shipping, o => o._id);
    return Orders.update({
      "_id": order._id,
      "shipping._id": { in: shipmentIds }
    }, {
      $set: {
        "shipping.$.workflow.status": "coreOrderWorkflow/packed"
      }, $push: {
        "shipping.$.workflow.workflow": "coreOrderWorkflow/packed"
      }
    });
  }

  return result;
};

const ordersApprovePayment = (orderId) => {
  check(orderId, String);

  const order = Orders.findOne({
    _id: orderId
  });

  if (!order) {
    return false;
  }

  const invoice = orderCreditMethod(order).invoice;
  const shopId = Reaction.getShopId();
  const subTotal = invoice.subtotal;
  const shipping = invoice.shipping;
  const taxes = invoice.taxes;
  const discount = invoice.discounts;
  const discountTotal = Math.max(0, subTotal - discount); // ensure no discounting below 0.
  const total = accounting.toFixed(Number(discountTotal) + Number(shipping) + Number(taxes), 2);


  return Orders.update({
    "_id": order._id,
    "billing.shopId": shopId,
    "billing.paymentMethod.method": "credit"
  }, {
    $set: {
      "billing.$.paymentMethod.amount": total,
      "billing.$.paymentMethod.status": "approved",
      "billing.$.paymentMethod.mode": "capture",
      "billing.$.invoice.discounts": discount,
      "billing.$.invoice.total": Number(total)
    }
  });
};

export const correctStatus = (orderId, status) => {
  check(status, String);
  check(orderId, String);

  switch (status) {
    /* coreOrderWorkflow/canceled */
    case "canceled":
    case "cancel_ogone":
    case "closed":
    case "decline_ogone":
    case "fraud": {
      workflowPushOrderWorkflow("coreOrderWorkflow", "processing", orderId);
      ordersShipmentPacked(orderId);
      workflowPushOrderWorkflow("coreOrderWorkflow", "completed", orderId);
      workflowPushOrderWorkflow("coreOrderWorkflow", "canceled", orderId);
      break;
    }
    /* coreOrderWorkflow/completed */
    case "complete": {
      const order = Orders.findOne({
        _id: orderId
      });

      if (order) {
        workflowPushOrderWorkflow("coreOrderWorkflow", "processing", orderId);
        ordersApprovePayment(orderId);
        ordersShipmentPacked(orderId);
        each(order.shipping, o => { ordersShipmentShipped(orderId, o); });
        workflowPushOrderWorkflow("coreOrderWorkflow", "completed", orderId);
      }
      break;
    }
    /* coreOrderWorkflow/processing */
    case "pending":
    case "holded":
    case "payment_review":
    case "paypal_canceled_reversal":
    case "paypal_reversed":
    case "pending_ogone":
    case "pending_payment":
    case "pending_paypal":
    case "processed_ogone":
    case "processing":
    case "processing_ogone": {
      workflowPushOrderWorkflow("coreOrderWorkflow", "processing", orderId);
      break;
    }
    /* coreOrderWorkflow/picked */
    /* coreOrderWorkflow/packed */
    /* coreOrderWorkflow/shipped */
    /* coreOrderWorkflow/labeled */
    // case "waiting_authorozation": break;
    default: break;
  }
};

const updateQuantityMethodToUnlim = () => {
  Products.rawCollection().updateMany({
    type: "variant",
  }, {
    $set: {
      inventoryQuantity: 100
    }
  });
};

const updateProductSearchCollection = () => {
  ProductSearch.rawCollection().drop();
  ProductSearch.remove({});
  Products.find({
    isGroupCombination: { $exists: false },
    groupId: { $exists: false },
    type: "simple"
  }).map(product => {
    ProductSearch.insert(product);
  });
};

const getGeneratedProductCombination = (productId, variantId, optionCombinations, cVariant) => {
  let generatedProductCombination = null;

  if (cVariant && optionCombinations.length) {
    const options = Products.find({ ancestors: productId, groupId: { $exists: true } }).fetch();

    if (options.length) {
      let partPrice = 0;
      let partSku = "";

      each(optionCombinations, oc => {
        const findOption = find(options, o => o.optionId === oc);

        if (!findOption) {
          Logger.error(`Option ${oc} not found for variant: ${variantId}`);
          throw new Meteor.Error(
            "invalid-parameter",
            `not found option: ${oc} - (server error)`
          );
        }

        const tPrice = findOption.optionDiff || findOption.optionPrice || 0;
        const tSku = findOption.optionSku || "";
        partPrice += isNaN(+(+tPrice).toFixed(2)) ? +tPrice : +(+tPrice).toFixed(2);

        if (tSku && tSku !== "") {
          partSku += `-${tSku}`;
        }
      });

      const sku = `${cVariant.sku}${partSku}`;
      const price = +(cVariant.price + partPrice).toFixed(2);

      generatedProductCombination = Products.findOne({
        ancestors: { $all: [productId, variantId] },
        isGroupCombination: true,
        sku,
        price
      });

      if (!generatedProductCombination) {
        generatedProductCombination = {
          ...cVariant,
          _id: Random.id(),
          ancestors: [productId, variantId],
          isGroupCombination: true,
          optionCombinations: [],
          sku,
          price
        };
        Products.insert(generatedProductCombination, {
          validate: false
        });
      }
    }
  } else if (!cVariant.sku) {
    cVariant.sku = "";
  }

  return generatedProductCombination || cVariant;
};

const changeOptionsOfProduct = async (productId, variantId, optionCombinations = []) => {
  check(productId, String);
  check(variantId, String);
  check(optionCombinations, Array);

  if (!Roles.userIsInRole(this.userId, ['owner','admin'])) {
    throw new Meteor.Error("403", "Forbidden");
  }

  const start = Date.now() / 1000;

  try {
    let cVariant = Products.findOne({
      _id: variantId,
      ancestors: productId,
      groupId: { $exists: false }
    });
    const getVariantsFromCombination = (v) => {
      if (v.isGroupCombination) {
        const findV = Products.findOne({
          _id: { $in: v.ancestors },
          type: "variant",
        });
        return getVariantsFromCombination(findV);
      }
      return v;
    };
    cVariant = getVariantsFromCombination(cVariant);
    const returnData = await getGeneratedProductCombination(productId, variantId, optionCombinations, cVariant);

    Logger.info({}, `GENERATE TIME = ${Date.now() / 1000 - start}`);

    return returnData;
  } catch (err) {
    throw new Meteor.Error(err);
  }
};

const addToCartCustomMethod = (productId, variantId, itemQty, additionalOptions, optionCombinations = {}, self = {}) => {
  check(productId, String);
  check(variantId, String);
  check(itemQty, Match.Optional(Number));
  check(additionalOptions, Match.Optional(Object));
  check(optionCombinations, Array);
  
  if (!Roles.userIsInRole(this.userId, ['owner','admin'])) {
    throw new Meteor.Error("403", "Forbidden");
  }

  const cVariant = Products.findOne({ _id: variantId, ancestors: productId, groupId: { $exists: false } });
  const generatedProductCombination = getGeneratedProductCombination(productId, variantId, optionCombinations, cVariant);
  const options = {
    overwriteExistingMetafields: false,
    metafields: undefined,
    ...additionalOptions || {}
  };
  const cart = Cart.findOne({ userId: self.userId });

  if (!cart) {
    Logger.error(`Cart not found for user: ${self.userId}`);
    throw new Meteor.Error(
      "invalid-parameter",
      "Cart not found for user with such id"
    );
  }

  const product = Products.findOne({ _id: productId });
  const variant = generatedProductCombination || cVariant;

  if (!product) {
    Logger.warn(`Product: ${productId} was not found in database`);
    throw new Meteor.Error(
      "not-found",
      "Product with such id was not found"
    );
  }

  if (!variant) {
    Logger.warn(`Product variant: ${variantId} was not found in database`);
    throw new Meteor.Error(
      "not-found",
      "ProductVariant with such id was not found"
    );
  }

  const quantity = quantityProcessing(product, variant, itemQty);
  const cartVariantExists = cart.items && cart.items
    .some(item => item.variants._id === variantId);

  if (cartVariantExists) {
    let modifier = {};

    if (options.overwriteExistingMetafields && options.metafields && Array.isArray(options.metafields)) {
      let nextStep = true;

      each(options.metafields, o => {
        if (o.key && o.value) {
          nextStep = true;
        }
      });

      if (nextStep) {
        modifier = {
          $set: {
            "items.$.metafields": options.metafields
          }
        };
      }
    }

    let updateResult;

    try {
      updateResult = Cart.update({
        "_id": cart._id,
        "items.product._id": productId,
        "items.variants._id": variant._id
      }, {
        $inc: {
          "items.$.quantity": quantity
        },
        ...modifier
      });
    } catch (error) {
      Logger.error(error, "Error adding to cart.");
      Logger.error({
        message: "Error adding to cart. Invalid keys:",
        info: Cart.simpleSchema().namedContext().invalidKeys()
      }, "Error adding to cart.");
      throw error;
    }

    Meteor.call("shipping/updateShipmentQuotes", cart._id);
    Meteor.call("workflow/revertCartWorkflow", "coreCheckoutShipping");
    Meteor.call("cart/resetShipmentMethod", cart._id);

    Logger.info(`cart: increment variant ${variant._id} quantity by ${quantity}`);

    return updateResult;
  }

  const immediateAncestors = variant.ancestors.filter((ancestor) => ancestor !== product._id);
  const immediateAncestor = Products.findOne({ _id: immediateAncestors[0] });
  let parcel = null;

  if (immediateAncestor) {
    if (immediateAncestor.weight || immediateAncestor.height || immediateAncestor.width || immediateAncestor.length) {
      parcel = { weight: immediateAncestor.weight, height: immediateAncestor.height, width: immediateAncestor.width, length: immediateAncestor.length };
    }
  }

  if (variant.weight || variant.height || variant.width || variant.length) {
    parcel = { weight: variant.weight, height: variant.height, width: variant.width, length: variant.length };
  }

  if (!product.createdAt) {
    let createdAt = product.metafields.find(field => field.key === "created_at");
    if (!createdAt) {
      createdAt = {
        value: new Date()
      };
    }
    product.createdAt = createdAt.value;
  }

  let updateResult;

  try {
    updateResult = Cart.update({
      _id: cart._id
    }, {
      $addToSet: {
        items: {
          _id: Random.id(),
          shopId: product.shopId,
          productId,
          quantity,
          product,
          variants: variant,
          metafields: [],
          title: product.title,
          type: product.type,
          parcel
        }
      }
    });
  } catch (error) {
    Logger.error("Error adding to cart.", error);
    Logger.error(
      "Error adding to cart. Invalid keys:",
      Cart.simpleSchema().namedContext().invalidKeys()
    );
    throw error;
  }

  Meteor.call("shipping/updateShipmentQuotes", cart._id);
  Meteor.call("workflow/revertCartWorkflow", "coreCheckoutShipping");
  Meteor.call("cart/resetShipmentMethod", cart._id);

  Logger.info(`cart: add variant ${variant._id} to cartId ${cart._id}`);

  return updateResult;
};
