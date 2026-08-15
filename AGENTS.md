# Context: AutoSouk (Car Marketplace & Inspection App)

## Overview

You are acting as an expert React developer and Node architect working on "AutoSouk" a decentralized marketplace application where users can buy, sell, and request independent mechanical inspections for vehicles.

### Tech Stack

- Frontend: React with typescript

- Backend / Database: Node, Express, Typescript, Postgres, Drizzle ORM

### Core Roles & User Flows

The app supports three main perspectives, selectable via a header toggle:

- **Buyer (Role: buyer)**

Goal: Browse available cars and ensure they are reliable before purchasing.

Capabilities:

- View all cars with.
- Filter cars.
- Favor cars
- Initiate a "Request Inspection" action on available cars.
- View the detailed results of any completed inspection reports attached to a car.

- **Seller (Role: seller)**

Goal: Post cars for sale and manage their listings.

Capabilities:

- Post a new car (Make, Model, Year, Price, City, Description).
- View their own active listings (filtered by sellerId).
- Delete their own listings.
- View inspection reports completed on their cars.

- **Mechanic (Role: mechanic)**

Goal: Fulfill inspection requests to build trust in the marketplace.

Capabilities:

- View a queue of all cars with a status of pending_inspection.
- "Pick up" a request by starting an inspection report.
- Submit a report containing a summary and detailed findings.

#### Project Rules

Always follow the guidelines defined in `.agents/rules/`

## Spec-Kit

This repository uses the [spec-kit](https://github.com/github/spec-kit) workflow for AI-assisted feature development.
Spec-kit is a convention for structuring feature specs, plans, and tasks in a `.specify/` directory so that AI agents can read and act on them.
This project uses an opinionated local tooling layer to generate the artifacts that live there — the source of truth for the workflow itself is the spec-kit repo linked above.

### `.specify/` directory

| Path | Purpose |
|------|---------|
| `.specify/templates/` | Markdown templates for specs, plans, tasks, and checklists |
| `.specify/memory/` | Long-lived context files (e.g. `constitution.md`) read by agents |
| `.specify/scripts/` | Helper shell scripts for common workflow steps |
| `.specify/hooks.yml` | CI/automation hook definitions |

### How to use it

- Start a new feature: `/speckit-specify` — creates a spec from a template and opens a clarification loop.
- Generate a plan: `/speckit-plan` — converts an approved spec into a structured plan.
- Break into tasks: `/speckit-tasks` — decomposes a plan into trackable tasks.
- Implement: `/speckit-implement` — works through tasks and updates checklists.
