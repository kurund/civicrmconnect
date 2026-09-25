var CiviCrmService = (function () {

  function call(config, action, params) {
    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Gmail-Connect-Token': config.token },
      payload: JSON.stringify({ action: action, params: params }),
      muteHttpExceptions: true
    };
    var response;
    try {
      response = UrlFetchApp.fetch(config.url, options);
    } catch (e) {
      if (/whitelisted/.test(e.message)) {
        throw new Error('CiviCRM Connect doesn\'t support CiviCRM sites at ' + siteOf(config.url) + ' yet. Please contact support.');
      }
      throw e;
    }
    var code = response.getResponseCode();
    if (code === 401) {
      throw new Error('This URL no longer works. Copy it again from CiviCRM: Contacts » Gmail Connect.');
    }
    if (code === 403) {
      throw new Error('Your CiviCRM user does not have permission to use Gmail Connect.');
    }
    var body;
    try {
      body = JSON.parse(response.getContentText());
    } catch (e) {
      throw new Error('CiviCRM returned an unexpected response (' + code + '). Check the URL.');
    }
    if (code !== 200) {
      throw new Error(body.error || 'CiviCRM error (' + code + ').');
    }
    return body.values;
  }

  /**
   * Returns {activity: {id, url} | null, contacts: {lowercased email: {id, display_name, url}},
   * user: {id, display_name}}
   */
  function lookup(config, rfcMessageId, emails) {
    return call(config, 'lookup', { messageId: rfcMessageId, emails: emails })[0];
  }

  /**
   * Returns {id, created}
   */
  function addContact(config, address) {
    return call(config, 'addContact', { email: address })[0];
  }

  /**
   * fields: subject, details, from, to, cc, bcc, messageId. Returns {id, url, created}
   */
  function recordActivity(config, fields) {
    return call(config, 'recordActivity', fields)[0];
  }

  return {
    lookup: lookup,
    addContact: addContact,
    recordActivity: recordActivity
  };
})();
