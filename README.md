# Snooze-CSS

<p align="center">
  <strong>Pengu loader theme loader and developer toolkit for the League of Legends client.</strong>
</p>

**Preview:** To try out a pre-made theme immediately, copy the contents of `demo-showcase.css` included in this repository and paste them into the Raw CSS tab within the plugin (Raw CSS tab).


## What it does

Snooze-CSS is an all-in-one suite designed to bridge the gap between casual users and theme developers. It provides the environment to modify the client's visual state without ever exiting the client.
---
## Showcase
**Quick Theme Builder** — The fastest route to a custom client. Example: Provide a background image URL and the plugin handles the rest.

<p align="center">
  <video src="https://github.com/user-attachments/assets/55ba2f3d-5517-4e2d-889c-b9dc2ec03a61" controls width="90%"></video>
</p>

**Omni-Inspector** — A real-time element picker. Hover over any part of the UI to identify its selector and modify properties like hue, opacity, and blur using visual sliders, etc.

<p align="center">
  <video src="https://github.com/user-attachments/assets/249ebb15-37ec-4d5c-9925-ae1b1a670b84" controls width="90%"></video>
</p>

**Visual Builder Catalog** — Over 470 pre-mapped client elements categorized by screen. From the Home View to Champ Select and the Post-Game lobby, modify layout properties through a structured visual interface.

**Raw CSS Editor** — A coding environment with CSS autocomplete.

<p align="center">
  <video src="https://github.com/user-attachments/assets/663aefe3-d6c5-44dd-b3bd-d9dd2b06b732" controls width="90%"></video>
</p>

**The Analyzer** — Built for themers who want to employ the help of LLMs to theme the client. It captures the current view state to generate spatial maps, identify flex/grid constraints, and map z-index stacks. (Raw text -> LLM -> CSS)

<p align="center">
  <video src="https://github.com/user-attachments/assets/749a0c4e-d6b4-4ae3-b553-5c3b921245a6" controls width="90%"></video>
</p>


## Requirements

**[Pengu Loader](https://github.com/PenguLoader/PenguLoader/releases/)** — A free, open-source tool that lets you run plugins inside the League client.


## Installation

### Step 1 — Install Pengu Loader
Download the latest release from **[here](https://github.com/PenguLoader/PenguLoader/releases/)**.

### Step 2 — Install Snooze-CSS
1. Open Pengu Loader and click **Open Plugins Folder**.
2. Drop the `Snooze-CSS` folder in so the structure matches the following:

```text
plugins/
└── Snooze-CSS/
    ├── index.js
    ├── assets/
    │   └── (optional: drop local background images here)
    └── src/
        ├── analyzer.js
        ├── builder.js
        ├── catalog.js
        ├── css-parser.js
        ├── modal.js
        ├── raw.js
        ├── resolver.js
        ├── settings.js
        ├── storage.js
        ├── styles.js
        └── utils.js
```

3. Launch (or relaunch) the League client.



## How to use it

### `Alt + C` — Open the toolkit
Press **Alt + C** at any time to toggle the Snooze-CSS window. The window is fully resizable, can be dragged by the header, and minimized to the corner of the screen while you work.

### Local Assets
To use local images instead of remote URLs, place files in the `Snooze-CSS/assets/` folder. Use the **Local Asset Path** tool under Generic Tools to generate the correct local path for your theme.


## Privacy

Snooze-CSS operates entirely locally. Custom themes, settings, and analyzer data are stored within your machine's local DataStore. No data is transmitted to external servers, and no telemetry is collected.
## Disclaimer

Snooze-CSS is a third-party modification and is not affiliated with or endorsed by Riot Games. It does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends. Use at your own discretion.