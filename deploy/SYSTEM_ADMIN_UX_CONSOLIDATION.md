# System Admin UX Consolidation

## Direction

This pass reduces cognitive load instead of adding new capability.

## Changes

- Main navigation now uses Turkish operational terminology.
- Sidebar domains are grouped under collapsible sections.
- Finance Center uses contextual tabs instead of stacking every workflow at once.
- Incident Center uses operational tabs for active, critical, historical, root-cause, escalation, and resolved views.
- Tenant workspace navigation moved to consistent Turkish labels.

## Design Rule

Each surface should answer one operator question at a time:

- What needs attention?
- What changed?
- What should I do next?

The system should reveal depth progressively rather than presenting every workflow simultaneously.

## Follow-On Cleanup

1. Finish replacing remaining English microcopy and mojibake legacy strings.
2. Move subscriber creation fully out of Tenant Home into a dedicated onboarding route.
3. Add tabbed operations center sections for queues, workers, devices, printers, sync, and event flow.
4. Standardize saved-view and command-palette language across all domains.
