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

function onSettings(e) {
  return CardService.newUniversalActionResponseBuilder().displayAddOnCards([buildSettingsCard(null)]).build();
}

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

function getRfcMessageId(message) {
  return (message.getHeader('Message-ID') || message.getHeader('Message-Id') || '').trim();
}

/**
 * Splits an address header on the commas outside quotes and angle brackets
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
 * [{address, email, name}] for each address in the header
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

function formatMessageDate(date, timeZone) {
  return Utilities.formatDate(date, timeZone, 'MMM d, yyyy h:mm a');
}

function getTimeZone(e) {
  var tz = e.commonEventObject && e.commonEventObject.timeZone;
  return (tz && tz.id) || Session.getScriptTimeZone();
}

function messageSnippet(message, maxLen) {
  var text = (message.getPlainBody() || '').replace(/\s+/g, ' ').trim();
  if (text.length > maxLen) {
    text = text.substring(0, maxLen).trim() + '…';
  }
  return text;
}

function plainTextToHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br />\n');
}

function readCurrentMessage(e) {
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  return GmailApp.getMessageById(e.gmail.messageId);
}

function getUserEmail() {
  return Session.getActiveUser().getEmail().toLowerCase();
}

function extractEmailAddress(address) {
  var match = address.match(/<([^>]+)>/);
  return match ? match[1] : address.trim();
}
