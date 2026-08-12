# Mermaid `/roadmap` sync

Load this file only when updating `app/views/roadmaps/show.html.erb`.

Hand-authored source lives in:

```erb
<pre class="hidden" data-mermaid-target="source">
…
</pre>
```

Stimulus `mermaid_controller` uses `textContent` (HTML entities decode to real tags). Keep `securityLevel: "loose"` and `flowchart.htmlLabels: true` / `useMaxWidth: false` unless fixing a regression.

## Node label pattern

In the ERB `<pre>`, escape markup:

```text
M4["&lt;b&gt;M4 Ops Admin — CURRENT&lt;/b&gt;&lt;br/&gt;Admin surface · fork/provider · Shared links&lt;br/&gt;COMPLETE — In Progress"]
```

Include milestone id + title, 1–3 feature bullets, status line. Match the project’s COMPLETE/DONE/PLANNED/IDEAS vocabulary from ROADMAP.

## Status classes

```text
classDef complete fill:#d8ebe0,stroke:#5f8f74,color:#1f3d2f
classDef current fill:#f5d9c8,stroke:#c45c2a,color:#3a322c,stroke-width:2px
classDef planned fill:#e4e9f0,stroke:#6b7c93,color:#2c3544
classDef ideas fill:#f0ebe4,stroke:#b5a898,color:#5c534a
```

Assign with `class M1,M2 complete` etc. At most one `current` node.

## Edges

Prefer a single LR chain (`M0 --> M1 --> …`). Extra edges only when ROADMAP truly forks.

## Page chrome

Do not reintroduce headers, legends, or feature lists under the diagram unless the user asks. Preserve existing full-width / dedicated roadmap layout.
