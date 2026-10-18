# IM Warehouse

Order tracker for the Intimissi / Karwa warehouse, Delhi: orders from the Sales Tracker, then allocate to picker, pick (with short qty), check, bill, pack, delivery allocation, dispatch.

App: https://pramod-lgtm.github.io/im-sales/warehouse/
Backend: Google Apps Script Web app (Code.gs kept outside this repo, see SETUP.md given with it).

## Demo logins (change the PINs in Admin after first login)
| Role | Username | PIN | Sees |
|---|---|---|---|
| Admin | admin | 1234 | everything, users, vehicles |
| Warehouse manager | manager | 2222 | all orders, allocate to picker, cluster, billing, delivery, dashboard |
| Picker | picker1 | 3333 | only orders allocated to him |
| Checker | checker1 | 4444 | picked orders to check |
| Biller | biller1 | 5555 | checked orders to bill, hold/unhold, billing import |
| Packer | packer1 | 6666 | billed orders to pack |
| Dispatch | dispatch1 | 7777 | billed/packed orders, delivery allocation, dispatch |

## Flow
1. Sales Tracker orders (Calls with order Trylo / C9) sync every 15 min, or "Sync now".
2. Manager allocates to picker. Picker enters picked qty (short qty shown). Checker checks. Biller enters invoice no, qty, value (or imports the Fusion ERP CSV/XLSX). Packer enters boxes. Dispatch sets mode, vehicle, payment mode, then dispatches.
3. Hold / unhold with reason at any stage before dispatch. Held orders show in Dashboard > Pending to bill with age.
4. Order screen lists nearby pending orders (same area / route / within 3 km). Cluster tab groups pending orders by area.

Tap the top title to log out.

## Done by names
At allocation the manager assigns picker, checker, biller and packer. At every step the "Done by" dropdown (users of that role + Admin > Staff names + "Other name") records who actually did the work, so one shared login per counter is fine. Names show in the timeline, order list, CSV export and efficiency table.

## Dealers, area and zone
Dealers tab (admin, manager): search, filter by zone/area, edit zone/area/route/mobile/lat/lng, bulk-set zone, CSV download/upload (id, name, area, zone, route). Area/zone can also be changed from an order. Local edits are never overwritten by the Sales Tracker sync. Cluster view and nearby orders group by zone, then area, then route.

## Billing template
Billing > "Download template" gives `Billing_Import_Template.xlsx`; its headers map automatically. EXAMPLE rows are skipped.
