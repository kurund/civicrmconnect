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
    var response;
    try {
      response = UrlFetchApp.fetch(url, options);
    } catch (e) {
      // Only addresses in the manifest's urlFetchWhitelist can be reached.
      if (/whitelisted/.test(e.message)) {
        throw new Error('CiviCRM Connect doesn\'t support CiviCRM sites at ' + config.baseUrl + ' yet. Please contact support.');
      }
      throw e;
    }
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
    var body = post(config, '/GmailConnect/' + action, { params: JSON.stringify(params) });
    return body.values || [];
  }

  /** Checks the key is valid and the Gmail Connect endpoints are available. */
  function testConnection(config) {
    callApi(config, 'getActions', {});
  }

  /**
   * Looks up, in one request, whether the email is already recorded and which
   * of the emails belong to contacts
   * Returns {activity: {id, url} | null, contacts: {lowercased email: {id, display_name, url}}}.
   */
  function lookup(config, rfcMessageId, emails) {
    var calls = {};
    if (rfcMessageId) {
      calls.activity = ['GmailConnect', 'getActivity', { messageId: rfcMessageId }];
    }
    emails.forEach(function (email, i) {
      calls['contact' + i] = ['GmailConnect', 'getContact', { email: email }];
    });
    if (!Object.keys(calls).length) {
      return { activity: null, contacts: {} };
    }

    var body = post(config, '', { calls: JSON.stringify(calls) });
    Object.keys(calls).forEach(function (key) {
      if (body[key].error_message) {
        throw new Error('CiviCRM API error: ' + body[key].error_message);
      }
    });
    var contacts = {};
    emails.forEach(function (email, i) {
      var values = body['contact' + i].values;
      if (values.length) contacts[email.toLowerCase()] = values[0];
    });
    return {
      activity: (body.activity && body.activity.values.length) ? body.activity.values[0] : null,
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
