/**
 * Thin wrapper around the Gmail Connect CiviCRM extension's APIv4 endpoints,
 * authenticated via AuthX (X-Civi-Auth: Bearer <api_key>). The site URL and
 * API key are shown at Administer » System Settings » Gmail Connect Settings.
 */
var CiviCrmService = (function () {

  /** POSTs to /civicrm/ajax/api4<path> and returns the decoded response. */
  function post(config, path, payload) {
    var url = config.baseUrl.replace(/\/$/, '') + '/civicrm/ajax/api4' + path;
    var options = {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      headers: {
        'X-Civi-Auth': 'Bearer ' + config.apiKey,
        'X-Requested-With': 'XMLHttpRequest'
      },
      payload: payload,
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code === 401 || code === 403) {
      throw new Error('Could not authenticate with CiviCRM (' + code + '). Check the API key.');
    }
    var body;
    try {
      body = JSON.parse(response.getContentText());
    } catch (e) {
      throw new Error('CiviCRM returned an unexpected response (' + code + '). Check the CiviCRM URL.');
    }
    if (code !== 200) {
      throw new Error('CiviCRM API error (' + code + '): ' + (body.error_message || response.getContentText()));
    }
    return body;
  }

  /** Calls a single GmailConnect action and returns its values. */
  function callApi(config, action, params) {
    var body = post(config, '/GmailConnect/' + action, { params: JSON.stringify(params || {}) });
    return body.values || [];
  }

  /**
   * Runs several GmailConnect actions in one HTTP request.
   * calls is {key: [action, params]}; returns {key: values}
   */
  function callBatch(config, calls) {
    var payload = {};
    Object.keys(calls).forEach(function (key) {
      payload[key] = ['GmailConnect', calls[key][0], calls[key][1]];
    });
    var body = post(config, '', { calls: JSON.stringify(payload) });
    var out = {};
    Object.keys(calls).forEach(function (key) {
      var result = body[key] || {};
      if (result.error_message) {
        throw new Error('CiviCRM API error: ' + result.error_message);
      }
      out[key] = result.values || [];
    });
    return out;
  }

  /** Checks the key is valid and the Gmail Connect endpoints are available. */
  function testConnection(config) {
    var actions = callApi(config, 'getActions', { select: ['name'] }).map(function (a) { return a.name; });
    if (actions.indexOf('recordActivity') === -1) {
      throw new Error('The Gmail Connect endpoints are not available. Is the extension installed?');
    }
  }

  /**
   * Looks up whether the email is already recorded and which
   * of the emails belong to contacts
   * Returns {activity: {id, url} | null, contacts: {lowercased email: {id, display_name, url}}}.
   */
  function lookup(config, rfcMessageId, emails) {
    var calls = {};
    if (rfcMessageId) {
      calls.activity = ['getActivity', { messageId: rfcMessageId }];
    }
    emails.forEach(function (email, i) {
      calls['contact' + i] = ['getContact', { email: email }];
    });
    if (!Object.keys(calls).length) {
      return { activity: null, contacts: {} };
    }

    var results = callBatch(config, calls);
    var contacts = {};
    emails.forEach(function (email, i) {
      var values = results['contact' + i];
      if (values.length) contacts[email.toLowerCase()] = values[0];
    });
    return {
      activity: (results.activity && results.activity.length) ? results.activity[0] : null,
      contacts: contacts
    };
  }

  /**
   * Adds a contact for an address like "Jane Doe <jane@doe.com>" or returns
   * the existing one. Returns {id, created}
   */
  function addContact(config, address) {
    return callApi(config, 'addContact', { email: address })[0];
  }

  /**
   * Records the email as an External Email activity or returns the existing
   * one for the same Message-ID. fields: subject, details, from, to, cc, bcc,
   * messageId. Returns {id, url, created}
   */
  function recordActivity(config, fields) {
    return callApi(config, 'recordActivity', fields)[0];
  }

  return {
    testConnection: testConnection,
    lookup: lookup,
    addContact: addContact,
    recordActivity: recordActivity
  };
})();
