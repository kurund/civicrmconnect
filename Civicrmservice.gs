/**
 * Thin wrapper around CiviCRM's APIv4 REST endpoint, authenticated via AuthX
 * (Authorization: Bearer <api_key>). See PROJECT_PLAN.md Phase 3 for the
 * CiviCRM-side AuthX setup required before this will work.
 */
var CiviCrmService = (function () {

  function callApi(config, entity, action, params) {
    var url = config.baseUrl.replace(/\/$/, '') + '/civicrm/ajax/api4/' + entity + '/' + action;
    var options = {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      headers: {
        Authorization: 'Bearer ' + config.apiKey,
        'X-Requested-With': 'XMLHttpRequest'
      },
      payload: {
        params: JSON.stringify(params || {})
      },
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());
    if (code !== 200) {
      throw new Error('CiviCRM API error (' + code + '): ' + (body.error_message || response.getContentText()));
    }
    return body;
  }

  function testConnection(config) {
    var url = config.baseUrl.replace(/\/$/, '') + '/civicrm/authx/id';
    var options = {
      method: 'get',
      headers: { Authorization: 'Bearer ' + config.apiKey },
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      throw new Error('Could not authenticate: ' + response.getContentText());
    }
    return JSON.parse(response.getContentText());
  }

  function findContactByEmail(config, email) {
    var result = callApi(config, 'Contact', 'get', {
      select: ['id', 'display_name', 'email_primary.email', 'phone_primary.phone', 'job_title', 'organization_name'],
      where: [['email_primary.email', '=', email]],
      limit: 1
    });
    return (result.values && result.values.length) ? result.values[0] : null;
  }

  function findContactsByEmails(config, emails) {
    if (!emails || !emails.length) return {};
    var result = callApi(config, 'Contact', 'get', {
      select: ['id', 'display_name', 'email_primary.email', 'organization_name'],
      where: [['email_primary.email', 'IN', emails]]
    });
    var map = {};
    (result.values || []).forEach(function (c) {
      var em = c['email_primary.email'];
      if (em) map[em.toLowerCase()] = c;
    });
    return map;
  }

  function recordActivity(config, sourceContactId, targetContactIds, subject, details) {
    var result = callApi(config, 'Activity', 'create', {
      values: {
        'activity_type_id:name': 'Email',
        subject: subject,
        details: details,
        source_contact_id: sourceContactId,
        target_contact_id: targetContactIds,
        'status_id:name': 'Completed'
      }
    });
    if (!result.values || !result.values.length) {
      throw new Error('CiviCRM accepted the request but returned no activity. Check the service account\'s permissions.');
    }
    return result.values[0];
  }

  function createContact(config, firstName, lastName, email) {
    var result = callApi(config, 'Contact', 'create', {
      values: {
        contact_type: 'Individual',
        first_name: firstName,
        last_name: lastName
      },
      chain: {
        email: ['Email', 'create', { values: { contact_id: '$id', email: email, is_primary: true } }]
      }
    });
    if (!result.values || !result.values.length) {
      throw new Error('CiviCRM did not return a new contact. Check the service account\'s permissions.');
    }
    return result.values[0];
  }

  function getUserFrameworkUsersTable(config) {
    var result = callApi(config, 'Setting', 'get', {
      select: ['userFrameworkUsersTableName']
    });
    if (result.values && result.values.length) {
      var row = result.values[0];
      return row.value != null ? row.value : null;
    }
    return null;
  }

  return {
    testConnection: testConnection,
    findContactByEmail: findContactByEmail,
    findContactsByEmails: findContactsByEmails,
    createContact: createContact,
    recordActivity: recordActivity,
    getUserFrameworkUsersTable: getUserFrameworkUsersTable
  };
})();
