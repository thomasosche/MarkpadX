# PR3 reproduction

Manual test fixture for the Action Plan view (from the PR #3 Windows review). Open in preview, press Ctrl+Shift+A, select all five status chips, note the source order G2, G1, G3, G10, then sort repeatedly by Owner / ID / Status in both directions and switch back to Document order.

Expected: G2 keeps its blocker label after every sort; Document order is always G2, G1, G3, G10; G2 stays before G1 whenever their sort keys are equal; the Sev chips stay MAJOR / MINOR / DOC.

**Status:** Active; top blocker G2.

**Legend:** 🔴 open · 🟡 in progress · 🟩 implemented in draft · 🟢 done · ⚪ no active action

### Track A

| ID | Sev | Issue | Action | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| G2 | MAJOR | First source row; blocker. | Check evidence. | TO | 🔴 Open |
| G1 | MINOR | Second source row; same owner/status as G2. | Preserve tie order. | TO | 🔴 Open |
| G3 | DOC | Third source row; completed. | Retain history. | QM | 🟢 Done |
| G10 | MINOR | Fourth source row; natural ID sort puts it last. | Check G10 after G3. | AB | 🟡 In progress |
