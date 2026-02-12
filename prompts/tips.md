<!-- This file is injected by the RL framework at runtime. It is NOT included in the PPTAgent tarball. -->

# Tips

## Fix Priority

topology → font → overflow → out_of_bounds → overlap. Fixing higher-priority defects often resolves downstream ones.

## Key Constraints

- All elements must fit within 1280 × 720 px
- 8px safe padding between elements (overlap checked on inflated boxes)
- Min font: 32px (priority ≥ 100), 20px (≥ 80), 16px (≥ 60)
- Decoration elements are exempt from overlap checks
- Set `overflow: visible` on all elements (required for diagnostics)
- Bullets: use `<ul><li>`, not unicode `•`
- Images: wrap in `<div data-eid="..."><img .../></div>`

## Hints Are Absolute Values

`suggested_y: 108` means set `top: 108px` — not "add 108px".

## Common Mistakes

1. **Missing `data-eid`** → diagnostics finds 0 elements
2. **`overflow: hidden`** → diagnostics can't detect content overflow
3. **Moving `other_eid` instead of `owner_eid`** → overlap defect says which element to move
4. **Forgetting `cd /tools/pptagent`** before running CLI scripts
5. **Applying hints as deltas** instead of absolute values

## Multi-Element Overlaps

When A overlaps B overlaps C, read the `conflict_graph` in diagnostics. It shows the cheapest separation direction for each pair. Fix them together to avoid cascade.
