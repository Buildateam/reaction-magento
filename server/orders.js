/* eslint no-unused-vars:0 */ /* eslint comma-dangle:0 */ /* eslint quote-props:0 */
import _ from "lodash";
import Fiber from "fibers";
import async from "async";
import { Random } from "meteor/random";
import { Meteor } from "meteor/meteor";
import find from "lodash/find";
import filter from "lodash/filter";
import findIndex from "lodash/findIndex";
import map from "lodash/map";
import each from "lodash/each";
import { Reaction } from "/server/api";
import { Orders, Accounts, Products, Cart, Packages, OrderSearch } from "/lib/collections";
import { Logger } from "/server/api";
import { ORDER_STATUSES } from "./magentoConsts";
import { 
  getProductAndVariantIdFromMagentoItemId,
  addAddrToCustomer,
  workflowPushCartWorkflow,
  copyCartToOrder,
  cartAddToCart,
  correctStatus,
  ordersUpdateShipmentTracking,
  createOrUpdateUserCart } from "./meteorMethods";

let emptyDataCounter = 0;

const loadOrder = (data = {}, connection, next) => {
  const magentoOrderId = data.order_id;

  if (!magentoOrderId || connection.getOrdersKey(magentoOrderId)) {
    return next();
  }

  const parseOrderFullData  = (err, res) => {
    if (res && (res.customer_id || (res.customer_email && res.customer_email !== "")) && res.items && res.items.length) {
      Fiber((magentoOrderId) => {
        let shipmentIncId = null;
        let account = null;
        const findCondition = {
          $or: []
        };

        if (res.customer_id) {
          const orderUserId = res.customer_id.toString();
          findCondition.$or.push({ metafields: { $elemMatch: { key: "customer_id", value: `${orderUserId}` } } });
          findCondition.$or.push({ metafields: { $elemMatch: { key: "id", value: `${orderUserId}` } } });
        }

        if (res.customer_email && res.customer_email !== "") {
          findCondition.$or.push({ "emails.address": res.customer_email });
        }

        if (findCondition.$or.length) {
          account = Accounts.findOne(findCondition);
        }

        if (account) {
          if (account.userId) {
            const { shipping_address, billing_address, items, payment } = res;
            let shipAddrs = [];
            let billingAddrs = [];
            let shippingAddresses = [];
            let tPayment = [];
            let billingAddresses = [];

            if (Array.isArray(shipping_address) && shipping_address.length) {
              shipAddrs = shipping_address;
            } else if (typeof shipping_address === "object" && Object.keys(shipping_address).length) {
              shipAddrs = [shipping_address];
            }

            if (Array.isArray(billing_address) && billing_address.length) {
              billingAddrs = billing_address;
            } else if (typeof billing_address === "object" && Object.keys(billing_address).length) {
              billingAddrs = [billing_address];
            }

            if (Array.isArray(payment) && payment.length) {
              tPayment = payment;
            } else {
              tPayment = [payment];
            }

            const cbToAddr = item => {
              if (!item.street || item.street === "") {
                return null;
              }
              const resCb = ({
                _id: Random.id(),
                fullName: `${item.firstname || ""} ${item.lastname || ""}`.trim(),
                address1: item.street,
                city: item.city,
                phone: item.telephone || item.fax || "0000",
                region: item.region && item.region !== "" ? item.region : item.city,
                postal: item.postcode,
                country: item.country_id,
                isCommercial: false,
                isBillingDefault: false,
                isShippingDefault: false,
                failedValidation: false
              });

              if (item.company && item.company !== "") {
                resCb.company = item.company;
                resCb.isCommercial = true;
              }

              if (!resCb.fullName || resCb.fullName === "" || !item.firstname && !item.lastname) {
                resCb.fullName = "undefined";
              }

              return resCb;
            };

            if (shipAddrs && shipAddrs.length) {
              if (res.shipping_address_id && res.shipping_address_id !== "") {
                shipmentIncId = res.shipping_address_id;
              }

              shippingAddresses = filter(map(shipAddrs, cbToAddr), o => !!o);
              if (shippingAddresses.length) {
                shippingAddresses[0].isShippingDefault = true;
              }
            }

            if (billingAddrs && billingAddrs.length) {
              billingAddresses = filter(map(billingAddrs, cbToAddr), o => !!o);

              if (billingAddresses.length) {
                billingAddresses[0].isBillingDefault = true;
              }
            }

            const tAddresses = [...shippingAddresses, ...billingAddresses];
            const addresses = [];

            each(tAddresses, tAddr => {
              const tIndex = findIndex(addresses, accAddr => {
                const props = ["city", "region", "postal", "address1", "country"];

                for (let i = 0; i < props.length; i += 1) {
                  if (
                    !accAddr[props[i]] && tAddr[props[i]] ||
                    accAddr[props[i]] && !tAddr[props[i]] ||
                    accAddr[props[i]] === null && tAddr[props[i]] !== null ||
                    accAddr[props[i]] !== null && tAddr[props[i]] === null
                  ) {
                    return false;
                  }

                  if (accAddr[props[i]] && tAddr[props[i]] &&
                    accAddr[props[i]].toLowerCase() !== tAddr[props[i]].toLowerCase()
                  ) {
                    return false;
                  }
                }

                return true;
              });

              if (tIndex !== -1) {
                if (tAddr.isBillingDefault) {
                  for (let i = 0; i < addresses.length; i += 1) {
                    addresses[i].isBillingDefault = false;
                  }

                  addresses[tIndex].isBillingDefault = tAddr.isBillingDefault;
                }

                if (tAddr.isShippingDefault) {
                  for (let i = 0; i < addresses.length; i += 1) {
                    addresses[i].isShippingDefault = false;
                  }

                  addresses[tIndex].isShippingDefault = tAddr.isShippingDefault;
                }
              } else {
                addresses.push(tAddr);
              }
            });

            if (addresses && addresses.length) {
              if (!addAddrToCustomer(account, addresses)) {
                Logger.error({
                  addr: addresses,
                  shipping_address,
                  billing_address,
                  shippingAddresses: shippingAddresses.length,
                  billingAddresses: billingAddresses.length,
                  accountId: account._id,
                }, "NOT UPDATE ADDR TO ACCOUNT");
              } else {
                account = Accounts.findOne({ _id: account._id });
              }
            }

            let cart = createOrUpdateUserCart(account.userId);

            if (cart) {
              each(items, item => {
                const itemInfo = getProductAndVariantIdFromMagentoItemId(`${item.product_id}`, item.sku);

                if (itemInfo) {
                  const quantity = +(item.qty_invoiced > 0 ? item.qty_invoiced : (item.qty_ordered || 1));
                  const { productId, variantId } = itemInfo;
                  cartAddToCart(account.userId, productId, variantId, quantity, {});
                }
              });

              // @TODO - FAKE CART DATA
              const cardData = {
                name: "ARIANA OLIVER",
                number: "4539294058081853",
                expireMonth: "10",
                expireYear: "19",
                cvv2: "314",
                type: "Visa"
              };
              let amountOrder = 0;

              each(tPayment, o => {
                amountOrder += (o && o.amount_ordered ? +o.amount_ordered : 0) + (o && o.base_shipping_amount ? +o.base_shipping_amount : 0);
              });

              const paymentData = {
                total: `${amountOrder}`,
                currency: "USD"
              };
              const transactionId = Random.id();
              const transaction = {
                saved: true,
                status: "created",
                currency: paymentData.currency,
                amount: paymentData.total,
                riskLevel: "normal",
                transactionId,
                response: {
                  amount: paymentData.total,
                  transactionId,
                  currency: paymentData.currency
                }
              };
              const packageData = Packages.findOne({
                name: "example-paymentmethod",
                shopId: Reaction.getShopId()
              });
              const paymentMethod = {
                processor: "Example",
                paymentPackageId: packageData._id,
                paymentSettingsKey: packageData.settings.apiKey && packageData.settings.apiKey.length ? packageData.settings.apiKey : packageData.registry[0].template,
                storedCard: cardData.number,
                method: "credit",
                transactionId: transaction.transactionId,
                riskLevel: transaction.riskLevel,
                currency: transaction.currency,
                amount: transaction.amount,
                status: transaction.status,
                mode: "authorize",
                createdAt: new Date(),
                transactions: []
              };

              paymentMethod.transactions.push(transaction.response);

              const cartId = cart._id;
              cart = Cart.findOne({ _id: cartId });
              const invoice = {
                shipping: cart.getShippingTotal(),
                subtotal: cart.getSubTotal(),
                taxes: cart.getTaxTotal(),
                discounts: cart.getDiscounts(),
                total: cart.getTotal()
              };

              let selector;
              let update;

              if (cart.billing) {
                selector = {
                  "_id": cartId,
                  "billing._id": cart.billing[0]._id
                };
                update = {
                  $set: {
                    "billing.$.paymentMethod": paymentMethod,
                    "billing.$.invoice": invoice
                  }
                };
              } else {
                selector = {
                  _id: cartId
                };
                update = {
                  $addToSet: {
                    "billing.paymentMethod": paymentMethod,
                    "billing.invoice": invoice
                  }
                };
              }

              Cart.update(selector, update);

              workflowPushCartWorkflow("coreCartWorkflow", "paymentSubmitted", cartId);
              const orderId = copyCartToOrder(cartId, account.userId, true);

              if (orderId) {
                const filters = { order_id: magentoOrderId };
                connection.salesOrderShipment.list({ filters }, Meteor.bindEnvironment((errShip, shipData) => {
                  const shipmentIncrementId = _.get(shipData, [0, "increment_id"]);

                  if (errShip || !shipmentIncrementId) {
                    Logger.error({ errShip, shipmentIncId }, "ERROR SHIP TRACKING");
                  }

                  if (shipmentIncrementId) {
                    connection.salesOrderShipment.info({ shipmentIncrementId }, Meteor.bindEnvironment((errShipInfo, shipInfoData) => {
                      if (errShipInfo || !shipInfoData) {
                        Logger.error({ errShipInfo, shipmentIncrementId }, "ERROR SHIP TRACKING");
                      }
                      if (shipInfoData) {
                        const { tracks } = shipInfoData;
                        let number = null;
                        if (Array.isArray(tracks) && tracks.length) {
                          number = tracks[0].number;
                        } else if (Object.keys(tracks).length && tracks.number) {
                          number = tracks.number;
                        }
                        if (number) {
                          ordersUpdateShipmentTracking(orderId, number);
                        }
                      }
                    }));
                  }
                }));

                correctStatus(orderId, res.status);

                Logger.info({
                  orderId
                }, "ORDER IMPORT SUCCESS");
              }
            } else {
              Logger.error({
                message: `Cart not found for userId(${account.userId})`
              });
            }
          } else {
            Logger.error({
              message: `Account not found property userId _id(${account._id})`
            });
          }
        } else {
          Logger.error({}, `USER NOT FOUND - ID = ${res.customer_id} | email = ${res.customer_email}`);
        }

        return next();
      }).run(magentoOrderId);
    } else {
      return next();
    }
  };

  connection.salesOrder.info({  OrderId: magentoOrderId, orderIncrementId: data.increment_id }, parseOrderFullData);
};

const chunkAsyncHelper = async.queue(({ data, connection }, cb) => {
  Fiber(() => {
    loadOrder(data, connection, cb);
  }).run();
}, 1);

const loadOrdersChunk = (chunk = [], connection, next) => {
  if (!chunk.length) {
    return next(null);
  }

  let callbackCalls = chunk.length;

  chunk.forEach(data => {
    chunkAsyncHelper.push(
      { data, connection },
      (err) => {
        if (err) {
          Logger.error(err, "loadOrdersChunk");
        }
        callbackCalls -= 1;
        if (callbackCalls <= 0) {
          Logger.info({
            chunkLen: chunk.length,
            callbackCalls
          }, "Next chunk call");
          next();
        }
      }
    );
  });
};

const dropCollection = () => {
  const rawCollection = Orders.rawCollection && Orders.rawCollection();

  if (rawCollection) {
    return rawCollection.drop();
  }

  OrderSearch.rawCollection().drop();
  OrderSearch.remove({});
  Orders.remove({});
};

/* eslint camelcase:0 */
const fetchOrdersChunk = (connection, skip, limit, next) => {
  const filters = {
    entity_id: { from: skip, to: (skip + limit) },
    // only orders in processing status
    status: _.values(ORDER_STATUSES.PROCESSING),
  };

  if (emptyDataCounter <= 10000) {
    connection.salesOrder.list({ filters }, (err, res) => {
      if (err) {
        Logger.error(err, "fetchOrdersChunk");
      }

      if (!res || Array.isArray(res) && !res.length) {
        emptyDataCounter += 1;
        Logger.info({
          filters,
          result: res,
          emptyDataCounter
        });
      } else if (emptyDataCounter !== 0) {
        Logger.info("skip emptyDataCounter to 0");
        emptyDataCounter = 0;
      }

      return next(null, res || []);
    });
  }
};

export const exportOrders = (connection, next) => {
  Logger.info({}, "IMPORT ORDERS START");

  dropCollection();

  let skip = 0;
  const limit = 1000;
  const processChunk = (e, chunk) => {
    if (e) {
      Logger.error(e);
      return next(e);
    }
    
    Fiber(() => {
      loadOrdersChunk(chunk, connection, (err) => {
        if (err) {
          Logger.error(err, "loadOrdersChunk");
        }
        skip += limit + 1;
        Logger.info({
          skip,
          limit
        }, "ORDER_FETCH");
        return fetchOrdersChunk(connection, skip, limit, processChunk);
      });
    }).run();
  };
  fetchOrdersChunk(connection, skip, limit, processChunk);
};
/* eslint quote-props:0 */
