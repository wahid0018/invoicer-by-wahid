# Features and limitations

INVOICER by wahid is a browser and Windows desktop app for preparing invoices and tracking sales and receipts. The current Windows package is **1.0.11**.

## Included workflows

- **GST invoices:** Add line items, select a GST slab, choose whether item rates include GST, and review taxable amounts and GST before the invoice total. Interstate invoices show IGST; intrastate invoices show CGST and SGST. Invoice print layouts include the tax breakdown.
- **Collections and balances:** Review sales, due invoices, and party ledgers. The Outstanding register filters unpaid bills and supports printing selected bills or the full register. Payment vouchers can apply due amounts to invoices and calculate the receipt amount from the allocations.
- **PDF sharing:** Print invoices, ledgers, and registers, or save a PDF and open WhatsApp with a prepared message.
- **Business records:** Maintain parties, agents, transporters, items and services, units, company details, and invoice and delivery settings. Create delivery notes.
- **Backups:** Work with a local `.invoicerdb` database file and use the backup and restore tools.
- **Cloud workspace:** With Supabase configured, web and desktop clients can share company data. Desktop installations can retain a local database file for offline access.
- **Updates:** The app checks the public GitHub Releases page for updates when it starts.

## Limitations

- Cloud sync requires the Supabase schema and cloud-record migration to be applied. The compatibility sync detects record conflicts but is not the final normalized, audit-ledger accounting backend.
- Existing local accounts and `.invoicerdb` files need a deliberate migration into Supabase; they are not silently uploaded or merged.
- GSTR-1 and e-way bill tools provide report or JSON output that should be independently reviewed before filing or statutory use. The app is not a certified tax filing service.
- Keep independent backups of the `.invoicerdb` file, especially before installing an update.
- The Windows installers are currently unsigned, so Windows may show a publisher warning during installation.
