chore(worker): disable cron trigger until alerts are set up

The account is at the free plan's 5 cron-trigger limit, so the daily
alert schedule did not attach on the 2026-10-02 deploy. Alerts are not
configured anyway (ALERTS KV still commented out). Set crons = [] so
future `wrangler deploy` runs don't try to claim a 6th slot; restore
steps are documented inline.

Closes PIA-074.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
