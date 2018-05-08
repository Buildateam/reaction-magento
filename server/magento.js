/* eslint-disable no-undef */
import crypto from "crypto";
import { Meteor } from "meteor/meteor";
import { HTTP } from "meteor/http";
import MagentoAPI from "magento-xmlrpc";
import Fiber from "fibers";
import { EJSON } from "meteor/ejson";
import { Packages } from "/lib/collections";
import { Reaction, Logger } from "/server/api";
import { MagentoResponses } from "./../lib/collections";


const asyncLib = require("async");

const q = asyncLib.queue(({ promise }, callback) => {
  promise()
    .then((result) => {
      return callback(null, result);
    })
    .catch((err) => {
      return callback(err);
    });
}, 40);

export const createMagentoRequest = (promise, cbData = o => o) => new Promise((resolve, reject) => {
  q.push([{ promise }], (err, o) => {
    if (err) {
      return reject(err);
    }

    return resolve(cbData(o));
  });
});

const createRequest = (data) => {
  Fiber(() => {
    HTTP.call("POST", "http://82.202.226.111:9000/logs", {
      data
    }, (err) => {
      if (err) {
        Logger.error(err);
      }
    });
  }).run();
};

export const onError = (err, functionName, cb = () => {}) => {
  const data = {
    title: "magento-import",
    type: "error",
    data: {
      function: functionName || "defaultError",
      ...err,
      message: err.message
    },
    createdAt: new Date()
  };

  Logger.error(data);

  createRequest({
    title: "magento-import",
    type: "error",
    function: functionName || "defaultError",
    data: EJSON.stringify(err),
    SITE: Meteor.absoluteUrl()
  });

  cb();
};

export const onLog = (functionName, argData = {}, cb = () => {}) => {
  const data = {
    title: "magento-import",
    type: "info",
    data: {
      function: functionName,
      ...argData
    },
    createdAt: new Date()
  };

  Logger.info(data);

  createRequest({
    ...data,
    SITE: Meteor.absoluteUrl()
  });

  cb();
};

export const connect = ({ host, port, path, login, password }, next) => {
  const connection = new MagentoAPI({ host, path, login, port: parseInt(port, 10), pass: password });

  connection._importKeys = {
    products: {},
    customers: {},
    orders: {},
    shops: {}
  };

  connection._setKey = (section, magentoKey, mongoKey) => {
    if (connection._importKeys[section]) {
      connection._importKeys[section][magentoKey] = mongoKey;
    }
  };

  connection._getKey = (section, magentoKey) => {
    if (connection._importKeys[section]) {
      return connection._importKeys[section][magentoKey];
    }
  };

  const keysMap = {
    products: "Products",
    customers: "Customers",
    orders: "Orders",
    shops: "Shops"
  };

  _.each(keysMap, (name, section) => {
    connection[`set${name}Key`] = (...args) => connection._setKey(section, ...args);
    connection[`get${name}Key`] = (...args) => connection._getKey(section, ...args);
  });


  connection.login((err, session) => Fiber(() => next(err, { connection, session })).run());
};

export const magento = (next) => {
  const packageData = Packages.findOne({
    name: "magento-import",
    shopId: Reaction.getShopId()
  }) || {};

  Logger.info(packageData, "MAGENTO CREDENTIALS");

  const { settings = {} } = packageData;

  return connect(settings, next);
};

const recreateConnection = () => {
  return new Promise((resolve, reject) => {
    magento((err, { connection }) => {
      if (err) {
        return reject(err);
      }

      return resolve(connection);
    });
  });
};

export const getList = (connection, collection, props = {}) =>
  new Promise((resolve, reject) => {
    connection[collection].list(props, (err, data) => {
      if (err) {
        return reject(err);
      }

      return resolve(data);
    });
  })
;

export const getInfo = (connection, collection, props = {}) =>
  new Promise((resolve, reject) => {
    connection[collection].info(props, (err, data) => {
      if (err) {
        return reject(err);
      }

      return resolve(data);
    });
  })
;

export const getOptions = (connection, collection, props = {}) =>
  new Promise((resolve, reject) => {
    connection[collection].options(props, (err, data) => {
      if (err) {
        return reject(err);
      }

      return resolve(data);
    });
  })
;

export const getCategoryTree = (connection) =>
  new Promise((resolve, reject) => {
    connection.catalogCategory.tree((error, categoryTree) => {
      if (error) {
        return reject(error);
      }

      return resolve(categoryTree);
    });
  })
;

export const getCategoryTreeInfo = (connection) =>
  new Promise((resolve, reject) => {
    connection.catalogCategory.info((error, category) => {
      if (error) {
        return reject(error);
      }

      return resolve(category);
    });
  })
;

export const checkInDBOrRequest = ({ connection, set }, url, props = {}, type = "list") => {
  const f = (tType) => {
    switch (tType) {
      case "info": return getInfo;
      case "list": return getList;
      case "options": return getOptions;
      case "categoryTree": return getCategoryTree;
      case "categoryInfo": return getCategoryTreeInfo;

      default: return getList;
    }
  };
  const dataSearch = {
    url,
    ...props
  };
  const jsonSearch = JSON.stringify(dataSearch);
  const req = {
    search: crypto.createHash("md5").update(jsonSearch).digest("hex")
  };
  const dbData = MagentoResponses.findOne({
    ...req
  });
  let promise = null;

  if (dbData) {
    const { data: { response } } = dbData;
    promise = Promise.resolve(response);
  } else {
    promise = createMagentoRequest(() => f(type)(connection, url, props))
      .then(data => {
        MagentoResponses.rawCollection().insert({
          ...req,
          jsonSearch,
          dataSearch,
          data: {
            response: data
          }
        });

        return data;
      });
  }

  return new Promise((resolve, reject) => {
    promise
      .then(data => resolve(data))
      .catch(err => {
        const { code, faultCode } = err;
        
        if (code === 5 || faultCode === 5) {
          recreateConnection()
            .then(newConnection => {
              onLog("recreateConnection", EJSON.stringify(newConnection));
              set(newConnection);
              return f(type)(newConnection, url, props);
            })
            .then(data => resolve(data))
            .catch(createConnectionError => reject(createConnectionError));
        } else {
          reject(err);
        }
      });
  });
};

export const createSuccessPromise = (promise, defaultReturn = null, message = null, optionData = {}) =>
  new Promise((resolve) => {
    promise
      .then(data => resolve(data))
      .catch(err => {
        const outError = err;
        if (Object.keys(optionData).length) {
          outError.outData = optionData;
        }
        Logger.error(outError, message);
        resolve(defaultReturn);
      });
  })
;
