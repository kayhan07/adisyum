# Template Pack Intelligence Architecture

## Purpose

Template packs turn an empty tenant into an operational tenant in minutes while preserving tenant ownership and isolation.

## Data Model

- `template_packs`
- `template_pack_items`
- `template_pack_imports`
- `product_templates`
- `recipe_templates`
- `recipe_template_items`
- `stock_templates`
- `category_templates`

Versioning is first-class:

- every pack has `version`
- packs and templates support `active` / `deprecated`
- imports record imported pack version
- tenant runtime copies remain isolated after import

## Smart Onboarding Flow

Route:

- `/onboarding`

Steps:

1. restaurant type
2. business scale
3. recommended pack selection
4. import preview
5. service configuration
6. final provisioning

APIs:

- `GET /api/templates/packs`
- `POST /api/templates/preview`
- `POST /api/templates/packs/import`

## Import Preview

Preview reports:

- selected pack count
- product count
- recipe count
- recipe line count
- stock cards to create
- existing stock matches
- duplicate imports

## Intelligent Stock Matching

Matching uses:

- normalized Turkish-safe names
- alias sets
- duplicate prevention

Examples:

- `Milk` can match `Sut` / `Süt`
- `Sugar` can match `Seker` / `Şeker`

The engine suggests reuse vs creation before import.

## Operational Defaults

Pack defaults can include:

- takeaway flag
- service charge
- printer routes
- kitchen groups
- table preset
- modifier groups

Starter packs currently seeded:

- Cafe Starter Pack
- Kebapci Starter Pack
- Meyhane Pack
- Balik Restaurant Pack

## System-Admin Operations

System-admin template module exposes:

- template count
- pack count
- restaurant-type coverage
- import count
- pack list
- template import analytics

Next production upgrades:

- pack CRUD
- publish/version workflow
- failed import dashboard
- onboarding completion analytics
- preview rollback UI
- batch import progress records
- modifier/combo/template graph expansion

## Scaling Notes

The current import path is transactional and duplicate-safe. For packs above hundreds of templates, the next step is chunked jobs with explicit progress rows while preserving atomic rollback per chunk.
