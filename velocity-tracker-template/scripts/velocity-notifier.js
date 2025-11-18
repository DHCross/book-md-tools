#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Velocity Change Notifier
 * 
 * Posts to Slack/Discord when velocity changes significantly
 * (>0.1 commits/hour or >20% delta)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const LOG_FILE_PATH = path.resolve(__dirname, '../velocity-log.jsonl');

/**
 * Read recent runs from log
 */
function readRecentRuns(limit = 2) {
  if (!fs.existsSync(LOG_FILE_PATH)) return [];
  
  const lines = fs.readFileSync(LOG_FILE_PATH, 'utf8').trim().split('\n');
  const runs = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
  
  return runs.slice(-limit);
}

/**
 * Detect if velocity changed significantly
 */
function detectSignificantChange(current, previous) {
  if (!current || !previous) return null;
  
  const absDelta = Math.abs(current.commits_per_hour - previous.commits_per_hour);
  const percentDelta = Math.abs(current.commits_per_hour - previous.commits_per_hour) / previous.commits_per_hour;
  
  // Significant if > 0.1 commits/hour OR > 20% change
  if (absDelta > 0.1 || percentDelta > 0.2) {
    return {
      direction: current.commits_per_hour > previous.commits_per_hour ? '📈 UP' : '📉 DOWN',
      abs_delta: absDelta,
      percent_delta: (percentDelta * 100).toFixed(1),
      current_velocity: current.commits_per_hour.toFixed(3),
      previous_velocity: previous.commits_per_hour.toFixed(3),
    };
  }
  
  return null;
}

/**
 * Format message for Slack
 */
function formatSlackMessage(change, runs) {
  const current = runs[runs.length - 1];
  
  return {
    text: `🚀 Velocity Alert: ${change.direction}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${change.direction} Velocity Change Detected`,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Current:*\n${change.current_velocity} c/h`
          },
          {
            type: 'mrkdwn',
            text: `*Previous:*\n${change.previous_velocity} c/h`
          },
          {
            type: 'mrkdwn',
            text: `*Change:*\n+${change.abs_delta.toFixed(3)} (${change.percent_delta}%)`
          },
          {
            type: 'mrkdwn',
            text: `*Commits:*\n${current.total_commits}`
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Updated at ${new Date(current.timestamp).toLocaleString()}`
          }
        ]
      }
    ]
  };
}

/**
 * Format message for Discord
 */
function formatDiscordMessage(change, runs) {
  const current = runs[runs.length - 1];
  const direction = change.direction.includes('UP') ? '📈' : '📉';
  
  return {
    embeds: [
      {
        title: `${direction} Velocity Change Detected`,
        description: `Team velocity has shifted significantly!`,
        fields: [
          {
            name: 'Current Velocity',
            value: `${change.current_velocity} commits/hour`,
            inline: true
          },
          {
            name: 'Previous Velocity',
            value: `${change.previous_velocity} commits/hour`,
            inline: true
          },
          {
            name: 'Change',
            value: `+${change.abs_delta.toFixed(3)} (+${change.percent_delta}%)`,
            inline: true
          },
          {
            name: 'Commits',
            value: `${current.total_commits} in last session`,
            inline: true
          }
        ],
        color: change.direction.includes('UP') ? 0x28a745 : 0xdc3545,
        timestamp: new Date().toISOString()
      }
    ]
  };
}

/**
 * Post to webhook
 */
function postToWebhook(url, payload) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, status: res.statusCode });
        } else {
          reject(new Error(`Webhook failed: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

/**
 * Main execution
 */
async function main() {
  const runs = readRecentRuns(2);
  
  if (runs.length < 2) {
    console.log('⏭️  Not enough runs to detect change (need ≥2)');
    return;
  }
  
  const change = detectSignificantChange(runs[1], runs[0]);
  
  if (!change) {
    console.log('✅ No significant velocity change detected');
    return;
  }
  
  console.log(`\n🔔 Significant Velocity Change Detected:`);
  console.log(`   ${change.direction}`);
  console.log(`   ${change.current_velocity} c/h (was ${change.previous_velocity} c/h)`);
  console.log(`   Change: +${change.abs_delta.toFixed(3)} (+${change.percent_delta}%)`);
  
  // Post to Slack
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    try {
      const slackMsg = formatSlackMessage(change, runs);
      await postToWebhook(slackWebhook, slackMsg);
      console.log('✅ Posted to Slack');
    } catch (err) {
      console.error('❌ Slack post failed:', err.message);
    }
  }
  
  // Post to Discord
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
  if (discordWebhook) {
    try {
      const discordMsg = formatDiscordMessage(change, runs);
      await postToWebhook(discordWebhook, discordMsg);
      console.log('✅ Posted to Discord');
    } catch (err) {
      console.error('❌ Discord post failed:', err.message);
    }
  }
  
  if (!slackWebhook && !discordWebhook) {
    console.log('⚠️  No webhook URLs configured (set SLACK_WEBHOOK_URL or DISCORD_WEBHOOK_URL)');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  readRecentRuns,
  detectSignificantChange,
  formatSlackMessage,
  formatDiscordMessage,
  postToWebhook,
};
