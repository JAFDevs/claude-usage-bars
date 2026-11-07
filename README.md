# Usage Bars

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
/plugin install usage-bars --marketplace JAFDevs/claude-usage-bars
```

In the Claude desktop app: click + next to the prompt box, choose Plugins, add the marketplace `JAFDevs/claude-usage-bars`, then add Usage Bars.

New sessions show the meters right away.

## Use

| Command | What it does |
| --- | --- |
| `/usage-bars` | Switches between above the prompt and the side pane |
| `/usage-bars band` | Shows the meters above the prompt (the default) |
| `/usage-bars side` | Moves them into a side pane, stacked |
| `/usage-bars off` | Hides them; run `/usage-bars` to bring them back |

Closing the side pane by hand puts the meters back above the prompt.

## Requirements

A recent Claude Code. Usage Bars is built and tested on 2.1.317 and 2.1.319; older releases such as 2.1.276 can't load it. It runs in Claude Code in the terminal and in the Claude desktop app's Code tab.

## Privacy

Usage Bars only reads the usage figures your session already has. It makes no network requests and keeps nothing once the session ends.

## Development

Run the tests from this folder:

```
claude plugin test .
```

## License

MIT. See [LICENSE](LICENSE).
