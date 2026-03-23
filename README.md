# LSA Disputed Lead Alerter

Google Ads Script that monitors Local Services Ads (LSA) campaigns for performance anomalies that may indicate disputed or low-quality leads.

## What it does

1. Queries LSA campaign metrics (cost, conversions, phone calls) for the last 7 days
2. Compares against a 30-day baseline to detect anomalies
3. Flags campaigns with conversion drops, zero-conversion spend, or cost spikes
4. Sends an HTML email alert with flagged campaigns and issues

## Important limitation

The `local_services_lead` GAQL resource is **not available** in standard Google Ads Scripts. This script monitors campaign-level metrics as a proxy for lead quality issues. For direct lead-level dispute tracking, use:
- The LSA Lead Inbox in Google Ads UI
- The Local Services Ads API (REST)

## Setup

1. Open [Google Ads Scripts](https://ads.google.com/aw/bulk/scripts)
2. Create a new script and paste the contents of `main_en.gs` (or `main_fr.gs`)
3. Edit the `CONFIG` block at the top
4. Run once in test mode, review the logs
5. Set `TEST_MODE: false` and schedule (e.g., daily)

## CONFIG reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `TEST_MODE` | boolean | `true` | `true` = log only, `false` = log + email |
| `EMAIL` | string | `'contact@domain.com'` | Alert recipient email |
| `MIN_COST_FOR_ALERT` | number | `50` | Minimum spend ($) before triggering alert |
| `CONVERSION_DROP_PCT` | number | `50` | Alert if conversions drop by this percentage |
| `LOOKBACK_DAYS` | number | `7` | Current period for comparison |
| `COMPARISON_DAYS` | number | `30` | Baseline period for comparison |
| `CAMPAIGN_NAME_CONTAINS` | string | `''` | Filter campaigns (empty = all LSA) |

## How it works

- Queries `campaign` resource filtered by `advertising_channel_type = "LOCAL_SERVICES"`
- Compares recent metrics against a normalized baseline (30-day average scaled to 7-day window)
- Detects three anomaly types: conversion drops, zero-conversion spend, and cost-per-conversion spikes
- Sends a structured HTML email with campaign details and issues

## Requirements

- Google Ads account with Local Services Ads campaigns
- Google Ads Scripts access

## License

MIT - Thibault Fayol Consulting
