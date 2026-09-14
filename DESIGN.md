# OmniCockpit Design System

## 1. Product

OmniCockpit is an enterprise AI Agent and knowledge workspace. The interface should feel like a precise operations console: calm, dense enough for repeated work, and clearly distinct from the upstream FastGPT visual language.

## 2. Visual Direction

Use **Steel Atlas / saturated blue map**.

- Graphite: `#27364A` for structure, primary text, and durable controls.
- Saturated blue: `#2563EB` for brand emphasis, active state, selected workflow elements, and key metrics.
- Warm gold: `#C69B4A` for scarce advisory or high-value accents.
- Canvas background: `#F8FAFC`.
- Panel background: `#FFFFFF`.
- Navigation background: `#F5F7FA`.
- Border: `#DFE5EE`.
- Text: `#1F2937`.
- Muted text: `#667085`.

## 3. Workflow Canvas Rules

- Canvas nodes should read as execution units, not large form cards.
- Default node body shows a compact summary: type, key configured values, input/output counts, status, and branch/port context.
- Full configuration should live in the right inspector, a detail view, or an explicit expanded state.
- Avoid repeated nested cards and blue left rails inside nodes.
- Port handles must be fully visible and feel attached to the node edge.

## 4. Components

- Node shell: a compact execution tile with a stable 304px working width, low-noise surface,
  and no embedded configuration form.
- Node execution signature: one primary operational sentence or route, followed by at most two
  supporting facts. Do not repeat generic input/output statistics when they do not help identify
  the node.
- Node port lane: branch names and source sockets stay on the canvas and align horizontally;
  ordinary target/source sockets remain attached to the shell edge.
- Node configuration workbench: the selected node's existing configuration controls render in
  the fixed right inspector. The inspector owns vertical scrolling and never overlays the node.
- Workflow debug preview: keep the live chat preview anchored to the right edge below the workflow
  header. On desktop, its left boundary is a horizontal resize separator; chat-only mode opens at
  480px, citation mode at 920px, and both remain bounded by a 420px minimum, a 1120px maximum, and
  the available viewport gutter. The panel body owns vertical scrolling. On narrow layouts it uses
  the full viewport width and hides the resize separator.
- Folded node: the existing fold command remains the only folding interaction. Do not introduce
  a second expand/collapse configuration control inside a node.
- Structural canvas elements: loop/parallel containers and comments keep their canvas-specific
  body because their geometry communicates workflow structure rather than configuration.
- Publish channel workbench: a fixed channel rail and one fluid content pane fill the available
  detail-page height. The content pane owns vertical scrolling; the page must not end in a
  detached block of unused canvas.
- Publish create action: every channel uses the same compact 34px saturated-blue button with a
  leading add icon, 8px radius, visible focus state, and a non-layout-shifting hover state.
- Publish empty state: empty lists keep the table header visible and use a compact 128px state
  directly below it. Do not vertically center an empty message across the whole workbench.
- Dataset import workbench: use a compact horizontal four-step rail above one bounded task body.
  File selection, parsing parameters, and upload confirmation use the full content width. Only the
  data-preview step becomes a list-detail split, with sources on the left and parsed text on the
  right.
- Dataset import action rail: previous/next/upload actions stay in a fixed footer while the current
  step body owns vertical scrolling. Do not place a second summary pane beside steps that do not
  need text comparison.
- Dataset import width: non-preview steps use one responsive workbench axis capped at 1440px and
  fill the available width below that cap. Keep page gutters around the workbench; do not stretch
  single controls edge to edge across an ultra-wide viewport.
- Dataset source workbench: the first import step aligns its heading, editor, source status, and
  footer actions to the shared workbench axis. File upload and its file list form one continuous
  bordered frame; web links and custom text use continuous editor surfaces rather than detached
  form fields.
- Dataset source density: empty source steps stay compact and top-aligned. Do not stretch an input
  across the viewport or vertically center it inside unused canvas space.
- Dataset parameter workbench: the second import step keeps the same responsive workbench axis and
  uses continuous two-column parameter bands. Each band explains intent on the left and keeps the
  real control on the right; related controls may use a two- or three-column grid while standalone
  controls retain a readable maximum width. Processing mode and default/custom mode use lightweight
  underline tabs.
- Dataset parameter density: do not wrap every setting in a separate card. Chunk triggers stay in
  one rule row, index enhancements stay directly on the page without a filled container, and custom
  parameters expand as a white field grid without changing the existing form state or validation flow.
- Dataset preview reader: use a 252px source rail and a fluid reading canvas. Preview chunks live in
  one centered document surface no wider than 960px, with readable 82ch text and continuous dividers
  instead of full-width prose or a card for every chunk.
- Dataset preview selection: keep source selection explicit. Before the user selects a source, show
  a small unframed instruction near the top rather than centering a large empty card.
- Dataset preview depth: reuse the existing preview route with a bounded preview limit, starting at
  10 chunks and loading 10 more from the document footer up to 50 real chunks.
- Dataset confirmation list: keep the final step on the shared responsive workbench axis and place
  the list title, count, table header, rows, statuses, and actions in one continuous border-only
  table frame. Align it with the step heading and footer, avoid a floating card shadow, and do not
  add a green validation banner above content that is already ready by definition.
- Dataset search test workbench: use a fixed 308px query and history rail beside one fluid result
  reader. The query editor, mode control, run action, and history share one continuous surface;
  result rows use stable dividers instead of large grey cards.
- Dataset search result density: move the active search mode, duration, token limit, and rerank state
  into the result toolbar using only values returned by the existing test response. Keep long
  Markdown and code content on a centered reading axis with independent result scrolling.
- Dataset search settings: use a 188px settings directory and one scroll-owning parameter workbench.
  Search mode, filter, and query optimization retain their existing form fields and submit callback;
  avoid horizontal tab stacks and nested option cards.
- Dataset configuration inspector: use a responsive 360-400px workbench with a compact resource
  identity header and task tabs for models, collaboration, and source connection. Do not expose the
  implementation-oriented `OMNI INSPECTOR` eyebrow or recreate the upstream vertical settings form.
- Dataset model routing: embedding, text processing, and vision models live in one continuous routing
  matrix. Each route has one icon, one localized role label, one useful constraint, and the existing
  selector; avoid detached labels and repeated field cards.
- Dataset collaborator surface: collaborators occupy a dedicated access tab. The manage action and
  member list share one border-only panel, and member tags use quiet neutral surfaces instead of a
  filled grey block.
- Dataset detail shell: the resource header, task navigation, controls, table, and optional inspector
  sit directly on the page canvas. Do not wrap the complete desktop workbench in a white rounded card;
  borders belong only to functional boundaries such as the header, table header, rows, and inspector.
- Team governance workbench: replace horizontal management tabs with a 220px governance rail for
  members, departments, groups, and permissions. The rail may collapse to a 64px icon track with
  localized hover guidance; its state persists independently from the global navigation. The rail
  is part of the page structure, not a stack of floating cards, and only real list or member-count
  responses may appear as badges.
- Team governance sections: every section uses the same compact title, description, action, and
  scroll-owning data layout. Small filter sets belong in the title action area instead of reserving
  an otherwise empty full-width toolbar. Tables sit directly in the workbench without a second
  rounded container, use sticky headers and dense rows, and keep every action in a fixed 72px column
  aligned to its header. Empty content stays top-aligned below the header.
- Team governance title rows target a compact 64px height. From the medium breakpoint onward, the
  title, filters, search, and primary action stay on one aligned row; only narrow mobile layouts may
  wrap controls below the title. The shared team-level header remains distinct but compact at 60px.
- Team organization context: department hierarchy and members remain in one workbench. The current
  path, search, member management, create action, and current-department overflow actions share the
  section title action area. The department ledger begins immediately below the title header. Edit,
  move, and delete remain in the overflow menu. Do not reserve a toolbar row or fixed right pane that
  narrows the department table.
- Team permission matrix: members, departments, and groups render as valid table sections inside one
  matrix. Existing role checkboxes, permission guards, collaborator APIs, and manage modal remain the
  source of truth.
- Personal profile workbench: merge account identity, workspace, language, time zone, security, and
  support into one continuous border-only surface. Use compact two-column setting bands instead of
  separate cards, and keep language changes immediate through the existing account update flow.
- Personal navigation: language and locale are account preferences, not a standalone global-nav
  destination. Legacy language-setting URLs redirect to the profile preference section.
- Plugin registry: render installed plugins as one full-width operational ledger rather than a
  collection of row cards. Plugin identity and introduction share the primary column; tags,
  availability, default installation, billing, and key readiness remain stable, aligned controls.
- Plugin registry density: search and status filters operate only on the already loaded plugin
  response. Drag ordering, row editing, inline policy switches, permissions, and existing API
  requests remain unchanged. Filtered drag ordering must merge back into the complete local order.
- Resource avatar treatment: application, folder, dataset, and tool/plugin identities render their
  avatar asset directly at `28–32px` on the owning panel. Do not add a type-colored gradient, tinted
  tile, halo, or shadow behind an avatar; resource type and selection state belong to the adjacent
  label and the card border. Preserve any background that is intrinsic to the uploaded avatar itself.
- Plugin import workbench: use a compact upload strip followed by one continuous processing queue.
  Parsed identity, tags, introduction, status, retry, and removal stay on the same row; the footer
  remains fixed to the workbench edge. Do not reserve an empty full-height table for pending files.
- Custom plugin workbench: group identity, application binding, classification, release policy,
  billing, and Markdown guidance into continuous setting bands. Avoid the legacy split form with a
  full-height textarea and avoid wrapping each individual setting in a card.
- Portal conversation rails: Human commands align to the right in compact saturated-blue blocks;
  AI responses align to the left as open reading surfaces with a three-pixel blue rail. Avoid paired
  rounded chat bubbles or another enclosing conversation card.
- Login collaboration visual: the desktop brand panel uses one vertically layered diagram. Agentic sits
  above Workflow; a solid blue downward lane means Agentic can invoke Workflow, while a dashed warm-gold
  upward lane means Workflow nodes can call Agentic back. Knowledge and Context connect to Agentic;
  Condition and Action connect to Workflow. Connection points sit exactly on every node border.
- Login collaboration primitives: use the graphite gradient panel, blue-light topology lines, warm-gold
  decision accents, quiet glass nodes, and the paired Agentic/Workflow legend from the approved final
  preview. Agentic uses the four-point spark; Workflow uses the three-node topology icon. The diagram is
  live DOM and SVG content with one accessible localized label and no case study, statistics, subtitle,
  or explanatory marketing block.
- Login frame: on desktop, the login surface fills the browser viewport with a `56% / 44%` split and no
  outer card, page gutter, radius, border, or frame shadow. Both the 544px brand-content axis and the
  330px form axis stay centered within their owning panel; large desktop breakpoints may scale those
  axes proportionally without stretching individual nodes or controls. The language selector remains
  inside the right panel. The approved slogan is “让判断灵活发生，让执行稳定抵达”.
- Login identity: the login logo and favicon use the same saturated-blue nested-hexagon mark from the
  approved preview. The login logo sits inside the existing quiet 42px tile; the favicon carries its own
  light rounded tile so the mark remains legible in browser chrome.
- Login collaboration responsive rule: the final visual contract covers desktop only. Preserve the
  existing focused mobile login fallback, but do not duplicate or reflow the collaboration diagram for
  mobile as part of this change.
- Chat start priority: required variable configuration is the first content in every empty chat
  surface, before welcome copy, application identity, quick applications, or other start guidance.
  Workflow preview, conversational Agent preview, portal application chat, and portal home must use
  the same semantic order. Application avatar and name form a quiet, pointer-transparent backdrop
  owned by the chat body; they stay fixed while chat content scrolls and never consume document-flow
  height. The backdrop uses the avatar asset directly without a tile, halo, or shadow, and applies
  48% content opacity so active forms and messages retain priority.
- Portal message metadata: avatar, localized role, actions, and time share a stable 30px row. Human
  time precedes its actions; AI time follows its actions. Hover may change action opacity or color,
  but must never move metadata or message content.
- Agent configuration workbench: keep one collapsible 184px parameter map beside one scroll-owning
  configuration ledger. The map uses the white panel token, a quiet canvas active fill, and a two-pixel
  saturated-blue location rail; it must not become a tinted secondary sidebar or repeat explanatory copy.
- Agent parameter section: each configuration chapter starts with one compact horizontal boundary that
  combines a tabular chapter number, a single-stroke feature glyph, title, and one-line purpose. Never
  reserve a permanent description column beside the fields, because the parameter map already owns
  navigation and chapter recognition.
- Agent parameter row: frequent settings use one continuous three-track ledger row: a 148-176px label
  and helper track, a fluid control track, and an optional compact action track. Rows use panel surfaces,
  cool-gray dividers, and no individual card shadow. Model, system instruction, knowledge binding, and
  runtime state must use this anatomy before lower-frequency controls fall back to their existing editors.
- Agent configuration iconography: chapter glyphs use one monochrome graphite/blue treatment in a compact
  square frame. Do not use a different saturated feature color for every chapter, and do not repeat a
  decorative icon when the nested control already carries the same meaning.
- Agent configuration asset family: shared configuration SVGs use a `20 × 20` canvas, a `1.5` stroke,
  rounded caps and joins, and `currentColor`. Keep the optical drawing area between roughly `2.5` and
  `17.5`; do not embed feature-specific purple, pink, teal, or orange fills. The same source asset must
  serve Agent configuration and every other caller, so state color belongs to the consuming component,
  not to the SVG file.
- Agent configuration metaphors: AI uses a tuned lattice, knowledge uses an indexed data stack, tools
  use connected capability modules, skills use a precision spark, files use a document ingress mark,
  variables use balanced braces and a value node, welcome text uses a prompted conversation, speech
  output uses a speaker waveform, speech input uses a microphone waveform, question guidance uses a
  branching prompt, input guidance uses a command field, and runtime uses a terminal status surface.

## 5. Interaction

- Hover states should use border, shadow, and color changes only; avoid layout-shifting transforms.
- Focus states must remain visible.
- All interactive controls keep the current workflow behavior and permissions.
- Selecting a node opens its configuration in the inspector without changing the node dimensions.
- Closing the inspector keeps the node selected and exposes a single restore-inspector control.
- Configuration controls rendered in the inspector must not render React Flow handles there.
- Right-panel resize separators support pointer and touch drag, expose vertical-separator ARIA with
  current/minimum/maximum width, and use Left/Right arrows for 24px steps plus Home/End for the
  configured bounds. Resizing updates continuously without a decorative animation; only the handle
  color communicates hover, focus, and active state.
- Publish channel navigation and list actions preserve their existing permission checks, limits,
  callbacks, and modal flows; this visual refactor does not add API calls or new data.
- Dataset import keeps the existing source selection, form state, upload requests, limits, and error
  handling. Preview depth may extend the existing route through a bounded optional field, but layout
  changes must not manufacture statistics or require another API.
- Dataset search test keeps the existing request payload, local history store, result renderer,
  source actions, and search-parameter form. The redesign may only reorganize those real values and
  must not add synthetic recall metrics or another request.
- Dataset configuration tabs only reorganize existing local data and callbacks. Model changes,
  rebuild confirmation, source editing, and collaborator permissions keep their current behavior.
- Team navigation changes only the frontend information architecture. Team switching, team editing,
  invitation, synchronization, ownership transfer, organization/group management, and permission
  mutations keep their existing APIs, modal flows, and permission checks.
- Agent configuration navigation, section headings, and parameter rows only reorganize existing form
  state and callbacks. The workbench must not add explanatory hero copy, configuration metrics, backend
  fields, or API requests, and the draggable configuration/debug split remains the page-level layout.

## 6. Typography

- Keep the existing app font stack unless a broader typography migration is requested.
- Use strong 13-15px labels for node titles, 11-12px for metadata, and tabular figures for counts.

## 7. Implementation Scope

This design system documents the active OmniCockpit refactor direction. The fuller project rationale lives in `.codex/design/portal-rebuild/design.md`.
