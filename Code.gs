/**
 * CiviCRM Connect - Gmail Add-on
 * Entry points for the homepage and contextual (message-open) triggers.
 */

function onHomepage(e) {
  var config = getConfig();
  return config ? buildHomepageCard(config) : buildSettingsCard(null);
}

function onGmailMessageOpen(e) {
  var config = getConfig();
  if (!config) {
    return buildSettingsCard('Connect CiviCRM Connect to your CiviCRM to look up the people on your emails.');
  }

  var message = readCurrentMessage(e);
  return buildContactCard(config, buildMsgInfo(message, getTimeZone(e)));
}

/** Universal action: the Settings entry in the add-on menu. */
function onSettings(e) {
  return CardService.newUniversalActionResponseBuilder().displayAddOnCards([buildSettingsCard(null)]).build();
}

/** Bundles the message fields the cards display, including its participants. */
function buildMsgInfo(message, timeZone) {
  return {
    rfcMessageId: getRfcMessageId(message),
    senderEmail: extractEmailAddress(message.getFrom()),
    toEmails: message.getTo(),
    date: formatMessageDate(message.getDate(), timeZone),
    snippet: messageSnippet(message, 240),
    participants: collectParticipants(message)
  };
}

/**
 * The RFC 822 Message-ID header, which is the same in every recipient's
 * mailbox, so the email is only recorded once. Empty if the header is missing
 */
function getRfcMessageId(message) {
  return (message.getHeader('Message-ID') || message.getHeader('Message-Id') || '').trim();
}

/**
 * Splits a comma-separated address header (To/Cc/Bcc) into its addresses,
 * e.g. ['Jane Doe <jane@doe.com>', 'john@x.org'], splitting only on commas
 * that sit outside quotes and angle brackets so display names with commas
 * survive.
 */
function splitAddressHeader(headerString) {
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
  parts.push(current);

  return parts
    .map(function (p) { return p.trim(); })
    .filter(function (p) { return p && extractEmailAddress(p).indexOf('@') > -1; });
}

/**
 * Parses an address header into [{address, email, name}], where address is
 * the original entry (sent to CiviCRM, which parses the name itself) and
 * name is only for display.
 */
function parseAddressList(headerString) {
  return splitAddressHeader(headerString).map(function (address) {
    var lt = address.indexOf('<');
    var name = lt > -1 ? address.substring(0, lt).replace(/"/g, '').trim() : '';
    return { address: address, email: extractEmailAddress(address), name: name };
  });
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

/** Formats the message date in the given time zone. */
function formatMessageDate(date, timeZone) {
  return Utilities.formatDate(date, timeZone, 'MMM d, yyyy h:mm a');
}

/** The user's time zone from the event (needs useLocaleFromApp), else the script's. */
function getTimeZone(e) {
  var tz = e.commonEventObject && e.commonEventObject.timeZone;
  return (tz && tz.id) || Session.getScriptTimeZone();
}

/** Start of the body with whitespace collapsed, truncated. */
function messageSnippet(message, maxLen) {
  var text = (message.getPlainBody() || '').replace(/\s+/g, ' ').trim();
  if (text.length > maxLen) {
    text = text.substring(0, maxLen).trim() + '…';
  }
  return text;
}

/**
 * Escapes the plain-text body for CiviCRM's HTML activity details, keeping
 * line breaks. 
 */
function plainTextToHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br />\n');
}

/**
 * Reads the message the user currently has open. Uses the event's own
 * messageId + accessToken pair so it stays correct inside threads, where a
 * value captured at card-build time can point at the wrong message.
 */
function readCurrentMessage(e) {
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  return GmailApp.getMessageById(e.gmail.messageId);
}

/** The active user's email address, lowercased. */
function getUserEmail() {
  return Session.getActiveUser().getEmail().toLowerCase();
}

/** Extracts a bare email address out of a "Name <email@x.com>" header string. */
function extractEmailAddress(address) {
  var match = address.match(/<([^>]+)>/);
  return match ? match[1] : address.trim();
}
