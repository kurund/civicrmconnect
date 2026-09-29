# Privacy policy

_Last updated: 30 September 2026_

This policy explains how the CiviCRM Connect Gmail add-on ("the add-on"), published by Third Sector Design ("we"), handles your data.

## Summary

The add-on connects Gmail to **your own** CiviCRM site. Email data goes only from Gmail to the CiviCRM site you connect. We don't run a server for the add-on, and we don't collect, store, sell or share your email data.

## What the add-on accesses

| Data | When | Why |
|---|---|---|
| The email you have open: sender, recipients (To, Cc, Bcc), subject, date, body and `Message-ID` header | Only while you have that email open with the add-on | To show and record the people on the email |
| Your Google account email address | When you open an email | To leave you out of the list of people on the email |
| Your locale and time zone | When you open an email | To show the email's date in your time zone |

The add-on can't read any email other than the one you have open, and it can't send, change or delete email.

## What is sent to your CiviCRM site

The add-on sends data only to the CiviCRM site whose URL you paste in, and only for these actions:

- **When you open an email:** the email addresses of the people on it and its `Message-ID`, so the add-on can show who is already in CiviCRM and whether the email is already recorded.
- **When you click Add:** that person's name and email address, to create a contact.
- **When you click Record this email:** the subject, plain-text body, sender, recipients and `Message-ID`, to create an activity.

Once data reaches your CiviCRM site, the organization that runs that site controls it, under its own privacy policy.

## What the add-on stores

The add-on stores your CiviCRM URL (which includes your personal access token), the site address and your CiviCRM display name, in Google Apps Script user properties in your Google account. Only the add-on, running as you, can read them. Clicking **Disconnect** under **Settings** deletes them.

Email content isn't stored by the add-on. The preview shown in the add-on is read from Gmail each time.

## Error logs

If the add-on hits an unexpected error, Google Apps Script records the error message in our Google Cloud project's logs. These messages may include the address of your CiviCRM site. They don't include email content. Logs are kept for Google Cloud Logging's default retention period and are only used to fix bugs.

## Sharing

We don't sell, rent or share your data with anyone. We don't use your data for advertising, and we don't use it to train AI or machine-learning models. No person at Third Sector Design reads your data.

## Google API Services User Data Policy

CiviCRM Connect's use and transfer of information received from Google APIs to any other app will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Removing access

- Click **Disconnect** under **Settings** in the add-on to delete your stored CiviCRM URL.
- Regenerate your URL in CiviCRM (**Contacts » Gmail Connect**) so the old one stops working.
- Uninstall the add-on, or remove its access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

To remove data already recorded in CiviCRM, contact whoever runs your CiviCRM site.

## Changes

If we change this policy, we'll update the date at the top of this page.

## Contact

Third Sector Design, [info@thirdsectordesign.org](mailto:info@thirdsectordesign.org), or [GitHub Issues](https://github.com/kurund/civicrmconnect/issues).
