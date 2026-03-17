# Notifications

## Current Scope

The notification module is worker-driven only in MVP. There are no public or merchant HTTP routes for notification management.

Current behavior:

- outbox events from ORD, PAY, and PUB are converted into planned notifications
- planned notifications are stored in `notification_jobs`
- dispatch attempts are stored in `notification_delivery_attempts`
- provider delivery currently uses Twilio SMS
- failed jobs can retry or move to the notification DLQ

## Queue Names

- `notifications.dispatch`
- `notifications.dispatch.dlq`

## Operator Commands

- `corepack pnpm ops:status`
- `corepack pnpm ops:dlq:list notifications`
- `corepack pnpm ops:dlq:replay notifications <jobId>`

## Current Triggers

- `Order.Created`
- selected `Order.StateChanged` transitions
- `Payment.Succeeded`
- `Payment.Failed`
- `Publish.Completed`

## Current Delivery Model

- templates live in code
- recipient masking is used in logs
- dedupe is DB-backed through `dedupe_key`
- retry classification is provider-result driven

## Useful Tables

- `outbox_events`
- `notification_jobs`
- `notification_delivery_attempts`
