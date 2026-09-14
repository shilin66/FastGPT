# FastGPT Admin Design System

## 0. Source

This console extends the repository root `DESIGN.md` and the shared Chakra theme. It is an operational desktop surface, not a marketing site.

## 1. Product

FastGPT Admin is a root-only platform operations console. It prioritizes scan speed, predictable actions, explicit risk, and compact information density.

## 2. Visual Direction

- Canvas: Steel Atlas light canvas from the root design system.
- Navigation: graphite structure with a white active surface and saturated blue active indicator.
- Accent: saturated blue for primary commands and selected states.
- Risk: semantic red only for destructive actions; amber only for warnings and frozen states.
- Surfaces: white panels with restrained borders; no decorative gradients, glass, or nested cards.

## 3. Typography And Spacing

- Use the existing FastGPT font stack.
- Page titles use compact 20px-24px sizing.
- Table and form text use 13px-14px sizing.
- Use the shared 4px spacing rhythm and Chakra theme tokens.
- The target viewport starts at 1280px. No mobile navigation or narrow-screen adaptation is required.

## 4. Layout

- Fixed 224px sidebar.
- Full-height application shell.
- Main content uses a compact header, filter toolbar, table, and pagination.
- List panels fill the remaining desktop viewport; only the table body scrolls while filters and pagination remain visible.
- Details use dedicated pages for complex objects and modals for focused edits.

## 5. Primitives And States

- `AdminLayout`: default, active-navigation, loading-session, unauthenticated.
- `PageHeader`: title-only and title-with-command.
- `DataTable`: loading, populated, empty, and error states with stable columns.
- `ListPageCard`: fixed toolbar, internally scrollable table, sticky table header, and fixed pagination footer.
- `StatusBadge`: active, frozen, queued, running, succeeded, failed.
- `ConfirmNameModal`: closed, invalid confirmation, submitting, failed.
- Form modal: create, edit, validation-error, submitting.
- Pagination: first, middle, last, disabled.

## 6. Interaction

- Use familiar icons for row menus, logout, navigation, refresh, and destructive actions.
- Hover and focus change border, background, or color without moving layout.
- Toast feedback enters from the top center so it never covers list pagination or bottom actions.
- Every destructive action shows consequences before enabling the submit button.
- Long-running actions return a task identifier and navigate to task details.

## 7. Accessibility

- Maintain visible keyboard focus.
- Inputs always have labels.
- Icon-only controls require accessible labels and tooltips.
- Status cannot be communicated by color alone.
- Confirmation text must be selectable and readable.

## 8. Accepted Debt

- The first release is Chinese-only.
- Mobile and tablet layouts are intentionally out of scope.
- Visual QA and performance measurement are deferred until the user authorizes testing.
