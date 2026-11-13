---
name: DERELICT
description: Orbital salvage strategy game where every move is a signed work order and the chain stamps it into the station's record.
colors:
  space: "#0c1011"
  registry-ground: "#0c1216"
  plate: "#111a20"
  plate-raised: "#17232b"
  rule: "#23323b"
  rule-strong: "#34474f"
  paper-ink: "#ece3cf"
  paper-ink-2: "#bdb5a3"
  paper-ink-3: "#8f9088"
  work-order-stock: "#e7dcc4"
  work-order-edge: "#c8b995"
  stock-ink: "#1a2025"
  stock-ink-2: "#4c5357"
  next-move-orange: "#ee7948"
  next-move-orange-hover: "#f58c5e"
  next-move-orange-press: "#d9632f"
  next-move-ink: "#1c0f08"
  stamp-green: "#8fcb9c"
  stamp-green-on-stock: "#2a6b3b"
  pending-amber: "#f0b65a"
  oxide: "#ee6a6f"
  oxide-on-stock: "#a3303a"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "54px"
    fontWeight: 700
    lineHeight: 0.95
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.02em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.03em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.08em"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  stamp: "4px"
  control: "6px"
  panel: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.next-move-orange}"
    textColor: "{colors.next-move-ink}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.next-move-orange-hover}"
  button-outline:
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "44px"
  work-order-card:
    backgroundColor: "{colors.work-order-stock}"
    textColor: "{colors.stock-ink}"
    rounded: "{rounded.control}"
    padding: "14px 12px 12px"
  work-order-card-blocked:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.paper-ink-3}"
  papers-panel:
    backgroundColor: "{colors.registry-ground}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
  input:
    backgroundColor: "{colors.registry-ground}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.control}"
    height: "40px"
---

# Design System: DERELICT

## Overview

**Creative North Star: "The Station's Papers"**

A salvage station is property with a record: its registry, what it holds, what it owes, and a log of every job done. The interface is that record. Every move is a work order on buff stock that the captain signs with their wallet, and the chain stamps the confirmed move into the six-slot turn track. The painted station sits at the centre of the screen as the board; everything else is paperwork around it.

The world is quiet registry blue-black with buff paper ink. Colour does jobs, not decoration: orange marks the one next move, green is a confirmed stamp, amber is waiting on the chain, oxide is damage or refusal. On-chain detail (revisions, block heights, contract method names) lives in the Ledger and the station papers, one click away, never on the main screen.

**Key Characteristics:**
- The station art is centred in open space at its own aspect ratio; the stage background is the art's own black.
- Work orders (action cards) are the only light surfaces on the bridge.
- One line grammar for chain state: dashed = pending, solid = confirmed, struck = refused or unavailable.
- Condensed display type for names and numbers; a plain sans for sentences; mono only for amounts, accounts and ledger data.

## Colors

Restrained registry neutrals with four role colours that each mean exactly one thing. Spending is not a colour: credits and fuel going out read in secondary paper ink with a minus sign.

### Primary
- **Next-Move Orange** (`next-move-orange`): the primary button, the selected work order's outline and hazard band, the current turn slot, and the active onboarding step. Never decoration, never focus rings, never badges.

### Secondary
- **Stamp Green** (`stamp-green`; `stamp-green-on-stock` on cards): confirmed turns, credits earned, gains in forecasts, a met win condition.
- **Pending Amber** (`pending-amber`): anything signed but not yet confirmed: the signing slot, the busy button, the wallet dot, an active repair reserve, the loading bar.

### Tertiary
- **Oxide** (`oxide`; `oxide-on-stock` on cards): hull damage, refusals and errors only. It is the red of the repair bay's livery, kept well away from orange in hue so damage never reads as "do this".

### Neutral
- **Station Black** (`space`): the stage behind the art, matched to the painting so the art has no visible edge.
- **Registry Ground** (`registry-ground`), **Plate** (`plate`), **Raised Plate** (`plate-raised`): page, panels, hovered controls.
- **Rules** (`rule`, `rule-strong`): hairlines and control borders.
- **Paper Ink** (`paper-ink`, `paper-ink-2`, `paper-ink-3`): primary text, secondary text, labels and notes (all ≥ 4.5:1 on plate).
- **Work-Order Stock** (`work-order-stock`, `work-order-edge`, `stock-ink`, `stock-ink-2`): action cards only.

### Named Rules
**The One Orange Rule.** Orange appears only where the player's next move is. If two things on a screen are orange, one of them is wrong.

**The Stamp Grammar Rule.** Chain state is shown by line form before colour: a dashed border is pending, a solid border is confirmed, a strike-through is refused or unavailable. Forecast pips are dashed because they are not real yet.

## Typography

**Display Font:** Barlow Condensed 600/700 (with Arial Narrow)
**Body Font:** IBM Plex Sans 400/500/600 (with system-ui)
**Data Font:** IBM Plex Mono 400/500

**Character:** Condensed industrial capitals read like stencilled panel markings and keep numbers big in narrow spaces; Plex Sans carries every sentence plainly.

### Hierarchy
- **Display** (700, 54px treasury; 96px final score; clamp(64px, 9vw, 128px) title screen; line-height 0.85–0.95): the score and the wordmark.
- **Headline** (700, 25–30px, uppercase): dialog titles and the selected action in the sign panel.
- **Title** (700, 13–20px, uppercase, 0.03em): card names, station name, stamp names, meter values.
- **Body** (400, 13–15.5px, 1.45–1.6): descriptions, notes, dialog copy; prose capped near 52–64ch.
- **Label** (600, 11px, 0.08em, uppercase): small section labels such as Treasury, Fuel, Held by the station.
- **Data** (mono 11–13px): credits deltas, accounts, ledger sequence and block numbers.

### Named Rules
**The Mono Is Data Rule.** Monospace is only for amounts, accounts and ledger coordinates, never for labels or atmosphere.

## Layout

Desktop (≥ 1181px) is a fixed, non-scrolling bridge: a 60px top bar (station, turn track, navigation, wallet), the stage, and the deck. The station papers float over the stage's left 288px; the art is centred in the remaining width at 896∶679, sized by container query units. The deck is a six-column hand plus a 360px sign panel, bottom-aligned so the selected card can lift. Navigation labels always show on desktop (each button also carries an aria-label); between 1181px and 1365px the wordmark gives way so the turn track keeps its room. Turn slots size by content: stamps and the current move are wide, empty future turns keep just their number, and each stamp drops its name when its slot gets narrow. At ≤ 820px tall the papers, cards and sign panel tighten.

From 1180px down the page scrolls: the turn track takes its own row, the stage is capped at 64vh, and the sign panel spans below the hand in two columns. At ≤ 900px the hand becomes three columns. At ≤ 760px (phone) the navigation folds into one Menu, the art sits on top at full width (module callouts hidden), the papers become a three-column strip, the hand is two columns, and the sign button is a fixed bar at the bottom of the viewport that names the chosen card ("Sign turn 2 · Heavy docking").

Spacing follows a 4px base (4 / 8 / 16 / 24), with 10px gaps inside the hand and 16px page gutters.

## Elevation & Depth

Mostly flat tonal layering (ground → plate → raised plate). Shadows exist only to lift things that physically float: the papers and toasts over the stage, dialogs and the drawer over the bridge, and the work-order cards, whose selected card rises 8px with a deeper shadow.

### Shadow Vocabulary
- **Card rest** (`inset 0 1px 0 rgba(255,255,255,.45), 0 8px 18px -12px rgba(0,0,0,.9)`): unselected work orders.
- **Card lifted** (`inset 0 1px 0 rgba(255,255,255,.45), 0 18px 28px -14px rgba(0,0,0,.95)`): the selected work order.
- **Floating panel** (`0 16px 40px -24px rgba(0,0,0,.9)`): station papers, toasts.
- **Dialog** (`0 30px 70px -30px rgba(0,0,0,.9)`): dialogs and the ledger drawer.

## Shapes

Small, practical radii: 4px for stamps, 6px for controls and cards, 10px for panels and dialogs. Stamps are drawn with a 1.5px border (2.5px for the verdict stamp) and sit rotated −2° to −2.5°, as if pressed by hand. The selected work order carries a 6px diagonal hazard band in orange and graphite, taken from the station's own livery.

## Components

### Buttons
- **Shape:** gently rounded (6px), 44px tall (36px small, 50px large).
- **Primary:** Next-Move Orange with dark ink; one per screen region.
- **Hover / Focus:** lighter orange on hover, 1px press on active; focus is a 2px paper-ink outline.
- **Busy:** while waiting for the wallet or chain the primary turns into a dashed amber outline with amber text.
- **Outline / Ghost:** rule-strong border with paper ink, or text-only paper-ink-2; both gain a raised-plate background on hover.

### Chips
- **Style:** 1px border in the text colour, Plex Sans 600 11.5px, signed values ("−2 fuel", "+1 ship").
- **State:** gains green, spending in secondary stock ink, hull damage in oxide; effects that land later use a dashed border.

### Cards / Containers
- **Work orders:** buff stock, 6px radius, condensed uppercase name, a 36px credits figure (green when earned), effect chips, and a footer hint. Unselected cards dim slightly; blocked cards turn to dark plate with the price struck through in oxide and the reason in oxide.
- **Station papers:** registry ground at 88% over the stage, 10px radius, labelled sections divided by hairlines.

### Inputs / Fields
- **Style:** registry ground, rule-strong border, 6px radius, mono text, orange caret.
- **Focus:** border turns paper ink.
- **Stepper:** segmented 1–4 control; the selected unit is filled paper ink.

### Navigation
- **Top bar:** quiet text buttons with icons (Ledger, Market, Stations, How to play); hover adds a plate background. A "For sale" tag badges Market when the station is listed.

### Turn Track (signature)
Six slots. A confirmed turn holds a rotated green stamp with the move's icon, short name and credit change; the stamp lands with a short scale-down when the chain confirms it. The current slot is outlined orange ("Your move" for the captain, "Captain's move" for everyone else); a signed turn is a dashed amber "Signing" slot; future slots are plain hairlines. The results dialog opens by itself only when the last turn confirms in the current session; otherwise a finished station shows its verdict in the deck.

## Do's and Don'ts

### Do:
- **Do** keep the station art centred in open space at 896∶679 with the stage set to the art's own black (`space`).
- **Do** show every effect of a move before it is signed: dashed forecast pips on the papers and a from → to line in the sign panel.
- **Do** put on-chain proof (revision, epoch, block, contract calls) in the Ledger and Market dialogs.
- **Do** write controls as actions in the product's own words: "Sign turn 2", "Fund 12 ships · 78 Cr", "Buy this station".

### Don't:
- **Don't** use orange for anything that is not the next move.
- **Don't** show a state the chain has not confirmed as solid; pending is always dashed and amber.
- **Don't** put telemetry captions ("SOURCE: CONTRACT get_ledger()", "1 CR = 10^21 YOCTO") on the main screen.
- **Don't** show credits with decimals; credits are whole numbers ("13 Cr").
