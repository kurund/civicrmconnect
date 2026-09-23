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
  section.addWidget(CardService.newTextParagraph().setText(
    'Copy the Site URL and API key from CiviCRM: Administer » System Settings » Gmail Connect Settings.'));
  section.addWidget(CardService.newTextInput().setFieldName('baseUrl').setTitle('CiviCRM Site URL').setHint('https://yourorg.org'));
  section.addWidget(CardService.newTextInput().setFieldName('apiKey').setTitle('API Key'));
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
    baseUrl: (e.formInput.baseUrl || '').trim(),
    apiKey: (e.formInput.apiKey || '').trim()
  };

  var connected = false;
  var notificationText;
  try {
    CiviCrmService.testConnection(config);
    saveDomainConfig(domain, config);
    connected = true;
    notificationText = 'Connected! Open any email to look up its contacts.';
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
    .addWidget(CardService.newTextParagraph().setText('Open an email to see its contacts in CiviCRM.'));

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
  var participants = msgInfo.participants || [];
  var found = CiviCrmService.lookup(config, msgInfo.rfcMessageId, participants.map(function (p) { return p.email; }));

  // Top: message details + record action (or link to the existing activity).
  var msgSection = CardService.newCardSection().setHeader('Message');
  addMessageWidgets(msgSection, msgInfo);
  if (found.activity) {
    msgSection.addWidget(CardService.newKeyValue()
      .setContent('Already recorded in CiviCRM')
      .setButton(CardService.newTextButton()
        .setText('View')
        .setOpenLink(CardService.newOpenLink().setUrl(found.activity.url))));
  } else if (!msgInfo.rfcMessageId) {
    msgSection.addWidget(CardService.newTextParagraph()
      .setText('This email has no Message-ID header, so it can\'t be recorded.'));
  } else {
    msgSection.addWidget(CardService.newTextButton()
      .setText('Record this email')
      .setOnClickAction(CardService.newAction()
        .setFunctionName('handleRecordActivity')
        .setParameters({ messageId: msgInfo.messageId })));
  }

  // Bottom: everyone on the message, each with a View or Add button.
  var contactsSection = buildContactsSection(participants, found.contacts, msgInfo.messageId);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('CiviCRM Connect'))
    .addSection(msgSection)
    .addSection(contactsSection)
    .build();
}

/** Lists each participant with a View (exists) or Add (missing) button. */
function buildContactsSection(participants, contacts, messageId) {
  var section = CardService.newCardSection().setHeader('Contacts');
  if (!participants.length) {
    section.addWidget(CardService.newTextParagraph().setText('No participants found on this message.'));
    return section;
  }

  participants.forEach(function (p) {
    var existing = contacts[p.email.toLowerCase()];
    var row = CardService.newKeyValue().setContent(p.email).setMultiline(true);
    if (existing) {
      row.setTopLabel(existing.display_name);
      row.setButton(CardService.newTextButton()
        .setText('View')
        .setOpenLink(CardService.newOpenLink().setUrl(existing.url)));
    } else {
      row.setTopLabel(p.name || 'Not in CiviCRM');
      row.setButton(CardService.newTextButton()
        .setText('Add')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('handleAddContact')
          .setParameters({ address: p.address, email: p.email, messageId: messageId })));
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
    var contact = CiviCrmService.addContact(config, p.address);
    notificationText = contact.created
      ? 'Added ' + p.email + ' to CiviCRM.'
      : p.email + ' already exists in CiviCRM.';
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
 * Records the email in CiviCRM: the sender is the source contact and the
 * To/Cc/Bcc recipients are targets. CiviCRM creates any missing contacts and
 * returns the existing activity if the email was already recorded.
 */
function handleRecordActivity(e) {
  var config = getDomainConfig(getUserDomain());
  var params = e.parameters;

  var notificationText;
  var message;
  try {
    message = readCurrentMessage(e, params.messageId);
    var activity = CiviCrmService.recordActivity(config, {
      subject: message.getSubject(),
      details: plainTextToHtml(message.getPlainBody() || '(No message body)'),
      from: message.getFrom(),
      to: splitAddressHeader(message.getTo()),
      cc: splitAddressHeader(message.getCc()),
      bcc: splitAddressHeader(message.getBcc()),
      messageId: getRfcMessageId(message)
    });
    notificationText = activity.created
      ? 'Email recorded in CiviCRM.'
      : 'This email was already recorded in CiviCRM.';
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Could not record: ' + err.message))
      .build();
  }

  // Refresh so the card shows the recorded state and any new contacts.
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(notificationText))
    .setNavigation(CardService.newNavigation().updateCard(buildContactCard(config, buildMsgInfo(message))))
    .build();
}
