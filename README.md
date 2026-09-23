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

1. In CiviCRM go to **Administer » System Settings » Gmail Connect Settings**
   and copy the Site URL and API key.
2. Open the add-on in Gmail and enter them on the "Connect your CiviCRM" card.

The settings are stored per Google Workspace domain.

### Recording

- The sender (From) is the source contact; To, Cc and Bcc recipients are the
  targets. CiviCRM creates contacts that don't exist yet, using the name in
  the address (e.g. `Jane Doe <jane@doe.com>`).
- The email's `Message-ID` header identifies it, so an email already recorded
  (e.g. by another recipient) is not recorded again.
- The plain-text body is recorded, so HTML from external senders is never
  rendered in CiviCRM.
