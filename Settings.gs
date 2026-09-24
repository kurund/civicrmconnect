/**
 * Organisation settings, domain-keyed config storage, and the cards shown to
 * users.
 *
 * Each Google Workspace domain has one config: the CiviCRM URL and API key,
 * and the admins who may change them. Whoever first saves a working URL and
 * key becomes an admin; admins can add others from the same domain.
 */

function getDomainConfig(domain) {
  var raw = PropertiesService.getScriptProperties().getProperty('config_' + domain);
  return raw ? JSON.parse(raw) : null;
}

/** Config for the active user's domain, or null if not connected yet. */
function getConfig() {
  return getDomainConfig(getUserDomain());
}

function saveDomainConfig(domain, config) {
  PropertiesService.getScriptProperties().setProperty('config_' + domain, JSON.stringify(config));
}

/**
 * Whether the active user may change the organisation's settings: anyone
 * while nothing is saved (or for configs saved before admins existed),
 * otherwise only the listed admins.
 */
function canManage(config) {
  return !config || !config.admins || config.admins.indexOf(getUserEmail()) > -1;
}

/** Settings form for admins, or a read-only summary for everyone else. */
function buildSettingsCard(message, config) {
  var section = CardService.newCardSection();
  if (message) {
    section.addWidget(CardService.newTextParagraph().setText(message));
  }

  if (!canManage(config)) {
    section.addWidget(CardService.newTextParagraph().setText('Connected to ' + config.baseUrl));
    section.addWidget(CardService.newTextParagraph().setText(
      'Managed by ' + config.admins.join(', ') + '. Ask one of them to change these settings.'));
    return CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle('Settings'))
      .addSection(section)
      .build();
  }

  section.addWidget(CardService.newTextParagraph().setText(
    'Copy the Site URL and API key from CiviCRM: Administer » System Settings » Gmail Connect Settings.'));
  section.addWidget(CardService.newTextInput()
    .setFieldName('baseUrl')
    .setTitle('CiviCRM Site URL')
    .setHint('https://yourorg.org')
    .setValue(config ? config.baseUrl : ''));
  section.addWidget(CardService.newTextInput()
    .setFieldName('apiKey')
    .setTitle('API Key')
    .setHint(config ? 'Leave blank to keep the current key' : ''));
  section.addWidget(CardService.newTextInput()
    .setFieldName('admins')
    .setTitle('Admins')
    .setHint('@' + getUserDomain() + ' addresses that can change these settings, one per line')
    .setMultiline(true)
    .setValue(config && config.admins ? config.admins.join('\n') : getUserEmail()));
  if (config && config.updatedBy) {
    section.addWidget(CardService.newTextParagraph().setText(
      'Last changed by ' + config.updatedBy + ' on ' + config.updatedAt.substring(0, 10) + '.'));
  }
  section.addWidget(CardService.newTextButton()
    .setText('Save & Test Connection')
    .setOnClickAction(CardService.newAction().setFunctionName('handleSaveSettings')));

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle(config ? 'Settings' : 'Connect your CiviCRM'))
    .addSection(section)
    .build();
}

/**
 * Tests and saves the organisation's settings. The user saving is always kept
 * as an admin, and all admins must be from the same domain. On failure only a
 * notification is shown, so the form keeps what was typed.
 */
function handleSaveSettings(e) {
  if (isPersonalAccount()) {
    return actionResponse('CiviCRM Connect needs a Google Workspace account.');
  }
  var domain = getUserDomain();
  var me = getUserEmail();
  var input = e.formInput;

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var current = getDomainConfig(domain);
    if (!canManage(current)) {
      return actionResponse('Only your organisation\'s CiviCRM Connect admins can change these settings.',
        buildSettingsCard(null, current));
    }

    var admins = (input.admins || '').split(/[\s,;]+/)
      .map(function (a) { return a.trim().toLowerCase(); })
      .filter(function (a, i, all) { return a && all.indexOf(a) === i; });
    if (admins.indexOf(me) === -1) {
      admins.unshift(me);
    }
    var config = {
      baseUrl: (input.baseUrl || '').trim().replace(/\/+$/, ''),
      apiKey: (input.apiKey || '').trim() || (current ? current.apiKey : ''),
      admins: admins,
      updatedBy: me,
      updatedAt: new Date().toISOString()
    };

    try {
      var outsiders = admins.filter(function (a) { return !/@/.test(a) || a.split('@')[1] !== domain; });
      if (outsiders.length) {
        throw new Error('Admins must be @' + domain + ' addresses: ' + outsiders.join(', '));
      }
      if (config.baseUrl.indexOf('https://') !== 0) {
        throw new Error('The Site URL must start with https://');
      }
      CiviCrmService.testConnection(config);
    } catch (err) {
      return actionResponse('Not saved: ' + err.message);
    }

    saveDomainConfig(domain, config);
    return actionResponse('Saved. Open any email to look up its contacts.', buildHomepageCard(config));
  } finally {
    lock.releaseLock();
  }
}

function buildPersonalAccountCard() {
  var section = CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(
    'CiviCRM Connect needs a Google Workspace account. Personal Gmail accounts aren\'t supported.'));
  return CardService.newCardBuilder()
    .addSection(section)
    .build();
}

/** Action response with a notification, optionally replacing the current card. */
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
    .addWidget(CardService.newTextParagraph().setText('Connected to ' + config.baseUrl));
  if (config.admins) {
    section.addWidget(CardService.newTextParagraph().setText('Managed by ' + config.admins.join(', ')));
  }
  section.addWidget(CardService.newTextParagraph().setText('Open an email to see its contacts in CiviCRM.'));

  return CardService.newCardBuilder()
    .addSection(section)
    .build();
}

/** From/To/Date/Preview block. */
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
      .setText('This email has no Message-ID header, so it cannot be recorded.'));
  } else {
    msgSection.addWidget(CardService.newTextButton()
      .setText('Record this email')
      .setOnClickAction(CardService.newAction().setFunctionName('handleRecordActivity')));
  }

  // Bottom: everyone on the message, each with a View or Add button.
  var contactsSection = buildContactsSection(participants, found.contacts);

  return CardService.newCardBuilder()
    .addSection(msgSection)
    .addSection(contactsSection)
    .build();
}

/** Lists each participant with a View (exists) or Add (missing) button. */
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

/** Adds a single participant to CiviCRM, then refreshes the card. */
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

/**
 * Records the email in CiviCRM: the sender is the source contact and the
 * To/Cc/Bcc recipients are targets. CiviCRM creates any missing contacts and
 * returns the existing activity if the email was already recorded.
 */
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
  // Refresh so the card shows the recorded state and any new contacts.
  return actionResponse(text, buildContactCard(config, buildMsgInfo(message, getTimeZone(e))));
}
