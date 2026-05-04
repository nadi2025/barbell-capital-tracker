# How to remove the Private Investments module

This module was added as a fully isolated feature. Removing it does not affect
any other part of the application.

## Option A: Disable temporarily (no code changes)

Add to `.env.local`:
```
VITE_ENABLE_PRIVATE_MODULE=false
```
Restart the dev server. The module's routes and nav items disappear.
Data in Base44 is preserved — flip the flag back to re-enable.

## Option B: Remove permanently

1. Delete folder: `src/pages/private/`
2. Delete folder: `src/components/private/`
3. Delete file:   `src/lib/privateMath.js`
4. Delete file:   `src/hooks/usePrivateData.js`
5. In `src/App.jsx`: remove everything between
   `// ===== PRIVATE INVESTMENTS MODULE — START =====` and
   `// ===== PRIVATE INVESTMENTS MODULE — END =====`
   (there are TWO such blocks: one for imports, one for routes)
6. In `src/components/Layout.jsx`: remove everything between
   the START/END markers (TWO blocks: one for `privateNav`, one for the JSX,
   and review the `lucide-react` import line — remove `Briefcase` if it's no
   longer used elsewhere)
7. In `src/lib/app-params.js`: remove the `ENABLE_PRIVATE_MODULE` export
   block (between START/END markers)
8. In Base44 admin panel, delete entities:
   - `PrivateInvestment`
   - `PrivateInvestmentValuation`
   - `PrivateDebtInvestor`
   - `PrivateInterestPayment`
9. Delete entity files:
   - `base44/entities/PrivateInvestment.jsonc`
   - `base44/entities/PrivateInvestmentValuation.jsonc`
   - `base44/entities/PrivateDebtInvestor.jsonc`
   - `base44/entities/PrivateInterestPayment.jsonc`

After these steps, no trace of the module remains. The rest of the app
(IB tracking, crypto, AAVE, dashboard, weekly report, etc.) is untouched.
