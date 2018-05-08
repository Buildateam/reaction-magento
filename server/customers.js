import { Meteor } from "meteor/meteor";
import { Accounts as MeteorAccounts } from "meteor/accounts-base";
import { Accounts } from "/lib/collections";
import { Logger } from "/server/api";
import { getMetafields, valueOrNone } from "./helpers";
import Fiber from "fibers";
import _ from "lodash";
import { updateUserProfile, createOrUpdateUserCart } from "./meteorMethods";

const loadCustomer = (data = {}, connection, next) => {
  const magentoCustmerId = data.customer_id;
  
  Logger.info({ magentoCustmerId }, "loadCustomer");

  if (!magentoCustmerId || connection.getCustomersKey(magentoCustmerId)) {
    return next();
  }

  const parseAddressAndData = (err, res) => {
    Fiber(() => {
      const addressBook = _.map(res || [], (address) => {
        const fullName = (`${address.firstname} ${address.lastname}`).trim();

        return {
          fullName: valueOrNone(fullName),
          address1: valueOrNone(address.street),
          city: valueOrNone(address.city),
          phone: valueOrNone(address.telephone),
          region: valueOrNone(address.region),
          postal: valueOrNone(address.postcode),
          country: valueOrNone(address.country_id),
          isCommercial: false,
          isBillingDefault: Boolean(address.is_default_billing),
          isShippingDefault: Boolean(address.is_default_shipping)
          // metafields: getMetafields(address)
        };
      });

      const fullName = (`${data.firstname} ${data.lastname}`).trim();
      const metafields = getMetafields(_.omit(data, [/* "password_hash" */]));

      const profile = {
        invited: true,
        name: fullName,
        username: fullName
      };

      if (addressBook.length) {
        profile.addressBook = addressBook;
      }

      const email = data.email;
      const name = fullName;

      const userByEmail = MeteorAccounts.findUserByEmail(email);
      if (userByEmail) {
        const mongoCustomerId = userByEmail._id;
        connection.setCustomersKey(magentoCustmerId, mongoCustomerId);
        if (!updateUserProfile(userByEmail)) {
          Logger.error({
            message: `not update profile by email(${email})`
          }, "IMPORT CUSTOMER ERROR : UPDATE");
        }
        createOrUpdateUserCart(userByEmail._id);
        return next();
      }

      try {
        const mongoCustomerId = MeteorAccounts.createUser({ profile, email, name });
        if (profile.addressBook) {
          Accounts.update(mongoCustomerId, { $set: { metafields, "profile.addressBook": profile.addressBook } });
        }
        connection.setCustomersKey(magentoCustmerId, mongoCustomerId);
        const tUser = MeteorAccounts.findUserByEmail(email);
        if (!updateUserProfile(tUser)) {
          Logger.error({
            message: `not update profile by email(${email})`
          }, "IMPORT CUSTOMER ERROR : CREATE");
        }
        createOrUpdateUserCart(tUser._id);
        return next();
      } catch (e) {
        if (Meteor.isDevelopment) {
          throw e;
        }

        next(e);
      }
    }).run();
  };

  connection.customerAddress.list({ customerId: magentoCustmerId }, parseAddressAndData);
};

const loadCustomersChunk = (chunk = [], connection, next) => {
  const customers = chunk;

  const processNextCustomer = () => {
    if (!customers.length) {
      return next();
    }

    const data = customers.pop();

    loadCustomer(data, connection, (err) => {
      if (err) {
        Meteor._debug("loadCustomer", err);
        return next(err);
      }

      return processNextCustomer();
    });
  };

  return processNextCustomer();
};

const fetchCustomersChunk = (connection, skip, limit, next) => {
  /* eslint camelcase:0 */
  const filters = { entity_id: { from: skip, to: (skip + limit) } };

  connection.customer.list({ filters }, (err, res) => {
    if (err) { Logger.error(err, "fetchCustomersChunk"); }
    Logger.info({ from: skip, to: skip + limit, chunk: (res || []).length }, "fetchCustomersChunk");
    return next(null, res || []);
  });
};

export const exportCustomers = (connection, next) => {
  let skip = 0;
  const limit = 1000;

  const originMeteorUser = Meteor.user;
  Meteor.user = () => null;
  Logger.info({}, "Started import for Customers (Accounts)");

  const processChunk = (e, chunk) => {
    if (e) {
      return next(e);
    }

    Logger.info({ from: skip, to: skip + limit, chunk: (chunk || []).length }, "exportCustomers:\"loading\"");

    Fiber(() => {
      loadCustomersChunk(chunk, connection, (err) => {
        Logger.info({ from: skip, to: skip + limit, chunk: (chunk || []).length }, "exportCustomers:\"loaded\"");
        if (err) { Logger.error(err, "loadCustomersChunk"); }
        Logger.info({}, `Imported ${skip + chunk.length} Customers`);
        if (chunk.length > 0 || skip < 3000000) {
          skip += limit + 1;
          return fetchCustomersChunk(connection, skip, limit, processChunk);
        }
        if (Meteor.user && originMeteorUser) {
          Meteor.user = originMeteorUser;
        }
        Logger.info({}, "Finished import for Customers (Accounts)");
        return next();
      });
    }).run();
  };

  fetchCustomersChunk(connection, skip, limit, processChunk);
};
