# Plain Timeline

Write a timeline as plain text in your note and see it drawn — vertically or horizontally, as evenly spaced cards or to scale. Year-only dates, months, and years before the common era all work.

![Vertical cards](docs/images/vertical-cards.jpg)

## Four layouts

Each timeline picks its own orientation and look. Use the small switch at the top right of a timeline, or write it in the block.

| | Cards — evenly spaced, best for events | Scale — lengths follow time, best for periods |
| --- | --- | --- |
| **Vertical** | ![](docs/images/vertical-cards.jpg) | ![](docs/images/vertical-scale.jpg) |
| **Horizontal** | ![](docs/images/horizontal-cards.jpg) | ![](docs/images/horizontal-scale.jpg) |

## Syntax

````markdown
```plain-timeline
- [1789-07-14] Storming of the Bastille | The revolution begins in Paris
@ [1792-09-21~1804-05-18] First Republic | Monarchy abolished
@ [1793-09~1794-07] #red Reign of Terror | [[Robespierre]] and the Committee of Public Safety
- [-490] Battle of Marathon
= [1815-06-18] Waterloo
```
````

| Line | Meaning |
| --- | --- |
| `- [date] Name \| description` | An event. A range like `[1914~1918]` is allowed. |
| `@ [start~end] Name \| description` | A period. Leave the end empty (`[2020~]`) for one that is still going on. |
| `= [date] Name` | A marker. |
| `#red` right after the date | Color for that item: blue, green, purple, orange, cyan, pink, yellow, red, gray. |
| `# text` | Comment, not shown. |
| `> orientation horizontal` | This timeline is horizontal (`vertical` is the default). |
| `> look scale` | This timeline is drawn to scale (`cards` otherwise). |
| `> title Text` | A title above the timeline. |
| `> start 1700` / `> end 1900` | Fix the range of the time axis (scale look). |
| `> today` | Add a marker for today. |
| `> density compact` / `> desc hover` | Per-block spacing and description display. |
| `> height 300` | Limit the height and scroll. |

Lines that cannot be read (a bad date, an unknown color, an unknown option) are listed in a small note under the timeline instead of disappearing silently.

Dates can be a year (`1789`), a month (`1789-07`), or a day (`1789-07-14`). Negative years are before the common era (`-490` → 490 BCE). In the settings you can switch the order to day–month–year or month–day–year, and separators `-`, `/`, `.` or none are all accepted (`20261021`, `202610`, `21/10/2026`, `211026` …).

Text after `|` is the description. Both `[[wiki links]]` and `[text](url)` links work inside names and descriptions. On the horizontal time axis, descriptions appear when you hover an item (and are listed under the axis when set to "always show").

The time axis picks calendar steps — days, weeks, months or years — and always starts and ends on a labelled tick.

![Years before the common era, light theme](docs/images/bce-light.jpg)

## Clicking items

Clicking an item opens, in order: the link inside it, a note with the same name, or the place in the current note where the name first appears. If an item contains links, only those links are clickable (you can change this in the settings). ⌘/Ctrl-click opens a new tab. Items can also be reached with Tab and opened with Enter, and links show Obsidian's page preview on hover.

## Mobile

On phones the vertical layout stacks the date above the text. On phones and tablets buttons are larger and tapping an item on the horizontal axis shows its details under the timeline. Wide timelines fade at the edge while there is more to scroll.

<img src="docs/images/mobile.jpg" width="390" alt="Mobile">

## Settings

Language (English / 日本語 / follow Obsidian) · default orientation and look · date order in blocks · two-digit years · date display (localized, ISO, or a custom pattern such as `DD/MM/YYYY`) · BCE label · descriptions always or on hover · clickable items · orientation switch · period colors and their order · density · sort order · minimum width of the horizontal axis.

![Light theme](docs/images/light.jpg)

## Install

Until it is listed in Community plugins: download `main.js`, `manifest.json` and `styles.css` from the latest release into `<vault>/.obsidian/plugins/plain-timeline/`, then enable **Plain Timeline** in Settings → Community plugins.

## Credits

The line syntax is compatible with [Chronos Timeline](https://github.com/clairefro/obsidian-plugin-chronos) (MIT), so existing Chronos-style lines can be pasted into a `plain-timeline` block. No code from that project is used.

## License

MIT
