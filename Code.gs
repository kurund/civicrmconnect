/**
 * CiviCRM Connect - Gmail Add-on
 * Entry points for the homepage and contextual (message-open) triggers.
 */

function onHomepage(e) {
  var domain = getUserDomain();
  var config = getDomainConfig(domain);
  if (!config) {
    return buildSettingsCard(null);
  }
  return buildHomepageCard(config);
}

function onGmailMessageOpen(e) {
  var domain = getUserDomain();
  var config = getDomainConfig(domain);
  if (!config) {
    return buildSettingsCard('Ask your Workspace admin to connect your organization\'s CiviCRM first.');
  }

  var message = readCurrentMessage(e, e.gmail ? e.gmail.messageId : null);
  return buildContactCard(config, buildMsgInfo(message));
}

/** Bundles the message fields the cards display, including its participants. */
function buildMsgInfo(message) {
  return {
    messageId: message.getId(),
    subject: message.getSubject(),
    senderEmail: extractEmailAddress(message.getFrom()),
    toEmails: message.getTo(),
    date: formatMessageDate(message.getDate()),
    snippet: messageSnippet(message, 240),
    participants: collectParticipants(message)
  };
}

/**
 * Resolves the CMS, preferring CiviCRM's own config (userFrameworkUsersTableName)
 * over markup sniffing. Falls back to detectCms() when the setting is unavailable.
 */
function resolveCms(config) {
  try {
    var fromApi = mapUsersTableToCms(CiviCrmService.getUserFrameworkUsersTable(config));
    if (fromApi) return fromApi;
  } catch (e) {
    // Setting not exposed or call failed — fall through to markup sniff.
  }
  return detectCms(config.baseUrl);
}

/** Maps CiviCRM's user table name to a CMS keyword, or null if inconclusive. */
function mapUsersTableToCms(tableName) {
  if (!tableName) return null;
  var t = ('' + tableName).toLowerCase();
  if (t.indexOf('#_') > -1) return 'joomla';                 // Joomla's #__ prefix placeholder
  if (t === 'users_field_data' || t === 'users') return 'drupal'; // Drupal 8+/7 & Backdrop — same URL form
  if (t.indexOf('wp_') === 0 || /_users$/.test(t)) return 'wordpress'; // prefixed users table
  return null;
}

/** Builds a link to the contact's summary screen, per the org's CMS. */
function buildContactViewUrl(baseUrl, cms, contactId) {
  var base = baseUrl.replace(/\/$/, '');
  switch (cms) {
    case 'wordpress':
      return base + '/wp-admin/admin.php?page=CiviCRM&q=civicrm/contact/view&reset=1&cid=' + contactId;
    case 'joomla':
      return base + '/administrator/index.php?option=com_civicrm&task=civicrm/contact/view&reset=1&cid=' + contactId;
    case 'drupal':
    case 'backdrop':
    case 'standalone':
    default:
      // Clean-URL form used by Drupal, Backdrop, Standalone (and clean-URL WordPress).
      return base + '/civicrm/contact/view?reset=1&cid=' + contactId;
  }
}

/**
 * Best-effort CMS detection by inspecting the site root's headers and markup.
 * Returns one of: drupal | wordpress | joomla | backdrop | standalone.
 * Falls back to 'drupal' (the clean-URL form) when signals are inconclusive.
 */
function detectCms(baseUrl) {
  try {
    var resp = UrlFetchApp.fetch(baseUrl, { muteHttpExceptions: true, followRedirects: true });
    var headers = resp.getAllHeaders();
    var generator = ((headers['X-Generator'] || headers['x-generator'] || '') + '').toLowerCase();
    var body = resp.getContentText().substring(0, 8000).toLowerCase();

    if (generator.indexOf('backdrop') > -1 || body.indexOf('/core/misc/backdrop.js') > -1) return 'backdrop';
    if (generator.indexOf('drupal') > -1 || body.indexOf('/sites/default/files') > -1 || body.indexOf('drupal.settings') > -1) return 'drupal';
    if (body.indexOf('wp-content') > -1 || body.indexOf('wp-includes') > -1) return 'wordpress';
    if (generator.indexOf('joomla') > -1 || body.indexOf('/media/jui/') > -1) return 'joomla';
  } catch (e) {
    // Network/permission issue — fall through to default.
  }
  return 'drupal';
}

/** Splits a "First Last <email>" header into {firstName, lastName}. */
function parseSenderName(fromHeader) {
  var lt = fromHeader.indexOf('<');
  var namePart = lt > -1 ? fromHeader.substring(0, lt) : '';
  // A bare address with no display name yields no name.
  if (lt === -1 && fromHeader.indexOf('@') === -1) {
    namePart = fromHeader;
  }
  return splitName(namePart);
}

/** Turns a display-name string into {firstName, lastName}. */
function splitName(namePart) {
  namePart = (namePart || '').replace(/["']/g, '').trim();
  if (!namePart) {
    return { firstName: '', lastName: '' };
  }
  var parts = namePart.split(/\s+/);
  return { firstName: parts.shift(), lastName: parts.join(' ') };
}

/**
 * Parses a comma-separated address header (To/Cc/Bcc) into
 * [{email, firstName, lastName}], splitting only on commas that sit
 * outside quotes and angle brackets so display names with commas survive.
 */
function parseAddressList(headerString) {
  if (!headerString) return [];
  var parts = [];
  var current = '';
  var inQuotes = false, inAngle = false;
  for (var i = 0; i < headerString.length; i++) {
    var ch = headerString.charAt(i);
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === '<') inAngle = true;
    else if (ch === '>') inAngle = false;
    if (ch === ',' && !inQuotes && !inAngle) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);

  var out = [];
  for (var j = 0; j < parts.length; j++) {
    var entry = parts[j].trim();
    if (!entry) continue;
    var email = extractEmailAddress(entry);
    if (!email || email.indexOf('@') === -1) continue;
    var name = parseSenderName(entry);
    out.push({ email: email, firstName: name.firstName, lastName: name.lastName });
  }
  return out;
}

/** Everyone on the message (From + To/Cc/Bcc), deduped, minus the active user. */
function collectParticipants(message) {
  var me = (Session.getActiveUser().getEmail() || '').toLowerCase();
  var all = []
    .concat(parseAddressList(message.getFrom()))
    .concat(parseAddressList(message.getTo()))
    .concat(parseAddressList(message.getCc()))
    .concat(parseAddressList(message.getBcc()));
  var seen = {};
  var out = [];
  all.forEach(function (a) {
    var k = a.email.toLowerCase();
    if (k === me || seen[k]) return;
    seen[k] = true;
    out.push(a);
  });
  return out;
}

/** Formats the message date in the script's timezone. */
function formatMessageDate(date) {
  if (!date) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a');
}

/** First few non-empty lines of the body, cleaned and truncated. */
function messageSnippet(message, maxLen) {
  var body = message.getPlainBody() || '';
  var text = body.replace(/\r/g, '').split('\n')
    .map(function (l) { return l.trim(); })
    .filter(function (l) { return l.length; })
    .slice(0, 4)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLen) {
    text = text.substring(0, maxLen).trim() + '\u2026';
  }
  return text;
}

/** Union of two ID lists, de-duplicated by string value. */
function mergeIds(a, b) {
  var out = [], seen = {};
  a.concat(b).forEach(function (id) {
    var k = String(id);
    if (!seen[k]) { seen[k] = true; out.push(id); }
  });
  return out;
}

/**
 * Reads the message the user currently has open. Uses the event's own
 * messageId + accessToken pair so it stays correct inside threads, where a
 * value captured at card-build time can point at the wrong message.
 */
function readCurrentMessage(e, fallbackId) {
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  var id = (e.gmail && e.gmail.messageId) ? e.gmail.messageId : fallbackId;
  return GmailApp.getMessageById(id);
}

/** Returns list with any entry equal (by string) to id removed. */
function removeId(list, id) {
  var target = String(id);
  return list.filter(function (x) { return String(x) !== target; });
}

/** Pulls the domain portion of the active user's email (used as the config key). */
function getUserDomain() {
  var email = Session.getActiveUser().getEmail();
  return email.substring(email.indexOf('@') + 1).toLowerCase();
}

/** Extracts a bare email address out of a "Name <email@x.com>" header string. */
function extractEmailAddress(fromHeader) {
  var match = fromHeader.match(/<([^>]+)>/);
  return match ? match[1] : fromHeader.trim();
}
