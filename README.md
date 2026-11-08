# Limit Lines

See how full your context window is and how much of your 5-hour and weekly limits you've used, right above the prompt in Claude Code.

## What it shows

Three thin lines sit side by side above the prompt:

- **Context**: tokens in the conversation against the window the session actually compacts at, the same figure `/context` uses. On a long-context model that compacts sooner, this is the real room you have, not the model's full limit.
- **5-hour limit**: your rolling 5-hour usage, with the time it resets.
- **Weekly limit**: your weekly usage, with the day and time it resets.

Any other limit your account reports, such as a spend limit, gets a line of its own.

Each line is blue below 60%, orange from 60% and red from 85%, where the percent turns red too. The colours flow along the line, a new reading grows in from where the last one was, and a highlight runs along the lines while Claude is working. Hover a line to see its full reading. The lines follow the app's light or dark appearance, and in a terminal the same meters draw as text bars.

## Install

In Claude Code in a terminal:

```
/plugin install limit-lines --marketplace JAFDevs/claude-usage-bars
```

In the Claude desktop app: click + next to the prompt box, choose Plugins, add the marketplace `JAFDevs/claude-usage-bars`, then add Limit Lines.

New sessions show the meters right away.

An install from GitHub doesn't update by itself. To get a newer version, open `/plugin`, choose Marketplaces, then limit-lines, then Update marketplace. Auto-update stays off unless you choose Enable auto-update in that same menu.

### Install from a downloaded copy

To keep a copy that never changes unless you replace it, install from a folder on your computer instead of from GitHub.

1. Get the code: on this page click **Code**, then **Download ZIP**, or use a zip someone sent you. Unzip it and move the folder somewhere it can stay. Claude Code reads the mod straight from that folder, so don't move or delete it afterwards.
2. If you installed Limit Lines from GitHub before, remove that first, since both use the same name:

   ```
   claude plugin uninstall limit-lines@limit-lines
   claude plugin marketplace remove limit-lines
   ```

3. Add the folder and install from it, using your folder's own path:

   ```
   claude plugin marketplace add ~/limit-lines
   claude plugin install limit-lines@limit-lines --scope user
   ```

4. Start a new session. `claude plugin list` shows `Read from:` and your folder when it worked.

A folder copy never updates by itself. To update it, replace the folder with a newer copy in the same place, then start a new session.

## Use

| Command | What it does |
| --- | --- |
| `/limit-lines` | Switches between above the prompt and the side pane |
| `/limit-lines band` | Shows the meters above the prompt (the default) |
| `/limit-lines side` | Moves them into a side pane, stacked |
| `/limit-lines off` | Hides them; run `/limit-lines` to bring them back |

Closing the side pane by hand puts the meters back above the prompt.

## Requirements

A recent Claude Code. Limit Lines is built and tested on 2.1.317 and 2.1.319; older releases such as 2.1.276 can't load it. It runs in Claude Code in the terminal and in the Claude desktop app's Code tab.

## What it hooks

Every hook passes the event on unchanged. Limit Lines watches these events and never blocks, rewrites or cancels any of them.

| Event | What Limit Lines does there |
| --- | --- |
| `session.start` | Adds the `/limit-lines` command and reads the session's usage once, so the lines show right away |
| `session.attach` | Opens the side pane when the desktop app connects, if you chose `/limit-lines side` |
| `session.measure` | Updates the lines each time Claude Code measures the session's usage |
| `turn.start`, `turn.complete` | Starts and stops the highlight that runs along the lines while Claude is working |
| `ui.close` | Notes when the Limit Lines side pane closes, so closing it by hand moves the lines back above the prompt. It looks only at its own pane, and the close always goes ahead, even if this hook fails |
| `command.run` | Answers `/limit-lines` and nothing else |
| `ui.render` | Draws the lines above the prompt and in its own side pane |

## Privacy

Limit Lines only reads the usage figures your session already has, through Claude Code's own `session.usage` and `session.measure`. It never reads, asks for or sends a password, key or other credential, makes no network requests and keeps nothing once the session ends.

The only web address in the code, `http://www.w3.org/2000/svg`, is the standard name every SVG drawing declares itself with. Nothing is fetched from it or sent to it. The `tokens` you see in the code are counts of context tokens, not login tokens.

The full policy is in [PRIVACY.md](PRIVACY.md).

## Development

Run the tests from this folder:

```
claude plugin test .
```

## License

MIT. See [LICENSE](LICENSE).
