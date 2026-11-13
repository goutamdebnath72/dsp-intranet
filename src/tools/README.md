# The topics of the search bar's tools

Every subject the search bar knows (a calculator, a converter, the tyre reader, the VIN reader, the BH-series guide, a live-data card) is **one folder**: `src/tools/<topic>/`.

```
src/tools/<topic>/
  <topic>.ts            the pure logic (a calculation, a reading, a table)         + <topic>.selftest.ts
  <Something>.tsx       its cards and forms (React)
  topic.ts              what the search line needs to know: the words that ask for it, the lines it answers
                        as you type, its sample questions for the user guide      (pure, no React)
  ui.tsx                how it looks in the panel: its tile, its page, its instant card
```

and **one line in each registry**: `src/tools/registry.ts` (logic side) and `src/tools/registry.ui.tsx` (panel side).

Nothing else names a topic. `src/lib/tools/detect.ts`, `src/components/tools/ToolPanel.tsx` and `src/lib/help/sampleQuestions.ts` only walk the registries.
`src/tools/registry.selftest.ts` fails if that stops being true.

## Adding a topic (for example, a "pension" calculator)

1. Make the folder `src/tools/pension/` with `pension.ts` and `pension.selftest.ts` (the logic and its tests), and `PensionForm.tsx` (the page).
2. `topic.ts`: `defineTopic({ id: "pension", form: { rank, nouns, wants }, samples: [...] })`. `rank` is where its plain-word request is tried among the others (see the ranks in the other topics).
   A topic that answers a typed line as you type also has `hits: [{ rank, detect }]`, returning `{ kind: "pension", ... }`.
3. `ui.tsx`: a `TopicUi` with `form: { title, tone, icon, menu: { title, text }, render }`, and for a hit card `hits: [onHit("pension", (hit) => <ToolShell ...>)]`.
4. Add `pensionTopic` to `src/tools/registry.ts` and `pensionUi` to `src/tools/registry.ui.tsx`, in the same place in both lists (the order is the order of the tiles and of the guide's samples).
5. Run `npx tsx --tsconfig tsconfig.selftest.json src/tools/registry.selftest.ts`. It checks that both descriptors exist, the topic has its own test, and every sample question is really answered by the topic that lists it.

`FormKind`, `LiveTopic` and the kinds of `ToolHit` are worked out from the registry; they are never written by hand.

## What is shared (and so lives outside the topics)

- `src/components/tools/toolKit.tsx`, `toolAtoms.tsx`: the frame, the dropdown, the fields.
- `src/lib/tools/money.ts`: the typed number, the refused-input shape, rupees.
- `src/lib/tools/detect.ts`: walks the registry (this is the only code that reads a typed line).
- `src/lib/live/*`, `src/app/api/live/*`, `src/components/tools/live/*`: the live-data engines, routes and cards (gold, markets, fuel, news, sports). Their two descriptor files are in `src/tools/<topic>/`
  like the others; the engines stay where they are because they run on the server and share fetch, cache and envelope code.

`tyre` and `rim` are one reader in two parts and import each other; that is the one declared dependency between topics.
