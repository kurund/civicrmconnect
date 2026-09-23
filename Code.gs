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
    rfcMessageId: getRfcMessageId(message),
    subject: message.getSubject(),
    senderEmail: extractEmailAddress(message.getFrom()),
    toEmails: message.getTo(),
    date: formatMessageDate(message.getDate()),
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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br />\n');
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
