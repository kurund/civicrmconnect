/**
 * Admin settings, domain-keyed config storage, and the cards shown to users.
 */

function getDomainConfig(domain) {
  var raw = PropertiesService.getScriptProperties().getProperty('config_' + domain);
  return raw ? JSON.parse(raw) : null;
}

function saveDomainConfig(domain, config) {
  PropertiesService.getScriptProperties().setProperty('config_' + domain, JSON.stringify(config));
}

function buildSettingsCard(message) {
  var section = CardService.newCardSection();
  if (message) {
    section.addWidget(CardService.newTextParagraph().setText(message));
  }
  section.addWidget(CardService.newTextInput().setFieldName('baseUrl').setTitle('CiviCRM URL').setHint('https://yourorg.org'));
  section.addWidget(CardService.newTextInput().setFieldName('apiKey').setTitle('API Key').setHint('From the service-account contact\'s API Key tab'));
  section.addWidget(CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('cms')
    .setTitle('Platform')
    .addItem('Auto-detect', 'auto', true)
    .addItem('Drupal', 'drupal', false)
    .addItem('WordPress', 'wordpress', false)
    .addItem('Joomla', 'joomla', false)
    .addItem('Backdrop', 'backdrop', false)
    .addItem('Standalone', 'standalone', false));
  section.addWidget(CardService.newTextButton()
    .setText('Save & Test Connection')
    .setOnClickAction(CardService.newAction().setFunctionName('handleSaveSettings')));

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Connect your CiviCRM'))
    .addSection(section)
    .build();
}

function handleSaveSettings(e) {
  var domain = getUserDomain();
  var config = {
    baseUrl: e.formInput.baseUrl,
    apiKey: e.formInput.apiKey,
    cms: e.formInput.cms || 'auto'
  };

  var connected = false;
  var notificationText;
  try {
    CiviCrmService.testConnection(config);
    if (config.cms === 'auto') {
      config.cms = resolveCms(config);
    }
    saveDomainConfig(domain, config);
    connected = true;
    notificationText = 'Connected (' + config.cms + ')! Open any email to look up the sender.';
  } catch (err) {
    notificationText = 'Connection failed: ' + err.message;
  }

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(notificationText))
    .setNavigation(CardService.newNavigation().updateCard(
      connected ? buildHomepageCard(getDomainConfig(domain)) : buildSettingsCard(notificationText)
    ))
    .build();
}

function buildHomepageCard(config) {
  var section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText('Connected to ' + config.baseUrl))
    .addWidget(CardService.newTextParagraph().setText('Open an email to see the sender\'s CiviCRM contact info.'));

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('CiviCRM Connect'))
    .addSection(section)
    .build();
}

/** From/To/Date/Preview block. */
function addMessageWidgets(section, msgInfo) {
  section.addWidget(CardService.newKeyValue().setTopLabel('From').setContent(msgInfo.senderEmail).setMultiline(true));
  if (msgInfo.toEmails) {
    section.addWidget(CardService.newKeyValue().setTopLabel('To').setContent(msgInfo.toEmails).setMultiline(true));
  }
  if (msgInfo.date) {
    section.addWidget(CardService.newKeyValue().setTopLabel('Date').setContent(msgInfo.date));
  }
  if (msgInfo.snippet) {
    section.addWidget(CardService.newKeyValue().setTopLabel('Preview').setContent(msgInfo.snippet).setMultiline(true));
  }
}

function buildContactCard(config, msgInfo) {
  // Top: message details + record action.
  var msgSection = CardService.newCardSection().setHeader('Message');
  addMessageWidgets(msgSection, msgInfo);
  msgSection.addWidget(CardService.newTextButton()
    .setText('Record this email')
    .setOnClickAction(CardService.newAction()
      .setFunctionName('handleRecordActivity')
      .setParameters({ messageId: msgInfo.messageId })));

  // Bottom: everyone on the message, each with a View or Add button.
  var contactsSection = buildContactsSection(config, msgInfo);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('CiviCRM Connect'))
    .addSection(msgSection)
    .addSection(contactsSection)
    .build();
}

/** Lists each participant with a View (exists) or Add (missing) button. */
function buildContactsSection(config, msgInfo) {
  var section = CardService.newCardSection().setHeader('Contacts');
  var participants = msgInfo.participants || [];
  if (!participants.length) {
    section.addWidget(CardService.newTextParagraph().setText('No participants found on this message.'));
    return section;
  }

  var found = CiviCrmService.findContactsByEmails(config, participants.map(function (p) { return p.email; }));

  participants.forEach(function (p) {
    var existing = found[p.email.toLowerCase()];
    var row = CardService.newKeyValue().setContent(p.email).setMultiline(true);
    if (existing) {
      row.setTopLabel(existing.display_name);
      row.setButton(CardService.newTextButton()
        .setText('View')
        .setOpenLink(CardService.newOpenLink().setUrl(buildContactViewUrl(config.baseUrl, config.cms, existing.id))));
    } else {
      var name = ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
      row.setTopLabel(name || 'Not in CiviCRM');
      row.setButton(CardService.newTextButton()
        .setText('Add')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('handleAddContact')
          .setParameters({
            email: p.email,
            firstName: p.firstName || '',
            lastName: p.lastName || '',
            messageId: msgInfo.messageId
          })));
    }
    section.addWidget(row);
  });
  return section;
}

/** Adds a single participant to CiviCRM, then refreshes the card. */
function handleAddContact(e) {
  var config = getDomainConfig(getUserDomain());
  var p = e.parameters;

  var notificationText;
  try {
    var existing = CiviCrmService.findContactByEmail(config, p.email);
    if (!existing) {
      CiviCrmService.createContact(config, p.firstName, p.lastName, p.email);
      notificationText = 'Added ' + p.email + ' to CiviCRM.';
    } else {
      notificationText = p.email + ' already exists in CiviCRM.';
    }
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Could not add: ' + err.message))
      .build();
  }

  var message = readCurrentMessage(e, p.messageId);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(notificationText))
    .setNavigation(CardService.newNavigation().updateCard(buildContactCard(config, buildMsgInfo(message))))
    .build();
}

/**
 * The CiviCRM contact ID of the Gmail user doing the recording, matched by
 * their own email address and cached per user. Creates the contact if none
 * exists, since every activity needs a source. Returns null only if the
 * user's email can't be determined.
 */
function getRecorderContactId(config) {
  var props = PropertiesService.getUserProperties();
  var cacheKey = 'recorderContactId:' + config.baseUrl;
  var cached = props.getProperty(cacheKey);
  if (cached) return cached;

  var email = Session.getActiveUser().getEmail();
  if (!email) return null;

  var contact = CiviCrmService.findContactByEmail(config, email);
  if (!contact) {
    var name = getRecorderName();
    contact = CiviCrmService.createContact(config, name.firstName, name.lastName, email);
  }
  props.setProperty(cacheKey, String(contact.id));
  return String(contact.id);
}

/** Reads the Gmail user's given/family name from Google's userinfo endpoint. */
function getRecorderName() {
  try {
    var resp = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() === 200) {
      var info = JSON.parse(resp.getContentText());
      return { firstName: info.given_name || '', lastName: info.family_name || '' };
    }
  } catch (e) {
    // Fall through to an email-only contact.
  }
  return { firstName: '', lastName: '' };
}

/** Resolves each address to a contact ID, creating a contact when none exists. */
function resolveOrCreateContacts(config, addresses) {
  var ids = [];
  var seen = {};
  for (var i = 0; i < addresses.length; i++) {
    var a = addresses[i];
    var key = a.email.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    var contact = CiviCrmService.findContactByEmail(config, a.email);
    if (!contact) {
      contact = CiviCrmService.createContact(config, a.firstName, a.lastName, a.email);
    }
    ids.push(contact.id);
  }
  return ids;
}

function handleRecordActivity(e) {
  var domain = getUserDomain();
  var config = getDomainConfig(domain);
  var params = e.parameters;

  var notificationText;
  try {
    var message = readCurrentMessage(e, params.messageId);
    var details = message.getPlainBody() || '(No message body)';

    var recorderId = getRecorderContactId(config);
    var allIds = resolveOrCreateContacts(config, collectParticipants(message));
    var sourceId = recorderId || allIds[0];
    var targetIds = removeId(allIds, sourceId);

    var activity = CiviCrmService.recordActivity(config, sourceId, targetIds, message.getSubject(), details);
    notificationText = 'Email recorded (activity #' + activity.id + ') against ' + targetIds.length + ' contact(s).';
  } catch (err) {
    notificationText = 'Could not record: ' + err.message;
  }

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(notificationText))
    .build();
}
