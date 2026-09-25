var CONFIG_KEY = 'civicrm';

/** {url, token, site, user}, or null if not connected */
function getConfig() {
  var raw = PropertiesService.getUserProperties().getProperty(CONFIG_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveConfig(config) {
  PropertiesService.getUserProperties().setProperty(CONFIG_KEY, JSON.stringify(config));
}

/**
 * Accepts https://site/civicrm/gmailconnect?token=… and WordPress's
 * https://site/civicrm/?civiwp=CiviCRM&q=civicrm%2Fgmailconnect&token=…
 */
function parseEndpointUrl(text) {
  var input = (text || '').trim();
  var match = input.match(/[?&]token=([A-Za-z0-9]+)/);
  if (input.indexOf('https://') !== 0 || !match) {
    throw new Error('Paste the full URL from CiviCRM (Contacts » Gmail Connect). It starts with https:// and contains token=.');
  }
  var url = input.replace(/([?&])token=[A-Za-z0-9]+&?/, '$1').replace(/[?&]$/, '');
  return { url: url, token: match[1] };
}

function siteOf(url) {
  return url.match(/^https:\/\/[^\/?#]+/)[0];
}

function buildSettingsCard(message) {
  var config = getConfig();
  var section = CardService.newCardSection();
  if (message) {
    section.addWidget(CardService.newTextParagraph().setText(message));
  }
  if (config) {
    section.addWidget(CardService.newTextParagraph().setText(connectedText(config)));
  }
  section.addWidget(CardService.newTextParagraph().setText(
    'Copy your personal URL from CiviCRM: Contacts » Gmail Connect.' +
    (config ? ' Paste a new URL to replace the current one.' : '')));
  section.addWidget(CardService.newTextInput()
    .setFieldName('url')
    .setTitle('Your Gmail Connect URL')
    .setHint('https://…/civicrm/gmailconnect?token=…'));

  var buttons = CardService.newButtonSet().addButton(CardService.newTextButton()
    .setText('Save & Test Connection')
    .setOnClickAction(CardService.newAction().setFunctionName('handleSaveSettings')));
  if (config) {
    buttons.addButton(CardService.newTextButton()
      .setText('Disconnect')
      .setOnClickAction(CardService.newAction().setFunctionName('handleDisconnect')));
  }
  section.addWidget(buttons);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle(config ? 'Settings' : 'Connect your CiviCRM'))
    .addSection(section)
    .build();
}

function handleSaveSettings(e) {
  var config;
  try {
    config = parseEndpointUrl(e.formInput.url);
    var result = CiviCrmService.lookup(config, '', []);
    config.site = siteOf(config.url);
    config.user = result.user ? result.user.display_name : '';
  } catch (err) {
    return actionResponse('Not saved: ' + err.message);
  }
  saveConfig(config);
  return actionResponse(connectedText(config) + '. Open any email to look up its contacts.', buildHomepageCard(config));
}

function handleDisconnect(e) {
  PropertiesService.getUserProperties().deleteProperty(CONFIG_KEY);
  return actionResponse('Disconnected from CiviCRM.', buildSettingsCard(null));
}

function connectedText(config) {
  return 'Connected to ' + config.site + (config.user ? ' as ' + config.user : '');
}

function actionResponse(text, card) {
  var response = CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(text));
  if (card) {
    response.setNavigation(CardService.newNavigation().updateCard(card));
  }
  return response.build();
}

function buildHomepageCard(config) {
  var section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText(connectedText(config)))
    .addWidget(CardService.newTextParagraph().setText('Open an email to see its contacts in CiviCRM.'));

  return CardService.newCardBuilder()
    .addSection(section)
    .build();
}

function addMessageWidgets(section, msgInfo) {
  section.addWidget(CardService.newKeyValue().setTopLabel('From').setContent(msgInfo.senderEmail).setMultiline(true));
  if (msgInfo.toEmails) {
    section.addWidget(CardService.newKeyValue().setTopLabel('To').setContent(msgInfo.toEmails).setMultiline(true));
  }
  section.addWidget(CardService.newKeyValue().setTopLabel('Date').setContent(msgInfo.date));
  if (msgInfo.snippet) {
    section.addWidget(CardService.newKeyValue().setTopLabel('Preview').setContent(msgInfo.snippet).setMultiline(true));
  }
}

function buildContactCard(config, msgInfo) {
  var participants = msgInfo.participants;
  var found = CiviCrmService.lookup(config, msgInfo.rfcMessageId, participants.map(function (p) { return p.email; }));

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
      .setText('This email has no Message-ID header, so it cannot be recorded.'));
  } else {
    msgSection.addWidget(CardService.newTextButton()
      .setText('Record this email')
      .setOnClickAction(CardService.newAction().setFunctionName('handleRecordActivity')));
  }

  var contactsSection = buildContactsSection(participants, found.contacts);

  return CardService.newCardBuilder()
    .addSection(msgSection)
    .addSection(contactsSection)
    .build();
}

function buildContactsSection(participants, contacts) {
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
          .setParameters({ address: p.address, email: p.email })));
    }
    section.addWidget(row);
  });
  return section;
}

function handleAddContact(e) {
  var config = getConfig();
  var p = e.parameters;

  var contact;
  try {
    contact = CiviCrmService.addContact(config, p.address);
  } catch (err) {
    return actionResponse('Could not add: ' + err.message);
  }

  var text = contact.created
    ? 'Added ' + p.email + ' to CiviCRM.'
    : p.email + ' already exists in CiviCRM.';
  return actionResponse(text, buildContactCard(config, buildMsgInfo(readCurrentMessage(e), getTimeZone(e))));
}

function handleRecordActivity(e) {
  var config = getConfig();
  var message = readCurrentMessage(e);

  var activity;
  try {
    activity = CiviCrmService.recordActivity(config, {
      subject: message.getSubject(),
      details: plainTextToHtml(message.getPlainBody() || '(No message body)'),
      from: message.getFrom(),
      to: splitAddressHeader(message.getTo()),
      cc: splitAddressHeader(message.getCc()),
      bcc: splitAddressHeader(message.getBcc()),
      messageId: getRfcMessageId(message)
    });
  } catch (err) {
    return actionResponse('Could not record: ' + err.message);
  }

  var text = activity.created
    ? 'Email recorded in CiviCRM.'
    : 'This email was already recorded in CiviCRM.';
  return actionResponse(text, buildContactCard(config, buildMsgInfo(message, getTimeZone(e))));
}
