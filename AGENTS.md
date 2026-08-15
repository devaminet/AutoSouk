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
