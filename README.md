## CiviCRM Connect

CiviCRM addon for gmail

### Feature

- Record emails as `External Email` activity against Contact
- Creates new contact if it does exists
- Prevents duplicate contact and activity recording

### Requirements

The CiviCRM site needs the Gmail Connect CiviCRM extension (`gmailconnect`),
which provides the endpoint this add-on calls. Each user needs a CiviCRM login
with the `access Gmail Connect endpoints` permission.

### Setup

Each user connects once with their own URL:

1. In CiviCRM go to **Contacts >> Gmail Connect** and copy your personal URL.
2. Open the add-on in Gmail and paste it on the "Connect your CiviCRM" card
   (or under **Settings** in the add-on's menu). The URL must use `https://`.

The add-on then shows which CiviCRM site you're connected to and as whom.
Actions in CiviCRM are carried out as you. **Disconnect** under Settings
removes your URL from the add-on; regenerating the URL in CiviCRM stops the
old one working.

The add-on can only reach CiviCRM sites whose address ends in one of the
domains in `urlFetchWhitelist` in `appsscript.json` (`.org`, `.com`, `.net`,
`.uk`, `.ie`, `.eu`, `.coop`, `.ngo`, `.io`).

### Recording

- The sender (From) is the source contact; To, Cc and Bcc recipients are the
  targets. CiviCRM creates contacts that don't exist yet, using the name in
  the address (e.g. `Jane Doe <jane@doe.com>`).
- The email's `Message-ID` header identifies it, so an email already recorded
  (e.g. by another recipient) is not recorded again.
- The plain-text body is recorded, so HTML from external senders is never
  rendered in CiviCRM.
