## CiviCRM Connect

CiviCRM addon for gmail

### Feature

- Record emails as `External Email` activity against Contact
- Creates new contact if it does exists
- Prevents duplicate contact and activity recording

### Requirements

The CiviCRM site needs the Gmail Connect CiviCRM extension (`gmailconnect`).
On install it creates a user with an API key and the endpoints this
add-on uses.

### Setup

CiviCRM Connect is set up once per organisation (Google Workspace domain).
Personal Gmail accounts aren't supported.

1. In CiviCRM go to **Administer » System Settings » Gmail Connect Settings**
   and copy the Site URL and API key.
2. Open the add-on in Gmail and enter them on the "Connect your CiviCRM" card.
   The Site URL must use `https://`.

Whoever saves the first working URL and key becomes the organisation's admin
and can add other admins (addresses in the same domain) under **Settings** in
the add-on's menu. Everyone else in the organisation can use the add-on
straight away; they see which CiviCRM it's connected to and who manages it.

The add-on can only reach CiviCRM sites whose address ends in one of the
domains in `urlFetchWhitelist` in `appsscript.json` (`.org`, `.com`, `.net`,
`.uk`, `.ie`, `.eu`, `.coop`, `.ngo`, `.io`).

### Data

- Each organisation's CiviCRM URL, API key and admin list are stored in the
  add-on's script properties, in the publisher's Google Apps Script project.
- When an email is opened, the participants' email addresses and the email's
  `Message-ID` are sent to the organisation's CiviCRM to look up contacts.
- When an email is recorded, its subject, plain-text body, addresses and
  `Message-ID` are sent to the organisation's CiviCRM.

### Recording

- The sender (From) is the source contact; To, Cc and Bcc recipients are the
  targets. CiviCRM creates contacts that don't exist yet, using the name in
  the address (e.g. `Jane Doe <jane@doe.com>`).
- The email's `Message-ID` header identifies it, so an email already recorded
  (e.g. by another recipient) is not recorded again.
- The plain-text body is recorded, so HTML from external senders is never
  rendered in CiviCRM.
