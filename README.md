# INVOICER by wahid

**Windows invoicing and GST workflow for small businesses.** Create invoices, track collections, and manage party balances from a desktop app backed by a local database file.

![Invoicer Business Suite dashboard](docs/images/dashboard.jpg)

## Screenshots

The screenshots below show the current app interface. The workspace used for these captures has no saved business records yet, so registers and totals are empty.

### GST invoice entry

![Invoice editor with GST slab selection and taxable line amount](docs/images/invoice-editor.jpg)

### Invoice register

![Invoice register](docs/images/invoices.jpg)

### Outstanding bills

![Outstanding bills register](docs/images/outstanding.jpg)

### Party ledger

![Party ledger](docs/images/party-ledger.jpg)

### Payment vouchers

![Payment vouchers](docs/images/payment-vouchers.jpg)

## Download for Windows

Open the [latest GitHub release](https://github.com/wahid0018/invoicer-by-wahid/releases/latest) and choose the installer that fits:

- **Offline setup** — `Invoicer-Business-Suite-Setup-1.0.11.exe`; includes the app package.
- **Web setup** — `Invoicer-Business-Suite-Web-Setup-1.0.11.exe`; a small installer that downloads the app package during setup.

The app includes its own Electron runtime. You do not need to install Node.js separately.

## Features

- Create and print GST invoices with configurable GST-inclusive or GST-exclusive rates, taxable line amounts, GST slabs, and a tax summary before the total.
- Track sales, due invoices, and party balances in sales, outstanding, and ledger registers.
- Record payment vouchers and allocate receipts against outstanding invoices.
- Share invoice and register PDFs through WhatsApp.
- Maintain parties, items and services, units, agents, transporters, company details, and invoice or delivery settings.
- Create delivery notes and export e-way bill JSON data.
- Save work in a local `.invoicerdb` file with backup and restore tools.
- Check GitHub Releases for app updates.

## Data and tax notes

Business data is kept in the local database file; this release does not sync with Supabase or another cloud database. Keep a separate backup of the `.invoicerdb` file.

GSTR-1 and e-way bill outputs are provided as workflow tools and should be checked before statutory use. The app is not a certified tax filing service.

## Documentation

- [Install the Windows app](INSTALLATION.md)
- [Features and limitations](FEATURES_AND_LIMITATIONS.md)
- [Database, backup, and privacy](DATA_AND_BACKUP.md)
- [App updates](UPDATES.md)

Application source code is not published in this repository. For support, contact the repository owner.
