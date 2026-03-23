/**
 * ==========================================================================
 * LSA Disputed Lead Alerter — Google Ads Script
 * ==========================================================================
 * Monitors Local Services Ads (LSA) campaigns for performance anomalies
 * that may indicate disputed or declined leads. Sends email alerts when
 * metrics deviate from expected baselines.
 *
 * IMPORTANT LIMITATION: The local_services_lead GAQL resource is not
 * available in standard Google Ads Scripts. This script uses an alternative
 * approach — monitoring LSA campaign metrics for anomalies (sudden drops
 * in conversions, spikes in cost without leads, etc.).
 *
 * For direct lead-level dispute tracking, use the Local Services Ads API
 * (REST) or the Google Ads UI Lead Inbox.
 *
 * Author:  Thibault Fayol — Consultant SEA
 * Website: https://thibaultfayol.com
 * License: MIT — Thibault Fayol Consulting
 * ==========================================================================
 */

var CONFIG = {
  TEST_MODE: true,
  EMAIL: 'contact@domain.com',
  MIN_COST_FOR_ALERT: 50,
  CONVERSION_DROP_PCT: 50,
  LOOKBACK_DAYS: 7,
  COMPARISON_DAYS: 30,
  CAMPAIGN_NAME_CONTAINS: ''
};

function main() {
  try {
    var tz = AdsApp.currentAccount().getTimeZone();
    var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var accountName = AdsApp.currentAccount().getName();

    Logger.log('=== LSA Disputed Lead Alerter ===');
    Logger.log('Account: ' + accountName);
    Logger.log('Date: ' + today);

    var recentQuery =
      'SELECT campaign.id, campaign.name, ' +
      'metrics.clicks, metrics.conversions, metrics.cost_micros, ' +
      'metrics.phone_calls, metrics.all_conversions ' +
      'FROM campaign ' +
      'WHERE campaign.advertising_channel_type = "LOCAL_SERVICES" ' +
      'AND segments.date DURING LAST_7_DAYS ' +
      'AND metrics.cost_micros > 0';

    var recentRows = AdsApp.search(recentQuery);
    var campaigns = {};

    while (recentRows.hasNext()) {
      var row = recentRows.next();
      var id = row.campaign.id;
      var name = row.campaign.name;

      if (CONFIG.CAMPAIGN_NAME_CONTAINS &&
          name.indexOf(CONFIG.CAMPAIGN_NAME_CONTAINS) === -1) continue;

      campaigns[id] = {
        name: name,
        recentClicks: row.metrics.clicks || 0,
        recentConversions: row.metrics.conversions || 0,
        recentCost: (row.metrics.costMicros || 0) / 1000000,
        recentPhoneCalls: row.metrics.phoneCalls || 0,
        recentAllConversions: row.metrics.allConversions || 0
      };
    }

    var campaignIds = Object.keys(campaigns);
    Logger.log('Found ' + campaignIds.length + ' LSA campaign(s) with spend.');

    if (campaignIds.length === 0) {
      Logger.log('No LSA campaigns found. Done.');
      return;
    }

    var baselineQuery =
      'SELECT campaign.id, ' +
      'metrics.clicks, metrics.conversions, metrics.cost_micros, ' +
      'metrics.phone_calls, metrics.all_conversions ' +
      'FROM campaign ' +
      'WHERE campaign.advertising_channel_type = "LOCAL_SERVICES" ' +
      'AND segments.date DURING LAST_30_DAYS ' +
      'AND metrics.cost_micros > 0';

    var baselineRows = AdsApp.search(baselineQuery);
    while (baselineRows.hasNext()) {
      var bRow = baselineRows.next();
      var bId = bRow.campaign.id;
      if (!campaigns[bId]) continue;

      var factor = CONFIG.LOOKBACK_DAYS / CONFIG.COMPARISON_DAYS;
      campaigns[bId].baselineConversions = (bRow.metrics.conversions || 0) * factor;
      campaigns[bId].baselineCost = ((bRow.metrics.costMicros || 0) / 1000000) * factor;
      campaigns[bId].baselineClicks = (bRow.metrics.clicks || 0) * factor;
    }

    var alerts = [];

    for (var i = 0; i < campaignIds.length; i++) {
      var c = campaigns[campaignIds[i]];
      if (!c.baselineConversions && c.baselineConversions !== 0) continue;

      var convDropPct = c.baselineConversions > 0
        ? ((c.baselineConversions - c.recentConversions) / c.baselineConversions) * 100
        : 0;

      var costPerConv = c.recentConversions > 0
        ? c.recentCost / c.recentConversions
        : (c.recentCost > 0 ? Infinity : 0);

      var baselineCPC = c.baselineConversions > 0
        ? c.baselineCost / c.baselineConversions
        : 0;

      var issues = [];

      if (convDropPct >= CONFIG.CONVERSION_DROP_PCT && c.recentCost >= CONFIG.MIN_COST_FOR_ALERT) {
        issues.push('Conversions dropped ' + convDropPct.toFixed(0) + '% vs baseline');
      }

      if (c.recentConversions < 0.5 && c.recentCost >= CONFIG.MIN_COST_FOR_ALERT) {
        issues.push('$' + c.recentCost.toFixed(2) + ' spent with 0 conversions');
      }

      if (costPerConv > baselineCPC * 2 && baselineCPC > 0 && costPerConv !== Infinity) {
        issues.push('Cost/conv $' + costPerConv.toFixed(2) + ' vs baseline $' + baselineCPC.toFixed(2));
      }

      if (issues.length > 0) {
        alerts.push({
          campaign: c.name,
          recentCost: c.recentCost.toFixed(2),
          recentConversions: c.recentConversions,
          baselineConversions: (c.baselineConversions || 0).toFixed(1),
          phoneCalls: c.recentPhoneCalls,
          issues: issues
        });
      }
    }

    Logger.log('Alerts generated: ' + alerts.length);

    for (var a = 0; a < alerts.length; a++) {
      Logger.log('ALERT: ' + alerts[a].campaign + ' — ' + alerts[a].issues.join(' | '));
    }

    if (!CONFIG.TEST_MODE && alerts.length > 0) {
      sendAlert_(accountName, today, alerts);
    }

    Logger.log('=== Done ===');

  } catch (e) {
    Logger.log('FATAL ERROR: ' + e.message);
    if (!CONFIG.TEST_MODE) {
      MailApp.sendEmail(
        CONFIG.EMAIL,
        'ERROR — LSA Disputed Lead Alerter — ' + AdsApp.currentAccount().getName(),
        'Script failed:\n' + e.message + '\n\n' + e.stack
      );
    }
  }
}

function sendAlert_(accountName, date, alerts) {
  var rows = alerts.map(function(a) {
    return '<tr><td>' + a.campaign + '</td><td>$' + a.recentCost + '</td>' +
      '<td>' + a.recentConversions + '</td><td>' + a.baselineConversions + '</td>' +
      '<td>' + a.phoneCalls + '</td><td style="color:red">' + a.issues.join('<br>') + '</td></tr>';
  }).join('\n');

  var html =
    '<h2>LSA Lead Anomaly Alert</h2>' +
    '<p><b>Account:</b> ' + accountName + '<br><b>Date:</b> ' + date +
    '<br><b>Campaigns flagged:</b> ' + alerts.length + '</p>' +
    '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse">' +
    '<tr style="background:#f2f2f2"><th>Campaign</th><th>Cost (7d)</th><th>Conv (7d)</th>' +
    '<th>Baseline Conv</th><th>Phone Calls</th><th>Issues</th></tr>' +
    rows + '</table>' +
    '<p style="color:#888;font-size:11px">For lead-level dispute tracking, use the LSA Lead Inbox.</p>';

  MailApp.sendEmail({
    to: CONFIG.EMAIL,
    subject: 'LSA Alert — ' + alerts.length + ' campaign(s) flagged — ' + accountName,
    htmlBody: html
  });
}
